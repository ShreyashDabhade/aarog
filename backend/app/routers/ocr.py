import traceback

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile

from app import auth, models
from app.ocr_service import extract_text_from_upload

router = APIRouter(prefix="/ocr", tags=["OCR"])


@router.post("/extract")
async def extract_ocr_text(
    file: UploadFile,
    mode: str = Query("table", description="OCR mode: plain or table"),
    current_user: models.User = Depends(auth.get_current_user),
):
    try:
        file_bytes = await file.read()
        result = extract_text_from_upload(file_bytes, file.content_type or "", mode=mode)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"OCR extraction failed: {exc}")
