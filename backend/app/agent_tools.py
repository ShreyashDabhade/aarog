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
        metadatas = results.get('metadatas') # Get metadata for filenames

        if not docs or not docs[0]:
            return "Observation: No relevant medical records found. The user may not have uploaded documents yet."
        
        flat_docs = docs[0]
        flat_metas = metadatas[0] if metadatas else [{}] * len(flat_docs)
        
        formatted_context = ""
        for i, (doc, meta) in enumerate(zip(flat_docs, flat_metas)):
            # Generate Frontend-Compatible Markdown Link
            # Syntax: [Filename](report_id)
            # We use a custom protocol or just path query param: /dashboard?view=REPORT_ID
            
            r_id = meta.get('report_id', 'unknown')
            f_name = meta.get('filename', 'Unknown File')
            
            formatted_context += f"SOURCE: {f_name} (ID: {r_id})\n"
            formatted_context += f"LINK: [View {f_name}](/dashboard?view={r_id})\n"
            formatted_context += f"CONTENT: {doc}\n\n"
            
        return formatted_context

    except Exception as e:
        print(f" [Tool Error] Retrieval failed: {e}")
        return f"Observation: Database error occurred - {str(e)}"

@tool
def get_current_date(query: str = "") -> str:
    """Returns today's date. Useful for calculating ages or timelines."""
    from datetime import date
    return str(date.today())