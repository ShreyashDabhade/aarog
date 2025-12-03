import os
import uuid
import chromadb
from chromadb.utils.embedding_functions import ONNXMiniLM_L6_V2
from langchain.text_splitter import RecursiveCharacterTextSplitter

# --- CONFIG ---
CHROMA_DB_DIR = "data/chroma"

_chroma_client = None
_embedding_fn = None
_collection = None


def get_chroma_client():
    global _chroma_client
    if _chroma_client is None:
        # Ensure directory exists
        os.makedirs(CHROMA_DB_DIR, exist_ok=True)
        _chroma_client = chromadb.PersistentClient(path=CHROMA_DB_DIR)
    return _chroma_client


def get_embedding_function():
    """
    Returns a singleton ONNX embedding function used by Chroma.
    """
    global _embedding_fn
    if _embedding_fn is None:
        print(" [Retrieval] Loading ONNXMiniLM_L6_V2 embedding function...")
        _embedding_fn = ONNXMiniLM_L6_V2()
    return _embedding_fn


def get_collection():
    """
    Returns (and creates if needed) the 'medical_reports' collection
    with the ONNX embedding function attached.
    """
    global _collection
    if _collection is None:
        client = get_chroma_client()
        _collection = client.get_or_create_collection(
            name="medical_reports",
            embedding_function=get_embedding_function(),
        )
    return _collection


# --- CORE LOGIC ---

def index_text_in_chroma(report_id: str, text: str):
    """
    Splits text into chunks and stores them in Chroma.
    Chroma will compute embeddings automatically via ONNXMiniLM_L6_V2.
    """
    collection = get_collection()

    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=100)
    chunks = splitter.split_text(text)

    if not chunks:
        return

    ids = [f"{report_id}_{i}" for i in range(len(chunks))]
    metadatas = [{"report_id": report_id, "chunk_index": i} for i in range(len(chunks))]

    collection.add(
        documents=chunks,
        metadatas=metadatas,
        ids=ids,
    )
    print(f" [Chroma] Indexed {len(chunks)} chunks for {report_id}")


def search_reports(query_text: str, k: int = 3, filter_metadata: dict | None = None):
    """
    Semantic search with optional metadata filtering.

    filter_metadata example:
        {"report_id": {"$in": ["id1", "id2"]}}
    """
    collection = get_collection()

    results = collection.query(
        query_texts=[query_text],   # let Chroma embed the query via ONNX
        n_results=k,
        where=filter_metadata,
    )

    return results
