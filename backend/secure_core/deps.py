# backend/secure_core/deps.py

from fastapi import Depends, HTTPException, status
#from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError

from secure_core.config import secure_settings
from secure_core.security import ALGORITHM
from secure_db.session import SessionLocal
from secure_models.user import SecureUser

# This tells FastAPI where the login endpoint is (for docs & token flow)
#oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/secure/login")
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

bearer_scheme = HTTPBearer()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db=Depends(get_db),
):
    token = credentials.credentials
 
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )

    try:
        payload = jwt.decode(
            token,
            secure_settings.SECRET_KEY,
            algorithms=[ALGORITHM],
        )
        email: str | None = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(SecureUser).filter(SecureUser.email == email).first()
    if user is None:
        raise credentials_exception

    return user


def require_patient(current_user: SecureUser = Depends(get_current_user)) -> SecureUser:
    if current_user.role != "patient":
        raise HTTPException(status_code=403, detail="Patients only")
    return current_user


def require_doctor(current_user: SecureUser = Depends(get_current_user)) -> SecureUser:
    if current_user.role != "doctor":
        raise HTTPException(status_code=403, detail="Doctors only")
    return current_user
