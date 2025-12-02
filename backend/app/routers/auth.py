from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from pydantic import BaseModel
from .. import database, models, auth

# Prefix ensures endpoints are at /auth/register and /auth/token
router = APIRouter(prefix="/auth", tags=["Authentication"])

class UserRegister(BaseModel):
    email: str
    password: str
    role: str = "patient"
    public_key_pem: str
    encrypted_private_key: str 

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    user_id: int
    encrypted_private_key: str | None = None

@router.post("/register", response_model=Token)
def register(user: UserRegister, db: Session = Depends(database.get_db)):
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
    return {
        "access_token": access_token, 
        "token_type": "bearer", 
        "role": new_user.role, 
        "user_id": new_user.id,
        "encrypted_private_key": new_user.encrypted_private_key
    }

@router.post("/token")
def login(form_data: dict = Body(...), db: Session = Depends(database.get_db)):
    # Standard OAuth2 expects form-data, but your frontend sends JSON.
    # We use Body(...) to accept JSON.
    email = form_data.get("username")
    password = form_data.get("password")
    
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user or not auth.verify_password(password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    
    access_token = auth.create_access_token(data={"sub": user.email})
    return {
        "access_token": access_token, 
        "token_type": "bearer", 
        "role": user.role, 
        "user_id": user.id,
        "encrypted_private_key": user.encrypted_private_key
    }