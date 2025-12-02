# backend/secure_models/user.py

from sqlalchemy import Column, Integer, String
from secure_db.session import Base


class SecureUser(Base):
    __tablename__ = "secure_users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    password_hash = Column(String)        # hashed password
    role = Column(String)                 # patient / doctor / admin
    public_key = Column(String)           # RSA public key (PEM)
    private_key = Column(String)          # encrypted private key (PEM or ciphertext)
