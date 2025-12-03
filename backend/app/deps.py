from fastapi import Depends, HTTPException, status
from .auth import get_current_user
from .models import User

def require_doctor(current_user: User = Depends(get_current_user)):
    if current_user.role != "doctor":
        raise HTTPException(status_code=403, detail="Access denied: Doctors only")
    return current_user

def require_patient(current_user: User = Depends(get_current_user)):
    if current_user.role != "patient":
        raise HTTPException(status_code=403, detail="Access denied: Patients only")
    return current_user