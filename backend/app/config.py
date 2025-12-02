from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # --- Database & Security ---
    DATABASE_URL: str = "postgresql://admin:secret@localhost:5433/med_privacy_db"
    SECRET_KEY: str = "hackathon_secret_key_change_me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # --- Infrastructure ---
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    SERVER_PRIV_KEY_PATH: str = "docs/server_privkey.pem"
    SERVER_PUB_KEY_PATH: str = "docs/server_pubkey.pem"

    # --- External Services ---
    # We add this so Pydantic reads it instead of crashing
    GOOGLE_API_KEY: str | None = None 

    # --- Configuration ---
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"  # <--- CRITICAL: This tells Pydantic to ignore PORT, HOST, etc.
    )

settings = Settings()