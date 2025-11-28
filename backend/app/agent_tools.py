from langchain.tools import tool
from typing import List
import json

# REAL IMPORT (No mocks)
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
        # Call the real ChromaDB search from retrieval.py
        results = search_reports(query, k=3)
        
        # Safe extraction of data from Chroma's specific result format
        # Chroma returns: {'documents': [['text1', 'text2']], 'ids': [['id1', 'id2']], ...}
        docs = results.get('documents')
        ids = results.get('ids')

        if not docs or not docs[0]:
            return "Observation: No relevant medical records found in the database. The user may not have uploaded/indexed the document yet."
        
        # Flatten the list of lists
        flat_docs = docs[0]
        flat_ids = ids[0]
        
        formatted_context = ""
        for i, (doc, doc_id) in enumerate(zip(flat_docs, flat_ids)):
            formatted_context += f"SOURCE {doc_id}: {doc}\n\n"
            
        return formatted_context

    except Exception as e:
        print(f" [Tool Error] Retrieval failed: {e}")
        return f"Observation: Database error occurred - {str(e)}"

@tool
def get_current_date(query: str = "") -> str:
    """Returns today's date. Useful for calculating ages or timelines."""
    from datetime import date
    return str(date.today())