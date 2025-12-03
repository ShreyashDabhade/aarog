from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text, Boolean, Float, func
from sqlalchemy.orm import relationship
from datetime import datetime
from enum import Enum
from .database import Base

# [Keep User, Report, SharedReport classes exactly as they are...]
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String, default="patient")
    public_key_pem = Column(Text) 
    encrypted_private_key = Column(Text)
    reports = relationship("Report", back_populates="owner")
    shared_reports = relationship("SharedReport", back_populates="doctor")

class Report(Base):
    __tablename__ = "reports"
    id = Column(String, primary_key=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    filename = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    original_ciphertext = Column(Text) 
    original_iv = Column(String)
    enc_aes_key_patient = Column(String) 
    is_anonymized = Column(Boolean, default=True)
    is_indexed = Column(Boolean, default=False)
    owner = relationship("User", back_populates="reports")
    shares = relationship("SharedReport", back_populates="report")

class SharedReport(Base):
    __tablename__ = "shared_reports"
    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(String, ForeignKey("reports.id"))
    doctor_id = Column(Integer, ForeignKey("users.id"))
    enc_aes_key_doctor = Column(String)
    report = relationship("Report", back_populates="shares")
    doctor = relationship("User", back_populates="shared_reports")

# --- UPDATED CONSENT MODEL ---

class ConsentScopeEnum(str, Enum):
    ALL_RECORDS = "all_records"
    SPECIFIC_RECORD = "specific_record"

class ConsentLevelEnum(str, Enum):
    VIEW = "view"
    EDIT = "edit"

class Consent(Base):
    __tablename__ = "consents"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    grantee_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # NEW FIELD: Store the ETH address used for the audit trail
    grantee_eth_address = Column(String, nullable=True) 

    scope = Column(String, nullable=False, default=ConsentScopeEnum.ALL_RECORDS.value)
    record_id = Column(String, ForeignKey("reports.id"), nullable=True)
    level = Column(String, nullable=False, default=ConsentLevelEnum.VIEW.value)
    emergency_only = Column(Boolean, default=False)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=True)

    patient = relationship("User", foreign_keys=[patient_id])
    grantee = relationship("User", foreign_keys=[grantee_id])
    report = relationship("Report", foreign_keys=[record_id])

class EmergencyContact(Base):
    __tablename__ = "emergency_contacts"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    contact_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    can_approve = Column(Boolean, default=True)
    priority = Column(Integer, default=1)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    patient = relationship("User", foreign_keys=[patient_id])
    contact = relationship("User", foreign_keys=[contact_id])