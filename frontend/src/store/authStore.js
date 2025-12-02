import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  // --- MOCK MODE: Default to logged in ---
  user: { full_name: "Dr. Mock User", email: "demo@aarog.ai" },
  token: "mock_jwt_token_for_demo_run",
  userPrivateKey: null, 
  userPublicKeyPem: "mock_public_key",
  isAuthenticated: true, // <--- This prevents the redirect to Login

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