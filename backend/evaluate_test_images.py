from __future__ import annotations

import csv
import mimetypes
import statistics
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
DEFAULT_TEST_IMAGES_DIR = REPO_ROOT / "test images"
DEFAULT_OUTPUT_DIR = BACKEND_DIR / "data" / "ocr_test_results"
MODES = ("table", "plain")

sys.path.insert(0, str(BACKEND_DIR))

from app.ocr_service import extract_text_from_upload  # noqa: E402


@dataclass
class EvalRow:
    image_name: str
    mode: str
    elapsed_sec: float
    success: bool
    error: str
    pages: int
    lines: int
    chars: int
    words: int
    avg_conf: float
    median_conf: float
    min_conf: float
    max_conf: float
    first_160_chars: str


def _guess_content_type(path: Path) -> str:
    guessed, _ = mimetypes.guess_type(path.name)
    return guessed or "application/octet-stream"


def _sanitize_preview(text: str, max_len: int = 160) -> str:
    one_line = " ".join((text or "").split())
    if len(one_line) <= max_len:
        return one_line
    return f"{one_line[: max_len - 3]}..."


def _confidence_stats(lines: list[dict[str, Any]]) -> tuple[float, float, float, float]:
    values: list[float] = []
    for item in lines:
        raw = item.get("confidence")
        if isinstance(raw, (int, float)):
            values.append(float(raw))

    if not values:
        return 0.0, 0.0, 0.0, 0.0

    return (
        statistics.fmean(values),
        statistics.median(values),
        min(values),
        max(values),
    )


def _evaluate_one(path: Path, mode: str, text_dir: Path) -> EvalRow:
    start = time.perf_counter()
    try:
        data = path.read_bytes()
        content_type = _guess_content_type(path)
        result = extract_text_from_upload(data, content_type, mode=mode)
        elapsed = time.perf_counter() - start

        text = str(result.get("text", ""))
        lines = result.get("lines") or []
        pages = result.get("pages") or []
        avg_conf, med_conf, min_conf, max_conf = _confidence_stats(lines)

        text_output_path = text_dir / f"{path.stem}.{mode}.txt"
        text_output_path.write_text(text, encoding="utf-8")

        return EvalRow(
            image_name=path.name,
            mode=mode,
            elapsed_sec=elapsed,
            success=True,
            error="",
            pages=len(pages),
            lines=len(lines),
            chars=len(text),
            words=len(text.split()),
            avg_conf=avg_conf,
            median_conf=med_conf,
            min_conf=min_conf,
            max_conf=max_conf,
            first_160_chars=_sanitize_preview(text),
        )
    except Exception as exc:  # noqa: BLE001
        elapsed = time.perf_counter() - start
        return EvalRow(
            image_name=path.name,
            mode=mode,
            elapsed_sec=elapsed,
            success=False,
            error=str(exc),
            pages=0,
            lines=0,
            chars=0,
            words=0,
            avg_conf=0.0,
            median_conf=0.0,
            min_conf=0.0,
            max_conf=0.0,
            first_160_chars="",
        )


def _write_csv(rows: list[EvalRow], out_csv: Path) -> None:
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    with out_csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "image_name",
                "mode",
                "elapsed_sec",
                "success",
                "error",
                "pages",
                "lines",
                "chars",
                "words",
                "avg_conf",
                "median_conf",
                "min_conf",
                "max_conf",
                "first_160_chars",
            ],
        )
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    "image_name": row.image_name,
                    "mode": row.mode,
                    "elapsed_sec": f"{row.elapsed_sec:.3f}",
                    "success": row.success,
                    "error": row.error,
                    "pages": row.pages,
                    "lines": row.lines,
                    "chars": row.chars,
                    "words": row.words,
                    "avg_conf": f"{row.avg_conf:.4f}",
                    "median_conf": f"{row.median_conf:.4f}",
                    "min_conf": f"{row.min_conf:.4f}",
                    "max_conf": f"{row.max_conf:.4f}",
                    "first_160_chars": row.first_160_chars,
                }
            )


def _write_markdown(rows: list[EvalRow], out_md: Path) -> None:
    out_md.parent.mkdir(parents=True, exist_ok=True)

    success_rows = [row for row in rows if row.success]
    avg_time = statistics.fmean([row.elapsed_sec for row in success_rows]) if success_rows else 0.0
    avg_lines = statistics.fmean([row.lines for row in success_rows]) if success_rows else 0.0
    avg_conf = statistics.fmean([row.avg_conf for row in success_rows]) if success_rows else 0.0

    grouped: dict[str, list[EvalRow]] = {}
    for row in rows:
        grouped.setdefault(row.image_name, []).append(row)

    lines = [
        "# OCR Test Report Matrix",
        "",
        f"- Total images: {len(grouped)}",
        f"- Total runs (image x mode): {len(rows)}",
        f"- Successful runs: {len(success_rows)}",
        f"- Avg runtime per run: {avg_time:.3f}s",
        f"- Avg lines per run: {avg_lines:.2f}",
        f"- Avg confidence per run: {avg_conf:.4f}",
        "",
        "## Detailed Matrix",
        "",
        "| Image | Mode | Success | Time (s) | Pages | Lines | Chars | Words | Avg Conf | Median Conf | Min Conf | Max Conf | Preview |",
        "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|",
    ]

    for image_name in sorted(grouped):
        per_image = sorted(grouped[image_name], key=lambda row: row.mode)
        for row in per_image:
            preview = row.first_160_chars.replace("|", "\\|")
            lines.append(
                f"| {row.image_name} | {row.mode} | {str(row.success).lower()} | {row.elapsed_sec:.3f} | "
                f"{row.pages} | {row.lines} | {row.chars} | {row.words} | {row.avg_conf:.4f} | "
                f"{row.median_conf:.4f} | {row.min_conf:.4f} | {row.max_conf:.4f} | {preview} |"
            )
            if row.error:
                err = row.error.replace("|", "\\|").replace("\n", " ")
                lines.append(f"|  |  |  |  |  |  |  |  |  |  |  |  | error: {err} |")

    out_md.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    images_dir = DEFAULT_TEST_IMAGES_DIR
    output_dir = DEFAULT_OUTPUT_DIR
    text_dir = output_dir / "texts"
    text_dir.mkdir(parents=True, exist_ok=True)

    if not images_dir.exists():
        print(f"Test image directory not found: {images_dir}")
        return 1

    files = sorted([path for path in images_dir.iterdir() if path.is_file()])
    if not files:
        print(f"No files found in test image directory: {images_dir}")
        return 1

    rows: list[EvalRow] = []
    total_runs = len(files) * len(MODES)
    current = 0
    for path in files:
        for mode in MODES:
            current += 1
            print(f"[{current}/{total_runs}] Processing {path.name} in {mode} mode...")
            rows.append(_evaluate_one(path, mode, text_dir))

    csv_path = output_dir / "report_matrix.csv"
    md_path = output_dir / "report_matrix.md"

    _write_csv(rows, csv_path)
    _write_markdown(rows, md_path)

    print(f"Saved CSV matrix: {csv_path}")
    print(f"Saved Markdown matrix: {md_path}")
    print(f"Saved raw text outputs in: {text_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
