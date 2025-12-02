import React, { useEffect } from 'react';
import { useUploadStore } from '../store/uploadStore';
import { useAuthStore } from '../store/authStore';
import { cryptoService } from '../lib/crypto';
import { nerService } from '../ner_service'; 
import Tesseract from 'tesseract.js';
import { useNavigate } from 'react-router-dom';
import { Upload, Activity, ShieldCheck, RefreshCw, Lock, FileImage, ArrowRight, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// --- STEP 1: DROPZONE ---
const DropZone = () => {
  const { setFile, setProcessedImage, setIsProcessing, setStep } = useUploadStore();
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFile(file);
    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setProcessedImage(ev.target.result);
      setStep(2);
      setIsProcessing(false);
    };
    reader.readAsDataURL(file);
  };
  return (
    <div className="h-full flex flex-col justify-center animate-in fade-in zoom-in duration-300">
      <div className="border-3 border-dashed border-slate-200 rounded-3xl p-16 text-center hover:bg-blue-50 hover:border-blue-400 transition-all cursor-pointer relative group bg-slate-50/50">
        <input type="file" accept="image/*,application/pdf" onChange={handleFile} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
        <div className="bg-white w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 shadow-md group-hover:scale-110 transition-transform duration-300">
          <Upload className="w-10 h-10 text-blue-600" />
        </div>
        <h3 className="text-2xl font-bold text-slate-800 mb-2">Upload Medical Record</h3>
        <p className="text-slate-500 max-w-sm mx-auto">Drag & drop your scanned reports (Images/PDF) here to begin the secure ingestion pipeline.</p>
      </div>
    </div>
  );
};

// --- STEP 2: OCR ---
const OCRReview = () => {
  const { file, setRawText, setStep, isProcessing, setIsProcessing, processedImage } = useUploadStore();
  useEffect(() => {
    const runOCR = async () => {
      if (!file) return;
      setIsProcessing(true);
      try {
        const result = await Tesseract.recognize(file, 'eng');
        setRawText(result.data.text);
      } finally { setIsProcessing(false); }
    };
    runOCR();
  }, [file]);
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full animate-in fade-in slide-in-from-right-8 duration-300">
        <div className="bg-slate-100 rounded-2xl overflow-hidden flex items-center justify-center border border-slate-200 relative group">
            {file && file.type.includes('image') ? (
               <img src={processedImage} alt="Preview" className="max-h-[500px] object-contain opacity-90 group-hover:opacity-100 transition-opacity" />
            ) : (
                <div className="p-10 text-slate-400">PDF Preview Not Available</div>
            )}
        </div>
        
        <div className="flex flex-col justify-center space-y-6">
            <div>
                <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                    {isProcessing ? <RefreshCw className="animate-spin text-blue-600"/> : <Check className="text-emerald-500"/>}
                    Extracting Text (OCR)
                </h3>
                <p className="text-slate-500 mt-2">Running local Tesseract.js engine to extract text.</p>
            </div>
            
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex-1 max-h-[400px] overflow-hidden relative">
                {isProcessing ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 z-10">
                        <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                        <p className="text-sm font-bold text-blue-600 animate-pulse">Analyzing Pixels...</p>
                    </div>
                ) : (
                   <p className="font-mono text-xs text-slate-600 leading-relaxed overflow-y-auto h-full p-2">{useUploadStore.getState().rawText || "No text detected."}</p>
                )}
            </div>

            <button 
                onClick={() => setStep(3)} 
                disabled={isProcessing}
                className="w-full bg-blue-600 text-white px-8 py-4 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
            >
                Proceed to Anonymization <ArrowRight className="w-5 h-5"/>
            </button>
        </div>
    </div>
  );
};

// --- STEP 3: ANONYMIZE ---
const Anonymizer = () => {
  const { rawText, anonymizedText, setAnonymizedText, setStep, isProcessing, setIsProcessing } = useUploadStore();
  
  useEffect(() => {
    const runNER = async () => {
      setIsProcessing(true);
      try {
        await nerService.load();
        const clean = rawText.replace(/^[|_—\s]+|[|_—\s]+$/gm, ""); 
        const sanitized = await nerService.anonymize(clean);
        setAnonymizedText(sanitized);
      } finally { setIsProcessing(false); }
    };
    runNER();
  }, []);

  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-8 duration-300">
       <div className="mb-6">
          <h3 className="text-2xl font-bold text-slate-800">Review & Anonymize</h3>
          <p className="text-slate-500">Our AI has identified potential PHI. Please verify the redactions before encryption.</p>
       </div>

      <div className="grid grid-cols-2 gap-6 flex-1 min-h-0">
        <div className="flex flex-col h-full">
          <div className="font-bold text-red-600 mb-3 flex items-center gap-2 text-sm uppercase tracking-wider bg-red-50 w-fit px-3 py-1 rounded-full border border-red-100">
            <Lock className="w-3 h-3"/> Original (Vault Copy)
          </div>
          <textarea readOnly value={rawText} className="flex-1 p-5 rounded-2xl border-2 border-red-100 bg-red-50/30 resize-none focus:outline-none text-sm leading-relaxed font-mono text-slate-600" />
        </div>
        <div className="flex flex-col h-full">
          <div className="font-bold text-emerald-600 mb-3 flex items-center gap-2 text-sm uppercase tracking-wider bg-emerald-50 w-fit px-3 py-1 rounded-full border border-emerald-100">
            <ShieldCheck className="w-3 h-3"/> Anonymized (AI Copy)
          </div>
          <div className="relative flex-1">
             {isProcessing && (
                 <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-2xl border border-emerald-100">
                     <div className="text-center">
                         <RefreshCw className="w-10 h-10 text-emerald-500 animate-spin mx-auto mb-3"/>
                         <p className="font-bold text-emerald-700">Detecting Entities...</p>
                     </div>
                 </div>
             )}
             <textarea 
                value={anonymizedText} 
                onChange={(e) => setAnonymizedText(e.target.value)} 
                className="w-full h-full p-5 rounded-2xl border-2 border-emerald-100 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 outline-none transition-all resize-none text-sm leading-relaxed font-mono text-slate-700 shadow-sm" 
             />
          </div>
        </div>
      </div>
      
      <div className="mt-6 flex justify-end">
          <button onClick={() => setStep(4)} disabled={isProcessing} className="bg-slate-900 text-white px-10 py-4 rounded-xl font-bold hover:bg-black transition shadow-xl flex items-center gap-3">
             Encrypt & Upload <Lock className="w-4 h-4"/>
          </button>
      </div>
    </div>
  );
};

// --- STEP 4: DUAL ENCRYPTION (MATCHING YOUR BACKEND) ---
const EncryptAndUpload = () => {
  const { anonymizedText, file, setUploadStatus, setReportId, uploadStatus, reportId } = useUploadStore();
  const { token, userPublicKeyPem } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    const process = async () => {
      setUploadStatus('encrypting');
      try {
        // 1. Get Server Public Key
        const serverKeyResp = await fetch(`http://localhost:8000/server_pubkey.pem`);
        if (!serverKeyResp.ok) throw new Error("Backend server key unreachable");
        const { public_key: serverPem } = await serverKeyResp.json();

        // 2. Encrypt for AI (Path A) - Anonymized Text
        const aesKeyRag = await cryptoService.generateAESKey();
        const ragData = await cryptoService.encryptData(aesKeyRag, anonymizedText);
        const ragKeyEnc = await cryptoService.wrapKeyWithRSA(serverPem, aesKeyRag);

        // 3. Encrypt for Storage (Path B) - Original Binary File
        if (!userPublicKeyPem) throw new Error("Missing user public key");
        
        const aesKeyVault = await cryptoService.generateAESKey();
        // Read file as buffer for encryption
        const fileBuffer = await file.arrayBuffer();
        const vaultData = await cryptoService.encryptData(aesKeyVault, fileBuffer);
        const vaultKeyEnc = await cryptoService.wrapKeyWithRSA(userPublicKeyPem, aesKeyVault);

        setUploadStatus('uploading');
        
        // 4. Send to Backend (Matches DualUploadPayload in main.py)
        const payload = {
          filename: file.name,
          anon_cipher: ragData.cipher,
          anon_iv: ragData.iv,
          anon_key_server: ragKeyEnc,
          original_cipher: vaultData.cipher,
          original_iv: vaultData.iv,
          original_key_patient: vaultKeyEnc
        };

        const resp = await fetch('http://localhost:8000/upload-record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(payload)
        });
        
        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.detail || "Upload failed");
        }

        const data = await resp.json();
        setReportId(data.report_id);
        setUploadStatus('success');

      } catch (err) { 
          console.error(err); 
          setUploadStatus('error'); 
      }
    };
    if (uploadStatus === 'idle') process();
  }, []);

  if (uploadStatus === 'success') return (
    <div className="text-center py-20 animate-in zoom-in duration-500">
      <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <ShieldCheck className="w-12 h-12 text-emerald-600"/>
      </div>
      <h3 className="text-3xl font-bold text-slate-800 mb-2">Upload Complete</h3>
      <p className="text-slate-500 mb-8">Your record has been securely encrypted and indexed.</p>
      
      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 inline-block mb-8">
          <p className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-1">Reference ID</p>
          <p className="text-lg font-mono font-bold text-slate-700">{reportId}</p>
      </div>

      <div className="flex gap-4 justify-center">
        <button onClick={() => navigate('/')} className="px-8 py-3 border border-slate-300 rounded-xl hover:bg-slate-50 font-bold text-slate-600 transition">Return to Vault</button>
        <button onClick={() => navigate('/chat')} className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/30 transition">Chat with AI Agent</button>
      </div>
    </div>
  );

  if (uploadStatus === 'error') return (
      <div className="text-center py-20 text-red-600">
          <h3 className="text-2xl font-bold">Upload Failed</h3>
          <p>Check console for details. Ensure backend is running.</p>
          <button onClick={() => setUploadStatus('idle')} className="mt-4 text-blue-600 underline">Try Again</button>
      </div>
  );

  return (
    <div className="py-32 text-center animate-in fade-in duration-500">
      <div className="relative w-24 h-24 mx-auto mb-8">
         <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
         <div className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
         <Activity className="absolute inset-0 m-auto w-8 h-8 text-blue-500 animate-pulse"/>
      </div>
      <h3 className="text-2xl font-bold text-slate-800 mb-2">Dual-Path Encryption</h3>
      <p className="text-slate-500 mb-6">Encrypting for AI (Anonymized) & Vault (Original)...</p>
    </div>
  );
};

const UploadWizard = () => {
  const { currentStep } = useUploadStore();
  const step = useUploadStore(s => s.currentStep);

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col">
       <div className="mb-8 flex items-center justify-between max-w-2xl mx-auto w-full px-4">
          {[1, 2, 3, 4].map(s => (
             <div key={s} className="flex items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all duration-500 ${step >= s ? 'bg-blue-600 text-white scale-110 shadow-blue-500/40 shadow-lg' : 'bg-slate-200 text-slate-400'}`}>
                   {step > s ? <Check className="w-5 h-5"/> : s}
                </div>
                {s < 4 && <div className={`w-16 h-1 mx-2 rounded-full transition-all duration-500 ${step > s ? 'bg-blue-600' : 'bg-slate-200'}`}></div>}
             </div>
          ))}
       </div>

      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 flex-1 p-8 overflow-hidden relative">
        <AnimatePresence mode='wait'>
          <motion.div key={step} className="h-full">
            {step === 1 && <DropZone />}
            {step === 2 && <OCRReview />}
            {step === 3 && <Anonymizer />}
            {step === 4 && <EncryptAndUpload />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default UploadWizard;