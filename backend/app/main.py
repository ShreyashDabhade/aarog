import os
import uuid
import redis
import random
import string
from typing import List
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

# Internal imports
from . import models, auth, database, deps
from .config import settings
from .database import engine, get_db
from .tasks import process_document_task
from .agent_runner import run_query
from .routers import auth as auth_router 

# Create Tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="SecureMed: Zero-Knowledge Medical AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)

# --- REDIS CONNECTION ---
# Using the existing Redis container
redis_client = redis.from_url(settings.CELERY_BROKER_URL)

# --- Pydantic Models ---
class DualUploadPayload(BaseModel):
    filename: str
    anon_cipher: str
    anon_iv: str
    anon_key_server: str
    original_cipher: str
    original_iv: str
    original_key_patient: str

class ShareRequest(BaseModel):
    report_id: str
    doctor_id: int
    encrypted_key_for_doctor: str

# --- ENDPOINTS ---

@app.get("/server_pubkey.pem")
def get_server_public_key():
    if not os.path.exists(settings.SERVER_PUB_KEY_PATH):
        raise HTTPException(500, "Server keys not configured.")
    with open(settings.SERVER_PUB_KEY_PATH, "r") as f:
        return {"public_key": f.read()}

@app.post("/upload-record")
async def upload_medical_record(
    payload: DualUploadPayload, 
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    report_id = str(uuid.uuid4())
    new_report = models.Report(
        id=report_id,
        owner_id=current_user.id,
        filename=payload.filename,
        original_ciphertext=payload.original_cipher,
        original_iv=payload.original_iv,
        enc_aes_key_patient=payload.original_key_patient,
        is_indexed=False
    )
    db.add(new_report)
    db.commit()
    
    task = process_document_task.delay(
        report_id=report_id,
        enc_aes_key_hex=payload.anon_key_server,
        iv_hex=payload.anon_iv,
        ciphertext_hex=payload.anon_cipher
    )
    return {"status": "securely_stored", "report_id": report_id, "task_id": str(task)}

@app.get("/my-records")
def get_my_records(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    return db.query(models.Report).filter(models.Report.owner_id == current_user.id).all()

@app.get("/shared-with-me")
def get_shared_records(
    current_user: models.User = Depends(deps.require_doctor),
    db: Session = Depends(get_db)
):
    shared = db.query(models.SharedReport).filter(models.SharedReport.doctor_id == current_user.id).all()
    results = []
    for share in shared:
        report = share.report
        # Added Patient Info for Grouping
        results.append({
            "report_id": report.id,
            "filename": report.filename,
            "original_ciphertext": report.original_ciphertext,
            "original_iv": report.original_iv,
            "enc_aes_key": share.enc_aes_key_doctor,
            "patient_id": report.owner.id,
            "patient_email": report.owner.email,
            "shared_at": report.created_at # Or add a specific shared_at column if tracking that
        })
    return results

@app.get("/users/public-key")
def get_user_public_key(email: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"public_key": user.public_key_pem}

@app.get("/query")
async def query_agent(
    q: str, 
    patient_id: Optional[int] = None, # Optional: For doctors focusing on a patient
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    filter_metadata = None

    # CASE 1: Patient is asking
    if current_user.role == "patient":
        # RESTRICTION: Patient can only search their own reports
        my_reports = db.query(models.Report).filter(models.Report.owner_id == current_user.id).all()
        if not my_reports:
            return {"answer": "You have no reports in your vault to analyze."}
        
        report_ids = [r.id for r in my_reports]
        filter_metadata = {"report_id": {"$in": report_ids}}

    # CASE 2: Doctor is asking
    elif current_user.role == "doctor":
        if patient_id:
            # Sub-case: Doctor wants to search specific patient's shared records
            # 1. Verify that the patient has actually shared these records with this doctor
            shared_records = db.query(models.SharedReport).join(models.Report).filter(
                models.SharedReport.doctor_id == current_user.id,
                models.Report.owner_id == patient_id
            ).all()
            
            if not shared_records:
                return {"answer": "You do not have access to any records for this patient."}
            
            report_ids = [share.report_id for share in shared_records]
            filter_metadata = {"report_id": {"$in": report_ids}}
        else:
            # Sub-case: Global Search (No filter = Search entire DB)
            # This allows the doctor to ask general medical questions based on the aggregate knowledge base
            filter_metadata = None 

    try:
        answer = run_query(q, filter_metadata)
        return {"answer": answer}
    except Exception as e:
        return {"answer": "Error processing request."}

# --- SHARING & SESSION HANDSHAKE ---

@app.post("/doctor/generate-code")
def generate_session_code(current_user: models.User = Depends(deps.require_doctor)):
    """Doctor generates a 6-digit code to show the patient."""
    code = ''.join(random.choices(string.digits, k=6))
    # Store Code -> DoctorID in Redis (Expires in 5 mins)
    redis_client.setex(f"share_session:{code}", 300, str(current_user.id))
    return {"code": code, "expires_in": 300}

@app.get("/patient/resolve-code")
def resolve_session_code(code: str, db: Session = Depends(get_db), current_user: models.User = Depends(deps.require_patient)):
    """Patient enters code to get Doctor's Public Key."""
    doctor_id = redis_client.get(f"share_session:{code}")
    if not doctor_id:
        raise HTTPException(404, "Invalid or expired code")
        
    doctor = db.query(models.User).filter(models.User.id == int(doctor_id)).first()
    if not doctor:
        raise HTTPException(404, "Doctor not found")
        
    return {
        "doctor_id": doctor.id,
        "name": doctor.email, 
        "public_key": doctor.public_key_pem
    }

@app.post("/share-record")
def share_record_with_doctor(
    req: ShareRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Stores the re-encrypted key for the doctor."""
    report = db.query(models.Report).filter(models.Report.id == req.report_id, models.Report.owner_id == current_user.id).first()
    if not report:
        raise HTTPException(404, "Report not found or access denied")
    
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

@app.get("/report/{report_id}/shares")
def get_report_shares(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_patient)
):
    """List all doctors who have access to this report."""
    report = db.query(models.Report).filter(models.Report.id == report_id, models.Report.owner_id == current_user.id).first()
    if not report:
        raise HTTPException(404, "Report not found")
        
    shares = db.query(models.SharedReport).filter(models.SharedReport.report_id == report.id).all()
    
    return [
        {"doctor_id": s.doctor.id, "doctor_email": s.doctor.email, "shared_at": "Today"} 
        for s in shares
    ]

@app.delete("/share-record/{report_id}/{doctor_id}")
def revoke_access(
    report_id: str, 
    doctor_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_patient)
):
    """Revoke access by deleting the encrypted key."""
    report = db.query(models.Report).filter(
        models.Report.id == report_id, 
        models.Report.owner_id == current_user.id
    ).first()
    
    if not report:
        raise HTTPException(404, "Report not found")
        
    share = db.query(models.SharedReport).filter(
        models.SharedReport.report_id == report_id,
        models.SharedReport.doctor_id == doctor_id
    ).first()
    
    if share:
        db.delete(share)
        db.commit()
        return {"status": "revoked"}
    
    raise HTTPException(404, "Share record not found")