import React, { useState, useEffect, useRef } from 'react';
import Tesseract from 'tesseract.js';
import { Shield, Search, Lock, Upload, Eye, Activity, CheckCircle, User, FileText, Share2, Key } from 'lucide-react';
import { nerService } from './ner_service';

const API_URL = "http://localhost:8000";

// --- CRYPTO UTILS ---
const buf2hex = (buffer) => [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0')).join('');
const hex2buf = (hexString) => new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

const CryptoManager = {
  // Generate RSA Keypair for Patient (stored in localStorage for demo persistence)
  getOrGenerateUserKeys: async () => {
    let keyStr = localStorage.getItem("user_key_pair");
    if (keyStr) {
      const keys = JSON.parse(keyStr);
      // Import back to CryptoKey objects
      const privateKey = await window.crypto.subtle.importKey(
        "jwk", keys.privateKey, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["decrypt"]
      );
      const publicKey = await window.crypto.subtle.importKey(
        "jwk", keys.publicKey, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["encrypt"]
      );
      return { privateKey, publicKey, pem: keys.pem };
    }

    // Generate New
    const keyPair = await window.crypto.subtle.generateKey(
      { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true, ["encrypt", "decrypt"]
    );

    // Export for storage
    const exportedPub = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const exportedPriv = await window.crypto.subtle.exportKey("jwk", keyPair.privateKey);
    
    // Export PEM for Server Registration
    const spki = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
    const pem = `-----BEGIN PUBLIC KEY-----\n${btoa(String.fromCharCode(...new Uint8Array(spki)))}\n-----END PUBLIC KEY-----`;

    localStorage.setItem("user_key_pair", JSON.stringify({ privateKey: exportedPriv, publicKey: exportedPub, pem }));
    return { ...keyPair, pem };
  },

  importServerKey: async (pem) => {
    const b64 = pem.replace(/-----BEGIN PUBLIC KEY-----/g, '').replace(/-----END PUBLIC KEY-----/g, '').replace(/\n/g, '');
    const binary = atob(b64);
    const buf = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
    return window.crypto.subtle.importKey("spki", buf, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  },

  encryptAES: async (textOrBuffer) => {
    const key = await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = typeof textOrBuffer === 'string' ? new TextEncoder().encode(textOrBuffer) : textOrBuffer;
    const cipher = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
    return { key, iv: buf2hex(iv), cipher: buf2hex(cipher) };
  },

  encryptRSA: async (aesKey, publicKey) => {
    const rawKey = await window.crypto.subtle.exportKey("raw", aesKey);
    const encrypted = await window.crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, rawKey);
    return buf2hex(encrypted);
  }
};

const App = () => {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [view, setView] = useState("auth"); // auth, dashboard, upload
  const [userRecords, setUserRecords] = useState([]);
  
  // Login State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [logs, setLogs] = useState([]);
  const addLog = (message) => {
    console.log(message); // Log to console for debugging
    // Optional: Only strictly necessary if you plan to render {logs} in your JSX
    setLogs(prev => [...prev, message]); 
  };
  
  // Upload State
  const [file, setFile] = useState(null);
  const [rawText, setRawText] = useState("");
  const [anonymizedText, setAnonymizedText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Chat State
  const [query, setQuery] = useState("");
  const [chatHistory, setChatHistory] = useState([]);

  useEffect(() => {
    if (token) {
       setView("dashboard");
       fetchRecords();
    }
  }, [token]);

  const fetchRecords = async () => {
    const res = await fetch(`${API_URL}/my-records`, { headers: { Authorization: `Bearer ${token}` }});
    if (res.ok) setUserRecords(await res.json());
  };

  const handleAuth = async (isRegister) => {
    let keys = { pem: "" };
    
    if (isRegister) {
      // Only generate keys on register
      addLog("Generating secure keys on device...");
      keys = await CryptoManager.getOrGenerateUserKeys();
    }

    const endpoint = isRegister ? "/register" : "/token";
    
    // LOGIN: Form Data (application/x-www-form-urlencoded)
    // REGISTER: JSON (application/json)
    
    let body;
    let headers = {};

    if (isRegister) {
      headers = { "Content-Type": "application/json" };
      body = JSON.stringify({ 
        email, 
        password, 
        public_key_pem: keys.pem, 
        role: "patient" 
      });
    } else {
      headers = { "Content-Type": "application/x-www-form-urlencoded" };
      body = new URLSearchParams({ 
        username: email, // OAuth2 expects 'username', not 'email'
        password: password 
      });
    }

    try {
      const res = await fetch(`${API_URL}${endpoint}`, { method: "POST", headers, body });
      const data = await res.json();
      
      if (res.ok) {
        localStorage.setItem("token", data.access_token);
        setToken(data.access_token);
        addLog("Authentication successful.");
      } else {
        alert(data.detail || "Auth Failed");
      }
    } catch (err) {
      alert("Network Error: Is backend running?");
    }
  };

  const processAndUpload = async () => {
    setIsProcessing(true);
    try {
      // 1. OCR & Anonymization (Existing Logic)
      const { blob } = await preprocessImage(file); // (Assuming helper exists from previous code)
      const ocrRes = await Tesseract.recognize(blob, 'eng');
      const cleanText = ocrRes.data.text.replace(/[|]/g, " ");
      const anonText = await nerService.anonymize(cleanText);

      // 2. Fetch Server Key
      const srvKeyRes = await fetch(`${API_URL}/server_pubkey.pem`);
      const { public_key: srvPem } = await srvKeyRes.json();
      const serverKey = await CryptoManager.importServerKey(srvPem);
      
      // 3. Get User Key
      const { publicKey: userKey } = await CryptoManager.getOrGenerateUserKeys();

      // 4. Encrypt for AI Pipeline (Anonymized -> Server)
      const aiEnc = await CryptoManager.encryptAES(anonText);
      const aiKeyEnc = await CryptoManager.encryptRSA(aiEnc.key, serverKey);

      // 5. Encrypt for Storage Pipeline (Original File -> Patient)
      const fileBuffer = await file.arrayBuffer();
      const storageEnc = await CryptoManager.encryptAES(new Uint8Array(fileBuffer));
      const storageKeyEnc = await CryptoManager.encryptRSA(storageEnc.key, userKey); // Encrypting for SELF

      // 6. Upload
      const payload = {
        filename: file.name,
        anon_cipher: aiEnc.cipher,
        anon_iv: aiEnc.iv,
        anon_key_server: aiKeyEnc,
        original_cipher: storageEnc.cipher,
        original_iv: storageEnc.iv,
        original_key_patient: storageKeyEnc
      };

      const res = await fetch(`${API_URL}/upload-record`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        alert("Secure Dual-Upload Complete!");
        setView("dashboard");
        fetchRecords();
      } else {
        alert("Upload Failed");
      }

    } catch (e) {
      console.error(e);
      alert("Error: " + e.message);
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Reuse existing preprocessImage helper from your original code
  const preprocessImage = (imageFile) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.src = URL.createObjectURL(imageFile);
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = img.width; canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          canvas.toBlob(blob => resolve({ blob, url: URL.createObjectURL(blob) }));
        };
      });
  };

  // --- UI RENDERING ---
  
  if (!token) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2"><Shield className="text-blue-600"/> SecureMed Login</h1>
        <input className="w-full p-3 mb-3 border rounded" placeholder="Email" onChange={e => setEmail(e.target.value)} />
        <input className="w-full p-3 mb-6 border rounded" type="password" placeholder="Password" onChange={e => setPassword(e.target.value)} />
        <div className="flex gap-4">
          <button onClick={() => handleAuth(false)} className="flex-1 bg-blue-600 text-white p-3 rounded font-bold hover:bg-blue-700">Login</button>
          <button onClick={() => handleAuth(true)} className="flex-1 bg-slate-100 text-slate-800 p-3 rounded font-bold hover:bg-slate-200">Register</button>
        </div>
        <p className="text-xs text-slate-400 mt-4 text-center">Your private keys are generated locally on registration.</p>
      </div>
    </div>
  );

  if (view === "dashboard") return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-slate-200 p-6 flex flex-col">
        <h1 className="font-bold text-xl mb-8 flex items-center gap-2"><Shield className="text-blue-600"/> Digilocker</h1>
        <button className="flex items-center gap-3 p-3 bg-blue-50 text-blue-700 rounded-lg mb-2"><User size={18}/> My Records</button>
        <button onClick={() => setView("upload")} className="flex items-center gap-3 p-3 text-slate-600 hover:bg-slate-50 rounded-lg"><Upload size={18}/> Upload New</button>
        <button onClick={() => setView("chat")} className="flex items-center gap-3 p-3 text-slate-600 hover:bg-slate-50 rounded-lg"><Activity size={18}/> AI Assistant</button>
      </div>

      {/* Content */}
      <div className="flex-1 p-8">
        <h2 className="text-2xl font-bold mb-6">My Encrypted Records</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {userRecords.map(rec => (
            <div key={rec.id} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
              <div className="flex justify-between items-start mb-4">
                <FileText className="text-blue-500 w-8 h-8"/>
                <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded font-mono">SECURE</span>
              </div>
              <h3 className="font-bold text-lg truncate">{rec.filename}</h3>
              <p className="text-xs text-slate-400 mb-4">ID: {rec.id.substring(0,8)}...</p>
              <div className="flex gap-2">
                <button className="flex-1 py-2 border border-slate-200 rounded text-sm hover:bg-slate-50 flex justify-center items-center gap-1">
                  <Eye size={14}/> View (Decrypt)
                </button>
                <button className="flex-1 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 flex justify-center items-center gap-1">
                  <Share2 size={14}/> Share
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (view === "upload") return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-2xl">
        <h2 className="text-2xl font-bold mb-6">Secure Dual-Pipeline Upload</h2>
        
        <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center mb-6">
           <input type="file" onChange={e => setFile(e.target.files[0])} />
        </div>

        {isProcessing ? (
           <div className="text-center py-8">
             <Activity className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4"/>
             <p className="text-slate-600 font-mono">Running Local OCR & BERT Anonymization...</p>
             <p className="text-slate-400 text-xs mt-2">Encrypting Original with YOUR key...</p>
             <p className="text-slate-400 text-xs">Encrypting Anonymized with SERVER key...</p>
           </div>
        ) : (
           <div className="flex gap-4">
             <button onClick={() => setView("dashboard")} className="flex-1 py-3 border rounded">Cancel</button>
             <button onClick={processAndUpload} disabled={!file} className="flex-1 py-3 bg-green-600 text-white rounded font-bold hover:bg-green-700">
               Encrypt & Upload
             </button>
           </div>
        )}
      </div>
    </div>
  );
  
  if (view === "chat") return (
      <div className="min-h-screen bg-slate-50 p-8 flex flex-col">
          <div className="flex-1 bg-white rounded-2xl shadow-sm p-6 mb-4 overflow-y-auto">
              {chatHistory.map((msg, i) => (
                  <div key={i} className={`p-4 mb-2 rounded-lg ${msg.role === 'user' ? 'bg-blue-100 ml-auto max-w-lg' : 'bg-slate-100 mr-auto max-w-lg'}`}>
                      {msg.text}
                  </div>
              ))}
          </div>
          <div className="flex gap-2">
              <input 
                  className="flex-1 p-4 rounded-xl border border-slate-300" 
                  placeholder="Ask about your records..."
                  value={query}
                  onChange={e => setQuery(e.target.value)}
              />
              <button 
                  className="bg-blue-600 text-white px-6 rounded-xl font-bold"
                  onClick={async () => {
                      const newHistory = [...chatHistory, {role: 'user', text: query}];
                      setChatHistory(newHistory);
                      setQuery("");
                      const res = await fetch(`${API_URL}/query?q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${token}` }});
                      const data = await res.json();
                      setChatHistory([...newHistory, {role: 'bot', text: data.answer}]);
                  }}
              >
                  Send
              </button>
              <button onClick={() => setView("dashboard")} className="px-4 text-slate-500">Back</button>
          </div>
      </div>
  );

  return null;
};

export default App;