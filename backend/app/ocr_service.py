"""OCR extraction service for image/PDF uploads.

Supported modes:
- plain: PaddleOCR text extraction with layout-aware ordering
- table: PP-Structure table/layout extraction with plain OCR fallback
"""

import io
import re
from functools import lru_cache
from html import unescape
from statistics import median
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
import pypdfium2 as pdfium
from paddleocr import PPStructure, PaddleOCR


OCRLine = Dict[str, Any]
Geometry = Dict[str, float]

MODE_PLAIN = "plain"
MODE_TABLE = "table"
SUPPORTED_MODES = {MODE_PLAIN, MODE_TABLE}

PDF_SIGNATURE = b"%PDF"
PDF_RENDER_SCALE = 2.0

# Preprocessing constants
SHADOW_BLUR_KERNEL = 25
ADAPTIVE_THRESHOLD_BLOCK_SIZE = 31
ADAPTIVE_THRESHOLD_C = 2
SHARPEN_KERNEL = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])

# Layout reconstruction constants
ROW_TOLERANCE_MIN = 10.0
ROW_TOLERANCE_DEFAULT = 12.0
ROW_TOLERANCE_FACTOR = 0.65
GAP_PIPE_MULTIPLIER = 7
GAP_DOUBLE_SPACE_MULTIPLIER = 3

# Noise filtering constants
NOISE_MIN_CONFIDENCE = 0.15
NOISE_SHORT_TEXT_LEN = 2
NOISE_SHORT_TEXT_CONFIDENCE = 0.35
NOISE_SYMBOL_MAX_LEN = 3

# Plain OCR fallback constants
RAW_FALLBACK_MIN_LINES = 8
RAW_FALLBACK_MIN_CONFIDENCE = 0.55

OCR_ENGINE_CANDIDATES: List[Dict[str, Any]] = [
    {"lang": "en", "show_log": False, "use_angle_cls": True},
    {"lang": "en", "show_log": False, "use_textline_orientation": True},
    {"lang": "en", "use_angle_cls": True},
    {"lang": "en", "use_textline_orientation": True},
    {"lang": "en"},
    {},
]

STRUCTURE_ENGINE_CANDIDATES: List[Dict[str, Any]] = [
    {"show_log": False, "lang": "en", "layout": True, "table": True, "ocr": True},
    {"show_log": False, "layout": True, "table": True, "ocr": True},
    {"show_log": False, "table": True, "ocr": True},
    {"layout": True, "table": True, "ocr": True},
    {"table": True, "ocr": True},
    {},
]


def _is_engine_kwarg_error(exc: Exception) -> bool:
    msg = str(exc)
    return (
        "Unknown argument" in msg
        or "unexpected keyword argument" in msg
        or isinstance(exc, TypeError)
    )


def _build_engine(factory: Any, candidates: List[Dict[str, Any]], engine_name: str) -> Any:
    """Try candidate kwargs until an engine initializes successfully."""
    last_exc: Optional[Exception] = None

    for kwargs in candidates:
        try:
            return factory(**kwargs)
        except Exception as exc:
            last_exc = exc
            if _is_engine_kwarg_error(exc):
                continue
            raise

    if last_exc is not None:
        raise RuntimeError(f"Failed to initialize {engine_name}") from last_exc
    raise RuntimeError(f"Failed to initialize {engine_name}")


@lru_cache(maxsize=1)
def _get_ocr_engine() -> Any:
    return _build_engine(PaddleOCR, OCR_ENGINE_CANDIDATES, "PaddleOCR")


@lru_cache(maxsize=1)
def _get_structure_engine() -> Any:
    return _build_engine(PPStructure, STRUCTURE_ENGINE_CANDIDATES, "PP-Structure")


def _run_ocr(ocr: Any, image: Any) -> Any:
    try:
        return ocr.ocr(image, cls=True)
    except TypeError:
        return ocr.ocr(image)
    except ValueError as exc:
        # PaddleOCR v3 may reject cls as an unknown argument.
        if "Unknown argument: cls" in str(exc):
            return ocr.ocr(image)
        raise


def preprocess_for_ocr(image_bgr: Any) -> Any:
    """Apply denoise + threshold + deskew before OCR."""
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    gray = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX)

    bg = cv2.medianBlur(gray, SHADOW_BLUR_KERNEL)
    shadow_removed = cv2.divide(gray, bg, scale=255)

    thresh = cv2.adaptiveThreshold(
        shadow_removed,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        ADAPTIVE_THRESHOLD_BLOCK_SIZE,
        ADAPTIVE_THRESHOLD_C,
    )

    text_pixels = np.column_stack(np.where(thresh < 255))
    if text_pixels.size == 0:
        deskew = thresh
    else:
        angle = cv2.minAreaRect(text_pixels)[-1]
        angle = -(90 + angle) if angle < -45 else -angle

        h, w = thresh.shape[:2]
        matrix = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
        deskew = cv2.warpAffine(
            thresh,
            matrix,
            (w, h),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_REPLICATE,
        )

    sharp = cv2.filter2D(deskew, -1, SHARPEN_KERNEL)

    if len(sharp.shape) == 2:
        sharp = cv2.cvtColor(sharp, cv2.COLOR_GRAY2BGR)
    return sharp


def _decode_image(file_bytes: bytes) -> Any:
    arr = np.frombuffer(file_bytes, dtype=np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Unable to decode image.")
    return image


def _pdf_to_images(file_bytes: bytes) -> List[Any]:
    pages: List[Any] = []
    pdf = pdfium.PdfDocument(io.BytesIO(file_bytes))
    for index in range(len(pdf)):
        page = pdf[index]
        bitmap = page.render(scale=PDF_RENDER_SCALE).to_numpy()

        if bitmap.ndim == 2:
            bitmap = cv2.cvtColor(bitmap, cv2.COLOR_GRAY2BGR)
        elif bitmap.shape[2] == 4:
            bitmap = cv2.cvtColor(bitmap, cv2.COLOR_RGBA2BGR)
        else:
            bitmap = cv2.cvtColor(bitmap, cv2.COLOR_RGB2BGR)

        pages.append(bitmap)
        page.close()
    pdf.close()
    return pages


def _decode_source_pages(file_bytes: bytes, content_type: str) -> List[Any]:
    content_type = (content_type or "").lower()

    if content_type == "application/pdf":
        return _pdf_to_images(file_bytes)

    if content_type.startswith("image/"):
        return [_decode_image(file_bytes)]

    if content_type in {"", "application/octet-stream"}:
        if file_bytes.startswith(PDF_SIGNATURE):
            return _pdf_to_images(file_bytes)
        return [_decode_image(file_bytes)]

    raise ValueError(f"Unsupported file type: {content_type}")


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _looks_like_box(value: Any) -> bool:
    if not isinstance(value, (list, tuple)) or not value:
        return False
    first = value[0]
    if not isinstance(first, (list, tuple)) or len(first) < 2:
        return False
    return _is_number(first[0]) and _is_number(first[1])


def _looks_like_line_entry(value: Any) -> bool:
    if not isinstance(value, (list, tuple)) or len(value) < 2:
        return False
    return _looks_like_box(value[0]) and isinstance(value[1], (list, tuple))


def _extract_line_entries(value: Any) -> List[Any]:
    entries: List[Any] = []
    if _looks_like_line_entry(value):
        return [value]
    if isinstance(value, (list, tuple)):
        for item in value:
            entries.extend(_extract_line_entries(item))
    return entries


def _parse_text_conf(text_info: Any) -> Tuple[str, float]:
    if not isinstance(text_info, (list, tuple)) or len(text_info) < 2:
        return str(text_info), 0.0

    first, second = text_info[0], text_info[1]
    if isinstance(first, str) and _is_number(second):
        return first, float(second)
    if isinstance(second, str) and _is_number(first):
        return second, float(first)
    if isinstance(first, str):
        return first, float(second) if _is_number(second) else 0.0
    if isinstance(second, str):
        return second, float(first) if _is_number(first) else 0.0
    return str(first), float(second) if _is_number(second) else 0.0


def _normalize_ocr_result(page_result: Any, page_number: int) -> List[OCRLine]:
    normalized: List[OCRLine] = []
    if not page_result:
        return normalized

    # PaddleOCR v3 can return a dict-like structure.
    if isinstance(page_result, dict):
        texts = page_result.get("rec_texts") or page_result.get("texts") or []
        scores = page_result.get("rec_scores") or page_result.get("scores") or []
        boxes = (
            page_result.get("rec_polys")
            or page_result.get("dt_polys")
            or page_result.get("boxes")
            or []
        )

        for idx, text in enumerate(texts):
            conf = scores[idx] if idx < len(scores) else 0.0
            box = boxes[idx] if idx < len(boxes) else []
            normalized.append(
                {
                    "page": page_number,
                    "text": str(text),
                    "confidence": float(conf),
                    "box": box,
                }
            )
        return normalized

    for entry in _extract_line_entries(page_result):
        text, confidence = _parse_text_conf(entry[1])
        normalized.append(
            {
                "page": page_number,
                "text": str(text),
                "confidence": float(confidence),
                "box": entry[0],
            }
        )

    return normalized


def _to_float(value: Any) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _box_geometry(box: Any) -> Optional[Geometry]:
    if not isinstance(box, (list, tuple)) or not box:
        return None

    points: List[Tuple[float, float]] = []
    for point in box:
        if not isinstance(point, (list, tuple)) or len(point) < 2:
            continue
        x = _to_float(point[0])
        y = _to_float(point[1])
        if x is None or y is None:
            continue
        points.append((x, y))

    if len(points) < 2 and len(box) >= 4:
        x1 = _to_float(box[0])
        y1 = _to_float(box[1])
        x2 = _to_float(box[2])
        y2 = _to_float(box[3])
        if x1 is not None and y1 is not None and x2 is not None and y2 is not None:
            points = [(x1, y1), (x2, y2)]

    if len(points) < 2:
        return None

    xs = [point[0] for point in points]
    ys = [point[1] for point in points]

    x_min = min(xs)
    x_max = max(xs)
    y_min = min(ys)
    y_max = max(ys)

    return {
        "x_min": x_min,
        "x_max": x_max,
        "y_min": y_min,
        "y_max": y_max,
        "cx": (x_min + x_max) / 2.0,
        "cy": (y_min + y_max) / 2.0,
        "width": max(x_max - x_min, 1.0),
        "height": max(y_max - y_min, 1.0),
    }


def _polygon_from_bbox(bbox: Any) -> List[List[float]]:
    if not isinstance(bbox, (list, tuple)) or not bbox:
        return []

    if all(isinstance(item, (int, float)) for item in bbox):
        values = [float(item) for item in bbox]
        if len(values) >= 4:
            x1, y1, x2, y2 = values[0], values[1], values[2], values[3]
            return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]

    points: List[List[float]] = []
    for item in bbox:
        if not isinstance(item, (list, tuple)) or len(item) < 2:
            continue
        x = _to_float(item[0])
        y = _to_float(item[1])
        if x is None or y is None:
            continue
        points.append([x, y])
    return points


def _clean_line_text(value: Any) -> str:
    text = str(value or "").replace("\u200b", " ").replace("\ufeff", " ")
    return " ".join(text.split())


def _iter_text_fragments(value: Any) -> List[str]:
    fragments: List[str] = []

    def walk(node: Any) -> None:
        if node is None:
            return

        if isinstance(node, str):
            cleaned = _clean_line_text(node)
            if cleaned:
                fragments.append(cleaned)
            return

        if isinstance(node, (int, float, bool)):
            return

        if isinstance(node, dict):
            preferred_keys = ["text", "label", "value", "content", "transcription"]
            for key in preferred_keys:
                candidate = node.get(key)
                if isinstance(candidate, str):
                    cleaned = _clean_line_text(candidate)
                    if cleaned:
                        fragments.append(cleaned)

            skip_keys = {
                "bbox",
                "box",
                "text_region",
                "poly",
                "points",
                "score",
                "confidence",
                "html",
                "img",
            }
            for key, child in node.items():
                if key in skip_keys or key in preferred_keys:
                    continue
                walk(child)
            return

        if isinstance(node, (list, tuple)):
            for child in node:
                walk(child)

    walk(value)
    return fragments


def _split_and_dedup_rows(values: List[str]) -> List[str]:
    rows: List[str] = []
    for value in values:
        for part in str(value).splitlines():
            normalized = _clean_line_text(part)
            if not normalized:
                continue
            if rows and normalized == rows[-1]:
                continue
            rows.append(normalized)
    return rows


def _extract_table_text_from_html(raw_html: str) -> str:
    if not raw_html:
        return ""

    text = unescape(raw_html)
    text = re.sub(r"(?i)<br\s*/?>", " ", text)
    text = re.sub(r"(?i)</t[dh]>", " | ", text)
    text = re.sub(r"(?i)</tr>", "\n", text)
    text = re.sub(r"<[^>]+>", " ", text)

    rows: List[str] = []
    for row in text.splitlines():
        normalized = " ".join(row.split())
        normalized = re.sub(r"(?:\s*\|\s*)+", " | ", normalized).strip(" |")
        if normalized:
            rows.append(normalized)

    dedup_rows: List[str] = []
    for row in rows:
        if dedup_rows and row == dedup_rows[-1]:
            continue
        dedup_rows.append(row)

    return "\n".join(dedup_rows).strip()


def _extract_structure_confidence(block: Dict[str, Any]) -> float:
    values: List[float] = []

    def collect(node: Any) -> None:
        if node is None:
            return

        if isinstance(node, dict):
            for key in ("confidence", "score", "prob", "rec_score"):
                maybe = _to_float(node.get(key))
                if maybe is not None and 0.0 <= maybe <= 1.0:
                    values.append(maybe)
            for key, child in node.items():
                if key in {"bbox", "box", "text_region", "poly", "points", "img", "html"}:
                    continue
                collect(child)
            return

        if isinstance(node, (list, tuple)):
            for child in node:
                collect(child)

    collect(block.get("res"))

    if values:
        return sum(values) / len(values)

    explicit = _to_float(block.get("confidence"))
    if explicit is not None and 0.0 <= explicit <= 1.0:
        return explicit

    explicit = _to_float(block.get("score"))
    if explicit is not None and 0.0 <= explicit <= 1.0:
        return explicit

    return 0.0


def _extract_structure_block_text(block: Dict[str, Any]) -> str:
    block_type = str(block.get("type", "")).lower()
    res = block.get("res")

    texts: List[str] = []

    if block_type == "table":
        html_value: Optional[str] = None
        if isinstance(res, dict):
            maybe_html = res.get("html")
            if isinstance(maybe_html, str):
                html_value = maybe_html
        elif isinstance(res, str) and "<table" in res.lower():
            html_value = res

        if html_value:
            table_text = _extract_table_text_from_html(html_value)
            if table_text:
                texts.append(table_text)

    if not texts:
        if isinstance(res, str):
            cleaned = _clean_line_text(res)
            if cleaned:
                texts.append(cleaned)
        else:
            texts.extend(_iter_text_fragments(res))

    if not texts:
        texts.extend(_iter_text_fragments(block.get("text")))

    rows = _split_and_dedup_rows(texts)
    return "\n".join(rows).strip()


def _is_probable_noise(text: str, confidence: float) -> bool:
    if not text:
        return True
    if confidence < NOISE_MIN_CONFIDENCE:
        return True
    if len(text) <= NOISE_SHORT_TEXT_LEN and confidence < NOISE_SHORT_TEXT_CONFIDENCE:
        return True

    alnum_count = sum(1 for char in text if char.isalnum())
    if alnum_count == 0 and len(text) <= NOISE_SYMBOL_MAX_LEN:
        return True

    return False


def _mean_confidence(lines: List[OCRLine]) -> float:
    if not lines:
        return 0.0

    confidences: List[float] = []
    for line in lines:
        conf = _to_float(line.get("confidence"))
        confidences.append(0.0 if conf is None else max(0.0, min(conf, 1.0)))

    return sum(confidences) / len(confidences)


def _score_page_text(lines: List[OCRLine], text: str) -> float:
    if not lines and not text:
        return 0.0

    avg_conf = _mean_confidence(lines)
    long_tokens = sum(1 for line in lines if len(str(line.get("text", ""))) >= 3)
    one_char_tokens = sum(1 for line in lines if len(str(line.get("text", ""))) == 1)

    return (avg_conf * 100.0) + (long_tokens * 1.2) + (len(text) * 0.01) - (one_char_tokens * 0.8)


def _compose_row_text(row: List[OCRLine]) -> str:
    pieces: List[str] = []
    previous: Optional[OCRLine] = None

    for item in row:
        if previous is None:
            pieces.append(item["text"])
            previous = item
            continue

        gap = item["_geom"]["x_min"] - previous["_geom"]["x_max"]
        prev_width = max(previous["_geom"]["width"], 1.0)
        prev_text_len = max(len(previous["text"]), 1)
        char_width = max(prev_width / prev_text_len, 1.0)

        if gap > char_width * GAP_PIPE_MULTIPLIER:
            separator = " | "
        elif gap > char_width * GAP_DOUBLE_SPACE_MULTIPLIER:
            separator = "  "
        else:
            separator = " "

        pieces.append(f"{separator}{item['text']}")
        previous = item

    return "".join(pieces).strip()


def _reconstruct_page_text(page_lines: List[OCRLine]) -> Tuple[str, List[OCRLine]]:
    layout_lines: List[OCRLine] = []
    fallback_lines: List[OCRLine] = []

    for line in page_lines:
        text = _clean_line_text(line.get("text", ""))
        confidence = _to_float(line.get("confidence"))
        confidence = 0.0 if confidence is None else confidence

        if _is_probable_noise(text, confidence):
            continue

        candidate = dict(line)
        candidate["text"] = text
        candidate["confidence"] = confidence

        geometry = _box_geometry(candidate.get("box"))
        if geometry is None:
            fallback_lines.append(candidate)
        else:
            candidate["_geom"] = geometry
            layout_lines.append(candidate)

    if not layout_lines and not fallback_lines:
        return "", []

    if not layout_lines:
        text_only = "\n".join(line["text"] for line in fallback_lines).strip()
        return text_only, fallback_lines

    layout_lines.sort(key=lambda line: (line["_geom"]["cy"], line["_geom"]["x_min"]))

    heights = [line["_geom"]["height"] for line in layout_lines if line["_geom"]["height"] > 0]
    row_tolerance = max(
        ROW_TOLERANCE_MIN,
        (median(heights) * ROW_TOLERANCE_FACTOR) if heights else ROW_TOLERANCE_DEFAULT,
    )

    rows: List[List[OCRLine]] = []
    for line in layout_lines:
        if not rows:
            rows.append([line])
            continue

        current_row = rows[-1]
        row_center = sum(item["_geom"]["cy"] for item in current_row) / len(current_row)
        if abs(line["_geom"]["cy"] - row_center) <= row_tolerance:
            current_row.append(line)
        else:
            rows.append([line])

    ordered_lines: List[OCRLine] = []
    reconstructed_rows: List[str] = []

    for row in rows:
        row.sort(key=lambda line: line["_geom"]["x_min"])
        ordered_lines.extend(row)

        row_text = _compose_row_text(row)
        if row_text:
            reconstructed_rows.append(row_text)

    ordered_lines.extend(fallback_lines)
    reconstructed_rows.extend(line["text"] for line in fallback_lines if line.get("text"))

    cleaned_lines: List[OCRLine] = []
    for line in ordered_lines:
        candidate = dict(line)
        candidate.pop("_geom", None)
        cleaned_lines.append(candidate)

    dedup_rows: List[str] = []
    for row_text in reconstructed_rows:
        if dedup_rows and row_text == dedup_rows[-1]:
            continue
        dedup_rows.append(row_text)

    return "\n".join(dedup_rows).strip(), cleaned_lines


def _normalize_structure_result(page_result: Any, page_number: int) -> Tuple[str, List[OCRLine]]:
    if not page_result:
        return "", []

    if isinstance(page_result, dict):
        blocks = page_result.get("res") or page_result.get("layout") or page_result.get("blocks") or []
    elif isinstance(page_result, (list, tuple)):
        blocks = list(page_result)
    else:
        return "", []

    ordered_blocks: List[Dict[str, Any]] = []
    for index, block in enumerate(blocks):
        if not isinstance(block, dict):
            continue

        text = _extract_structure_block_text(block)
        if not text:
            continue

        box = _polygon_from_bbox(block.get("bbox") or block.get("box") or block.get("text_region") or [])
        geom = _box_geometry(box)

        ordered_blocks.append(
            {
                "text": text,
                "confidence": _extract_structure_confidence(block),
                "box": box,
                "_sort_y": geom["y_min"] if geom else float(index),
                "_sort_x": geom["x_min"] if geom else 0.0,
                "_sort_i": index,
            }
        )

    ordered_blocks.sort(key=lambda block: (block["_sort_y"], block["_sort_x"], block["_sort_i"]))

    lines: List[OCRLine] = []
    for block in ordered_blocks:
        split_lines = [part for part in str(block["text"]).splitlines() if _clean_line_text(part)]
        if not split_lines:
            continue

        geom = _box_geometry(block.get("box"))
        for row_index, row_text in enumerate(split_lines):
            row_box = block.get("box", [])
            if geom and len(split_lines) > 1:
                row_height = max(geom["height"] / len(split_lines), 1.0)
                y1 = geom["y_min"] + (row_index * row_height)
                y2 = y1 + row_height
                row_box = [
                    [geom["x_min"], y1],
                    [geom["x_max"], y1],
                    [geom["x_max"], y2],
                    [geom["x_min"], y2],
                ]

            lines.append(
                {
                    "page": page_number,
                    "text": _clean_line_text(row_text),
                    "confidence": float(block["confidence"]),
                    "box": row_box,
                }
            )

    page_text = "\n".join(line["text"] for line in lines).strip()
    return page_text, lines


def _extract_with_plain_ocr(ocr: Any, page_bgr: Any, page_number: int) -> Tuple[str, List[OCRLine]]:
    clean_image = preprocess_for_ocr(page_bgr)

    clean_result = _run_ocr(ocr, clean_image)
    clean_lines = _normalize_ocr_result(clean_result if clean_result else [], page_number)
    clean_text, clean_lines = _reconstruct_page_text(clean_lines)

    page_text = clean_text
    page_lines = clean_lines

    # If preprocessing removed too much structure, compare against raw-image OCR.
    if len(clean_lines) < RAW_FALLBACK_MIN_LINES or _mean_confidence(clean_lines) < RAW_FALLBACK_MIN_CONFIDENCE:
        raw_result = _run_ocr(ocr, page_bgr)
        raw_lines = _normalize_ocr_result(raw_result if raw_result else [], page_number)
        raw_text, raw_lines = _reconstruct_page_text(raw_lines)

        if _score_page_text(raw_lines, raw_text) > _score_page_text(clean_lines, clean_text):
            page_text = raw_text
            page_lines = raw_lines

    return page_text, page_lines


def _build_page_summary(page: int, text: str, lines: List[OCRLine], mode: str) -> Dict[str, Any]:
    return {
        "page": page,
        "text": text,
        "line_count": len(lines),
        "mode": mode,
    }


def extract_text_from_upload(file_bytes: bytes, content_type: str, mode: str = MODE_PLAIN) -> Dict[str, Any]:
    """Extract OCR text from uploaded bytes in plain or table mode."""
    normalized_mode = (mode or MODE_PLAIN).strip().lower()
    if normalized_mode not in SUPPORTED_MODES:
        raise ValueError("Unsupported OCR mode. Use 'plain' or 'table'.")

    source_pages = _decode_source_pages(file_bytes, content_type)
    if not source_pages:
        return {"text": "", "lines": [], "pages": [], "mode": normalized_mode}

    ocr_engine: Optional[Any] = _get_ocr_engine() if normalized_mode == MODE_PLAIN else None
    structure_engine: Optional[Any] = _get_structure_engine() if normalized_mode == MODE_TABLE else None

    all_lines: List[OCRLine] = []
    page_summaries: List[Dict[str, Any]] = []

    for page_number, page_bgr in enumerate(source_pages, start=1):
        page_mode = normalized_mode

        if normalized_mode == MODE_TABLE:
            if structure_engine is None:
                structure_engine = _get_structure_engine()

            structure_result = structure_engine(page_bgr)
            page_text, page_lines = _normalize_structure_result(structure_result, page_number)

            # Fallback to plain OCR when structure parser yields nothing useful.
            if not page_lines:
                if ocr_engine is None:
                    ocr_engine = _get_ocr_engine()
                page_text, page_lines = _extract_with_plain_ocr(ocr_engine, page_bgr, page_number)
                page_mode = MODE_PLAIN
        else:
            if ocr_engine is None:
                ocr_engine = _get_ocr_engine()
            page_text, page_lines = _extract_with_plain_ocr(ocr_engine, page_bgr, page_number)

        all_lines.extend(page_lines)
        page_summaries.append(_build_page_summary(page_number, page_text, page_lines, page_mode))

    full_text = "\n\n".join(page["text"] for page in page_summaries if page["text"]).strip()
    return {"text": full_text, "lines": all_lines, "pages": page_summaries, "mode": normalized_mode}
