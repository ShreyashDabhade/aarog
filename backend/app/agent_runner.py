# app/agent_runner.py

"""
Temporary stub for the RAG agent.

The original project used LangChain + Google Generative AI.
To avoid version & setup issues during integration,
we replace it with a simple function that returns a placeholder answer.

All your important project parts (secure auth, keys, and encrypted
medical records with Celery + Redis + Postgres) will still work.
"""

def run_query(q: str) -> str:
    if not q:
        return "Query is empty."

    preview = (q[:200] + "...") if len(q) > 200 else q

    return (
        "RAG agent is not fully configured in this environment.\n"
        f"You asked: '{preview}'\n"
        "For the demo, focus on secure login, key management, and encrypted records."
    )
