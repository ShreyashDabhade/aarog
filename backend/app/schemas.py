from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from enum import Enum


# -----------------------------
# ENUMS (matching models.py)
# -----------------------------
class ConsentScopeEnum(str, Enum):
    all_records = "all_records"
    specific_record = "specific_record"


class ConsentLevelEnum(str, Enum):
    view = "view"
    edit = "edit"


# -----------------------------
# CONSENT SCHEMAS
# -----------------------------

class ConsentBase(BaseModel):
    grantee_id: int
    scope: ConsentScopeEnum
    record_id: Optional[str] = None
    level: ConsentLevelEnum
    emergency_only: bool = False
    expires_at: Optional[datetime] = None


class ConsentCreate(ConsentBase):
    """Used when patient creates a consent"""
    pass


class ConsentUpdate(BaseModel):
    """Used when editing an existing consent"""
    level: Optional[ConsentLevelEnum] = None
    emergency_only: Optional[bool] = None
    active: Optional[bool] = None
    expires_at: Optional[datetime] = None


class ConsentResponse(BaseModel):
    id: int
    patient_id: int
    grantee_id: int
    scope: ConsentScopeEnum
    record_id: Optional[str]
    level: ConsentLevelEnum
    emergency_only: bool
    active: bool
    expires_at: Optional[datetime]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        orm_mode = True


# -----------------------------
# EMERGENCY CONTACT SCHEMAS
# -----------------------------

class EmergencyContactBase(BaseModel):
    contact_id: int
    can_approve: bool = True
    priority: int = 1


class EmergencyContactCreate(EmergencyContactBase):
    """Used to add an emergency contact"""
    pass


class EmergencyContactUpdate(BaseModel):
    can_approve: Optional[bool] = None
    active: Optional[bool] = None
    priority: Optional[int] = None


class EmergencyContactResponse(BaseModel):
    id: int
    patient_id: int
    contact_id: int
    can_approve: bool
    priority: int
    active: bool
    created_at: datetime

    class Config:
        orm_mode = True
