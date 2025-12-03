from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, auth, deps
from app.schemas import (
    ConsentCreate,
    ConsentUpdate,
    ConsentResponse,
    EmergencyContactCreate,
    EmergencyContactUpdate,
    EmergencyContactResponse,
)

router = APIRouter(
    prefix="/consent",
    tags=["Consent & Emergency"],
)

# -----------------------------------------------------------
# 1. CREATE CONSENT (patient -> doctor/family)
# -----------------------------------------------------------

@router.post("/", response_model=ConsentResponse)
def create_consent(
    data: ConsentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    # Only patients can grant consent
    if current_user.role != "patient":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only patients can grant consent.",
        )

    if data.scope == "specific_record" and data.record_id is None:
        raise HTTPException(
            status_code=400,
            detail="record_id is required when scope='specific_record'",
        )

    consent = models.Consent(
        patient_id=current_user.id,
        grantee_id=data.grantee_id,
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


# -----------------------------------------------------------
# 2. LIST CONSENTS GRANTED BY ME (patient)
# -----------------------------------------------------------

@router.get("/", response_model=list[ConsentResponse])
def list_my_consents(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    consents = (
        db.query(models.Consent)
        .filter(models.Consent.patient_id == current_user.id)
        .all()
    )
    return consents


# -----------------------------------------------------------
# 3. UPDATE CONSENT (change level, emergency_only, active, expires_at)
# -----------------------------------------------------------

@router.put("/{consent_id}", response_model=ConsentResponse)
def update_consent(
    consent_id: int,
    data: ConsentUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    consent = (
        db.query(models.Consent)
        .filter(models.Consent.id == consent_id)
        .first()
    )

    if not consent:
        raise HTTPException(status_code=404, detail="Consent not found")

    if consent.patient_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You cannot modify someone else's consent.",
        )

    for field, value in data.dict(exclude_unset=True).items():
        setattr(consent, field, value)

    db.commit()
    db.refresh(consent)
    return consent


# -----------------------------------------------------------
# 4. REVOKE CONSENT (set active = False)
# -----------------------------------------------------------

@router.delete("/{consent_id}")
def revoke_consent(
    consent_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    consent = (
        db.query(models.Consent)
        .filter(models.Consent.id == consent_id)
        .first()
    )

    if not consent:
        raise HTTPException(status_code=404, detail="Consent not found")

    if consent.patient_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You cannot revoke someone else's consent.",
        )

    consent.active = False
    db.commit()
    return {"detail": "Consent revoked"}


# ===========================================================
# EMERGENCY CONTACTS
# ===========================================================

# 5. ADD EMERGENCY CONTACT
@router.post("/emergency", response_model=EmergencyContactResponse)
def add_emergency_contact(
    data: EmergencyContactCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    if current_user.role != "patient":
        raise HTTPException(
            status_code=403,
            detail="Only patients can add emergency contacts.",
        )

    contact_user = db.query(models.User).filter(models.User.id == data.contact_id).first()
    if not contact_user:
        raise HTTPException(status_code=404, detail="Contact user not found")

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


# 6. LIST EMERGENCY CONTACTS FOR CURRENT PATIENT

@router.get("/emergency", response_model=list[EmergencyContactResponse])
def list_emergency_contacts(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    ecs = (
        db.query(models.EmergencyContact)
        .filter(models.EmergencyContact.patient_id == current_user.id)
        .all()
    )
    return ecs


# 7. UPDATE EMERGENCY CONTACT

@router.put("/emergency/{contact_id}", response_model=EmergencyContactResponse)
def update_emergency_contact(
    contact_id: int,
    data: EmergencyContactUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    ec = (
        db.query(models.EmergencyContact)
        .filter(models.EmergencyContact.id == contact_id)
        .first()
    )

    if not ec:
        raise HTTPException(status_code=404, detail="Emergency contact not found")

    if ec.patient_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    for field, value in data.dict(exclude_unset=True).items():
        setattr(ec, field, value)

    db.commit()
    db.refresh(ec)
    return ec


# 8. DELETE / DEACTIVATE EMERGENCY CONTACT

@router.delete("/emergency/{contact_id}")
def deactivate_emergency_contact(
    contact_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    ec = (
        db.query(models.EmergencyContact)
        .filter(models.EmergencyContact.id == contact_id)
        .first()
    )

    if not ec:
        raise HTTPException(status_code=404, detail="Emergency contact not found")

    if ec.patient_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    ec.active = False
    db.commit()
    return {"detail": "Emergency contact deactivated"}
