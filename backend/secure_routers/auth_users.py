# backend/secure_routers/auth_users.py

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm

from secure_db.session import SessionLocal
from secure_crud.users import create_user, authenticate_user
from secure_core.security import create_access_token

router = APIRouter(tags=["Secure Authentication"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/signup")
def signup(email: str, password: str, role: str = "patient", db=Depends(get_db)):
    user = create_user(db, email=email, password=password, role=role)
    return {
        "msg": "Account created",
        "email": user.email,
        "role": user.role,
        "public_key": user.public_key,
    }


@router.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db=Depends(get_db)):
    user = authenticate_user(db, form.username, form.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": user.email, "role": user.role})
    return {"access_token": token, "token_type": "bearer"}
