from dotenv import load_dotenv
load_dotenv()

import os
import json
from celery import Celery
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

# --- FIX: Import the correct function name ---
from .retrieval import index_text_in_chroma 

# --- CONFIG ---
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
SERVER_PRIV_KEY_PATH = "docs/server_privkey.pem"

celery_app = Celery("tasks", broker=CELERY_BROKER_URL)

def load_private_key():
    """Loads the RSA private key to decrypt the AES key."""
    if not os.path.exists(SERVER_PRIV_KEY_PATH):
        raise FileNotFoundError(f"Private Key not found at {SERVER_PRIV_KEY_PATH}")
        
    with open(SERVER_PRIV_KEY_PATH, "rb") as key_file:
        return serialization.load_pem_private_key(
            key_file.read(),
            password=None,
            backend=default_backend()
        )

def decrypt_aes_key(encrypted_aes_hex: str, private_key) -> bytes:
    """Decrypts the client-generated AES key using Server's RSA Private Key."""
    encrypted_bytes = bytes.fromhex(encrypted_aes_hex)
    
    plaintext_key = private_key.decrypt(
        encrypted_bytes,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None
        )
    )
    return plaintext_key

def decrypt_document(ciphertext_hex: str, iv_hex: str, aes_key: bytes) -> str:
    """Decrypts the actual document text using AES-GCM."""
    # 1. Decode Hex
    full_data = bytes.fromhex(ciphertext_hex)
    
    # 2. SEPARATE TAG FROM CIPHERTEXT
    # WebCrypto appends the 16-byte (128-bit) authentication tag to the end.
    # Python requires this tag to be passed separately to modes.GCM(iv, tag).
    tag = full_data[-16:]
    ciphertext = full_data[:-16]

    iv = bytes.fromhex(iv_hex)

    # 3. Construct Cipher with explicit Tag
    cipher = Cipher(algorithms.AES(aes_key), modes.GCM(iv, tag), backend=default_backend())
    decryptor = cipher.decryptor()

    try:
        # 4. Decrypt the actual ciphertext portion
        decoded_text = decryptor.update(ciphertext) + decryptor.finalize()
        return decoded_text.decode('utf-8')
    except Exception as e:
        print(f"Decryption failed: {e}")
        raise e

@celery_app.task(name="process_document_task")
def process_document_task(report_id: str, filename: str, enc_aes_key_hex: str, iv_hex: str, ciphertext_hex: str):
    print(f" [Worker] Processing Report: {report_id} ({filename})")
    
    # 1. Load Keys
    try:
        priv_key = load_private_key()
    except Exception as e:
        print(" [FATAL] Could not load private key.")
        return "FAILED_KEY_LOAD"

    # 2. Decrypt AES Key (RSA)
    try:
        aes_key = decrypt_aes_key(enc_aes_key_hex, priv_key)
    except Exception as e:
        print(f" [Error] AES Key Decryption failed: {e}")
        return "FAILED_AES_DECRYPT"

    # 3. Decrypt Document (AES-GCM)
    try:
        plaintext_report = decrypt_document(ciphertext_hex, iv_hex, aes_key)
    except Exception as e:
        print(f" [Error] Document Decryption failed: {e}")
        return "FAILED_DOC_DECRYPT"

    # 4. Indexing (Pass filename now)
    index_text_in_chroma(report_id, filename, plaintext_report)
    
    print(f" [Worker] Successfully decrypted & indexed {filename}.")
    return "SUCCESS"