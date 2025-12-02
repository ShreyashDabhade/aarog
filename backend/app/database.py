import os
from dotenv import load_dotenv # <--- NEW IMPORT
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# 1. Load the .env file explicitly
load_dotenv() 

# 2. Get the URL. If .env is loaded, this will now be "postgresql://admin:secret..."
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost/med_privacy_db")

print(f" [Database] Connecting to: {SQLALCHEMY_DATABASE_URL}") # Debug print to confirm

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()