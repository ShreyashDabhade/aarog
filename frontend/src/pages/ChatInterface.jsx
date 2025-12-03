import React, { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSearchParams, Link } from 'react-router-dom'; // Import Link
import { Send, Bot, User, Sparkles, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

// Helper to render text with Markdown-style links
const MessageContent = ({ text }) => {
  // Regex to find [Text](Url)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = linkRegex.exec(text)) !== null) {
    // Add text before link
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    // Add Link component
    parts.push(
      <Link 
        key={match.index} 
        to={match[2] === '/dashboard' ? '/' : match[2]} // Handle root redirect
        className="text-blue-400 hover:underline font-bold"
      >
        {match[1]}
      </Link>
    );
    lastIndex = linkRegex.lastIndex;
  }
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return <>{parts.length > 0 ? parts : text}</>;
};

const ChatInterface = () => {
  // ... [Keep existing state and handlers exactly as is] ...
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const { token, role } = useAuthStore();
  const endRef = useRef(null);
  const [searchParams] = useSearchParams();
  const patientId = searchParams.get("patientId");

  useEffect(() => {
    let welcome = "Hello. I am your secure medical assistant.";
    if (role === 'patient') {
        welcome = "I have access to YOUR encrypted records only. Ask me about your health.";
    } else if (role === 'doctor') {
        welcome = patientId 
            ? `I am analyzing records for Patient ID #${patientId}.` 
            : "I am in Global Research Mode.";
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
      let url = `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/query?q=${encodeURIComponent(query)}`;
      if (role === 'doctor' && patientId) url += `&patient_id=${patientId}`;

      const resp = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!resp.ok) throw new Error("Failed");
      const data = await resp.json();
      setHistory(prev => [...prev, { role: 'bot', text: data.answer }]);
    } catch (err) {
      setHistory(prev => [...prev, { role: 'bot', text: "Error connecting to AI." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-xl border border-slate-200 h-[calc(100vh-140px)] flex flex-col overflow-hidden">
      {/* ... [Header - Keep exactly as is] ... */}
      <div className="px-8 py-5 border-b border-slate-100 bg-white flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg bg-gradient-to-br from-blue-600 to-indigo-600 shadow-blue-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm">SecureMed AI</h3>
            <p className="text-xs text-slate-500">RAG Powered</p>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-slate-50/50">
        {history.map((msg, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={i} 
            className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-slate-200' : 'bg-blue-100 text-blue-600'}`}>
              {msg.role === 'user' ? <User className="w-5 h-5 text-slate-600"/> : <Bot className="w-5 h-5"/>}
            </div>
            
            <div className={`
              max-w-[75%] p-5 rounded-2xl text-sm leading-relaxed shadow-sm whitespace-pre-wrap
              ${msg.role === 'user' ? 'bg-slate-900 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none'}
            `}>
              {/* USE CUSTOM RENDERER */}
              <MessageContent text={msg.text} />
            </div>
          </motion.div>
        ))}
        {loading && <div className="text-center text-xs text-slate-400 animate-pulse">Thinking...</div>}
        <div ref={endRef} />
      </div>

      {/* ... [Input Area - Keep exactly as is] ... */}
      <div className="p-6 bg-white border-t border-slate-100">
        <div className="relative flex items-center gap-3 max-w-4xl mx-auto bg-slate-50 p-2 rounded-2xl border border-slate-200 focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all">
          <input 
            type="text" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} 
            className="flex-1 bg-transparent border-none focus:ring-0 text-slate-700 placeholder:text-slate-400 px-4 py-3"
            placeholder="Ask..." disabled={loading}
          />
          <button onClick={handleSend} disabled={loading} className="p-3 bg-blue-600 text-white rounded-xl">
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;