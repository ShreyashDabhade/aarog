import React, { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { Send, Bot, User, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

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
      const resp = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/query?q=${encodeURIComponent(query)}`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!resp.ok) throw new Error("Failed to fetch response");

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
    <div className="bg-white rounded-3xl shadow-xl border border-slate-200 h-[calc(100vh-140px)] flex flex-col overflow-hidden">
      
      {/* Header */}
      <div className="px-8 py-5 border-b border-slate-100 bg-white flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Clinical AI Agent</h3>
            <p className="text-xs text-slate-500">Powered by RAG & Gemini</p>
          </div>
        </div>
        <div className="px-3 py-1 bg-slate-100 rounded-full border border-slate-200 text-xs font-semibold text-slate-600 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          Privacy Mode Active
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-slate-50/50">
        {history.map((msg, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            key={i} 
            className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-slate-200' : 'bg-blue-100 text-blue-600'}`}>
              {msg.role === 'user' ? <User className="w-5 h-5 text-slate-600"/> : <Bot className="w-5 h-5"/>}
            </div>
            
            <div className={`
              max-w-[75%] p-5 rounded-2xl text-sm leading-relaxed shadow-sm
              ${msg.role === 'user' 
                ? 'bg-slate-900 text-white rounded-tr-none' 
                : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none'}
            `}>
              {msg.text}
            </div>
          </motion.div>
        ))}
        
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-4">
            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5"/>
            </div>
            <div className="bg-white border border-slate-200 px-6 py-4 rounded-2xl rounded-tl-none flex items-center gap-2 shadow-sm">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-75"></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-150"></div>
            </div>
          </motion.div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="p-6 bg-white border-t border-slate-100">
        <div className="relative flex items-center gap-3 max-w-4xl mx-auto bg-slate-50 p-2 rounded-2xl border border-slate-200 focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all">
          <input 
            type="text" 
            value={query} 
            onChange={(e) => setQuery(e.target.value)} 
            onKeyDown={(e) => e.key === 'Enter' && handleSend()} 
            className="flex-1 bg-transparent border-none focus:ring-0 text-slate-700 placeholder:text-slate-400 px-4 py-3"
            placeholder="Ask a clinical question about your records..." 
            disabled={loading}
          />
          <button 
            onClick={handleSend} 
            disabled={loading || !query.trim()}
            className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md active:scale-95"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <p className="text-center text-xs text-slate-400 mt-4">
          AI generated responses are based on anonymized data. Please verify with original documents in your vault.
        </p>
      </div>
    </div>
  );
};

export default ChatInterface;