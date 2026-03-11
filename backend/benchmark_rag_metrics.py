from __future__ import annotations

import json
import os
import statistics
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List

from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI

from app.retrieval import index_text_in_chroma, search_reports


BACKEND_DIR = Path(__file__).resolve().parent
TEXT_DIR = BACKEND_DIR / "data" / "ocr_test_results" / "texts"
OUTPUT_PATH = BACKEND_DIR / "data" / "ocr_test_results" / "rag_latency_metrics.json"
LLM_MODEL = "gemini-2.5-flash"


def _stats(values: List[float]) -> Dict[str, float]:
    if not values:
        return {"count": 0, "mean": 0.0, "median": 0.0, "min": 0.0, "max": 0.0}
    ordered = sorted(values)
    return {
        "count": float(len(ordered)),
        "mean": float(statistics.fmean(ordered)),
        "median": float(statistics.median(ordered)),
        "min": float(ordered[0]),
        "max": float(ordered[-1]),
    }


def _load_table_texts() -> List[Dict[str, str]]:
    if not TEXT_DIR.exists():
        raise FileNotFoundError(f"Missing input folder: {TEXT_DIR}")

    rows: List[Dict[str, str]] = []
    for path in sorted(TEXT_DIR.glob("*.table.txt")):
        rows.append({"name": path.name, "text": path.read_text(encoding="utf-8")})

    if not rows:
        raise RuntimeError(f"No .table.txt records found in {TEXT_DIR}")
    return rows


def _index_benchmark_docs(rows: List[Dict[str, str]]) -> List[str]:
    run_id = uuid.uuid4().hex[:10]
    report_ids: List[str] = []

    for index, row in enumerate(rows):
        report_id = f"bench_{run_id}_{index}"
        index_text_in_chroma(
            report_id=report_id,
            filename=row["name"],
            text=row["text"],
        )
        report_ids.append(report_id)

    return report_ids


def _query_filter(report_ids: List[str]) -> Dict[str, Any]:
    return {"report_id": {"$in": report_ids}}


def _run_retrieval_benchmark(queries: List[str], report_ids: List[str]) -> Dict[str, Any]:
    where_filter = _query_filter(report_ids)
    search_reports(queries[0], k=3, filter_metadata=where_filter)

    samples: List[Dict[str, Any]] = []
    elapsed_ms: List[float] = []

    for query in queries:
        start = time.perf_counter()
        result = search_reports(query, k=3, filter_metadata=where_filter)
        elapsed = (time.perf_counter() - start) * 1000.0
        docs = (result.get("documents") or [[]])[0]

        elapsed_ms.append(elapsed)
        samples.append(
            {
                "query": query,
                "elapsed_ms": elapsed,
                "result_count": len(docs),
            }
        )

    return {"summary_ms": _stats(elapsed_ms), "samples": samples}


def _run_gemini_synthesis_benchmark(queries: List[str], report_ids: List[str]) -> Dict[str, Any]:
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return {"enabled": False, "error": "GOOGLE_API_KEY missing", "summary_seconds": _stats([]), "samples": []}

    llm = ChatGoogleGenerativeAI(
        model=LLM_MODEL,
        temperature=0,
        google_api_key=api_key,
        convert_system_message_to_human=True,
    )

    where_filter = _query_filter(report_ids)
    samples: List[Dict[str, Any]] = []
    elapsed_seconds: List[float] = []

    for query in queries:
        retrieval = search_reports(query, k=3, filter_metadata=where_filter)
        docs = (retrieval.get("documents") or [[]])[0]
        context = "\n\n".join(docs[:3]).strip()

        prompt = (
            "You are a medical assistant. Answer only from the provided context.\n\n"
            f"Context:\n{context}\n\n"
            f"Question: {query}\n"
            "Answer:"
        )

        start = time.perf_counter()
        response = llm.invoke(prompt)
        elapsed = time.perf_counter() - start
        content = response.content if hasattr(response, "content") else str(response)

        elapsed_seconds.append(elapsed)
        samples.append(
            {
                "query": query,
                "elapsed_seconds": elapsed,
                "response_chars": len(str(content)),
            }
        )

    return {
        "enabled": True,
        "model": LLM_MODEL,
        "summary_seconds": _stats(elapsed_seconds),
        "samples": samples,
    }


def main() -> int:
    load_dotenv(BACKEND_DIR / ".env")
    rows = _load_table_texts()
    report_ids = _index_benchmark_docs(rows)

    retrieval_queries = [
        "What is the patient name?",
        "What is the diagnosis?",
        "What medicine was prescribed?",
        "What is the follow-up advice?",
        "What is the patient ID?",
        "What is the visit date?",
    ]
    synthesis_queries = [
        "Summarize the diagnosis and prescription in 2 lines.",
        "List the follow-up recommendations from the reports.",
        "Which reports mention fever or infection?",
        "Extract patient identifiers and visit dates.",
    ]

    retrieval_metrics = _run_retrieval_benchmark(retrieval_queries, report_ids)
    synthesis_metrics = _run_gemini_synthesis_benchmark(synthesis_queries, report_ids)

    payload = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "indexed_reports": len(rows),
        "indexed_report_ids": report_ids,
        "chroma_retrieval_latency": retrieval_metrics,
        "gemini_synthesis_latency": synthesis_metrics,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    retrieval_mean = payload["chroma_retrieval_latency"]["summary_ms"]["mean"]
    print(f"Chroma retrieval latency mean (ms): {retrieval_mean:.3f}")

    if payload["gemini_synthesis_latency"]["enabled"]:
        synthesis_mean = payload["gemini_synthesis_latency"]["summary_seconds"]["mean"]
        print(f"Gemini synthesis latency mean (s): {synthesis_mean:.3f}")
    else:
        print("Gemini synthesis benchmark skipped: GOOGLE_API_KEY missing")

    print(f"Saved metrics to: {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
