import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { cryptoService } from '../lib/crypto';
import { Users, Activity, FileText, Search, Clock, Link as LinkIcon, RefreshCw, ChevronRight, File, Lock, Eye, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const StatCard = ({ icon: Icon, label, value, color }) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
    <div className={`p-4 rounded-xl ${color}`}>
      <Icon className="w-6 h-6 text-white" />
    </div>
    <div>
      <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">{label}</p>
      <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
    </div>
  </div>
);

const DoctorDashboard = () => {
  const navigate = useNavigate();
  const { token, userPrivateKey } = useAuthStore();
  
  // Data State
  const [sharedReports, setSharedReports] = useState([]);
  const [patients, setPatients] = useState({}); // Grouped by email
  const [selectedPatient, setSelectedPatient] = useState(null);
  
  // Session Code State
  const [sessionCode, setSessionCode] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [loadingCode, setLoadingCode] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  // --- 1. Fetch & Organize Data ---
  useEffect(() => {
    const fetchData = async () => {
      setLoadingData(true);
      try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        const resp = await fetch(`${API_URL}/shared-with-me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!resp.ok) throw new Error("Failed to fetch");
        
        const data = await resp.json();
        setSharedReports(data);

        // Group by Patient Email
        const grouped = data.reduce((acc, report) => {
          const email = report.patient_email;
          if (!acc[email]) acc[email] = [];
          acc[email].push(report);
          return acc;
        }, {});
        
        setPatients(grouped);
      } catch (err) {
        console.error("Dashboard Load Error:", err);
      } finally {
        setLoadingData(false);
      }
    };
    fetchData();
  }, [token]);

  // --- 2. Session Code Timer ---
  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft(t => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const generateCode = async () => {
    setLoadingCode(true);
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const resp = await fetch(`${API_URL}/doctor/generate-code`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await resp.json();
      setSessionCode(data.code);
      setTimeLeft(300); // 5 minutes
    } catch (err) {
      console.error(err);
      alert("Failed to generate code");
    } finally {
      setLoadingCode(false);
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // --- 3. Decryption Logic ---
  const handleViewFile = async (report) => {
    if (!userPrivateKey) return alert("Session Key Missing. Please Relogin.");
    
    try {
        // 1. Unwrap AES Key using Doctor's Private Key
        const aesKey = await cryptoService.unwrapKeyWithRSA(userPrivateKey, report.enc_aes_key);
        
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
        alert("Access Denied or Revoked. The patient may have stopped sharing this file.");
    }
  };

  // Stats Calculation
  const totalPatients = Object.keys(patients).length;
  const totalReports = sharedReports.length;

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">Clinical Command Center</h2>
          <p className="text-slate-500 mt-1">Manage patient access and secure sessions.</p>
        </div>
        <button 
          onClick={() => navigate('/chat')}
          className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition flex items-center gap-2 shadow-lg shadow-blue-500/20"
        >
          <Search className="w-5 h-5" /> Query Knowledge Base
        </button>
      </div>

      {/* Dynamic Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard icon={Users} label="Active Patients" value={totalPatients} color="bg-blue-500" />
        <StatCard icon={FileText} label="Shared Records" value={totalReports} color="bg-emerald-500" />
        <StatCard icon={Activity} label="Session Active" value={sessionCode && timeLeft > 0 ? "Yes" : "No"} color="bg-indigo-500" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
        
        {/* Left Column: Session Code & Patient List */}
        <div className="space-y-8 xl:col-span-1">
            {/* Session Widget */}
            <div className="bg-slate-900 rounded-3xl p-8 text-white relative overflow-hidden flex flex-col justify-center">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500 rounded-full blur-[60px] opacity-20"></div>
            
            <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                <div className="bg-white/10 p-2 rounded-lg">
                    <LinkIcon className="w-5 h-5 text-emerald-400" />
                </div>
                <h3 className="font-bold text-lg">New Patient Session</h3>
                </div>
                
                <p className="text-slate-400 text-sm mb-6">
                Generate a temporary code for patients to securely share their records.
                </p>

                {sessionCode && timeLeft > 0 ? (
                <div className="text-center animate-in zoom-in bg-white/5 p-4 rounded-2xl border border-white/10">
                    <div className="text-4xl font-mono font-bold tracking-widest text-emerald-400 mb-2">{sessionCode}</div>
                    <div className="flex items-center justify-center gap-2 text-sm text-slate-300">
                        <Clock className="w-4 h-4 animate-pulse text-red-400" /> 
                        Expires in {formatTime(timeLeft)}
                    </div>
                </div>
                ) : (
                <button 
                    onClick={generateCode}
                    disabled={loadingCode}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-xl font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/50"
                >
                    {loadingCode ? <RefreshCw className="w-4 h-4 animate-spin"/> : "Generate Secure Code"}
                </button>
                )}
            </div>
            </div>

            {/* Patient List */}
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <Users className="w-5 h-5 text-blue-500" /> Patient List
                    </h3>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                    {Object.keys(patients).length === 0 ? (
                        <div className="p-8 text-center text-slate-400 text-sm">No patients have shared files yet.</div>
                    ) : (
                        Object.keys(patients).map(email => (
                            <button 
                                key={email}
                                onClick={() => setSelectedPatient(email)}
                                className={`w-full text-left p-4 border-b border-slate-50 flex items-center justify-between hover:bg-blue-50 transition-colors ${selectedPatient === email ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-500">
                                        {email.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-700 text-sm">{email}</p>
                                        <p className="text-xs text-slate-400">{patients[email].length} files shared</p>
                                    </div>
                                </div>
                                <ChevronRight className="w-4 h-4 text-slate-300" />
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>

        {/* Right Column: File Viewer */}
        <div className="xl:col-span-2">
            {selectedPatient ? (
                <motion.div 
                    initial={{ opacity: 0, x: 20 }} 
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden min-h-[600px] flex flex-col"
                >
                    <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
                        <div>
                            <h3 className="text-2xl font-bold text-slate-800">Medical Records</h3>
                            <p className="text-slate-500 text-sm">Shared by <span className="font-semibold text-blue-600">{selectedPatient}</span></p>
                        </div>
                        
                        <div className="flex gap-3">
                            {/* NEW: Patient-Specific AI Chat Button */}
                            <button 
                                onClick={() => {
                                    // Find the patient ID from the first report (all reports in this view belong to this patient)
                                    const pid = patients[selectedPatient][0].patient_id;
                                    navigate(`/chat?patientId=${pid}`);
                                }}
                                className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl shadow-lg hover:bg-indigo-700 transition flex items-center gap-2"
                            >
                                <Search className="w-4 h-4" /> AI Analysis
                            </button>

                            <div className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full uppercase tracking-wide flex items-center">
                                Active Access
                            </div>
                        </div>
                    </div>

                    <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {patients[selectedPatient].map((report) => (
                            <div key={report.report_id} className="p-5 border border-slate-200 rounded-2xl hover:border-blue-300 hover:shadow-md transition-all group bg-white">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                                        <FileText className="w-6 h-6" />
                                    </div>
                                    <Lock className="w-4 h-4 text-slate-300" />
                                </div>
                                <h4 className="font-bold text-slate-800 mb-1 truncate" title={report.filename}>{report.filename}</h4>
                                <p className="text-xs text-slate-400 font-mono mb-4">{report.report_id.substring(0,8)}...</p>
                                
                                <button 
                                    onClick={() => handleViewFile(report)}
                                    className="w-full py-2.5 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Eye className="w-4 h-4" /> Decrypt & View
                                </button>
                            </div>
                        ))}
                    </div>
                </motion.div>
            ) : (
                <div className="h-full min-h-[500px] bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400">
                    <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm">
                        <Users className="w-8 h-8 text-slate-300" />
                    </div>
                    <p className="font-medium">Select a patient to view their records</p>
                </div>
            )}
        </div>

      </div>
    </div>
  );
};

export default DoctorDashboard;