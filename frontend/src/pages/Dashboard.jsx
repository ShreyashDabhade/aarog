import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { cryptoService } from '../lib/crypto';
import { FileText, Lock, Eye, Share2 } from 'lucide-react';

const Dashboard = () => {
  const { token, userPrivateKey } = useAuthStore();
  const [reports, setReports] = useState([]);
  const [decryptedContent, setDecryptedContent] = useState(null);

  useEffect(() => {
    fetch('http://localhost:8000/my-reports', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => setReports(data))
    .catch(err => console.error(err));
  }, [token]);

  const handleDecrypt = async (report) => {
    try {
      // Unwrap the AES Key using our Private Key
      const aesKey = await cryptoService.unwrapKeyWithRSA(userPrivateKey, report.vault_encrypted_aes_key);
      
      // Decrypt the Document
      const text = await cryptoService.decryptData(aesKey, report.vault_cipher, report.vault_iv);
      setDecryptedContent({ title: report.filename, text });
    } catch (err) {
      console.error(err);
      alert("Decryption Failed: Keys do not match.");
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-800 mb-6">My Medical Vault</h2>
      
      {decryptedContent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">{decryptedContent.title}</h3>
              <button onClick={() => setDecryptedContent(null)} className="text-slate-500 hover:text-black">Close</button>
            </div>
            <div className="flex-1 overflow-y-auto bg-slate-50 p-4 rounded border font-mono text-sm whitespace-pre-wrap">
              {decryptedContent.text}
            </div>
            <div className="mt-4 pt-4 border-t flex justify-end gap-2">
               <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg"><Share2 className="w-4 h-4"/> Share</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reports.map((report) => (
          <div key={report.id} className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                <FileText className="w-6 h-6" />
              </div>
              <Lock className="w-4 h-4 text-emerald-500" />
            </div>
            <h3 className="font-bold text-slate-800 truncate">{report.filename}</h3>
            <p className="text-xs text-slate-500 mb-4">ID: {report.id}</p>
            <div className="flex gap-2">
              <button onClick={() => handleDecrypt(report)} className="flex-1 py-2 text-sm font-semibold text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 flex items-center justify-center gap-2">
                <Eye className="w-4 h-4" /> View Original
              </button>
            </div>
          </div>
        ))}
        {reports.length === 0 && <p className="text-slate-500 col-span-3 text-center py-10">Vault is empty.</p>}
      </div>
    </div>
  );
};

export default Dashboard;