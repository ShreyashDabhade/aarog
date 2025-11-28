import os
import uuid
# chromadb and sentence_transformers must be installed
import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer
from langchain.text_splitter import RecursiveCharacterTextSplitter

# --- CONFIG ---
CHROMA_DB_DIR = "data/chroma"
EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2" # Fast, decent for medical if fine-tuned, but ok for hackathon.

# Global instances (lazy loaded in production usually)
_chroma_client = None
_embedding_model = None

def get_chroma_client():
    global _chroma_client
    if _chroma_client is None:
        # PersistentClient ensures data is saved to disk
        _chroma_client = chromadb.PersistentClient(path=CHROMA_DB_DIR)
    return _chroma_client

def get_embedding_model():
    global _embedding_model
    if _embedding_model is None:
        print(" [Retrieval] Loading SentenceTransformer model...")
        _embedding_model = SentenceTransformer(EMBEDDING_MODEL_NAME)
    return _embedding_model

def get_collection():
    client = get_chroma_client()
    # get_or_create to avoid errors on restart
    return client.get_or_create_collection(name="medical_reports")

# --- CORE LOGIC ---

def index_text_in_chroma(report_id: str, text: str):
    """
    Splits text into chunks, embeds them, and stores in Chroma.
    See Image 1b37c5.jpg for the flow.
    """
    model = get_embedding_model()
    collection = get_collection()

    # 1. Chunking
    # Overlap is crucial for context in medical reports.
    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=100)
    chunks = splitter.split_text(text)
    
    if not chunks:
        return

    # 2. Embedding
    # SentenceTransformers handles batching efficiently
    embeddings = model.encode(chunks).tolist()

    # 3. Prepare IDs and Metadata
    ids = [f"{report_id}_{i}" for i in range(len(chunks))]
    metadatas = [{"report_id": report_id, "chunk_index": i} for i in range(len(chunks))]

    # 4. Upsert to Chroma
    collection.add(
        documents=chunks,
        embeddings=embeddings,
        metadatas=metadatas,
        ids=ids
    )
    print(f" [Chroma] Indexed {len(chunks)} chunks for {report_id}")

def search_reports(query_text: str, k: int = 3):
    """
    Semantic search for the RAG agent.
    """
    model = get_embedding_model()
    collection = get_collection()

    query_embedding = model.encode([query_text]).tolist()

    results = collection.query(
        query_embeddings=query_embedding,
        n_results=k
    )
    
    # Chroma returns a specific dict structure:
    # {'ids': [['id1', 'id2']], 'documents': [['text1', 'text2']], ...}
    
    return results