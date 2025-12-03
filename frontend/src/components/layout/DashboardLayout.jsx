import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { Shield, LayoutDashboard, UploadCloud, MessageSquare, LogOut, Menu, X, Stethoscope, User, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const SidebarItem = ({ to, icon: Icon, label }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      `flex items-center justify-between px-4 py-3.5 rounded-2xl transition-all duration-300 group ${
        isActive 
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' 
          : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
      }`
    }
  >
    {({ isActive }) => (
      <>
        <div className="flex items-center gap-3">
          <Icon className="w-5 h-5 transition-transform group-hover:scale-110" />
          <span className="font-medium text-sm tracking-wide">{label}</span>
        </div>
        <div className={isActive ? "opacity-100" : "opacity-0"}>
           <ChevronRight className="w-4 h-4 opacity-50" />
        </div>
      </>
    )}
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
    <div className="flex h-screen bg-[#F8FAFC] overflow-hidden font-sans">
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 z-40 lg:hidden backdrop-blur-sm" 
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-72 bg-[#0F172A] text-white flex flex-col
        shadow-2xl shadow-slate-400/20
        transform transition-transform duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1)]
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Brand Header */}
        <div className="h-24 flex items-center px-8">
          <div className="relative group cursor-pointer">
            <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative bg-slate-900 rounded-full p-1">
               <Shield className="w-8 h-8 text-emerald-400" />
            </div>
          </div>
          <div className="ml-3">
            <h1 className="font-bold text-xl tracking-tight text-white leading-none">SecureMed</h1>
            <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest mt-1">Privacy Vault</p>
          </div>
          <button className="ml-auto lg:hidden p-1 hover:bg-slate-800 rounded-full" onClick={() => setIsMobileMenuOpen(false)}>
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          <p className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Main Menu</p>
          <SidebarItem to="/" icon={LayoutDashboard} label={role === 'doctor' ? "Command Center" : "My Vault"} />
          
          {role === 'patient' && (
            <>
              <SidebarItem to="/upload" icon={UploadCloud} label="Secure Upload" />
              <SidebarItem to="/consent" icon={Shield} label="Consent & Emergency" /> {/* <--- New Link */}
            </>
          )}
          
          <SidebarItem to="/chat" icon={MessageSquare} label={role === 'doctor' ? "Patient Query AI" : "AI Assistant"} />
        </nav>

        {/* User Profile Footer */}
        <div className="p-4 bg-slate-900 border-t border-slate-800/50">
          <div className="bg-slate-800/40 rounded-2xl p-4 mb-4 flex items-center gap-3 border border-slate-700/30">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold shadow-lg ${role === 'doctor' ? 'bg-gradient-to-br from-blue-600 to-indigo-600' : 'bg-gradient-to-br from-emerald-500 to-teal-500'}`}>
              {role === 'doctor' ? <Stethoscope className="w-5 h-5" /> : <User className="w-5 h-5" />}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-semibold text-white truncate">{user?.full_name || 'Authenticated User'}</p>
              <p className="text-xs text-slate-400 truncate capitalize flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                {role}
              </p>
            </div>
          </div>
          <button 
            onClick={handleLogout} 
            className="flex items-center justify-center gap-2 px-4 py-3 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all w-full font-medium text-sm group border border-transparent hover:border-red-500/10"
          >
            <LogOut className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span>Lock Vault & Exit</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Glassmorphism Header */}
        <header className="h-20 bg-white/70 backdrop-blur-xl border-b border-slate-200/60 flex items-center justify-between px-6 lg:px-10 sticky top-0 z-30 shadow-sm">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsMobileMenuOpen(true)} className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              <Menu className="w-6 h-6" />
            </button>
            <div>
               <h2 className="text-xl font-bold text-slate-800 hidden sm:block">
                 {role === 'doctor' ? 'Physician Portal' : 'Patient Vault'}
               </h2>
               <p className="text-xs text-slate-500 hidden sm:block">Manage your secure medical records</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100 text-xs font-bold shadow-sm">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              System Secure
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-10 scroll-smooth">
          <div className="max-w-7xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;