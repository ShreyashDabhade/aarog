import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Activity, FileText, Search, AlertCircle, Clock } from 'lucide-react';
import { motion } from 'framer-motion';

const StatCard = ({ icon: Icon, label, value, color }) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
    <div className={`p-4 rounded-xl ${color}`}>
      <Icon className="w-6 h-6 text-white" />
    </div>
    <div>
      <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">{label}</p>
      <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
    </div>
  </div>
);

const DoctorDashboard = () => {
  const navigate = useNavigate();

  // Mock Data for "Recent" view
  const recentActivity = [
    { id: 1, name: "Patient #9281", action: "Uploaded MRI Scan", time: "2 mins ago" },
    { id: 2, name: "Patient #3321", action: "Shared Lab Results", time: "1 hour ago" },
    { id: 3, name: "Patient #1102", action: "Requested Consultation", time: "3 hours ago" },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">Clinical Command Center</h2>
          <p className="text-slate-500 mt-1">Welcome back, Dr. Smith.</p>
        </div>
        <button 
          onClick={() => navigate('/chat')}
          className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition flex items-center gap-2 shadow-lg shadow-blue-500/20"
        >
          <Search className="w-5 h-5" /> Query Knowledge Base
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard icon={Users} label="Total Patients" value="1,284" color="bg-blue-500" />
        <StatCard icon={Activity} label="Critical Alerts" value="3" color="bg-red-500" />
        <StatCard icon={FileText} label="Reports Reviewed" value="842" color="bg-emerald-500" />
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Quick Actions / Recent */}
        <div className="lg:col-span-2 bg-white rounded-3xl p-8 border border-slate-200 shadow-sm">
          <h3 className="font-bold text-lg text-slate-800 mb-6 flex items-center gap-2">
            <Clock className="w-5 h-5 text-slate-400" /> Recent Patient Activity
          </h3>
          <div className="space-y-4">
            {recentActivity.map((item) => (
              <motion.div 
                key={item.id}
                whileHover={{ scale: 1.01 }}
                className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 cursor-pointer hover:bg-blue-50 hover:border-blue-100 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center font-bold text-slate-600 border border-slate-200">
                    {item.name.charAt(9)}
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">{item.name}</p>
                    <p className="text-xs text-slate-500">{item.action}</p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-slate-400">{item.time}</span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-slate-900 rounded-3xl p-8 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500 rounded-full blur-[60px] opacity-20"></div>
          <h3 className="font-bold text-lg mb-6 flex items-center gap-2 relative z-10">
            <AlertCircle className="w-5 h-5 text-red-400" /> Priority Attention
          </h3>
          <div className="space-y-4 relative z-10">
            <div className="p-4 bg-white/10 rounded-2xl backdrop-blur-md border border-white/5">
              <p className="text-sm font-medium text-white">Patient #4421</p>
              <p className="text-xs text-slate-400 mt-1">High blood pressure flags in recent report.</p>
            </div>
            <div className="p-4 bg-white/10 rounded-2xl backdrop-blur-md border border-white/5">
              <p className="text-sm font-medium text-white">Patient #8821</p>
              <p className="text-xs text-slate-400 mt-1">Pending approval for MRI access.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default DoctorDashboard;