import React, { useState, useEffect, useRef } from 'react';
import Tesseract from 'tesseract.js';
import { Shield, Search, Lock, Upload, Eye, Activity, CheckCircle, User, FileText, Share2, LogOut, Terminal, X, ChevronRight, Menu, Edit3 } from 'lucide-react';
import { nerService } from './ner_service';

const API_URL = "http://localhost:8000";

// --- CRYPTO UTILS ---
const buf2hex = (buffer) => [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0')).join('');
const hex2buf = (hexString) => new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

const CryptoManager = {
  // 1. KEY MANAGEMENT
  getOrGenerateUserKeys: async () => {
    let keyStr = localStorage.getItem("user_key_pair");
    if (keyStr) {
      const keys = JSON.parse(keyStr);
      const privateKey = await window.crypto.subtle.importKey(
        "jwk", keys.privateKey, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["decrypt"]
      );
      const publicKey = await window.crypto.subtle.importKey(
        "jwk", keys.publicKey, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["encrypt"]
      );
      return { privateKey, publicKey, pem: keys.pem };
    }

    const keyPair = await window.crypto.subtle.generateKey(
      { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true, ["encrypt", "decrypt"]
    );

    const exportedPub = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const exportedPriv = await window.crypto.subtle.exportKey("jwk", keyPair.privateKey);
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

  // 2. ENCRYPTION
  encryptAES: async (textOrBuffer) => {
    const encoded = typeof textOrBuffer === 'string' ? new TextEncoder().encode(textOrBuffer) : textOrBuffer;
    const key = await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const cipher = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
    return { key, iv: buf2hex(iv), cipher: buf2hex(cipher) };
  },

  encryptRSA: async (aesKey, publicKey) => {
    const rawKey = await window.crypto.subtle.exportKey("raw", aesKey);
    const encrypted = await window.crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, rawKey);
    return buf2hex(encrypted);
  },

  // 3. DECRYPTION
  decryptRSA: async (cipherHex, privateKey) => {
    const buffer = hex2buf(cipherHex);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      buffer
    );
    return decrypted; 
  },

  decryptAES: async (cipherHex, ivHex, aesKey) => {
    const cipherBuffer = hex2buf(cipherHex);
    const iv = hex2buf(ivHex);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      aesKey,
      cipherBuffer
    );
    return decrypted; 
  },

  // 4. KEY WRAPPING (Cross-Browser Access)
  deriveKeyFromPassword: async (password, salt) => {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]
    );
    return window.crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" },
      keyMaterial, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
    );
  },

  encryptPrivateKeyWithPassword: async (privateKeyPem, password) => {
    const salt = "static_salt_for_demo"; 
    const wrappingKey = await CryptoManager.deriveKeyFromPassword(password, salt);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    
    const encrypted = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv }, wrappingKey, enc.encode(privateKeyPem)
    );

    return JSON.stringify({ iv: buf2hex(iv), cipher: buf2hex(encrypted) });
  },

  decryptPrivateKeyWithPassword: async (encryptedPackageStr, password) => {
    const pkg = JSON.parse(encryptedPackageStr);
    const salt = "static_salt_for_demo";
    const wrappingKey = await CryptoManager.deriveKeyFromPassword(password, salt);
    
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: hex2buf(pkg.iv) }, wrappingKey, hex2buf(pkg.cipher)
    );

    const dec = new TextDecoder();
    return dec.decode(decryptedBuffer); 
  }
};

// --- UI COMPONENTS ---
const StepIndicator = ({ num, title, active }) => (
  <div className={`flex items-center gap-4 p-4 rounded-lg transition-all ${active ? 'bg-blue-50 border border-blue-100' : 'opacity-60'}`}>
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${active ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
      {num}
    </div>
    <span className={`text-base font-semibold ${active ? 'text-blue-900' : 'text-slate-500'}`}>{title}</span>
    {active && <ChevronRight className="ml-auto w-5 h-5 text-blue-400" />}
  </div>
);

const App = () => {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [view, setView] = useState("auth"); 
  const [userRecords, setUserRecords] = useState([]);
  
  // Auth State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  // Upload Flow State
  const [file, setFile] = useState(null);
  const [rawText, setRawText] = useState("");
  const [anonymizedText, setAnonymizedText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState(1); // 1: Select, 2: OCR, 3: Review, 4: Encrypting, 5: Done
  const [uploadReportId, setUploadReportId] = useState(null);

  // Chat State
  const [query, setQuery] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Logs & UI
  const [logs, setLogs] = useState([]);
  const logsEndRef = useRef(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (token) {
       setView("dashboard");
       fetchRecords();
    }
  }, [token]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = (msg) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${msg}`]);
  };

  const fetchRecords = async () => {
    try {
      const res = await fetch(`${API_URL}/my-records`, { headers: { Authorization: `Bearer ${token}` }});
      if (res.ok) setUserRecords(await res.json());
    } catch (e) {
      console.error("Fetch failed", e);
    }
  };

  const handleAuth = async (isRegister) => {
    addLog(isRegister ? "Starting Registration..." : "Starting Login...");
    try {
      if (isRegister) {
        addLog("Generating 2048-bit RSA Keypair...");
        const keys = await CryptoManager.getOrGenerateUserKeys(); 
        
        const privKeyExport = await window.crypto.subtle.exportKey("pkcs8", keys.privateKey);
        const privKeyPem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...new Uint8Array(privKeyExport)))}\n-----END PRIVATE KEY-----`;

        addLog("Encrypting private key with password...");
        const encryptedPrivKey = await CryptoManager.encryptPrivateKeyWithPassword(privKeyPem, password);

        const res = await fetch(`${API_URL}/auth/register`, { 
            method: "POST", 
            headers: { "Content-Type": "application/json" }, 
            body: JSON.stringify({ 
              email, password, role: "patient",
              public_key_pem: keys.pem, 
              encrypted_private_key: encryptedPrivKey, 
            })
        });

        const data = await res.json();
        if (res.ok) {
          localStorage.setItem("token", data.access_token);
          setToken(data.access_token);
          addLog("Registration Successful!");
        } else {
          alert(data.detail || "Registration Failed");
        }

      } else {
        const res = await fetch(`${API_URL}/auth/token`, { 
            method: "POST", 
            headers: { "Content-Type": "application/json" }, // Changed to JSON for consistency if needed, but standard OAuth2 is form-data.
            // Let's keep your original URLSearchParams if the backend expects form-data
            // BUT Kanak's backend expects JSON body for login? No, my backend refactor put it in /token which usually is form.
            // Let's use JSON body as defined in the new router
            body: JSON.stringify({ username: email, password }) 
        });
        
        const data = await res.json();
        if (res.ok) {
           localStorage.setItem("token", data.access_token);
           setToken(data.access_token);
           addLog("Login Token Received.");

           if (data.encrypted_private_key) {
               addLog("Found secure key backup. Decrypting...");
               const privKeyPem = await CryptoManager.decryptPrivateKeyWithPassword(data.encrypted_private_key, password);
               
               // Import Private Key Logic
               const pemContents = privKeyPem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s/g, '');
               const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

               const privateKey = await window.crypto.subtle.importKey(
                   "pkcs8", binaryDer.buffer, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["decrypt"]
               );

               // Regenerate JWK for storage
               const exportedPriv = await window.crypto.subtle.exportKey("jwk", privateKey);
               
               // Fetch self public key to complete pair
               const pubRes = await fetch(`${API_URL}/users/public-key?email=${email}`, { headers: { Authorization: `Bearer ${data.access_token}` }});
               const pubData = await pubRes.json();
               const pubKeyObj = await CryptoManager.importServerKey(pubData.public_key);
               const exportedPub = await window.crypto.subtle.exportKey("jwk", pubKeyObj);

               localStorage.setItem("user_key_pair", JSON.stringify({ 
                   privateKey: exportedPriv, publicKey: exportedPub, pem: pubData.public_key 
               }));
               addLog("Keys restored successfully!");
           }
        } else {
          alert("Login Failed: " + data.detail);
        }
      }
    } catch (e) {
      console.error(e);
      addLog("Auth Error: " + e.message);
    }
  };

  const handleFileSelect = async (e) => {
    const f = e.target.files[0];
    if(!f) return;
    setFile(f);
    setStep(2);
    addLog(`File loaded: ${f.name}`);
    
    // Auto start OCR
    addLog("Initializing Tesseract OCR...");
    setIsProcessing(true);
    const { blob } = await preprocessImage(f);
    const ocrRes = await Tesseract.recognize(blob, 'eng');
    setRawText(ocrRes.data.text);
    addLog(`OCR Complete. Confidence: ${ocrRes.data.confidence}%`);
    setStep(3);
    setIsProcessing(false);
  };

  const runAnonymization = async () => {
    addLog("Running PII Redaction (BERT + Regex)...");
    // Clean text
    let text = rawText.replace(/[|]/g, " "); 
    const anon = await nerService.anonymize(text);
    setAnonymizedText(anon);
    addLog("Anonymization complete. Please Review.");
  };

  const processAndUpload = async () => {
    setStep(4);
    setIsProcessing(true);
    addLog("Starting Secure Upload Pipeline...");
    try {
      // 1. Keys
      addLog("Fetching Server Key & User Key...");
      const srvKeyRes = await fetch(`${API_URL}/server_pubkey.pem`);
      const { public_key: srvPem } = await srvKeyRes.json();
      const serverKey = await CryptoManager.importServerKey(srvPem);
      const { publicKey: userKey } = await CryptoManager.getOrGenerateUserKeys();

      // 2. Encrypt for AI (Server)
      addLog("Encrypting Anonymized Data for AI...");
      const aiEnc = await CryptoManager.encryptAES(anonymizedText);
      const aiKeyEnc = await CryptoManager.encryptRSA(aiEnc.key, serverKey);

      // 3. Encrypt for Storage (Patient)
      addLog("Encrypting Original File for Storage...");
      const fileBuffer = await file.arrayBuffer();
      const storageEnc = await CryptoManager.encryptAES(new Uint8Array(fileBuffer));
      const storageKeyEnc = await CryptoManager.encryptRSA(storageEnc.key, userKey); 

      // 4. Upload
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
        const data = await res.json();
        setUploadReportId(data.report_id);
        setStep(5);
        addLog("Upload Complete! ID: " + data.report_id);
        fetchRecords();
      } else {
        throw new Error("Server rejected upload");
      }

    } catch (e) {
      console.error(e);
      addLog("Error: " + e.message);
      setStep(3); // Go back to review
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDecrypt = async (record) => {
    try {
      addLog(`Decrypting record: ${record.id.substring(0,8)}...`);
      const { privateKey } = await CryptoManager.getOrGenerateUserKeys();
      const rawAesKey = await CryptoManager.decryptRSA(record.enc_aes_key_patient, privateKey);
      
      const aesKey = await window.crypto.subtle.importKey(
        "raw", rawAesKey, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
      );

      const fileBuffer = await CryptoManager.decryptAES(
        record.original_ciphertext, record.original_iv, aesKey
      );

      let mime = "application/octet-stream";
      if (record.filename.toLowerCase().endsWith(".png")) mime = "image/png";
      if (record.filename.toLowerCase().endsWith(".jpg")) mime = "image/jpeg";
      if (record.filename.toLowerCase().endsWith(".jpeg")) mime = "image/jpeg";
      if (record.filename.toLowerCase().endsWith(".pdf")) mime = "application/pdf";

      const blob = new Blob([fileBuffer], { type: mime }); 
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      addLog("Decryption successful. Opening file...");

    } catch (error) {
      console.error(error);
      addLog("Decryption Failed! Check keys.");
      alert("Decryption failed! You may have lost your key.");
    }
  };

  const handleChat = async () => {
    if (!query) return;
    const userMsg = { role: 'user', text: query };
    setChatHistory(prev => [...prev, userMsg]);
    setQuery("");
    setIsChatLoading(true);

    try {
      const resp = await fetch(`${API_URL}/query?q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${token}` }});
      const data = await resp.json();
      setChatHistory(prev => [...prev, userMsg, { role: 'bot', text: data.answer || "No response." }]);
    } catch (err) {
      setChatHistory(prev => [...prev, userMsg, { role: 'bot', text: "Error connecting to Agent." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

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

  // --- RENDER ---

  if (!token) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2"><Shield className="text-blue-600"/> SecureMed</h1>
        <input className="w-full p-3 mb-3 border rounded" placeholder="Email" onChange={e => setEmail(e.target.value)} />
        <input className="w-full p-3 mb-6 border rounded" type="password" placeholder="Password" onChange={e => setPassword(e.target.value)} />
        <div className="flex gap-4">
          <button onClick={() => handleAuth(false)} className="flex-1 bg-blue-600 text-white p-3 rounded font-bold hover:bg-blue-700">Login</button>
          <button onClick={() => handleAuth(true)} className="flex-1 bg-slate-100 text-slate-800 p-3 rounded font-bold hover:bg-slate-200">Register</button>
        </div>
        <div className="mt-4 p-2 bg-slate-950 text-green-400 text-xs font-mono rounded max-h-32 overflow-y-auto">
             {logs.length === 0 ? "Ready..." : logs.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 flex bg-slate-50 overflow-hidden font-sans text-slate-800">
      
      {/* SIDEBAR */}
      <div className={`
        fixed lg:static inset-y-0 left-0 z-50 
        w-[85%] sm:w-[400px] lg:w-[450px]
        flex flex-col border-r border-slate-200 bg-white h-full shadow-2xl lg:shadow-xl
        transform transition-transform duration-300 ease-in-out
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Shield className="w-8 h-8 text-blue-600" />
              SecureMed
            </h1>
            <div className="flex items-center gap-2 mt-2">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">System Online</span>
            </div>
          </div>
          <button onClick={() => setMobileMenuOpen(false)} className="lg:hidden p-2 text-slate-500"><X/></button>
        </div>

        {/* Action Buttons */}
        <div className="p-6 grid grid-cols-2 gap-4 border-b border-slate-100">
            <button onClick={() => setView("dashboard")} className={`flex flex-col items-center justify-center p-4 rounded-xl border transition ${view==="dashboard"?"bg-blue-50 border-blue-200 text-blue-700":"hover:bg-slate-50"}`}>
                <User size={24} className="mb-2"/> <span className="text-sm font-bold">Records</span>
            </button>
            <button onClick={() => setView("upload")} className={`flex flex-col items-center justify-center p-4 rounded-xl border transition ${view==="upload"?"bg-blue-50 border-blue-200 text-blue-700":"hover:bg-slate-50"}`}>
                <Upload size={24} className="mb-2"/> <span className="text-sm font-bold">Upload</span>
            </button>
        </div>

        {/* Status / Logs Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
            {view === "upload" && (
                <div className="space-y-4">
                    <StepIndicator num={1} title="Local Ingestion" active={step <= 2} />
                    <StepIndicator num={2} title="Review & Anonymize" active={step === 3} />
                    <StepIndicator num={3} title="Zero-Trust Encryption" active={step >= 4} />
                </div>
            )}
            
            <div className="mt-6 p-4 bg-slate-950 text-green-400 font-mono text-xs h-64 overflow-y-auto border-t border-slate-800 rounded-xl shadow-inner">
               <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                 <Terminal className="w-4 h-4" /> System Logs
               </div>
               <div ref={logsEndRef} />
               {logs.map((log, i) => <div key={i} className="mb-2 break-words leading-snug">{log}</div>)}
            </div>
        </div>
        
        <div className="p-4 border-t">
            <button onClick={() => { localStorage.clear(); setToken(null); }} className="flex items-center gap-3 p-3 text-red-600 hover:bg-slate-50 rounded-lg w-full justify-center"><LogOut size={18}/> Logout</button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col h-full relative bg-slate-100 w-full overflow-hidden">
        {/* Header */}
        <div className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm z-10 shrink-0">
             <button className="lg:hidden p-2 text-slate-600" onClick={() => setMobileMenuOpen(true)}><Menu/></button>
             <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
               {view === "dashboard" ? "My Secure Records" : view === "upload" ? "Secure Upload Pipeline" : "AI Agent"}
             </h2>
             <div className="text-xs font-semibold text-slate-500 bg-slate-100 px-4 py-1.5 rounded-full border border-slate-200">
                End-to-End Encrypted
             </div>
        </div>

        {/* View: Upload */}
        {view === "upload" && (
            <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                    
                    {step <= 2 && (
                        <div className="border-2 border-dashed border-slate-300 rounded-xl p-12 text-center cursor-pointer hover:bg-slate-50 transition relative">
                            <input type="file" onChange={handleFileSelect} className="absolute inset-0 opacity-0 cursor-pointer" />
                            <Upload className="w-12 h-12 text-blue-500 mx-auto mb-4"/>
                            <p className="text-lg font-semibold text-slate-700">Click to Upload Medical Report</p>
                            <p className="text-sm text-slate-400">Processed entirely in browser</p>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-red-50 rounded-lg border border-red-100 text-xs">
                                    <div className="font-bold text-red-800 mb-2 flex items-center gap-2"><Eye className="w-3 h-3"/> RAW PHI</div>
                                    <div className="h-40 overflow-y-auto">{rawText}</div>
                                </div>
                                <div className="p-4 bg-green-50 rounded-lg border border-green-100 text-xs">
                                    <div className="font-bold text-green-800 mb-2 flex items-center gap-2"><Edit3 className="w-3 h-3"/> REDACTED</div>
                                    <textarea className="w-full h-40 bg-transparent border-none outline-none resize-none" value={anonymizedText} onChange={e => setAnonymizedText(e.target.value)} />
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <button onClick={runAnonymization} className="flex-1 py-3 bg-blue-100 text-blue-700 rounded-lg font-bold">Sanitize</button>
                                <button onClick={processAndUpload} className="flex-1 py-3 bg-slate-900 text-white rounded-lg font-bold">Encrypt & Upload</button>
                            </div>
                        </div>
                    )}

                    {step >= 4 && (
                        <div className="text-center py-12">
                            {step === 4 ? (
                                <>
                                    <Activity className="w-16 h-16 text-blue-600 animate-spin mx-auto mb-6"/>
                                    <h3 className="text-xl font-bold text-slate-800">Encrypting & Uploading...</h3>
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-6"/>
                                    <h3 className="text-xl font-bold text-green-700">Upload Complete!</h3>
                                    <p className="text-slate-500 mt-2">ID: {uploadReportId}</p>
                                    <button onClick={() => { setView("dashboard"); setStep(1); }} className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg">View Records</button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* View: Dashboard & Chat (Split View) */}
        {view === "dashboard" && (
            <div className="flex-1 flex overflow-hidden">
                {/* Records List */}
                <div className="flex-1 overflow-y-auto p-8 border-r border-slate-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {userRecords.map(rec => (
                            <div key={rec.id} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-2 bg-blue-50 rounded-lg"><FileText className="text-blue-600 w-6 h-6"/></div>
                                    <span className="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded font-bold tracking-wide">AES-256</span>
                                </div>
                                <h3 className="font-bold text-slate-800 truncate mb-1">{rec.filename}</h3>
                                <p className="text-xs text-slate-400 mb-6 font-mono">ID: {rec.id.substring(0,8)}...</p>
                                <div className="flex gap-2">
                                    <button onClick={() => handleDecrypt(rec)} className="flex-1 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-black flex items-center justify-center gap-2">
                                        <Eye size={14}/> Decrypt
                                    </button>
                                    <button className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"><Share2 size={16}/></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Chat Panel (Right Side) */}
                <div className="w-[400px] bg-white flex flex-col border-l border-slate-200 shadow-xl">
                    <div className="p-4 border-b border-slate-100 font-bold text-slate-700 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-blue-600"/> Clinical Assistant
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                        {chatHistory.length === 0 && (
                            <div className="text-center text-slate-400 mt-10">
                                <Search className="w-12 h-12 mx-auto mb-2 opacity-20"/>
                                <p className="text-sm">Ask questions about your uploaded reports.</p>
                            </div>
                        )}
                        {chatHistory.map((msg, i) => (
                            <div key={i} className={`p-3 rounded-lg text-sm ${msg.role==='user'?'bg-blue-600 text-white ml-auto max-w-[80%]':'bg-white border border-slate-200 text-slate-700 mr-auto max-w-[90%]'}`}>
                                {msg.text}
                            </div>
                        ))}
                        {isChatLoading && <div className="text-xs text-slate-400 animate-pulse ml-2">Agent is thinking...</div>}
                    </div>
                    <div className="p-4 border-t border-slate-100 bg-white">
                        <div className="relative">
                            <input 
                                className="w-full pl-4 pr-10 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                placeholder="Ask a question..."
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleChat()}
                            />
                            <button onClick={handleChat} className="absolute right-2 top-2 p-1.5 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200">
                                <ChevronRight size={16}/>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

export default App;