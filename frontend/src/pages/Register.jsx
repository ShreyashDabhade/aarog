import React, { useState } from 'react';
import { cryptoService } from '../lib/crypto';
import { useNavigate, Link } from 'react-router-dom';
import { Shield, Lock, ChevronRight } from 'lucide-react';

const Register = () => {
  const [formData, setFormData] = useState({ email: '', password: '', role: 'patient' });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // 1. Generate RSA Key Pair
      const keys = await cryptoService.generateUserKeyPair();
      
      // 2. Derive Encryption Key from Password to protect Private Key
      const passwordKey = await cryptoService.deriveKeyFromPassword(formData.password);
      
      // 3. Encrypt the Private Key
      const { cipher, iv } = await cryptoService.encryptData(passwordKey, keys.privateKeyPem);
      
      // 4. Send to Backend (Matches your models.py UserRegister)
      const payload = {
        email: formData.email,
        password: formData.password, 
        role: formData.role,
        public_key_pem: keys.publicKeyPem,
        encrypted_private_key: JSON.stringify({ cipher, iv }) // Storing as JSON string in Text column
      };

      const resp = await fetch((import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.detail || "Registration failed");
      }

      alert("Vault Created! Login to unlock.");
      navigate('/login');

    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="bg-white p-10 rounded-3xl shadow-2xl w-full max-w-md border border-slate-100 relative z-10">
        <div className="text-center mb-8">
          <Shield className="w-12 h-12 text-blue-600 mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-slate-800">Create Vault</h2>
          <p className="text-slate-500 mt-2">Zero-Knowledge Architecture</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <input type="email" placeholder="Email" required className="w-full p-3.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition" onChange={e => setFormData({...formData, email: e.target.value})} />
          <input type="password" placeholder="Password" required className="w-full p-3.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition" onChange={e => setFormData({...formData, password: e.target.value})} />
          
          <select 
            className="w-full p-3.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition"
            onChange={e => setFormData({...formData, role: e.target.value})}
            value={formData.role}
          >
            <option value="patient">Patient</option>
            <option value="doctor">Doctor</option>
          </select>

          <button disabled={loading} className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-black transition flex items-center justify-center gap-2 shadow-lg">
            {loading ? 'Generating Keys...' : <>Create Encrypted Vault <ChevronRight className="w-4 h-4"/></>}
          </button>
        </form>
        <p className="text-center mt-6 text-sm text-slate-500">
          Already have a vault? <Link to="/login" className="text-blue-600 hover:underline font-bold">Unlock it</Link>
        </p>
      </div>
    </div>
  );
};

export default Register;