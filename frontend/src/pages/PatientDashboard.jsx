import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { cryptoService } from '../lib/crypto';
import { FileText, Lock, Eye, AlertTriangle, FileCheck, Share2, X, Trash2, UserCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const PatientDashboard = () => {
  const { token, userPrivateKey } = useAuthStore();
  const [reports, setReports] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Share Modal State
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [sessionCode, setSessionCode] = useState("");
  const [doctorInfo, setDoctorInfo] = useState(null); // { id, name, public_key }
  const [sharingStatus, setSharingStatus] = useState("idle"); // idle, resolving, ready, sharing, success, error
  const [accessList, setAccessList] = useState([]);

  useEffect(() => {
    fetchReports();
  }, [token]);

  const fetchReports = async () => {
    setIsLoading(true);
    try {
      const resp = await fetch((import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/my-records', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) setReports(await resp.json());
    } catch (err) { console.error(err); } 
    finally { setIsLoading(false); }
  };

  const openShareModal = async (report) => {
    setSelectedReport(report);
    setShareModalOpen(true);
    setSessionCode("");
    setDoctorInfo(null);
    setSharingStatus("idle");
    
    // Fetch current access list
    try {
        const resp = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/report/${report.id}/shares`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (resp.ok) setAccessList(await resp.json());
    } catch (e) { console.error(e); }
  };

  const handleResolveCode = async () => {
    setSharingStatus("resolving");
    try {
        const resp = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/patient/resolve-code?code=${sessionCode}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!resp.ok) throw new Error("Invalid Code");
        setDoctorInfo(await resp.json());
        setSharingStatus("ready");
    } catch (err) {
        alert("Invalid or expired session code.");
        setSharingStatus("idle");
    }
  };

  const handleShareConfirm = async () => {
    if (!userPrivateKey) return alert("Key missing. Please relogin.");
    setSharingStatus("sharing");

    try {
        // 1. Unwrap AES Key (using Patient PrivKey)
        const aesKey = await cryptoService.unwrapKeyWithRSA(userPrivateKey, selectedReport.enc_aes_key_patient);
        
        // 2. Wrap AES Key (using Doctor PubKey)
        const doctorEncryptedKey = await cryptoService.wrapKeyWithRSA(doctorInfo.public_key, aesKey);

        // 3. Send to Backend
        const resp = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/share-record`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                report_id: selectedReport.id,
                doctor_id: doctorInfo.doctor_id,
                encrypted_key_for_doctor: doctorEncryptedKey
            })
        });

        if (!resp.ok) throw new Error("Share failed");
        
        setSharingStatus("success");
        setTimeout(() => setShareModalOpen(false), 1500);
    } catch (err) {
        console.error(err);
        setSharingStatus("error");
    }
  };

  const handleRevoke = async (doctorId) => {
      if (!confirm("Are you sure? This doctor will lose access immediately.")) return;
      try {
        await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/share-record/${selectedReport.id}/${doctorId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        // Refresh list
        setAccessList(prev => prev.filter(d => d.doctor_id !== doctorId));
      } catch (err) { alert("Revocation failed"); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">My Medical Vault</h2>
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
                        <button onClick={() => openShareModal(report)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Share Access">
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

      {/* SHARE MODAL */}
      <AnimatePresence>
        {shareModalOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <h3 className="font-bold text-lg text-slate-800">Manage Access</h3>
                        <button onClick={() => setShareModalOpen(false)}><X className="w-5 h-5 text-slate-400"/></button>
                    </div>
                    
                    <div className="p-6 space-y-6">
                        {/* New Share Section */}
                        <div className="space-y-4">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Add Doctor via Session Code</label>
                            {sharingStatus === 'success' ? (
                                <div className="bg-emerald-50 text-emerald-700 p-4 rounded-xl flex items-center gap-3">
                                    <FileCheck className="w-5 h-5"/> Access Granted Successfully!
                                </div>
                            ) : !doctorInfo ? (
                                <div className="flex gap-2">
                                    <input 
                                        type="text" placeholder="Enter 6-digit code" 
                                        className="flex-1 border border-slate-300 rounded-xl px-4 py-3 text-center text-lg font-mono tracking-widest focus:ring-2 focus:ring-blue-500 outline-none"
                                        maxLength={6}
                                        value={sessionCode} onChange={(e) => setSessionCode(e.target.value)}
                                    />
                                    <button onClick={handleResolveCode} disabled={sessionCode.length < 6 || sharingStatus === 'resolving'} className="bg-slate-900 text-white px-6 rounded-xl font-bold">
                                        {sharingStatus === 'resolving' ? '...' : 'Find'}
                                    </button>
                                </div>
                            ) : (
                                <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="bg-blue-200 p-2 rounded-full"><UserCheck className="w-5 h-5 text-blue-700"/></div>
                                        <div>
                                            <p className="font-bold text-slate-800">Share with {doctorInfo.name}?</p>
                                            <p className="text-xs text-slate-500">Public Key Verified</p>
                                        </div>
                                    </div>
                                    <button onClick={handleShareConfirm} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition">
                                        Confirm & Grant Access
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Existing Access List */}
                        {accessList.length > 0 && (
                            <div className="pt-6 border-t border-slate-100">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">Who has access</label>
                                <div className="space-y-2">
                                    {accessList.map(share => (
                                        <div key={share.doctor_id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center border border-slate-200 text-xs font-bold text-slate-600">
                                                    {share.doctor_email.charAt(0).toUpperCase()}
                                                </div>
                                                <span className="text-sm font-medium text-slate-700">{share.doctor_email}</span>
                                            </div>
                                            <button onClick={() => handleRevoke(share.doctor_id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition" title="Revoke Access">
                                                <Trash2 className="w-4 h-4"/>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PatientDashboard;