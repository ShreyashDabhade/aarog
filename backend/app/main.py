import os
import uuid
from typing import List
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

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

# Include the new Auth Router
app.include_router(auth_router.router)

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
    doctor_email: str
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
    
    # 1. Store Original in DB
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
    
    # 2. Send Anon Data to Celery
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
    current_user: models.User = Depends(deps.require_doctor), # <--- USING NEW DEP
    db: Session = Depends(get_db)
):
    shared = db.query(models.SharedReport).filter(models.SharedReport.doctor_id == current_user.id).all()
    results = []
    for share in shared:
        report = share.report
        results.append({
            "report_id": report.id,
            "filename": report.filename,
            "original_ciphertext": report.original_ciphertext,
            "original_iv": report.original_iv,
            "enc_aes_key": share.enc_aes_key_doctor
        })
    return results

@app.get("/users/public-key")
def get_user_public_key(email: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"public_key": user.public_key_pem}

@app.post("/share-record")
def share_record_with_doctor(
    req: ShareRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    report = db.query(models.Report).filter(models.Report.id == req.report_id, models.Report.owner_id == current_user.id).first()
    if not report:
        raise HTTPException(404, "Report not found or access denied")
        
    doctor = db.query(models.User).filter(models.User.email == req.doctor_email).first()
    if not doctor:
        raise HTTPException(404, "Doctor not found")
        
    share = models.SharedReport(
        report_id=report.id,
        doctor_id=doctor.id,
        enc_aes_key_doctor=req.encrypted_key_for_doctor
    )
    db.add(share)
    db.commit()
    
    return {"status": "shared", "doctor": doctor.email}

@app.get("/query")
async def query_agent(q: str, current_user: models.User = Depends(auth.get_current_user)):
    try:
        answer = run_query(q)
        return {"answer": answer}
    except Exception as e:
        return {"answer": "Error processing request."}