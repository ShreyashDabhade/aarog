# secure_core/security.py

from datetime import datetime, timedelta
from typing import Optional

from jose import jwt
from passlib.context import CryptContext
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization

from secure_core.config import secure_settings  # you already have this file

# 👉 Use pbkdf2_sha256 instead of bcrypt to avoid Windows/bcrypt issues
pwd_context = CryptContext(
    schemes=["pbkdf2_sha256"],
    deprecated="auto",
)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode,
        secure_settings.SECRET_KEY,
        algorithm=ALGORITHM,
    )
    return encoded_jwt


# ---- GENERATE RSA KEYS (patient private/public keys) ----
def generate_user_keypair():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    priv_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    ).decode()

    pub_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()

    return priv_pem, pub_pem
