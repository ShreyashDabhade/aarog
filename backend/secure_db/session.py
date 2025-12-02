# backend/secure_db/session.py

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from secure_core.config import secure_settings  # if you created this

# Use the Postgres URL from your config, or hardcode if you prefer:
# DATABASE_URL = "postgresql://postgres:password@localhost:5432/secure_med"
DATABASE_URL = secure_settings.SECURE_DATABASE_URL

engine = create_engine(DATABASE_URL, echo=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency for FastAPI to get a DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
