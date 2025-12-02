# backend/secure_crud/users.py

from sqlalchemy.orm import Session

from secure_models.user import SecureUser
from secure_core.security import (
    hash_password,
    verify_password,
    generate_user_keypair,
)


def get_user_by_email(db: Session, email: str) -> SecureUser | None:
    """Fetch a user by email."""
    return db.query(SecureUser).filter(SecureUser.email == email).first()


def create_user(
    db: Session,
    email: str,
    password: str,
    role: str = "patient",
) -> SecureUser:
    """
    Create a new user with:
    - hashed password
    - generated RSA keypair (private+public)
    """
    private_key, public_key = generate_user_keypair()

    user = SecureUser(
        email=email,
        password_hash=hash_password(password),
        role=role,
        public_key=public_key,
        private_key=private_key,  # later you can encrypt this with password
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
