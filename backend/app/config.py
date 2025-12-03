from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # --- Database & Security ---
    DATABASE_URL: str = "postgresql+psycopg2://secure_user:StrongPassword123!@localhost:5432/secure_medrec"
    SECRET_KEY: str = "hackathon_secret_key_change_me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Optional: keep the secure DB as a separate env var if needed
    SECURE_DATABASE_URL: str = "postgresql+psycopg2://secure_user:StrongPassword123!@localhost:5432/secure_medrec"

    # --- Infrastructure ---
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    SERVER_PRIV_KEY_PATH: str = "docs/server_privkey.pem"
    SERVER_PUB_KEY_PATH: str = "docs/server_pubkey.pem"

    # --- External Services ---
    GOOGLE_API_KEY: str | None = None 

    # --- Configuration ---
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )

settings = Settings()
