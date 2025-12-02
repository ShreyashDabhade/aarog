import React, { useState } from 'react';
import { cryptoService } from '../lib/crypto';
import { useNavigate, Link } from 'react-router-dom';
import { Shield, Lock, CheckCircle } from 'lucide-react';

const Register = () => {
  const [formData, setFormData] = useState({ email: '', password: '', full_name: '' });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // 1. Generate RSA Key Pair
      const keys = await cryptoService.generateUserKeyPair();
      
      // 2. Derive Encryption Key from Password
      const passwordKey = await cryptoService.deriveKeyFromPassword(formData.password);
      
      // 3. Encrypt the Private Key
      const { cipher, iv } = await cryptoService.encryptData(passwordKey, keys.privateKeyPem);
      
      // 4. Send to Backend
      const payload = {
        email: formData.email,
        password: formData.password,
        full_name: formData.full_name,
        public_key_pem: keys.publicKeyPem,
        encrypted_private_key: JSON.stringify({ cipher, iv })
      };

      const resp = await fetch('http://localhost:8000/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) throw new Error('Registration failed');
      
      alert("Vault Created! Login to unlock.");
      navigate('/login');

    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-100">
        <div className="text-center mb-8">
          <Shield className="w-12 h-12 text-blue-600 mx-auto mb-2" />
          <h2 className="text-2xl font-bold text-slate-800">Create Secure Vault</h2>
        </div>
        <form onSubmit={handleRegister} className="space-y-4">
          <input type="text" placeholder="Full Name" required className="w-full p-3 border rounded-lg bg-slate-50 focus:bg-white transition" onChange={e => setFormData({...formData, full_name: e.target.value})} />
          <input type="email" placeholder="Email" required className="w-full p-3 border rounded-lg bg-slate-50 focus:bg-white transition" onChange={e => setFormData({...formData, email: e.target.value})} />
          <input type="password" placeholder="Password" required className="w-full p-3 border rounded-lg bg-slate-50 focus:bg-white transition" onChange={e => setFormData({...formData, password: e.target.value})} />
          
          <div className="bg-blue-50 p-3 rounded-lg flex gap-3 items-start">
            <Lock className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600 leading-relaxed">
              <strong>Zero-Knowledge Encryption:</strong> Your password encrypts your private key. We cannot reset your password or recover your files if you lose it.
            </p>
          </div>

          <button disabled={loading} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2">
            {loading ? 'Generating 2048-bit Keys...' : 'Create Encrypted Vault'}
          </button>
        </form>
        <p className="text-center mt-4 text-sm text-slate-500">
          Already have a vault? <Link to="/login" className="text-blue-600 hover:underline font-bold">Unlock it</Link>
        </p>
      </div>
    </div>
  );
};

export default Register;