from pydantic_settings import BaseSettings

class SecureSettings(BaseSettings):
    SECURE_DATABASE_URL: str = "postgresql+psycopg2://secure_user:StrongPassword123!@localhost:5432/secure_medrec"
    SECRET_KEY: str = "super-long-random-secret-change-this"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    ALGORITHM: str = "HS256"

    class Config:
        env_file = ".env"

secure_settings = SecureSettings()
