from pydantic import BaseModel
from typing import Optional, List

# Shared data structures used by API and potentially Agent tools

class ReportChunk(BaseModel):
    chunk_id: str
    text: str
    report_id: str
    score: Optional[float] = None

class SearchResult(BaseModel):
    query: str
    results: List[ReportChunk]

class AgentQueryRequest(BaseModel):
    query: str
    session_id: Optional[str] = "default"

class AgentResponse(BaseModel):
    answer: str
    sources: List[str] # List of chunk IDs used