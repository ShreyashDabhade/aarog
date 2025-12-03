import os
import traceback
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.agents import AgentExecutor, create_react_agent
from langchain.prompts import PromptTemplate
from langchain.tools import Tool

# Internal imports
from .retrieval import search_reports # Import directly
from .agent_tools import get_current_date # Keep this static tool

# --- CONFIG ---
LLM_MODEL = "gemini-2.5-flash"

REACT_PROMPT = """
You are a Privacy-First Medical Assistant. Answer based ONLY on the provided medical reports.

TOOLS AVAILABLE:
{tools}

FORMAT INSTRUCTIONS:
To use a tool, please use the following format:

Question: the input question you must answer
Thought: Do I need to use a tool? Yes
Action: the action to take, should be one of [{tool_names}]
Action Input: the input to the action
Observation: the result of the action
... (repeat Thought/Action/Observation N times)
Thought: I now know the final answer
Final Answer: [Your response here]

IMPORTANT:
1. If you have the information, you MUST start your response with "Final Answer:".
2. Do NOT output "Thought:" without an "Action:" or "Final Answer:" following it.
3. When referencing a file, ALWAYS include the redirect link provided by the tool (e.g., [View Report](/dashboard?view=...)).

Begin!

Question: {input}
Thought:{agent_scratchpad}
"""

def create_search_tool(filter_metadata: dict = None):
    """Creates a configured search tool with a specific visibility filter."""
    
    def search_func(query: str):
        print(f" [Agent Tool] Searching: {query} | Filter: {filter_metadata}")
        try:
            results = search_reports(query, k=3, filter_metadata=filter_metadata)
            
            docs = results.get('documents')
            ids = results.get('ids')

            if not docs or not docs[0]:
                return "Observation: No relevant records found in the allowed scope."
            
            flat_docs = docs[0]
            flat_ids = ids[0]
            
            formatted_context = ""
            for i, (doc, doc_id) in enumerate(zip(flat_docs, flat_ids)):
                formatted_context += f"SOURCE {doc_id}: {doc}\n\n"
                
            return formatted_context
        except Exception as e:
            return f"Observation: Database error - {str(e)}"

    return Tool(
        name="search_medical_reports",
        func=search_func,
        description="Useful for answering questions about medical history. Returns excerpts from allowed reports."
    )

def get_agent_executor(filter_metadata: dict = None):
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("CRITICAL: GOOGLE_API_KEY is missing.")

    # 1. Setup LLM
    try:
        llm = ChatGoogleGenerativeAI(
            model=LLM_MODEL, 
            temperature=0, 
            convert_system_message_to_human=True,
            google_api_key=api_key
        )
    except Exception as e:
        raise ConnectionError(f"Failed to initialize Gemini: {str(e)}")
    
    # 2. Setup Tools (Dynamic)
    search_tool = create_search_tool(filter_metadata)
    tools = [search_tool, get_current_date]
    
    # 3. Setup Prompt
    prompt = PromptTemplate.from_template(REACT_PROMPT)
    
    # 4. Construct Agent
    agent = create_react_agent(llm, tools, prompt)
    
    # 5. Create Executor
    agent_executor = AgentExecutor(
        agent=agent, 
        tools=tools, 
        verbose=True,
        handle_parsing_errors=True,
        max_iterations=5
    )
    return agent_executor

def run_query(user_query: str, filter_metadata: dict = None):
    print(f" [Agent] Received Query: {user_query} | Scope: {filter_metadata}")
    try:
        executor = get_agent_executor(filter_metadata)
        result = executor.invoke({"input": user_query})
        return result["output"]
        
    except ValueError as ve:
        return f"CONFIGURATION ERROR: {str(ve)}"
    except Exception as e:
        print(f" [Agent Crash] {e}")
        traceback.print_exc()
        return f"SYSTEM ERROR: {str(e)}"