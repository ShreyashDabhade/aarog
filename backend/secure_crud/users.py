# backend/secure_crud/users.py

from sqlalchemy.orm import Session
from secure_core.security import hash_password, verify_password, generate_user_keypair
from secure_models.user import SecureUser
from secure_db.session import SessionLocal
from secure_models.user import SecureUser
from secure_core.security import (
    hash_password,
    verify_password,
    generate_user_keypair,
)


def get_user_by_email(db: Session, email: str) -> SecureUser | None:
    """Fetch a user by email."""
    return db.query(SecureUser).filter(SecureUser.email == email).first()


def create_user(db, email: str, password: str, role: str = "patient"):
    existing = db.query(SecureUser).filter(SecureUser.email == email).first()
    if existing:
        raise ValueError("User already exists")  # or HTTPException in router

    priv_pem, pub_pem = generate_user_keypair()

    user = SecureUser(
        email=email,
        password_hash=hash_password(password),
        role=role,
        public_key=pub_pem,
        private_key=priv_pem,   # currently stored as plain PEM (ok for demo, not ideal for prod)
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: str) -> SecureUser | None:
    """
    Validate email + password; return user if ok, else None.
    """
    user = get_user_by_email(db, email)
    if not user:
        return None

    if not verify_password(password, user.password_hash):
        return None

    return user
