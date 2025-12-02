from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text, Boolean, Float
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String, default="patient")  # 'patient' or 'doctor'
    
    # Public Key for "Digilocker" functionality (Zero-Knowledge Sharing)
    public_key_pem = Column(Text) 

    reports = relationship("Report", back_populates="owner")
    shared_reports = relationship("SharedReport", back_populates="doctor")

class Report(Base):
    __tablename__ = "reports"

    id = Column(String, primary_key=True) # UUID
    owner_id = Column(Integer, ForeignKey("users.id"))
    filename = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # 1. STORAGE PIPELINE (Encrypted for Patient Access)
    # The ciphertext of the ORIGINAL file
    original_ciphertext = Column(Text) 
    original_iv = Column(String)
    
    # The AES key encrypted with the PATIENT'S Public Key
    enc_aes_key_patient = Column(String) 

    # 2. AI PIPELINE (Status)
    is_anonymized = Column(Boolean, default=True)
    is_indexed = Column(Boolean, default=False)

    owner = relationship("User", back_populates="reports")
    shares = relationship("SharedReport", back_populates="report")

class SharedReport(Base):
    """
    Table to store access grants. 
    If a patient shares a report with a doctor, we re-encrypt the AES key 
    with the Doctor's Public Key and store it here.
    """
    __tablename__ = "shared_reports"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(String, ForeignKey("reports.id"))
    doctor_id = Column(Integer, ForeignKey("users.id"))
    
    # The AES key for the report, encrypted with the DOCTOR'S Public Key
    enc_aes_key_doctor = Column(String)
    
    report = relationship("Report", back_populates="shares")
    doctor = relationship("User", back_populates="shared_reports")