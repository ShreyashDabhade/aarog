import React, { useState } from 'react';
import { cryptoService } from '../lib/crypto';
import { useAuthStore } from '../store/authStore';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, Key } from 'lucide-react';

const Login = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
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

      const resp = await fetch('http://localhost:8000/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formDataBody
      });

      if (!resp.ok) throw new Error('Invalid credentials');
      const data = await resp.json();

      // Client-Side Decryption of Private Key
      const passwordKey = await cryptoService.deriveKeyFromPassword(formData.password);
      const encryptedPrivKey = JSON.parse(data.encrypted_private_key);
      
      const privateKeyPem = await cryptoService.decryptData(
        passwordKey, 
        encryptedPrivKey.cipher, 
        encryptedPrivKey.iv
      );

      // Convert PEM back to Key Object
      const privateKeyObj = await cryptoService.importPrivateKey(privateKeyPem);

      setAuth(
        { email: formData.email, full_name: data.full_name }, 
        data.access_token, 
        privateKeyObj, 
        data.public_key
      );
      
      navigate('/');

    } catch (err) {
      console.error(err);
      alert("Unlock Failed: Incorrect Password or Corrupt Key");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-100">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">Unlock Vault</h2>
          <p className="text-slate-500 text-sm mt-1">Decryption happens on your device.</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <input type="email" placeholder="Email" required className="w-full p-3 border rounded-lg" onChange={e => setFormData({...formData, email: e.target.value})} />
          <input type="password" placeholder="Password" required className="w-full p-3 border rounded-lg" onChange={e => setFormData({...formData, password: e.target.value})} />
          <button disabled={loading} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2">
            {loading ? <Key className="w-4 h-4 animate-spin" /> : 'Decrypt & Enter'}
          </button>
        </form>
        <p className="text-center mt-4 text-sm text-slate-500">
          Need a vault? <Link to="/register" className="text-blue-600 hover:underline font-bold">Create one</Link>
        </p>
      </div>
    </div>
  );
};

export default Login;