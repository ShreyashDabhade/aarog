import React, { useState } from 'react';
import { cryptoService } from '../lib/crypto';
import { useAuthStore } from '../store/authStore';
import { useNavigate, Link } from 'react-router-dom';
import { Key, ArrowRight, Stethoscope, User } from 'lucide-react';
import { motion } from 'framer-motion';

const Login = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // NOTE: Your backend /auth/token expects JSON body (username, password)
      // based on the provided routers/auth.py file.
      const resp = await fetch('http://localhost:8000/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: formData.email, password: formData.password })
      });

      if (!resp.ok) {
        const error = await resp.json();
        throw new Error(error.detail || "Login failed");
      }

      const data = await resp.json();

      // Client-Side Decryption of the Private Key
      // 1. Derive key from password
      const passwordKey = await cryptoService.deriveKeyFromPassword(formData.password);
      
      // 2. Unwrap the private key stored on server
      const encryptedPrivKey = JSON.parse(data.encrypted_private_key);
      const privateKeyPem = await cryptoService.decryptData(
        passwordKey, 
        encryptedPrivKey.cipher, 
        encryptedPrivKey.iv
      );

      // 3. Import to browser crypto
      const privateKeyObj = await cryptoService.importPrivateKey(privateKeyPem);

      // 4. Fetch Public Key to complete the pair (for local encryption ops)
      const pubKeyResp = await fetch(`http://localhost:8000/users/public-key?email=${formData.email}`, {
          headers: { Authorization: `Bearer ${data.access_token}` }
      });
      const pubKeyData = await pubKeyResp.json();

      setAuth(
        { email: formData.email }, 
        data.access_token, 
        privateKeyObj, 
        pubKeyData.public_key,
        data.role 
      );
      
      navigate('/');

    } catch (err) {
      console.error(err);
      alert("Login Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl w-full max-w-md z-10"
      >
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Welcome Back</h2>
          <p className="text-slate-400 text-sm">Access your SecureMed Vault</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-1">
            <input 
              type="email" 
              required 
              className="w-full p-4 bg-slate-950/50 border border-slate-700/50 rounded-xl text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-600"
              placeholder="Email Address"
              onChange={e => setFormData({...formData, email: e.target.value})} 
            />
          </div>
          
          <div className="space-y-1">
            <input 
              type="password" 
              required 
              className="w-full p-4 bg-slate-950/50 border border-slate-700/50 rounded-xl text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-600"
              placeholder="Master Password"
              onChange={e => setFormData({...formData, password: e.target.value})} 
            />
          </div>

          <button 
            disabled={loading} 
            className="w-full py-4 rounded-xl font-bold hover:shadow-lg transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-blue-500/20"
          >
            {loading ? (
              <span className="flex items-center gap-2"><Key className="w-4 h-4 animate-spin" /> Decrypting...</span>
            ) : (
              <span className="flex items-center gap-2">Decrypt Vault <ArrowRight className="w-4 h-4"/></span>
            )}
          </button>
        </form>

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