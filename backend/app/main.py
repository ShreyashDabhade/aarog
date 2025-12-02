import os
import uuid
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Body, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session

# Internal imports
from . import models, tasks, auth, database
from .database import engine, get_db
from .tasks import process_document_task
from .agent_runner import run_query

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

# --- Pydantic Models for API ---
class UserRegister(BaseModel):
    email: str
    password: str
    role: str = "patient"
    public_key_pem: str  # Client generates this
    encrypted_private_key: str

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    user_id: int

class DualUploadPayload(BaseModel):
    filename: str
    
    # Pipeline A: RAG (Anonymized Data) -> Sent to Server for Processing
    anon_cipher: str
    anon_iv: str
    anon_key_server: str 
    
    # Pipeline B: Storage (Original Data) -> Stored in Postgres for Patient
    original_cipher: str
    original_iv: str
    original_key_patient: str 

class ShareRequest(BaseModel):
    report_id: str
    doctor_email: str
    encrypted_key_for_doctor: str

# --- AUTH ENDPOINTS ---

@app.post("/register", response_model=Token)
def register(user: UserRegister, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = auth.get_password_hash(user.password)
    new_user = models.User(
        email=user.email,
        hashed_password=hashed_password,
        role=user.role,
        public_key_pem=user.public_key_pem,
        encrypted_private_key=user.encrypted_private_key
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    access_token = auth.create_access_token(data={"sub": new_user.email})
    return {"access_token": access_token, "token_type": "bearer", "role": new_user.role, "user_id": new_user.id}

@app.post("/token", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # FIX: Now accepts standard Form Data (username/password)
    # Note: OAuth2 spec uses 'username' field, even if we use emails
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    
    access_token = auth.create_access_token(data={"sub": user.email})
    return {
        "access_token": access_token, 
        "token_type": "bearer", 
        "role": user.role,
        "encrypted_private_key": user.encrypted_private_key 
    }

@app.get("/users/public-key")
def get_user_public_key(email: str, db: Session = Depends(get_db)):
    """Used by patients to get a doctor's public key for sharing."""
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"public_key": user.public_key_pem}

# --- SECURE UPLOAD & RAG ---

@app.get("/server_pubkey.pem")
def get_server_public_key():
    path = "docs/server_pubkey.pem"
    if not os.path.exists(path):
        raise HTTPException(500, detail="Server keys not configured.")
    with open(path, "r") as f:
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

# --- DIGILOCKER: VIEW & SHARE ---

@app.get("/my-records")
def get_my_records(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    return db.query(models.Report).filter(models.Report.owner_id == current_user.id).all()

@app.get("/shared-with-me")
def get_shared_records(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "doctor":
        raise HTTPException(403, detail="Only doctors can view shared records")
        
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

@app.post("/share-record")
def share_record_with_doctor(
    req: ShareRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    report = db.query(models.Report).filter(models.Report.id == req.report_id, models.Report.owner_id == current_user.id).first()
    if not report:
        raise HTTPException(404, detail="Report not found or access denied")
        
    doctor = db.query(models.User).filter(models.User.email == req.doctor_email).first()
    if not doctor:
        raise HTTPException(404, detail="Doctor not found")
        
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
        print(f"Agent Error: {e}")
        return {"answer": "I encountered an internal error while processing your request."}