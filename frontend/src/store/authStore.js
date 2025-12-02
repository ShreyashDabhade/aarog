import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  user: null,
  token: localStorage.getItem('token') || null,
  userPrivateKey: null, // The unlocked CryptoKey object
  userPublicKeyPem: localStorage.getItem('user_public_key') || null,
  isAuthenticated: !!localStorage.getItem('token'),

  setAuth: (user, token, privateKey, publicKeyPem) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user_public_key', publicKeyPem);
    set({ 
      user, 
      token, 
      userPrivateKey: privateKey,
      userPublicKeyPem: publicKeyPem,
      isAuthenticated: true 
    });
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user_public_key');
    set({ 
      user: null, 
      token: null, 
      userPrivateKey: null, 
      userPublicKeyPem: null,
      isAuthenticated: false 
    });
  }
}));