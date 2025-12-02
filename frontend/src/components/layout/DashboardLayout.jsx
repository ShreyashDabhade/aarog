import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { Shield, LayoutDashboard, UploadCloud, MessageSquare, LogOut, Menu, X, Stethoscope, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const SidebarItem = ({ to, icon: Icon, label }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
        isActive 
          ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/25 font-medium' 
          : 'text-slate-400 hover:bg-slate-800 hover:text-white'
      }`
    }
  >
    <Icon className="w-5 h-5" />
    <span className="text-sm">{label}</span>
  </NavLink>
);

const DashboardLayout = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { logout, user, role } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm" 
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-72 bg-slate-900 text-white flex flex-col
        border-r border-slate-800
        transform transition-transform duration-300 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="h-24 flex items-center px-8 border-b border-slate-800/50">
          <Shield className="w-8 h-8 text-emerald-400 mr-3" />
          <div>
            <h1 className="font-bold text-xl tracking-tight text-white">SecureMed</h1>
            <p className="text-xs text-emerald-400/80 font-medium">Privacy-First AI</p>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setIsMobileMenuOpen(false)}>
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        <nav className="flex-1 px-6 py-8 space-y-3">
          <p className="px-4 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Platform</p>
          <SidebarItem to="/" icon={LayoutDashboard} label={role === 'doctor' ? "Command Center" : "My Vault"} />
          
          {/* Only Patients see Upload */}
          {role === 'patient' && (
            <SidebarItem to="/upload" icon={UploadCloud} label="Secure Upload" />
          )}
          
          <SidebarItem to="/chat" icon={MessageSquare} label={role === 'doctor' ? "Patient Query AI" : "AI Assistant"} />
        </nav>

        <div className="p-6 border-t border-slate-800/50">
          <div className="bg-slate-800/50 rounded-xl p-4 mb-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shadow-lg ${role === 'doctor' ? 'bg-blue-600' : 'bg-emerald-500'}`}>
              {role === 'doctor' ? <Stethoscope className="w-5 h-5" /> : <User className="w-5 h-5" />}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-semibold text-white truncate">{user?.full_name || 'User'}</p>
              <p className="text-xs text-slate-400 truncate capitalize">{role}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout} 
            className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-red-500/10 hover:text-red-400 rounded-xl transition-all w-full group"
          >
            <LogOut className="w-5 h-5 group-hover:text-red-400" />
            <span className="font-medium">Lock Vault & Exit</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-full overflow-hidden relative bg-slate-50">
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-200/60 flex items-center justify-between px-8 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsMobileMenuOpen(true)} className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="text-xl font-bold text-slate-800 hidden sm:block">
              {role === 'doctor' ? 'Physician Portal' : 'Patient Vault'}
            </h2>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 px-4 py-1.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100 text-xs font-semibold shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              System Secure
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8 scroll-smooth">
          <div className="max-w-6xl mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;