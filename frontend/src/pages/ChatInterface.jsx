import React, { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { Send, Bot, Sparkles, User, ShieldAlert } from 'lucide-react';

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
      setHistory(prev => [...prev, { role: 'bot', text: "Unable to connect to Agent. Please ensure the backend is running." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 h-[calc(100vh-140px)] flex flex-col overflow-hidden relative">
      
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-grid-slate-50 opacity-50 pointer-events-none"></div>

      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 bg-white/80 backdrop-blur-md flex justify-between items-center z-10 sticky top-0">
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <Bot className="w-5 h-5 text-blue-600" />
            </div>
            <div>
                <h3 className="font-bold text-slate-700 text-sm">Clinical AI Agent</h3>
                <p className="text-[10px] text-slate-400 font-mono">Gemini-1.5-Flash Encrypted</p>
            </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-xs font-bold border border-emerald-100">
            <ShieldAlert className="w-3 h-3"/> Privacy Mode: Active
        </div>
      </div>

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 z-0">
        {history.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex gap-3 max-w-[85%] lg:max-w-[75%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex shrink-0 items-center justify-center mt-1 ${msg.role === 'user' ? 'bg-slate-200' : 'bg-blue-600'}`}>
                    {msg.role === 'user' ? <User className="w-4 h-4 text-slate-500"/> : <Sparkles className="w-4 h-4 text-white"/>}
                </div>
                <div className={`
                  p-4 rounded-2xl text-sm leading-relaxed shadow-sm
                  ${msg.role === 'user' 
                    ? 'bg-slate-800 text-white rounded-tr-none' 
                    : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none'}
                `}>
                  {msg.text}
                </div>
            </div>
          </div>
        ))}
        
        {loading && (
          <div className="flex justify-start">
            <div className="ml-11 bg-white border border-slate-100 px-4 py-3 rounded-2xl rounded-tl-none flex items-center gap-2 shadow-sm">
              <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce delay-100"></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce delay-200"></div>
              </div>
              <span className="text-xs text-slate-400 font-medium ml-2">Analyzing medical context...</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-slate-100 bg-white z-10">
        <div className="relative flex items-center gap-3 max-w-4xl mx-auto">
          <input 
            type="text" 
            value={query} 
            onChange={(e) => setQuery(e.target.value)} 
            onKeyDown={(e) => e.key === 'Enter' && handleSend()} 
            className="flex-1 pl-5 pr-4 py-4 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm bg-slate-50 focus:bg-white"
            placeholder="Ask a clinical question about your uploaded reports..." 
            disabled={loading}
          />
          <button 
            onClick={handleSend} 
            disabled={loading || !query.trim()}
            className="p-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-blue-500/30 flex-shrink-0 active:scale-95"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <p className="text-center text-[10px] text-slate-400 mt-3">
          AI responses are generated from anonymized data for clinical support only. Not a diagnosis.
        </p>
      </div>
    </div>
  );
};

export default ChatInterface;