import React, { useState } from 'react';
import { cryptoService } from '../lib/crypto';
import { useAuthStore } from '../store/authStore';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, Key, ArrowRight, Stethoscope, User, Bug } from 'lucide-react';
import { motion } from 'framer-motion';

const Login = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [role, setRole] = useState('patient'); // 'patient' or 'doctor'
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const formDataBody = new URLSearchParams();
      formDataBody.append('username', formData.email);
      formDataBody.append('password', formData.password);

      // Attempt to connect to real backend
      const resp = await fetch('http://localhost:8000/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formDataBody
      });

      if (resp.ok) {
        // --- REAL BACKEND SUCCESS PATH ---
        const data = await resp.json();

        // Client-Side Decryption
        const passwordKey = await cryptoService.deriveKeyFromPassword(formData.password);
        const encryptedPrivKey = JSON.parse(data.encrypted_private_key);
        
        const privateKeyPem = await cryptoService.decryptData(
          passwordKey, 
          encryptedPrivKey.cipher, 
          encryptedPrivKey.iv
        );

        const privateKeyObj = await cryptoService.importPrivateKey(privateKeyPem);

        // Save Auth with Role
        setAuth(
          { email: formData.email, full_name: data.full_name }, 
          data.access_token, 
          privateKeyObj, 
          data.public_key,
          role 
        );
      } else {
        // --- FALLBACK: MOCK LOGIN FOR DEMO ---
        console.warn("Backend unreachable or invalid credentials. Falling back to Mock Mode.");
        // Generate mock keys on the fly so the app doesn't crash
        const keys = await cryptoService.generateUserKeyPair();
        setAuth(
          { email: formData.email, full_name: 'Mock User' }, 
          'mock-jwt-token-fallback', 
          keys.privateKey, 
          keys.publicKeyPem,
          role
        );
        alert("Backend unavailable. Logged in with MOCK credentials for testing.");
      }
      
      navigate('/');

    } catch (err) {
      console.error("Login Error:", err);
      // Even on network error (fetch failed), fallback to mock for the demo
      console.warn("Network error. Falling back to Mock Mode.");
      const keys = await cryptoService.generateUserKeyPair();
      setAuth(
        { email: formData.email, full_name: 'Mock User (Offline)' }, 
        'mock-jwt-token-offline', 
        keys.privateKey, 
        keys.publicKeyPem,
        role
      );
      alert("Network error. Logged in with MOCK credentials for testing.");
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  // --- DEV ONLY: MOCK LOGIN ---
  const handleMockLogin = async () => {
    // Generate temporary keys so the app doesn't crash when trying to use crypto
    const keys = await cryptoService.generateUserKeyPair();
    
    setAuth(
      { email: 'mock@dev.local', full_name: 'Dev User' }, 
      'mock-jwt-token', 
      keys.privateKey, 
      keys.publicKeyPem,
      role
    );
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue-600 rounded-full blur-[128px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-emerald-600 rounded-full blur-[128px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl w-full max-w-md z-10"
      >
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Welcome Back</h2>
          <p className="text-slate-400 text-sm">Select your portal to continue</p>
        </div>

        {/* Role Toggle */}
        <div className="flex bg-slate-950/50 p-1 rounded-xl mb-6 border border-slate-700/50">
          <button 
            onClick={() => setRole('patient')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-all ${role === 'patient' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
          >
            <User className="w-4 h-4" /> Patient
          </button>
          <button 
            onClick={() => setRole('doctor')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-all ${role === 'doctor' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
          >
            <Stethoscope className="w-4 h-4" /> Doctor
          </button>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-1">
            <input 
              type="email" 
              required 
              className="w-full p-4 bg-slate-950/50 border border-slate-700/50 rounded-xl text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600"
              placeholder="Email Address"
              onChange={e => setFormData({...formData, email: e.target.value})} 
            />
          </div>
          
          <div className="space-y-1">
            <input 
              type="password" 
              required 
              className="w-full p-4 bg-slate-950/50 border border-slate-700/50 rounded-xl text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600"
              placeholder="Master Password"
              onChange={e => setFormData({...formData, password: e.target.value})} 
            />
          </div>

          <button 
            disabled={loading} 
            className={`w-full py-4 rounded-xl font-bold hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed group text-white
              ${role === 'patient' ? 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:shadow-emerald-500/20' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-blue-500/20'}
            `}
          >
            {loading ? (
              <span className="flex items-center gap-2"><Key className="w-4 h-4 animate-spin" /> Decrypting...</span>
            ) : (
              <span className="flex items-center gap-2">Decrypt Vault <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform"/></span>
            )}
          </button>
        </form>

        {/* BYPASS BUTTON */}
        <button 
          onClick={handleMockLogin}
          className="w-full mt-4 py-3 border border-dashed border-slate-600 text-slate-400 rounded-xl font-mono text-xs hover:bg-slate-800 hover:text-white transition-all flex items-center justify-center gap-2"
        >
          <Bug className="w-4 h-4" /> Bypass Login (Dev Mode)
        </button>

        <div className="mt-8 pt-6 border-t border-white/10 text-center">
          <p className="text-slate-400 text-sm">
            New user? <Link to="/register" className="text-white hover:underline font-semibold transition">Create a Vault</Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;