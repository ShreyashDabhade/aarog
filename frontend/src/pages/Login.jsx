import React, { useState } from 'react';
import { cryptoService } from '../lib/crypto';
import { useAuthStore } from '../store/authStore';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, Key, ChevronRight, AlertCircle } from 'lucide-react';

const Login = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const formDataBody = new URLSearchParams();
      formDataBody.append('username', formData.email);
      formDataBody.append('password', formData.password);

      const resp = await fetch('http://localhost:8000/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formDataBody
      });

      if (!resp.ok) throw new Error('Invalid credentials');
      const data = await resp.json();

      let privateKeyObj = null;

      // --- BACKEND COMPATIBILITY FIX ---
      // The current backend mock in main.py only returns { access_token }.
      // It does NOT return the encrypted_private_key yet.
      // We handle this gracefully to allow the UI to function in Demo Mode.
      if (data.encrypted_private_key) {
        try {
            const passwordKey = await cryptoService.deriveKeyFromPassword(formData.password);
            const encryptedPrivKey = JSON.parse(data.encrypted_private_key);
            const privateKeyPem = await cryptoService.decryptData(
                passwordKey, 
                encryptedPrivKey.cipher, 
                encryptedPrivKey.iv
            );
            privateKeyObj = await cryptoService.importPrivateKey(privateKeyPem);
        } catch (decErr) {
            console.error("Decryption failed:", decErr);
            throw new Error("Password incorrect or Vault Corrupted");
        }
      } else {
        console.warn("Backend running in Mock Mode. No Private Key returned.");
        // Proceed without private key (Read-Only Mode for Demo)
      }

      setAuth(
        { email: formData.email, full_name: data.full_name || "Demo User" }, 
        data.access_token, 
        privateKeyObj, 
        data.public_key || "mock_public_key"
      );
      
      navigate('/');

    } catch (err) {
      console.error(err);
      setError(err.message || "Login Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decorations */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue-200/30 rounded-full blur-3xl"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-emerald-200/30 rounded-full blur-3xl"></div>

      <div className="bg-white p-8 lg:p-10 rounded-3xl shadow-2xl w-full max-w-md border border-slate-100 relative z-10">
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-500/30 transform rotate-3">
            <Lock className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-slate-800 tracking-tight">Welcome Back</h2>
          <p className="text-slate-500 mt-2 font-medium">Secure Patient Data Vault</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl flex items-center gap-3 text-sm font-medium animate-pulse">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Email Address</label>
            <input 
              type="email" 
              required 
              className="w-full p-3.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" 
              onChange={e => setFormData({...formData, email: e.target.value})} 
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Master Password</label>
            <input 
              type="password" 
              required 
              className="w-full p-3.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" 
              onChange={e => setFormData({...formData, password: e.target.value})} 
            />
          </div>
          
          <button 
            disabled={loading} 
            className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 group disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>Processing...</>
            ) : (
              <>Unlock Vault <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" /></>
            )}
          </button>
        </form>

        <p className="text-center mt-8 text-slate-500 text-sm">
          No account? <Link to="/register" className="text-blue-600 hover:text-blue-700 font-bold hover:underline">Create Secure Vault</Link>
        </p>
      </div>
    </div>
  );
};

export default Login;