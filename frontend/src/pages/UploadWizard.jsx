import React, { useEffect } from 'react';
import { useUploadStore } from '../store/uploadStore';
import { useAuthStore } from '../store/authStore';
import { cryptoService } from '../lib/crypto';
import { nerService } from '../ner_service'; 
import Tesseract from 'tesseract.js';
import { useNavigate } from 'react-router-dom';
import { Upload, Activity, ShieldCheck, RefreshCw, Lock } from 'lucide-react';
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
    <div className="border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center hover:bg-blue-50 hover:border-blue-400 transition-all cursor-pointer relative group">
      <input type="file" accept="image/*" onChange={handleFile} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
      <div className="bg-blue-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
        <Upload className="w-10 h-10 text-blue-600" />
      </div>
      <h3 className="text-xl font-bold text-slate-800">Upload Medical Record</h3>
    </div>
  );
};

// --- STEP 2: OCR ---
const OCRReview = () => {
  const { file, setRawText, setStep, isProcessing, setIsProcessing } = useUploadStore();
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
    <div className="text-center space-y-6">
      <h3 className="text-xl font-bold text-slate-800">Extracting Text (Local)</h3>
      {isProcessing ? <RefreshCw className="w-12 h-12 text-blue-500 animate-spin mx-auto" /> : (
        <button onClick={() => setStep(3)} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold">Review & Anonymize</button>
      )}
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
    <div className="grid grid-cols-2 gap-8 h-[500px]">
      <div className="flex flex-col">
        <div className="font-bold text-red-600 mb-2">Original PHI (For Vault)</div>
        <textarea readOnly value={rawText} className="flex-1 p-4 rounded-xl border-2 border-red-100 bg-red-50/50 resize-none" />
      </div>
      <div className="flex flex-col">
        <div className="font-bold text-emerald-600 mb-2">Anonymized (For AI)</div>
        <textarea value={anonymizedText} onChange={(e) => setAnonymizedText(e.target.value)} className="flex-1 p-4 rounded-xl border-2 border-emerald-100 resize-none" />
        <button onClick={() => setStep(4)} disabled={isProcessing} className="mt-4 bg-slate-900 text-white py-4 rounded-xl font-bold">Encrypt & Upload</button>
      </div>
    </div>
  );
};

// --- STEP 4: DUAL ENCRYPTION ---
const EncryptAndUpload = () => {
  const { anonymizedText, rawText, file, setUploadStatus, setReportId, uploadStatus, reportId } = useUploadStore();
  const { token, userPublicKeyPem } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    const process = async () => {
      setUploadStatus('encrypting');
      try {
        if (!token || !userPublicKeyPem) throw new Error("Authentication missing");

        // 1. PATH A: RAG (Anonymized -> Server Key)
        const serverKeyResp = await fetch(`http://localhost:8000/server_pubkey.pem`);
        const { public_key: serverPem } = await serverKeyResp.json();
        const aesKeyRag = await cryptoService.generateAESKey();
        const ragData = await cryptoService.encryptData(aesKeyRag, anonymizedText);
        const ragKeyEnc = await cryptoService.wrapKeyWithRSA(serverPem, aesKeyRag);

        // 2. PATH B: VAULT (Original -> User Public Key)
        const aesKeyVault = await cryptoService.generateAESKey();
        const vaultData = await cryptoService.encryptData(aesKeyVault, rawText);
        const vaultKeyEnc = await cryptoService.wrapKeyWithRSA(userPublicKeyPem, aesKeyVault);

        setUploadStatus('uploading');

        const resp = await fetch('http://localhost:8000/submit-dual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            filename: file.name,
            rag_cipher: ragData.cipher, rag_iv: ragData.iv, rag_key: ragKeyEnc,
            vault_cipher: vaultData.cipher, vault_iv: vaultData.iv, vault_key: vaultKeyEnc
          })
        });
        
        if (!resp.ok) throw new Error("Upload Failed");
        const data = await resp.json();
        setReportId(data.report_id);
        setUploadStatus('success');

      } catch (err) { console.error(err); setUploadStatus('error'); }
    };
    if (uploadStatus === 'idle') process();
  }, []);

  if (uploadStatus === 'success') return (
    <div className="text-center py-12">
      <ShieldCheck className="w-20 h-20 text-emerald-500 mx-auto mb-4"/>
      <h3 className="text-2xl font-bold">Secure Dual-Upload Complete</h3>
      <div className="flex gap-4 justify-center mt-8">
        <button onClick={() => navigate('/')} className="px-6 py-2 border rounded-lg hover:bg-slate-50">Go to Vault</button>
        <button onClick={() => navigate(`/chat?reportId=${reportId}`)} className="px-6 py-2 bg-blue-600 text-white rounded-lg">Chat with AI</button>
      </div>
    </div>
  );

  return (
    <div className="py-20 text-center">
      <Activity className="w-16 h-16 text-blue-500 animate-pulse mx-auto mb-4"/>
      <h3 className="text-xl font-bold text-slate-800">Dual-Path Encryption</h3>
      <p className="text-slate-500 mb-6">Encrypting for AI (Anonymized) & Vault (Original)...</p>
      <div className="w-64 h-2 bg-slate-200 rounded-full mx-auto"><div className="h-full bg-blue-600 rounded-full animate-pulse w-2/3"></div></div>
    </div>
  );
};

const UploadWizard = () => {
  const { currentStep } = useUploadStore();
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 min-h-[600px] flex flex-col p-8">
      <AnimatePresence mode='wait'>
        <motion.div key={currentStep} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
          {currentStep === 1 && <DropZone />}
          {currentStep === 2 && <OCRReview />}
          {currentStep === 3 && <Anonymizer />}
          {currentStep === 4 && <EncryptAndUpload />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default UploadWizard;