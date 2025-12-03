import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { cryptoService } from '../lib/crypto';
import { FileText, Lock, AlertTriangle, Share2, Eye, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

const PatientDashboard = () => {
  const { token, userPrivateKey } = useAuthStore();
  const [reports, setReports] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewingId, setViewingId] = useState(null); // Loading state for decryption
  
  const pollingRef = useRef(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const autoViewId = searchParams.get('view');

  // --- Auto-Refresh Logic ---
  const fetchReports = async (isBackground = false) => {
    if (!isBackground) setIsLoading(true);
    try {
      const resp = await fetch((import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/my-records', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) setReports(await resp.json());
    } catch (err) { console.error(err); } 
    finally { 
      if (!isBackground) setIsLoading(false); 
    }
  };

  useEffect(() => {
    fetchReports();
    pollingRef.current = setInterval(() => {
        fetchReports(true);
    }, 5000); 

    return () => {
        if(pollingRef.current) clearInterval(pollingRef.current);
    }
  }, [token]);

  // --- Decrypt & View Logic ---
  const handleViewFile = async (report) => {
    if (!userPrivateKey) return alert("Session Key Missing. Please Relogin.");
    setViewingId(report.id);
    
    try {
        // 1. Unwrap AES Key (Patient uses 'enc_aes_key_patient')
        const aesKey = await cryptoService.unwrapKeyWithRSA(userPrivateKey, report.enc_aes_key_patient);
        
        // 2. Decrypt File
        const decryptedBuffer = await cryptoService.decryptData(
            aesKey,
            report.original_ciphertext,
            report.original_iv,
            false // binary
        );

        // 3. Open
        let mime = "application/octet-stream";
        if (report.filename.endsWith(".pdf")) mime = "application/pdf";
        else if (report.filename.match(/\.(jpg|jpeg|png)$/i)) mime = "image/png";
        
        const blob = new Blob([decryptedBuffer], { type: mime });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        
    } catch (err) {
        console.error(err);
        alert("Decryption Failed. Key mismatch or data corruption.");
    } finally {
        setViewingId(null);
    }
  };

  // --- Auto-View Effect (From AI Chat Link) ---
  useEffect(() => {
    if (autoViewId && reports.length > 0) {
        const reportToView = reports.find(r => r.id === autoViewId);
        if (reportToView) {
            // Small delay to ensure UI is ready
            setTimeout(() => handleViewFile(reportToView), 500);
        }
    }
  }, [autoViewId, reports]);

  // --- Redirect to Consent Page ---
  const handleShareClick = (report) => {
    navigate(`/consent?reportId=${report.id}`);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
             My Medical Vault 
             <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full animate-pulse">Live Sync</span>
          </h2>
          <p className="text-slate-500 mt-1">Securely stored encrypted records.</p>
        </div>
        {!userPrivateKey && (
            <div className="bg-amber-50 text-amber-700 px-4 py-2 rounded-lg border border-amber-200 text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Relogin required to Decrypt
            </div>
        )}
      </div>
      
      {isLoading ? (
          <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {reports.map((report, i) => (
            <motion.div key={report.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-xl hover:shadow-slate-200/50 hover:border-blue-200 transition-all group"
            >
                <div className="flex items-start justify-between mb-6">
                    <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl">
                        <FileText className="w-6 h-6" />
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => handleShareClick(report)} 
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" 
                            title="Manage Consent & Access"
                        >
                            <Share2 className="w-5 h-5"/>
                        </button>
                    </div>
                </div>
                <h3 className="font-bold text-lg text-slate-800 truncate mb-1">{report.filename}</h3>
                <p className="text-xs text-slate-400 font-mono mb-6 bg-slate-50 p-1.5 rounded w-fit">{report.id.substring(0,8)}...</p>
                
                <button 
                    onClick={() => handleViewFile(report)}
                    disabled={viewingId === report.id}
                    className="w-full py-3 text-sm font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-100 transition"
                >
                    {viewingId === report.id ? (
                        <><RefreshCw className="w-4 h-4 animate-spin"/> Decrypting...</>
                    ) : (
                        <><Eye className="w-4 h-4" /> Decrypt & View</>
                    )}
                </button>
            </motion.div>
            ))}
        </div>
      )}
    </div>
  );
};

export default PatientDashboard;