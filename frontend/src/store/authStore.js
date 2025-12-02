import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  user: null,
  token: localStorage.getItem('token') || null,
  role: localStorage.getItem('user_role') || 'patient',
  userPrivateKey: null, 
  userPublicKeyPem: localStorage.getItem('user_public_key') || null,
  isAuthenticated: !!localStorage.getItem('token'),

  setAuth: (user, token, privateKey, publicKeyPem, role = 'patient') => {
    localStorage.setItem('token', token);
    localStorage.setItem('user_public_key', publicKeyPem);
    localStorage.setItem('user_role', role);
    
    set({ 
      user, 
      token, 
      role,
      userPrivateKey: privateKey, // Kept in memory only for security
      userPublicKeyPem: publicKeyPem,
      isAuthenticated: true 
    });
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user_public_key');
    localStorage.removeItem('user_role');
    
    set({ 
      user: null, 
      token: null, 
      role: null,
      userPrivateKey: null, 
      userPublicKeyPem: null,
      isAuthenticated: false 
    });
  }
}));