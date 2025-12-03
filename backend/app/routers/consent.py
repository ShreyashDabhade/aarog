import random
import string
import redis
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from .. import models, deps, auth
from ..database import get_db
from ..config import settings

# Prefix all endpoints with /consent
router = APIRouter(prefix="/consent", tags=["Doctor Consent & Sharing"])

# Redis Connection for Session Codes
redis_client = redis.from_url(settings.CELERY_BROKER_URL)

# --- Schemas ---
class ShareRequest(BaseModel):
    report_id: str
    doctor_id: int
    encrypted_key_for_doctor: str

# --- Endpoints ---

@router.post("/doctor/generate-code")
def generate_session_code(current_user: models.User = Depends(deps.require_doctor)):
    """
    Doctor generates a 6-digit code. Valid for 5 minutes.
    """
    code = ''.join(random.choices(string.digits, k=6))
    redis_client.setex(f"share_session:{code}", 300, str(current_user.id))
    return {"code": code, "expires_in": 300}

@router.get("/patient/resolve-code")
def resolve_session_code(code: str, db: Session = Depends(get_db), current_user: models.User = Depends(deps.require_patient)):
    """
    Patient resolves code to get Doctor's ID and Public Key.
    """
    doctor_id = redis_client.get(f"share_session:{code}")
    if not doctor_id:
        raise HTTPException(status_code=404, detail="Invalid or expired session code")
        
    doctor = db.query(models.User).filter(models.User.id == int(doctor_id)).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")
        
    return {
        "doctor_id": doctor.id,
        "name": doctor.email, 
        "public_key": doctor.public_key_pem
    }

@router.post("/share-record")
def share_record_with_doctor(
    req: ShareRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """
    Patient grants access by sending the re-encrypted AES key.
    """
    report = db.query(models.Report).filter(models.Report.id == req.report_id, models.Report.owner_id == current_user.id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found or access denied")
    
    # Check if already shared
    existing = db.query(models.SharedReport).filter(
        models.SharedReport.report_id == req.report_id,
        models.SharedReport.doctor_id == req.doctor_id
    ).first()
    
    if existing:
        return {"status": "already_shared"}

    share = models.SharedReport(
        report_id=report.id,
        doctor_id=req.doctor_id,
        enc_aes_key_doctor=req.encrypted_key_for_doctor
    )
    db.add(share)
    db.commit()
    
    return {"status": "shared", "doctor_id": req.doctor_id}

@router.get("/report/{report_id}/shares")
def get_report_shares(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_patient)
):
    """
    List all doctors who have access to this report.
    """
    report = db.query(models.Report).filter(models.Report.id == report_id, models.Report.owner_id == current_user.id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
        
    shares = db.query(models.SharedReport).filter(models.SharedReport.report_id == report.id).all()
    
    return [
        {"doctor_id": s.doctor.id, "doctor_email": s.doctor.email, "shared_at": "Today"} 
        for s in shares
    ]

@router.delete("/revoke/{report_id}/{doctor_id}")
def revoke_access(
    report_id: str, 
    doctor_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_patient)
):
    """
    Revoke access by deleting the encrypted key.
    """
    share = db.query(models.SharedReport).join(models.Report).filter(
        models.SharedReport.report_id == report_id,
        models.SharedReport.doctor_id == doctor_id,
        models.Report.owner_id == current_user.id
    ).first()
    
    if share:
        db.delete(share)
        db.commit()
        return {"status": "revoked"}
    
    raise HTTPException(status_code=404, detail="Share record not found")

@router.get("/shared-with-me")
def get_shared_records(
    current_user: models.User = Depends(deps.require_doctor),
    db: Session = Depends(get_db)
):
    """
    For Doctor Dashboard: Get all records shared with the current doctor.
    """
    shared = db.query(models.SharedReport).filter(models.SharedReport.doctor_id == current_user.id).all()
    results = []
    for share in shared:
        report = share.report
        results.append({
            "report_id": report.id,
            "filename": report.filename,
            "original_ciphertext": report.original_ciphertext,
            "original_iv": report.original_iv,
            "enc_aes_key": share.enc_aes_key_doctor,
            "patient_id": report.owner.id,
            "patient_email": report.owner.email,
            "shared_at": report.created_at 
        })
    return results