from langchain.tools import tool
from .retrieval import search_reports

@tool
def search_medical_reports(query: str) -> str:
    """
    Useful for answering questions about the patient's medical history. 
    Input should be a specific question or keyword search.
    Returns excerpts from the anonymized medical reports.
    """
    print(f" [Agent Tool] Searching for: {query}")
    
    try:
        results = search_reports(query, k=3)
        
        docs = results.get('documents')
        ids = results.get('ids')
        metadatas = results.get('metadatas') 

        if not docs or not docs[0]:
            return "Observation: No relevant medical records found."
        
        flat_docs = docs[0]
        flat_metas = metadatas[0] if metadatas else [{}] * len(flat_docs)
        
        formatted_context = ""
        for i, (doc, meta) in enumerate(zip(flat_docs, flat_metas)):
            r_id = meta.get('report_id', 'unknown')
            f_name = meta.get('filename', 'Unknown File')
            
            # --- FIX: Changed '/dashboard' to '/' ---
            # This ensures the query param survives the router
            formatted_context += f"Source: [{f_name}](/?view={r_id})\n"
            formatted_context += f"Content: {doc}\n\n"
            
        return formatted_context

    except Exception as e:
        print(f" [Tool Error] Retrieval failed: {e}")
        return f"Observation: Database error - {str(e)}"

@tool
def get_current_date(query: str = "") -> str:
    """Returns today's date."""
    from datetime import date
    return str(date.today())