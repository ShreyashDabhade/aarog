import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { cryptoService } from '../lib/crypto';
import { FileText, Lock, Eye, Share2, Unlock, Clock, FileCheck } from 'lucide-react';
import { motion } from 'framer-motion';

const PatientDashboard = () => {
  const { token, userPrivateKey } = useAuthStore();
  const [reports, setReports] = useState([]);
  const [decryptedContent, setDecryptedContent] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchReports = async () => {
      setIsLoading(true);
      try {
        // Attempt to fetch from backend
        const resp = await fetch('http://localhost:8000/my-reports', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!resp.ok) {
           throw new Error(`Backend Error: ${resp.status}`);
        }
        
        const data = await resp.json();
        setReports(data);

      } catch (err) {
        console.warn("Backend unavailable, loading mock data for demo:", err);
        // Fallback to mock data if backend fails (404 or connection refused)
        setReports([
          { id: 'rep_mock_1', filename: 'Blood_Work_2024.pdf', created_at: '2024-03-10T10:00:00' },
          { id: 'rep_mock_2', filename: 'MRI_Scan_Report.pdf', created_at: '2024-02-15T14:30:00' },
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchReports();
  }, [token]);

  const handleDecrypt = async (report) => {
    if (!report.vault_encrypted_aes_key) {
        alert("This is a mock file. In a real app, decryption would happen here.");
        setDecryptedContent({ title: report.filename, text: "This is mock decrypted content for demonstration purposes.\n\nPatient: John Doe\nDate: 2024-03-10\n\nFindings:\n- Hemoglobin: Normal\n- WBC: Normal\n\n[End of Secure Record]" });
        return;
    }

    try {
      const aesKey = await cryptoService.unwrapKeyWithRSA(userPrivateKey, report.vault_encrypted_aes_key);
      const text = await cryptoService.decryptData(aesKey, report.vault_cipher, report.vault_iv);
      setDecryptedContent({ title: report.filename, text });
    } catch (err) {
      console.error(err);
      alert("Decryption Failed: Keys do not match or file is corrupted.");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">My Medical Vault</h2>
          <p className="text-slate-500 mt-1">Securely stored encrypted records.</p>
        </div>
        <div className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-xl text-sm font-medium shadow-sm flex items-center gap-2">
          <Clock className="w-4 h-4" /> Updated just now
        </div>
      </div>
      
      {decryptedContent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }} 
            className="bg-white rounded-3xl p-8 max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl"
          >
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-50 rounded-xl">
                  <Unlock className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-bold text-xl text-slate-800">{decryptedContent.title}</h3>
                  <p className="text-xs text-emerald-600 font-medium bg-emerald-50 inline-block px-2 py-0.5 rounded mt-1">Decrypted Successfully</p>
                </div>
              </div>
              <button onClick={() => setDecryptedContent(null)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-lg transition">Close</button>
            </div>
            <div className="flex-1 overflow-y-auto bg-slate-50 p-6 rounded-xl border border-slate-200 font-mono text-sm whitespace-pre-wrap leading-relaxed text-slate-700 shadow-inner">
              {decryptedContent.text}
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end gap-3">
               <button className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition shadow-lg shadow-blue-500/20">
                 <Share2 className="w-4 h-4"/> Share with Doctor
               </button>
            </div>
          </motion.div>
        </div>
      )}

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
                <p className="text-xs text-slate-400 font-mono mb-6 bg-slate-50 p-1.5 rounded w-fit">{report.id}</p>
                
                <button 
                onClick={() => handleDecrypt(report)} 
                className="w-full py-3 text-sm font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all flex items-center justify-center gap-2 group-hover:shadow-md"
                >
                <Eye className="w-4 h-4" /> Decrypt & View
                </button>
            </motion.div>
            ))}
            {reports.length === 0 && (
            <div className="col-span-3 py-20 text-center bg-white rounded-3xl border border-dashed border-slate-300">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileCheck className="w-10 h-10 text-slate-300" />
                </div>
                <p className="text-slate-500 font-medium">Your vault is empty.</p>
                <p className="text-sm text-slate-400">Upload your first record to secure it.</p>
            </div>
            )}
        </div>
      )}
    </div>
  );
};

export default PatientDashboard;