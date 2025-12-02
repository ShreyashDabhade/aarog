import React, { useState, useEffect } from 'react';
import Tesseract from 'tesseract.js';
import { Shield, Upload, Eye, Activity, User, FileText, Share2, LogOut } from 'lucide-react';
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

  // 2. ENCRYPTION
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
  },

  // 3. DECRYPTION (For Viewing Files)
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
    return decrypted; // Returns ArrayBuffer of the file
  },

  // 4. KEY WRAPPING (For Cross-Browser Access)
  deriveKeyFromPassword: async (password, salt) => {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]
    );
    return window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: enc.encode(salt),
        iterations: 100000,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
  },

  encryptPrivateKeyWithPassword: async (privateKeyPem, password) => {
    const salt = "static_salt_for_demo"; // Production should use random salt
    const wrappingKey = await CryptoManager.deriveKeyFromPassword(password, salt);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    
    const encrypted = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      wrappingKey,
      enc.encode(privateKeyPem)
    );

    return JSON.stringify({
      iv: buf2hex(iv),
      cipher: buf2hex(encrypted)
    });
  },

  decryptPrivateKeyWithPassword: async (encryptedPackageStr, password) => {
    const pkg = JSON.parse(encryptedPackageStr);
    const salt = "static_salt_for_demo";
    const wrappingKey = await CryptoManager.deriveKeyFromPassword(password, salt);
    
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: hex2buf(pkg.iv) },
      wrappingKey,
      hex2buf(pkg.cipher)
    );

    const dec = new TextDecoder();
    return dec.decode(decryptedBuffer); // This is your Private Key PEM
  }
};

const App = () => {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [view, setView] = useState("auth"); // auth, dashboard, upload, chat
  const [userRecords, setUserRecords] = useState([]);
  
  // Login State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  // Upload State
  const [file, setFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Chat State
  const [query, setQuery] = useState("");
  const [chatHistory, setChatHistory] = useState([]);

  // Logging State
  const [logs, setLogs] = useState([]);

  // LOGGING HELPER
  const addLog = (msg) => {
    console.log(msg);
    setLogs(prev => [...prev, msg]);
  };

  useEffect(() => {
    if (token) {
       setView("dashboard");
       fetchRecords();
    }
  }, [token]);

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
        // 1. Generate New Keys Locally
        addLog("Generating new 2048-bit RSA Keypair...");
        const keys = await CryptoManager.getOrGenerateUserKeys(); 
        
        // 2. Export Private Key to PEM for backup
        const privKeyExport = await window.crypto.subtle.exportKey("pkcs8", keys.privateKey);
        const privKeyPem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...new Uint8Array(privKeyExport)))}\n-----END PRIVATE KEY-----`;

        // 3. Encrypt Private Key with Password
        addLog("Encrypting private key with password...");
        const encryptedPrivKey = await CryptoManager.encryptPrivateKeyWithPassword(privKeyPem, password);

        // 4. Register on Server
        const body = JSON.stringify({ 
          email, 
          password, 
          public_key_pem: keys.pem, 
          encrypted_private_key: encryptedPrivKey, 
          role: "patient" 
        });

        const res = await fetch(`${API_URL}/register`, { 
            method: "POST", 
            headers: { "Content-Type": "application/json" }, 
            body 
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
        // LOGIN FLOW
        const body = new URLSearchParams({ username: email, password });
        const res = await fetch(`${API_URL}/token`, { 
            method: "POST", 
            headers: { "Content-Type": "application/x-www-form-urlencoded" }, 
            body 
        });
        
        const data = await res.json();
        if (res.ok) {
           localStorage.setItem("token", data.access_token);
           setToken(data.access_token);
           addLog("Login Token Received.");

           // 1. Check for Encrypted Key Backup
           if (data.encrypted_private_key) {
               addLog("Found secure key backup. Decrypting...");
               
               // 2. Decrypt Private Key
               const privKeyPem = await CryptoManager.decryptPrivateKeyWithPassword(data.encrypted_private_key, password);
               
               // 3. Cleanup PEM formatting for import
               const pemHeader = "-----BEGIN PRIVATE KEY-----";
               const pemFooter = "-----END PRIVATE KEY-----";
               const pemContents = privKeyPem.substring(
                   pemHeader.length, 
                   privKeyPem.length - pemFooter.length - 1 // remove newline if exists
               ).replace(/\s/g, ''); // remove newlines inside

               const binaryDerString = atob(pemContents);
               const binaryDer = new Uint8Array(binaryDerString.length);
               for (let i = 0; i < binaryDerString.length; i++) {
                   binaryDer[i] = binaryDerString.charCodeAt(i);
               }

               // 4. Import Private Key
               const privateKey = await window.crypto.subtle.importKey(
                   "pkcs8",
                   binaryDer.buffer,
                   { name: "RSA-OAEP", hash: "SHA-256" },
                   true,
                   ["decrypt"]
               );

               // 5. Re-save to LocalStorage so CryptoManager finds it
               // Note: Ideally we also fetch the public key to complete the pair, 
               // but for decryption, only Private Key is needed.
               // We will regenerate the JWK for storage consistency.
               const exportedPriv = await window.crypto.subtle.exportKey("jwk", privateKey);
               
               // We need a dummy or fetched public key to satisfy the object structure
               // Fetch public key from backend if possible, or just store incomplete if only decrypting
               // For now, let's fetch self public key
               const pubRes = await fetch(`${API_URL}/users/public-key?email=${email}`, { headers: { Authorization: `Bearer ${data.access_token}` }});
               const pubData = await pubRes.json();
               
               // Re-import Public Key
               const pubKeyObj = await CryptoManager.importServerKey(pubData.public_key);
               const exportedPub = await window.crypto.subtle.exportKey("jwk", pubKeyObj);

               localStorage.setItem("user_key_pair", JSON.stringify({ 
                   privateKey: exportedPriv, 
                   publicKey: exportedPub, 
                   pem: pubData.public_key 
               }));
               addLog("Keys restored successfully!");
           }
        } else {
          alert("Login Failed");
        }
      }
    } catch (e) {
      console.error(e);
      addLog("Error: " + e.message);
      alert("Auth Error: " + e.message);
    }
  };

  const processAndUpload = async () => {
    setIsProcessing(true);
    addLog("Starting Upload Process...");
    try {
      // 1. OCR & Anonymization
      addLog("Running Local OCR...");
      const { blob } = await preprocessImage(file);
      const ocrRes = await Tesseract.recognize(blob, 'eng');
      const cleanText = ocrRes.data.text.replace(/[|]/g, " ");
      
      addLog("Running PII Redaction (BERT)...");
      const anonText = await nerService.anonymize(cleanText);

      // 2. Fetch Server Key
      const srvKeyRes = await fetch(`${API_URL}/server_pubkey.pem`);
      const { public_key: srvPem } = await srvKeyRes.json();
      const serverKey = await CryptoManager.importServerKey(srvPem);
      
      // 3. Get User Key
      const { publicKey: userKey } = await CryptoManager.getOrGenerateUserKeys();

      // 4. Encrypt for AI Pipeline (Anonymized -> Server)
      addLog("Encrypting for AI Pipeline...");
      const aiEnc = await CryptoManager.encryptAES(anonText);
      const aiKeyEnc = await CryptoManager.encryptRSA(aiEnc.key, serverKey);

      // 5. Encrypt for Storage Pipeline (Original File -> Patient)
      addLog("Encrypting for Secure Storage...");
      const fileBuffer = await file.arrayBuffer();
      const storageEnc = await CryptoManager.encryptAES(new Uint8Array(fileBuffer));
      const storageKeyEnc = await CryptoManager.encryptRSA(storageEnc.key, userKey); 

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
        addLog("Upload Complete!");
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
  
  const handleDecrypt = async (record) => {
    try {
      console.log("Decrypting record:", record.id);
      
      // 1. Get User's Private Key
      const { privateKey } = await CryptoManager.getOrGenerateUserKeys();

      // 2. Decrypt the AES Key (which was encrypted with RSA)
      const rawAesKey = await CryptoManager.decryptRSA(record.enc_aes_key_patient, privateKey);
      
      // 3. Import the AES Key
      const aesKey = await window.crypto.subtle.importKey(
        "raw", 
        rawAesKey, 
        { name: "AES-GCM", length: 256 }, 
        true, 
        ["encrypt", "decrypt"]
      );

      // 4. Decrypt the actual file content
      const fileBuffer = await CryptoManager.decryptAES(
        record.original_ciphertext, 
        record.original_iv, 
        aesKey
      );

      // 5. Open in new tab
      let mime = "application/octet-stream";
      if (record.filename.toLowerCase().endsWith(".png")) mime = "image/png";
      if (record.filename.toLowerCase().endsWith(".jpg")) mime = "image/jpeg";
      if (record.filename.toLowerCase().endsWith(".jpeg")) mime = "image/jpeg";
      if (record.filename.toLowerCase().endsWith(".pdf")) mime = "application/pdf";

      const blob = new Blob([fileBuffer], { type: mime }); 
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');

    } catch (error) {
      console.error("Decryption failed:", error);
      alert("Decryption failed! You may have lost your key or are using a different device without restoring keys.");
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

  // --- UI RENDERING ---
  
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
        
        {/* Logs Display for Auth Debugging */}
        <div className="mt-4 p-2 bg-slate-900 text-green-400 text-xs font-mono rounded max-h-32 overflow-y-auto">
             {logs.length === 0 ? "Ready..." : logs.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </div>
    </div>
  );

  if (view === "dashboard") return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-slate-200 p-6 flex flex-col">
        <h1 className="font-bold text-xl mb-8 flex items-center gap-2"><Shield className="text-blue-600"/> Digilocker</h1>
        <button onClick={() => setView("dashboard")} className="flex items-center gap-3 p-3 bg-blue-50 text-blue-700 rounded-lg mb-2"><User size={18}/> My Records</button>
        <button onClick={() => setView("upload")} className="flex items-center gap-3 p-3 text-slate-600 hover:bg-slate-50 rounded-lg"><Upload size={18}/> Upload New</button>
        <button onClick={() => setView("chat")} className="flex items-center gap-3 p-3 text-slate-600 hover:bg-slate-50 rounded-lg"><Activity size={18}/> AI Assistant</button>
        <button onClick={() => { localStorage.clear(); setToken(null); }} className="flex items-center gap-3 p-3 text-red-600 hover:bg-slate-50 rounded-lg mt-auto"><LogOut size={18}/> Logout</button>
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
                <button onClick={() => handleDecrypt(rec)} className="flex-1 py-2 border border-slate-200 rounded text-sm hover:bg-slate-50 flex justify-center items-center gap-1">
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
             <div className="text-slate-600 font-mono text-sm">
                {logs.slice(-3).map((l, i) => <div key={i}>{l}</div>)}
             </div>
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
              >Send</button>
              <button onClick={() => setView("dashboard")} className="px-4 text-slate-500">Back</button>
          </div>
      </div>
  );

  return null;
};

export default App;