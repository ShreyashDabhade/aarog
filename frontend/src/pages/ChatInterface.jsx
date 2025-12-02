import React, { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { Send, Bot, User } from 'lucide-react';

const ChatInterface = () => {
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState([
    { role: 'bot', text: "Hello. I have secure access to the anonymized medical knowledge base. How can I assist you today?" }
  ]);
  const [loading, setLoading] = useState(false);
  const { token } = useAuthStore();
  const endRef = useRef(null);

  const scrollToBottom = () => endRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(scrollToBottom, [history]);

  const handleSend = async () => {
    if (!query.trim()) return;
    
    const userMsg = { role: 'user', text: query };
    setHistory(prev => [...prev, userMsg]);
    setQuery("");
    setLoading(true);

    try {
      // The backend expects 'q' query param and Authorization header
      const resp = await fetch(`http://localhost:8000/query?q=${encodeURIComponent(query)}`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!resp.ok) {
        throw new Error("Failed to fetch response");
      }

      const data = await resp.json();
      setHistory(prev => [...prev, { role: 'bot', text: data.answer }]);
    } catch (err) {
      console.error(err);
      setHistory(prev => [...prev, { role: 'bot', text: "Error connecting to the secure AI agent. Please ensure the backend is running." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 h-[calc(100vh-180px)] flex flex-col overflow-hidden">
      
      {/* Header / Context info could go here */}
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
          <Bot className="w-4 h-4 text-blue-600" />
          <span>Clinical AI Agent</span>
        </div>
        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-full border border-slate-200">
          Privacy Mode: Enabled
        </span>
      </div>

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {history.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`
              max-w-[85%] lg:max-w-[75%] p-4 rounded-2xl text-sm leading-relaxed shadow-sm
              ${msg.role === 'user' 
                ? 'bg-blue-600 text-white rounded-br-none' 
                : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'}
            `}>
              {msg.text}
            </div>
          </div>
        ))}
        
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-50 border border-slate-100 px-4 py-3 rounded-2xl rounded-bl-none flex items-center gap-2">
              <Bot className="w-4 h-4 text-blue-500 animate-bounce" />
              <span className="text-xs text-slate-500 font-medium">Analyzing records...</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-slate-100 bg-white">
        <div className="relative flex items-center gap-2 max-w-4xl mx-auto">
          <input 
            type="text" 
            value={query} 
            onChange={(e) => setQuery(e.target.value)} 
            onKeyDown={(e) => e.key === 'Enter' && handleSend()} 
            className="flex-1 pl-5 pr-4 py-3.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm bg-slate-50 focus:bg-white"
            placeholder="Ask a clinical question about your uploaded reports..." 
            disabled={loading}
          />
          <button 
            onClick={handleSend} 
            disabled={loading || !query.trim()}
            className="p-3.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg active:scale-95 flex-shrink-0"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <p className="text-center text-xs text-slate-400 mt-3">
          AI responses are generated from anonymized data. Verify with original documents.
        </p>
      </div>
    </div>
  );
};

export default ChatInterface;