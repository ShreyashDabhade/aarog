# backend/secure_routers/auth_users.py

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from secure_db.session import SessionLocal  # (kept for type hints if needed)
from secure_crud.users import create_user, authenticate_user
from secure_core.security import create_access_token, verify_password
from secure_core.deps import (
    get_db,
    get_current_user,
    require_patient,
    require_doctor,
)
from secure_models.user import SecureUser

router = APIRouter()


# ---------- Request models ----------

class SignupRequest(BaseModel):
    email: str
    password: str
    role: str = "patient"   # default


class LoginRequest(BaseModel):
    email: str
    password: str


class PrivateKeyRequest(BaseModel):
    password: str


# ---------- Endpoints ----------

@router.post("/signup")
def signup(body: SignupRequest, db=Depends(get_db)):
    """
    Register a new user (patient/doctor/admin).

    For now:
    - generates RSA keypair
    - hashes password
    - stores in secure_users table
    - returns public_key
    """
    user = create_user(
        db,
        email=body.email,
        password=body.password,
        role=body.role,
    )

    return {
        "msg": "Account created",
        "email": user.email,
        "role": user.role,
        "public_key": user.public_key,
    }


@router.post("/login")
def login(body: LoginRequest, db=Depends(get_db)):
    """
    JSON login:
    {
      "email": "user@example.com",
      "password": "1234"
    }
    """
    user = authenticate_user(db, body.email, body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": user.email, "role": user.role})
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me")
def get_me(current_user: SecureUser = Depends(get_current_user)):
    """
    Return basic profile + public key (safe to show).
    """
    return {
        "email": current_user.email,
        "role": current_user.role,
        "public_key": current_user.public_key,
    }


@router.post("/me/private-key")
def get_my_private_key(
    body: PrivateKeyRequest,
    current_user: SecureUser = Depends(get_current_user),
):
    """
    Show PRIVATE KEY only if:
    - user is authenticated (JWT)
    - user re-enters their password correctly
    """

    # Verify password
    if not verify_password(body.password, current_user.password_hash):
        raise HTTPException(status_code=403, detail="Incorrect password")

    # ⚠️ For demo: we return plain PEM from DB.
    # In a more serious version, this would be encrypted in DB.
    return {
        "private_key": current_user.private_key,
    }


# Example of role-protected endpoints if needed:

@router.get("/patient-only")
def patient_only(current_user: SecureUser = Depends(require_patient)):
    return {"msg": f"Hello patient {current_user.email}"}


@router.get("/doctor-only")
def doctor_only(current_user: SecureUser = Depends(require_doctor)):
    return {"msg": f"Hello doctor {current_user.email}"}
