from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, auth
from app.schemas import (
    ConsentCreate, ConsentUpdate, ConsentResponse,
    EmergencyContactCreate, EmergencyContactUpdate, EmergencyContactResponse
)

router = APIRouter(prefix="/policy", tags=["Consent Policy & Emergency"])

# --- CONSENT MANAGEMENT ---

@router.post("/consent", response_model=ConsentResponse)
def create_consent(data: ConsentCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role != "patient":
        raise HTTPException(status_code=403, detail="Only patients can grant consent.")
    
    if data.scope == "specific_record" and not data.record_id:
        raise HTTPException(status_code=400, detail="record_id required for specific scope")

    consent = models.Consent(
        patient_id=current_user.id,
        grantee_id=data.grantee_id,
        grantee_eth_address=data.grantee_eth_address, # <--- SAVING HERE
        scope=data.scope,
        record_id=data.record_id,
        level=data.level,
        emergency_only=data.emergency_only,
        active=True,
        expires_at=data.expires_at,
    )
    db.add(consent)
    db.commit()
    db.refresh(consent)
    return consent

@router.get("/consent", response_model=list[ConsentResponse])
def list_my_consents(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return db.query(models.Consent).filter(models.Consent.patient_id == current_user.id).all()

@router.delete("/consent/{consent_id}")
def revoke_consent(
    consent_id: int, 
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(auth.get_current_user)
):
    # 1. Get the Consent Policy
    consent = db.query(models.Consent).filter(
        models.Consent.id == consent_id, 
        models.Consent.patient_id == current_user.id
    ).first()
    
    if not consent: 
        raise HTTPException(status_code=404, detail="Consent not found")

    # 2. MARK POLICY AS INACTIVE
    consent.active = False
    
    # 3. PHYSICALLY REMOVE THE KEYS
    if consent.scope == "specific_record" and consent.record_id:
        shares_to_delete = db.query(models.SharedReport).filter(
            models.SharedReport.report_id == consent.record_id,
            models.SharedReport.doctor_id == consent.grantee_id
        ).all()
        
    elif consent.scope == "all_records":
        shares_to_delete = db.query(models.SharedReport).join(models.Report).filter(
            models.Report.owner_id == current_user.id,
            models.SharedReport.doctor_id == consent.grantee_id
        ).all()
    else:
        shares_to_delete = []

    for share in shares_to_delete:
        db.delete(share)

    db.commit()
    return {"detail": f"Consent revoked and {len(shares_to_delete)} access keys destroyed."}

# --- EMERGENCY CONTACTS (Unchanged) ---

@router.post("/emergency", response_model=EmergencyContactResponse)
def add_emergency_contact(data: EmergencyContactCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role != "patient": raise HTTPException(status_code=403, detail="Patients only")
    
    ec = models.EmergencyContact(
        patient_id=current_user.id,
        contact_id=data.contact_id,
        can_approve=data.can_approve,
        priority=data.priority,
        active=True,
    )
    db.add(ec)
    db.commit()
    db.refresh(ec)
    return ec

@router.get("/emergency", response_model=list[EmergencyContactResponse])
def list_emergency_contacts(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return db.query(models.EmergencyContact).filter(models.EmergencyContact.patient_id == current_user.id, models.EmergencyContact.active == True).all()

@router.delete("/emergency/{contact_id}")
def delete_emergency_contact(contact_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    ec = db.query(models.EmergencyContact).filter(models.EmergencyContact.id == contact_id, models.EmergencyContact.patient_id == current_user.id).first()
    if not ec: raise HTTPException(status_code=404, detail="Not found")
    ec.active = False
    db.commit()
    return {"detail": "Deleted"}