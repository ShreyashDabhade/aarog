import React, { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSearchParams } from 'react-router-dom'; // Import useSearchParams
import { Send, Bot, User, Sparkles, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

const ChatInterface = () => {
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const { token, role } = useAuthStore();
  const endRef = useRef(null);
  
  // Get Patient ID from URL (if doctor is analyzing a specific patient)
  const [searchParams] = useSearchParams();
  const patientId = searchParams.get("patientId");

  useEffect(() => {
    // Set initial welcome message based on context
    let welcome = "Hello. I am your secure medical assistant.";
    
    if (role === 'patient') {
        welcome = "I have access to YOUR encrypted records only. How can I help you understand your health?";
    } else if (role === 'doctor') {
        if (patientId) {
            welcome = `I am analyzing records for Patient ID #${patientId}. Ask me about their specific history.`;
        } else {
            welcome = "I am in Global Research Mode. I can search the entire anonymized knowledge base for patterns.";
        }
    }
    
    setHistory([{ role: 'bot', text: welcome }]);
  }, [role, patientId]);

  const scrollToBottom = () => endRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(scrollToBottom, [history]);

  const handleSend = async () => {
    if (!query.trim()) return;
    
    const userMsg = { role: 'user', text: query };
    setHistory(prev => [...prev, userMsg]);
    setQuery("");
    setLoading(true);

    try {
      // Build Query URL
      let url = `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/query?q=${encodeURIComponent(query)}`;
      
      // If doctor is focusing on a patient, append the ID
      if (role === 'doctor' && patientId) {
          url += `&patient_id=${patientId}`;
      }

      const resp = await fetch(url, {
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
      setHistory(prev => [...prev, { role: 'bot', text: "Error connecting to the secure AI agent." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-xl border border-slate-200 h-[calc(100vh-140px)] flex flex-col overflow-hidden">
      
      {/* Header */}
      <div className="px-8 py-5 border-b border-slate-100 bg-white flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg ${role === 'doctor' && !patientId ? 'bg-indigo-600 shadow-indigo-500/20' : 'bg-gradient-to-br from-blue-600 to-indigo-600 shadow-blue-500/20'}`}>
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm">
                {role === 'doctor' && !patientId ? "Global Medical Research AI" : "Personal Clinical Agent"}
            </h3>
            <p className="text-xs text-slate-500">
                {role === 'doctor' && patientId ? `Focusing on Patient #${patientId}` : "Powered by RAG & Gemini"}
            </p>
          </div>
        </div>
        
        <div className={`px-3 py-1 rounded-full border text-xs font-semibold flex items-center gap-2 ${role === 'doctor' && !patientId ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
          <div className={`w-2 h-2 rounded-full animate-pulse ${role === 'doctor' && !patientId ? 'bg-indigo-500' : 'bg-emerald-500'}`}></div>
          {role === 'doctor' && !patientId ? "Global Context" : "Scoped Context"}
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
              max-w-[75%] p-5 rounded-2xl text-sm leading-relaxed shadow-sm whitespace-pre-wrap
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
            placeholder={role === 'doctor' && !patientId ? "Ask a global research question..." : "Ask about the patient's history..."}
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
          {role === 'doctor' && !patientId 
            ? <span className="flex items-center justify-center gap-1"><AlertCircle className="w-3 h-3"/> Global Search Mode: Analyzing all anonymized records.</span>
            : "AI responses are based on the specific patient's anonymized data context."
          }
        </p>
      </div>
    </div>
  );
};

export default ChatInterface;