from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
import os

def generate_keys():
    # 1. Generate Private Key
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )

    # 2. Serialize Private Key
    pem_priv = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )

    # 3. Generate Public Key
    public_key = private_key.public_key()
    pem_pub = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    )

    # 4. Save to docs folder
    os.makedirs("docs", exist_ok=True)
    
    with open("docs/server_privkey.pem", "wb") as f:
        f.write(pem_priv)
    
    with open("docs/server_pubkey.pem", "wb") as f:
        f.write(pem_pub)

    print("✅ Keys generated in backend/docs/")

if __name__ == "__main__":
    generate_keys()