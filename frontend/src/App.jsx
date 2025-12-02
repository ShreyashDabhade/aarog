// import React, { useState, useEffect, useRef } from 'react';
// // CDN Import for Tesseract
// import Tesseract from 'tesseract.js';
// import { Shield, Search, Lock, Upload, Eye, EyeOff, Activity, CheckCircle, FileText, Server, Edit3, AlertCircle, ChevronRight, Terminal, Menu, X, Sliders } from 'lucide-react';
// import { nerService } from './ner_service';

// const API_URL = "http://localhost:8000";

// // --- HELPERS ---
// const buf2hex = (buffer) => [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0')).join('');

// const pemToArrayBuffer = (pem) => {
//   const b64Lines = pem.replace(/-----BEGIN PUBLIC KEY-----/, '').replace(/-----END PUBLIC KEY-----/, '').replace(/\n/g, '');
//   const str = window.atob(b64Lines);
//   const buf = new ArrayBuffer(str.length);
//   const bufView = new Uint8Array(buf);
//   for (let i = 0, strLen = str.length; i < strLen; i++) bufView[i] = str.charCodeAt(i);
//   return buf;
// }

// const App = () => {
//   const [step, setStep] = useState(1);
//   const [file, setFile] = useState(null);
//   const [processedImage, setProcessedImage] = useState(null); // Preview the clean image
//   const [rawText, setRawText] = useState("");
//   const [anonymizedText, setAnonymizedText] = useState("");
//   const [logs, setLogs] = useState([]);
//   const [query, setQuery] = useState("");
//   const [chatHistory, setChatHistory] = useState([]);
//   const [isLoading, setIsLoading] = useState(false);
//   const [isAnonymizing, setIsAnonymizing] = useState(false);
//   const [serverStatus, setServerStatus] = useState("checking");
//   const [reportId, setReportId] = useState(null);
//   const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

//   const logsEndRef = useRef(null);
//   const scrollToBottom = () => logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
//   useEffect(scrollToBottom, [logs]);

//   const addLog = (msg) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

//   useEffect(() => {
//     fetch(`${API_URL}/`)
//       .then(() => { setServerStatus("online"); addLog("Connected to Secure Backend."); })
//       .catch(() => { setServerStatus("offline"); addLog("ERROR: Backend unreachable. Is uvicorn running?"); });

//     addLog("Pre-loading AI Models...");
//     nerService.load()
//       .then(() => addLog("NER Model Loaded & Ready."))
//       .catch(err => addLog(`NER Model Load Failed: ${err.message}`));
//   }, []);

//   /**
//    * PRE-PROCESSING ENGINE
//    * Takes a File object, draws it to a canvas, manipulates pixels, returns a Blob.
//    */
//   const preprocessImage = (imageFile) => {
//     return new Promise((resolve) => {
//       const img = new Image();
//       img.src = URL.createObjectURL(imageFile);
//       img.onload = () => {
//         const canvas = document.createElement('canvas');
//         const ctx = canvas.getContext('2d');
        
//         // 1. Rescaling (Increase DPI for better detection)
//         const scaleFactor = 2; 
//         canvas.width = img.width * scaleFactor;
//         canvas.height = img.height * scaleFactor;
        
//         ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
//         // 2. Pixel Manipulation
//         const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
//         const data = imageData.data;
        
//         for (let i = 0; i < data.length; i += 4) {
//           // Grayscale (Luminosity method)
//           const avg = 0.21 * data[i] + 0.72 * data[i + 1] + 0.07 * data[i + 2];
          
//           // Binarization (High Contrast Thresholding)
//           // If a pixel is lighter than gray 128, make it pure white (255). Otherwise black (0).
//           // This removes shadows and gray text artifacts.
//           const threshold = 140; 
//           const color = avg > threshold ? 255 : 0;
          
//           data[i] = color;     // R
//           data[i + 1] = color; // G
//           data[i + 2] = color; // B
//         }
        
//         ctx.putImageData(imageData, 0, 0);
        
//         // Return blob for Tesseract
//         canvas.toBlob((blob) => {
//           resolve({ blob, url: URL.createObjectURL(blob) });
//         }, 'image/png');
//       };
//     });
//   };

//   const handleFileChange = async (e) => {
//     const selectedFile = e.target.files[0];
//     if (!selectedFile) return;
    
//     setFile(selectedFile);
//     addLog(`File loaded: ${selectedFile.name}`);
//     setStep(2);
//     setIsLoading(true);

//     // 1. Run Pre-processing
//     addLog("Pre-processing image (Grayscale + Binarization)...");
//     const { blob, url } = await preprocessImage(selectedFile);
//     setProcessedImage(url); // Save for UI preview

//     // 2. Run OCR on CLEAN image
//     addLog("Initializing Tesseract (Best Model)...");

//     try {
//       const result = await Tesseract.recognize(
//         blob, 
//         'eng', 
//         {
//            // Using 'eng' by default via CDN, but you can configure 
//            // Tesseract workers to load 'eng_best.traineddata' if needed.
//            // For now, the pre-processing does 90% of the work.
//            logger: m => {
//              if (m.status === 'recognizing text') {
//                // optional progress
//              }
//            }
//         }
//       );
      
//       setRawText(result.data.text);
//       addLog(`OCR Complete. Confidence: ${result.data.confidence}%`);
//       setIsLoading(false);
//       setStep(3);
//     } catch (err) {
//       addLog(`OCR Failed: ${err.message}`);
//       setIsLoading(false);
//     }
//   };

//   const runAnonymization = async () => {
//     if (!rawText) return;
//     setIsAnonymizing(true);
//     addLog("Running AI-Powered Context Sanitization (BERT)...");
//     try {
//       let cleanText = rawText.replace(/^[|_—\s]+|[|_—\s]+$/gm, "").replace(/[|]/g, " "); 
//       const sanitized = await nerService.anonymize(cleanText);
//       setAnonymizedText(sanitized);
//       addLog("AI Analysis Complete. Please MANUAL REVIEW for accuracy.");
//     } catch (err) {
//       addLog(`Sanitization Error: ${err.message}`);
//     } finally {
//       setIsAnonymizing(false);
//     }
//   };

//   const performSecureUpload = async () => {
//     if (serverStatus === 'offline') { alert("Backend is offline."); return; }
//     setIsLoading(true);

//     try {
//       addLog("Fetching Server RSA Public Key...");
//       const keyResp = await fetch(`${API_URL}/server_pubkey.pem`);
//       if (!keyResp.ok) throw new Error("Failed to fetch public key");
//       const { public_key: pem } = await keyResp.json();

//       const rsaKeyData = pemToArrayBuffer(pem);
//       const serverRsaKey = await window.crypto.subtle.importKey("spki", rsaKeyData, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);

//       addLog("Generating ephemeral AES-256 key...");
//       const aesKey = await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

//       const encoder = new TextEncoder();
//       const dataEncoded = encoder.encode(anonymizedText);
//       const iv = window.crypto.getRandomValues(new Uint8Array(12));

//       const encryptedContentBuffer = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, aesKey, dataEncoded);
//       const rawAesKey = await window.crypto.subtle.exportKey("raw", aesKey);
//       const encryptedAesKeyBuffer = await window.crypto.subtle.encrypt({ name: "RSA-OAEP" }, serverRsaKey, rawAesKey);

//       addLog("Encryption successful. Uploading...");

//       const payload = {
//         cipher: buf2hex(encryptedContentBuffer),
//         iv: buf2hex(iv),
//         key: buf2hex(encryptedAesKeyBuffer),
//         filename: file.name,
//         patient_pubkey: "mock_key_v1"
//       };

//       const uploadResp = await fetch(`${API_URL}/submit-anon`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(payload)
//       });

//       if (!uploadResp.ok) {
//         const errData = await uploadResp.json();
//         throw new Error(errData.detail || "Upload failed");
//       }
      
//       const uploadResult = await uploadResp.json();
//       setReportId(uploadResult.report_id);
//       addLog(`Upload Success! ID: ${uploadResult.report_id}`);
//       setStep(5);
      
//     } catch (err) {
//       addLog(`ERROR: ${err.message}`);
//       console.error(err);
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   const handleChat = async () => {
//     if (!query) return;
//     const userMsg = { role: 'user', text: query };
//     setChatHistory(prev => [...prev, userMsg]);
//     setQuery("");
//     setIsLoading(true);

//     try {
//       const resp = await fetch(`${API_URL}/query?q=${encodeURIComponent(query)}`);
//       const data = await resp.json();
//       setChatHistory(prev => [...prev, userMsg, { role: 'bot', text: data.answer || "No response.", sources: [] }]);
//     } catch (err) {
//       setChatHistory(prev => [...prev, userMsg, { role: 'bot', text: "Error connecting to Agent." }]);
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   const StepIndicator = ({ num, title, active }) => (
//     <div className={`flex items-center gap-4 p-4 rounded-lg transition-all ${active ? 'bg-blue-50 border border-blue-100' : 'opacity-60'}`}>
//       <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${active ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
//         {num}
//       </div>
//       <span className={`text-base font-semibold ${active ? 'text-blue-900' : 'text-slate-500'}`}>{title}</span>
//       {active && <ChevronRight className="ml-auto w-5 h-5 text-blue-400" />}
//     </div>
//   );

//   return (
//     <div className="fixed inset-0 flex bg-slate-50 overflow-hidden font-sans text-slate-800">
      
//       {mobileMenuOpen && (
//         <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileMenuOpen(false)}></div>
//       )}

//       {/* --- SIDEBAR --- */}
//       <div className={`
//         fixed lg:static inset-y-0 left-0 z-50 
//         w-[85%] sm:w-[400px] lg:w-[450px]
//         flex flex-col border-r border-slate-200 bg-white h-full shadow-2xl lg:shadow-xl
//         transform transition-transform duration-300 ease-in-out
//         ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
//       `}>
        
//         <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
//           <div>
//             <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
//               <Shield className="w-8 h-8 text-blue-600" />
//               SecureMed AI
//             </h1>
//             <div className="flex items-center gap-2 mt-2">
//               <div className={`w-2.5 h-2.5 rounded-full ${serverStatus === 'online' ? 'bg-green-500' : 'bg-red-500'}`}></div>
//               <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
//                 {serverStatus === 'online' ? "System Operational" : "System Offline"}
//               </span>
//             </div>
//           </div>
//           <button onClick={() => setMobileMenuOpen(false)} className="lg:hidden p-2 text-slate-500">
//             <X className="w-6 h-6" />
//           </button>
//         </div>

//         <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
//           {/* STEP 1: UPLOAD & PREVIEW */}
//           <div className={step === 1 || step === 2 ? "opacity-100" : "opacity-40 pointer-events-none"}>
//             <StepIndicator num={1} title="Local Ingestion" active={step <= 2} />
//             <div className="mt-4 border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:bg-slate-50 transition relative group cursor-pointer">
//               <input type="file" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept="image/*" />
//               <div className="group-hover:scale-105 transition-transform duration-200">
//                 <Upload className="w-12 h-12 text-blue-500 mx-auto mb-3" />
//                 <p className="text-base text-slate-700 font-semibold">Click to Upload</p>
//                 <p className="text-sm text-slate-400 mt-1">Enhancement & OCR</p>
//               </div>
//             </div>
            
//             {/* Show Processed Image Preview so user sees the "Clean" version */}
//             {processedImage && (
//               <div className="mt-4">
//                  <p className="text-xs font-bold text-slate-500 mb-2 uppercase flex items-center gap-1"><Sliders className="w-3 h-3"/> Processed Input (Binarized)</p>
//                  <img src={processedImage} alt="Cleaned Input" className="w-full h-auto rounded border border-slate-200" />
//               </div>
//             )}
//           </div>

//           {/* STEP 2: ANONYMIZE */}
//           <div className={step === 3 ? "opacity-100" : "opacity-40 pointer-events-none"}>
//             <StepIndicator num={2} title="Review & Anonymize" active={step === 3} />
//             {step >= 3 && (
//                <div className="mt-4 space-y-4">
//                  <div className="p-4 bg-red-50 rounded-lg border border-red-100 text-sm">
//                    <div className="font-bold text-red-800 mb-2 flex items-center gap-2"><Eye className="w-4 h-4"/> RAW PHI</div>
//                    <div className="font-mono text-slate-700 max-h-32 overflow-y-auto bg-white p-3 rounded border border-red-100 text-xs leading-relaxed">{rawText}</div>
//                  </div>
//                  <div className="p-4 bg-green-50 rounded-lg border border-green-100 text-sm">
//                    <div className="font-bold text-green-800 mb-2 flex items-center gap-2"><Edit3 className="w-4 h-4"/> REDACTED (EDITABLE)</div>
//                    <textarea 
//                      className="w-full h-48 p-3 mt-1 border border-green-200 rounded focus:ring-2 focus:ring-green-500 bg-white text-slate-900 font-mono text-sm leading-relaxed"
//                      value={anonymizedText} 
//                      onChange={(e) => setAnonymizedText(e.target.value)} 
//                      placeholder="Sanitization pending..." 
//                    />
//                  </div>
//                  <div className="flex gap-3">
//                    <button 
//                       onClick={runAnonymization} 
//                       disabled={isAnonymizing}
//                       className="flex-1 py-3 bg-blue-100 text-blue-700 rounded-lg text-sm font-bold hover:bg-blue-200 transition disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
//                    >
//                      {isAnonymizing ? (
//                        <><Activity className="w-4 h-4 animate-spin"/> Running AI...</>
//                      ) : "Run AI Sanitizer"}
//                    </button>
//                    {anonymizedText && !isAnonymizing && (
//                      <button onClick={performSecureUpload} className="flex-1 py-3 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-black transition shadow-lg shadow-blue-900/20">Encrypt & Upload</button>
//                    )}
//                  </div>
//                </div>
//             )}
//           </div>

//           {/* STEP 3: STATUS */}
//           <div className={step >= 4 ? "opacity-100" : "opacity-40"}>
//             <StepIndicator num={3} title="Zero-Trust Encryption" active={step >= 4} />
//             {step === 4 && <div className="mt-4 text-center text-sm text-blue-600 font-mono animate-pulse flex items-center justify-center gap-2"><Activity className="w-4 h-4" /> Encrypting payload...</div>}
//             {step === 5 && (
//                <div className="mt-4 p-5 bg-green-50 border border-green-200 rounded-xl text-center shadow-sm">
//                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
//                  <p className="text-base font-bold text-green-800">Secure Upload Complete</p>
//                  <p className="text-xs text-slate-500 font-mono mt-1 break-all bg-white/50 p-1 rounded">{reportId}</p>
//                </div>
//             )}
//           </div>
//         </div>

//         <div className="p-4 bg-slate-950 text-green-400 font-mono text-xs h-64 overflow-y-auto border-t border-slate-800 shadow-inner">
//            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
//              <Terminal className="w-4 h-4" /> System Logs
//            </div>
//            <div ref={logsEndRef} />
//            {logs.map((log, i) => <div key={i} className="mb-2 opacity-90 hover:opacity-100 break-words border-l-2 border-transparent hover:border-green-500 pl-2 transition-all leading-snug">{log}</div>)}
//         </div>
//       </div>

//       <div className="flex-1 flex flex-col h-full relative bg-slate-100 w-full">
        
//         <div className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-6 lg:px-8 shadow-sm z-10 shrink-0">
//           <div className="flex items-center gap-4">
//             <button 
//               className="lg:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg"
//               onClick={() => setMobileMenuOpen(true)}
//             >
//               <Menu className="w-6 h-6" />
//             </button>
//             <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
//               <Activity className="hidden sm:block w-6 h-6 text-blue-600" />
//               Clinical Agent Interface
//             </h2>
//           </div>
//           <div className="text-xs font-semibold text-slate-500 bg-slate-100 px-4 py-1.5 rounded-full border border-slate-200 hidden sm:block">
//             Model: Gemini-1.5-Flash (Privacy Mode)
//           </div>
//         </div>

//         <div className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-6">
//            {chatHistory.length === 0 && (
//              <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60 px-4 text-center">
//                <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm border border-slate-100">
//                  {step < 5 ? <Lock className="w-10 h-10 text-slate-300"/> : <Search className="w-10 h-10 text-blue-500" />}
//                </div>
//                <p className="text-2xl font-semibold text-slate-600">{step < 5 ? "Pipeline Locked" : "Ready for Clinical Queries"}</p>
//                <p className="text-lg text-slate-400 mt-2 max-w-md">{step < 5 ? "Upload & Encrypt a Report via the sidebar to unlock analysis." : "Ask questions based on the anonymized record."}</p>
//              </div>
//            )}
//            {chatHistory.map((msg, idx) => (
//               <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
//                 <div className={`max-w-[85%] lg:max-w-[70%] p-5 rounded-2xl shadow-sm text-base leading-relaxed ${
//                   msg.role === 'user' 
//                     ? 'bg-blue-600 text-white rounded-br-none' 
//                     : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
//                 }`}>
//                   {msg.text}
//                 </div>
//               </div>
//            ))}
//            {isLoading && step === 5 && (
//              <div className="flex justify-start">
//                <div className="bg-white border border-slate-200 px-6 py-4 rounded-2xl rounded-bl-none shadow-sm flex items-center gap-2">
//                  <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce"></div>
//                  <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce delay-75"></div>
//                  <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce delay-150"></div>
//                </div>
//              </div>
//            )}
//         </div>

//         <div className="p-6 lg:p-8 bg-white border-t border-slate-200 shrink-0">
//           <div className="max-w-5xl mx-auto relative">
//             <input 
//               type="text" 
//               className="w-full pl-6 pr-16 py-4 rounded-full border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none shadow-sm text-lg disabled:bg-slate-50 disabled:cursor-not-allowed transition-all"
//               placeholder={step < 5 ? "Pipeline locked. Complete encryption first." : "Ask a clinical question about the report..."}
//               value={query} 
//               onChange={e => setQuery(e.target.value)} 
//               onKeyDown={e => e.key === 'Enter' && handleChat()}
//               disabled={step < 5 || isLoading}
//             />
//             <button 
//               onClick={handleChat} 
//               disabled={step < 5 || isLoading}
//               className="absolute right-2 top-2 p-2.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:bg-slate-300 transition-all shadow-md hover:shadow-lg transform active:scale-95"
//             >
//               <Search className="w-6 h-6" />
//             </button>
//           </div>
//           <div className="text-center mt-4">
//             <span className="text-xs text-slate-400 flex items-center justify-center gap-1.5 font-medium uppercase tracking-wide">
//               <Lock className="w-3.5 h-3.5" /> End-to-End Encrypted Session
//             </span>
//           </div>
//         </div>

//       </div>
//     </div>
//   );
// };

// export default App;



// import React from 'react';
// import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
// import { useAuthStore } from './store/authStore';
// import DashboardLayout from './components/layout/DashboardLayout';
// import Login from './pages/Login';
// import Register from './pages/Register';
// import Dashboard from './pages/Dashboard';
// import UploadWizard from './pages/UploadWizard';
// import ChatInterface from './pages/ChatInterface';

// // Guard component to protect private routes
// const ProtectedRoute = () => {
//   const { isAuthenticated } = useAuthStore();
//   return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
// };

// const App = () => {
//   return (
//     <BrowserRouter>
//       <Routes>
//         {/* Public Routes */}
//         <Route path="/login" element={<Login />} />
//         <Route path="/register" element={<Register />} />
        
//         {/* Secure Routes (Wrapped in Guard) */}
//         <Route element={<ProtectedRoute />}>
//           <Route path="/" element={<DashboardLayout />}>
//             <Route index element={<Dashboard />} />
//             <Route path="upload" element={<UploadWizard />} />
//             <Route path="chat" element={<ChatInterface />} />
//           </Route>
//         </Route>
        
//         {/* Catch-all: Redirect unknown paths to home */}
//         <Route path="*" element={<Navigate to="/" replace />} />
//       </Routes>
//     </BrowserRouter>
//   );
// };

// export default App;
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import DashboardLayout from './components/layout/DashboardLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import UploadWizard from './pages/UploadWizard';
import ChatInterface from './pages/ChatInterface';

// --- MOCK MODE: GUARD UNLOCKED ---
const ProtectedRoute = () => {
  // In a real app, we check: const { isAuthenticated } = useAuthStore();
  // But for this mock run, we just render the Outlet.
  return <Outlet />;
};

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        
        {/* Protected Routes (Now Unlocked) */}
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<DashboardLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="upload" element={<UploadWizard />} />
            <Route path="chat" element={<ChatInterface />} />
          </Route>
        </Route>
        
        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;