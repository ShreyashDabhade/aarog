import os
import chromadb
from sentence_transformers import SentenceTransformer
from langchain.text_splitter import RecursiveCharacterTextSplitter

# --- CONFIG ---
CHROMA_DB_DIR = "data/chroma"
EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2" 

_chroma_client = None
_embedding_model = None

def get_chroma_client():
    global _chroma_client
    if _chroma_client is None:
        os.makedirs(CHROMA_DB_DIR, exist_ok=True)
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
    return client.get_or_create_collection(name="medical_reports")

# --- CORE LOGIC ---

def index_text_in_chroma(report_id: str, filename: str, text: str):
    """
    Splits text into chunks, embeds them using SentenceTransformer, 
    and stores in Chroma with filename metadata.
    """
    model = get_embedding_model()
    collection = get_collection()

    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=100)
    chunks = splitter.split_text(text)
    
    if not chunks:
        return

    # 1. Generate Embeddings Manually (Your original reliable method)
    embeddings = model.encode(chunks).tolist()

    ids = [f"{report_id}_{i}" for i in range(len(chunks))]
    
    # 2. Store Filename in Metadata (The new fix)
    metadatas = [{"report_id": report_id, "filename": filename, "chunk_index": i} for i in range(len(chunks))]

    collection.add(
        documents=chunks,
        embeddings=embeddings,
        metadatas=metadatas,
        ids=ids
    )
    print(f" [Chroma] Indexed {len(chunks)} chunks for {filename} ({report_id})")

def search_reports(query_text: str, k: int = 3, filter_metadata: dict = None):
    """
    Semantic search with optional Metadata Filtering.
    """
    model = get_embedding_model()
    collection = get_collection()

    query_embedding = model.encode([query_text]).tolist()

    results = collection.query(
        query_embeddings=query_embedding,
        n_results=k,
        where=filter_metadata
    )
    
    return results