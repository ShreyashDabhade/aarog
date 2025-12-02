import os
from typing import Optional

from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import models, tasks, auth, database
from .tasks import process_document_task
from .agent_runner import run_query

from secure_routers.auth_users import router as secure_auth_router
from secure_db.session import Base as SecureBase, engine as secure_engine

app = FastAPI(
    title="Privacy-First Medical RAG API",
    description="Backend for secure patient records",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(
    secure_auth_router,
    prefix="/secure",
    tags=["Secure Authentication"],
)

SecureBase.metadata.create_all(bind=secure_engine)


# ---- CONFIG ----
SERVER_PUB_KEY_PATH = "docs/server_pubkey.pem"


# ---- Pydantic Models ----
class EncryptedPayload(BaseModel):
    cipher: str   # Hex encoded
    iv: str       # Hex encoded
    key: str      # Hex encoded (RSA encrypted AES key)
    filename: str
    # optional because v1 frontend doesn't send patient_pubkey yet
    patient_pubkey: Optional[str] = None


class Token(BaseModel):
    access_token: str
    token_type: str


# ---- ENDPOINTS ----

@app.get("/")
def health_check():
    return {"status": "secure", "service": "med-privacy-backend"}


@app.get("/server_pubkey.pem")
def get_server_public_key():
    if not os.path.exists(SERVER_PUB_KEY_PATH):
        raise HTTPException(status_code=500, detail="Server keys not configured.")

    with open(SERVER_PUB_KEY_PATH, "r") as f:
        return {"public_key": f.read()}


@app.post("/submit-anon")
async def submit_anonymized_report(payload: EncryptedPayload):
    # 1. Validation
    try:
        bytes.fromhex(payload.cipher)
        bytes.fromhex(payload.iv)
        bytes.fromhex(payload.key)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid hex encoding in payload")

    # 2. Generate ID
    report_id = "rep_" + os.urandom(4).hex()

    # 3. Offload to Celery
    task = process_document_task.delay(
        report_id=report_id,
        enc_aes_key_hex=payload.key,
        iv_hex=payload.iv,
        ciphertext_hex=payload.cipher,
    )

    return {
        "status": "processing",
        "report_id": report_id,
        "task_id": str(task),
    }


@app.get("/query")
async def query_agent(q: str):
    if not q:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    try:
        answer = run_query(q)
        return {"answer": answer}
    except Exception as e:
        print(f"Agent Error: {e}")
        return {
            "answer": "I encountered an internal error while processing your request."
        }


# --- Existing mock token endpoint (for old flow) ---
@app.post("/token", response_model=Token)
async def login_for_access_token(form_data: dict = Body(...)):
    return {"access_token": "j.w.t", "token_type": "bearer"}
