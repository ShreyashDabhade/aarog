import React from 'react';
import { useAuthStore } from '../store/authStore';
import PatientDashboard from './PatientDashboard';
import DoctorDashboard from './DoctorDashboard';

const Dashboard = () => {
  const { role } = useAuthStore();

  return (
    <>
      {role === 'doctor' ? <DoctorDashboard /> : <PatientDashboard />}
    </>
  );
};

export default Dashboard;