import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom'; // Import useNavigate
import { useAuthStore } from '../store/authStore';
import { FileText, Lock, AlertTriangle, Share2 } from 'lucide-react';
import { motion } from 'framer-motion';

const PatientDashboard = () => {
  const { token, userPrivateKey } = useAuthStore();
  const [reports, setReports] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const pollingRef = useRef(null);
  const navigate = useNavigate(); // Hook for navigation

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

  // --- NEW HANDLER: Redirect to Consent Page ---
  const handleShareClick = (report) => {
    // Pass the report ID via URL params so the dropdown auto-selects it
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
                        {/* UPDATED BUTTON: Navigates to Consent Page */}
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
                <button className="w-full py-3 text-sm font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center gap-2">
                    <Lock className="w-4 h-4" /> Encrypted
                </button>
            </motion.div>
            ))}
        </div>
      )}
    </div>
  );
};

export default PatientDashboard;