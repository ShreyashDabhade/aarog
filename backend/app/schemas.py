from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from enum import Enum

class ConsentScopeEnum(str, Enum):
    all_records = "all_records"
    specific_record = "specific_record"

class ConsentLevelEnum(str, Enum):
    view = "view"
    edit = "edit"

class ConsentCreate(BaseModel):
    grantee_id: int
    grantee_eth_address: Optional[str] = None # <--- NEW
    scope: ConsentScopeEnum
    record_id: Optional[str] = None
    level: ConsentLevelEnum
    emergency_only: bool = False
    expires_at: Optional[datetime] = None

class ConsentUpdate(BaseModel):
    level: Optional[ConsentLevelEnum] = None
    emergency_only: Optional[bool] = None
    active: Optional[bool] = None
    expires_at: Optional[datetime] = None

class ConsentResponse(BaseModel):
    id: int
    patient_id: int
    grantee_id: int
    grantee_eth_address: Optional[str] # <--- NEW
    scope: ConsentScopeEnum
    record_id: Optional[str]
    level: ConsentLevelEnum
    emergency_only: bool
    active: bool
    expires_at: Optional[datetime]
    created_at: datetime

    class Config:
        orm_mode = True

# ... [Keep EmergencyContact schemas as they are] ...
class EmergencyContactCreate(BaseModel):
    contact_id: int
    can_approve: bool = True
    priority: int = 1

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