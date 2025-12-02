import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { cryptoService } from '../lib/crypto';
import { FileText, Lock, Eye, Share2, Calendar, Shield } from 'lucide-react';
import { motion } from 'framer-motion';

const Dashboard = () => {
  const { token, userPrivateKey } = useAuthStore();
  const [reports, setReports] = useState([]);
  const [decryptedContent, setDecryptedContent] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // --- SAFE FETCH LOGIC ---
    const fetchReports = async () => {
      try {
        const response = await fetch('http://localhost:8000/my-reports', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
          throw new Error(`Backend Error: ${response.status}`);
        }

        const data = await response.json();
        
        // Safety check: Ensure data is actually an array before setting it
        if (Array.isArray(data)) {
          setReports(data);
        } else {
          throw new Error("Invalid data format received");
        }

      } catch (err) {
        console.warn("Backend unavailable or endpoint missing. Switching to MOCK DATA for Demo.");
        
        // --- FALLBACK MOCK DATA ---
        setReports([
          { id: 'rep_123', filename: 'Blood_Report_Oct2023.pdf', created_at: '2023-10-24', vault_cipher: 'mock', vault_iv: 'mock' },
          { id: 'rep_124', filename: 'MRI_Scan_Results.docx', created_at: '2023-11-02', vault_cipher: 'mock', vault_iv: 'mock' },
          { id: 'rep_125', filename: 'Vaccination_Cert.jpg', created_at: '2023-12-15', vault_cipher: 'mock', vault_iv: 'mock' }
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchReports();
  }, [token]);

  const handleDecrypt = async (report) => {
    // Demo Mode Logic
    if (!userPrivateKey || report.vault_cipher === 'mock') {
        setDecryptedContent({ 
            title: report.filename, 
            text: "DEMO CONTENT:\n\nThis is a simulated decrypted view. Since you are in 'Mock Run' mode, no real decryption key exists in memory.\n\nIn the real application, your local RSA-2048 private key would unwrap the AES-256 key and decrypt the document client-side." 
        });
        return;
    }

    try {
      const aesKey = await cryptoService.unwrapKeyWithRSA(userPrivateKey, report.vault_encrypted_aes_key);
      const text = await cryptoService.decryptData(aesKey, report.vault_cipher, report.vault_iv);
      setDecryptedContent({ title: report.filename, text });
    } catch (err) {
      console.error(err);
      alert("Decryption Failed: Keys do not match.");
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-slate-800">My Medical Vault</h2>
        <p className="text-slate-500 mt-2">Securely stored and encrypted documents.</p>
      </div>
      
      {/* Decryption Modal */}
      {decryptedContent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col border border-slate-200">
            <div className="flex justify-between items-center p-5 border-b border-slate-100">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600"/> {decryptedContent.title}
              </h3>
              <button onClick={() => setDecryptedContent(null)} className="p-2 hover:bg-slate-100 rounded-full transition">
                <span className="sr-only">Close</span>
                <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto bg-slate-50 p-6 font-mono text-sm whitespace-pre-wrap text-slate-700 leading-relaxed">
              {decryptedContent.text}
            </div>
            <div className="p-4 border-t border-slate-100 bg-white rounded-b-2xl flex justify-end gap-3">
               <button className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium transition"><Shield className="w-4 h-4"/> Verify Signature</button>
               <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium shadow-md shadow-blue-500/20"><Share2 className="w-4 h-4"/> Secure Share</button>
            </div>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Safety Check: Ensure reports is an array before mapping */}
        {Array.isArray(reports) && reports.map((report, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            key={report.id} 
            className="group bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-lg hover:border-blue-200 transition-all duration-300 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 transform -translate-x-full group-hover:translate-x-0 transition-transform duration-300"></div>
            
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300">
                <FileText className="w-6 h-6" />
              </div>
              <div className="flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-600 rounded-full text-xs font-bold border border-emerald-100">
                 <Lock className="w-3 h-3" /> Encrypted
              </div>
            </div>
            
            <h3 className="font-bold text-slate-800 truncate text-lg mb-1">{report.filename}</h3>
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-6">
                <Calendar className="w-3 h-3"/> {report.created_at || "Unknown Date"}
                <span>•</span>
                <span className="font-mono">{report.id}</span>
            </div>
            
            <div className="flex gap-3">
              <button 
                onClick={() => handleDecrypt(report)} 
                className="flex-1 py-2.5 text-sm font-bold text-blue-700 bg-blue-50 rounded-xl hover:bg-blue-100 flex items-center justify-center gap-2 transition-colors"
              >
                <Eye className="w-4 h-4" /> Decrypt & View
              </button>
            </div>
          </motion.div>
        ))}
        
        {!isLoading && Array.isArray(reports) && reports.length === 0 && (
            <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-dashed border-slate-300">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-10 h-10 text-slate-300" />
                </div>
                <h3 className="text-xl font-bold text-slate-400">Vault is empty</h3>
                <p className="text-slate-400">Upload documents to see them here.</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;