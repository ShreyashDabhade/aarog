import os
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

def generate_keys():
    # Ensure docs directory exists
    os.makedirs("docs", exist_ok=True)
    
    # 1. CHECK FOR KEYS IN ENVIRONMENT VARIABLES (Render Persistence Fix)
    env_priv = os.getenv("SERVER_PRIVATE_KEY_CONTENT")
    env_pub = os.getenv("SERVER_PUBLIC_KEY_CONTENT")

    if env_priv and env_pub:
        print(" [Keys] Loading persistent keys from Environment Variables...")
        # Write them to files so the app can read them as usual
        with open("docs/server_privkey.pem", "w") as f:
            f.write(env_priv)
        with open("docs/server_pubkey.pem", "w") as f:
            f.write(env_pub)
        return

    # 2. GENERATE NEW KEYS (Localhost fallback)
    print(" [Keys] Generating NEW keys (Local Mode)...")
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )

    pem_priv = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )

    public_key = private_key.public_key()
    pem_pub = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    )

    with open("docs/server_privkey.pem", "wb") as f:
        f.write(pem_priv)
    
    with open("docs/server_pubkey.pem", "wb") as f:
        f.write(pem_pub)
    
    print("✅ Keys generated in backend/docs/")

if __name__ == "__main__":
    generate_keys()