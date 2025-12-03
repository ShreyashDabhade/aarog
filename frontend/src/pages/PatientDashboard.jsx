import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { cryptoService } from '../lib/crypto';
import { FileText, Lock, Eye, AlertTriangle, FileCheck } from 'lucide-react';
import { motion } from 'framer-motion';

const PatientDashboard = () => {
  const { token, userPrivateKey } = useAuthStore();
  const [reports, setReports] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchReports = async () => {
      setIsLoading(true);
      try {
        const resp = await fetch((import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/my-records', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!resp.ok) throw new Error(`Backend Error: ${resp.status}`);
        
        const data = await resp.json();
        setReports(data);

      } catch (err) {
        console.error("Failed to fetch reports", err);
      } finally {
        setIsLoading(false);
      }
    };

    if (token) fetchReports();
  }, [token]);

  const handleDecrypt = async (report) => {
    // --- CRITICAL FIX: Check if key exists in memory ---
    if (!userPrivateKey) {
        alert("SESSION EXPIRED: Your secure key was cleared from memory on refresh.\n\nPlease Logout and Login again to restore your encryption keys.");
        return;
    }

    if (!report.enc_aes_key_patient) {
        alert("This record is missing keys.");
        return;
    }

    try {
      // 1. Unwrap the AES key
      const aesKey = await cryptoService.unwrapKeyWithRSA(userPrivateKey, report.enc_aes_key_patient);
      
      // 2. Decrypt the file content (binary)
      const decryptedBuffer = await cryptoService.decryptData(
          aesKey, 
          report.original_ciphertext, 
          report.original_iv, 
          false // isText = false
      );

      // 3. Determine Mime Type
      let mime = "application/octet-stream";
      const ext = report.filename.split('.').pop().toLowerCase();
      if (ext === "png") mime = "image/png";
      if (ext === "pdf") mime = "application/pdf";
      if (ext === "jpg" || ext === "jpeg") mime = "image/jpeg";

      // 4. Create Blob and Open
      const blob = new Blob([decryptedBuffer], { type: mime });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');

    } catch (err) {
      console.error(err);
      alert("Decryption Failed! Ensure you are using the same account that uploaded this file.");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">My Medical Vault</h2>
          <p className="text-slate-500 mt-1">Securely stored encrypted records.</p>
        </div>
        
        {/* Warning Badge if Key is Missing */}
        {!userPrivateKey && (
            <div className="hidden md:flex bg-amber-50 text-amber-700 px-4 py-2 rounded-lg border border-amber-200 text-sm font-semibold items-center gap-2 animate-pulse">
                <AlertTriangle className="w-4 h-4" />
                <span>Read-Only Mode (Relogin required to Decrypt)</span>
            </div>
        )}
      </div>
      
      {isLoading ? (
          <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {reports.map((report, i) => (
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                key={report.id} 
                className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-xl hover:shadow-slate-200/50 hover:border-blue-200 transition-all group"
            >
                <div className="flex items-start justify-between mb-6">
                <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300">
                    <FileText className="w-6 h-6" />
                </div>
                <div className="flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                    <Lock className="w-3 h-3" /> Encrypted
                </div>
                </div>
                
                <h3 className="font-bold text-lg text-slate-800 truncate mb-1">{report.filename}</h3>
                <p className="text-xs text-slate-400 font-mono mb-6 bg-slate-50 p-1.5 rounded w-fit">{report.id.substring(0,8)}...</p>
                
                <button 
                onClick={() => handleDecrypt(report)} 
                className="w-full py-3 text-sm font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all flex items-center justify-center gap-2 group-hover:shadow-md"
                >
                <Eye className="w-4 h-4" /> Decrypt & View
                </button>
            </motion.div>
            ))}
            {reports.length === 0 && (
            <div className="col-span-full py-24 text-center bg-white rounded-3xl border-2 border-dashed border-slate-200 hover:border-blue-300 transition-colors group">
                <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-300">
                <FileCheck className="w-10 h-10 text-blue-500" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Your vault is currently empty</h3>
                <p className="text-slate-500 max-w-md mx-auto mb-8">
                Upload your first medical record to initialize your encrypted storage and enable AI analysis.
                </p>
                <a href="/upload" className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition shadow-lg shadow-blue-500/20">
                Upload First Record
                </a>
            </div>
            )}
        </div>
      )}
    </div>
  );
};

export default PatientDashboard;