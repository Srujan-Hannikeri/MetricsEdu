import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import AuthView from './components/AuthView';
import TeacherDashboard from './components/TeacherDashboard';
import StudentDashboard from './components/StudentDashboard';
import AdminDashboard from './components/AdminDashboard';
import { api, getToken, removeToken } from './services/api';
import { loadFaceApiModels } from './utils/faceUtils';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Background initialization & auth restoration
  useEffect(() => {
    checkCurrentUser();
    // Warm up face-api models asynchronously in background
    loadFaceApiModels().catch(e => console.log('Background model warming:', e));
  }, []);

  const checkCurrentUser = async () => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const data = await api.getMe();
      if (data.user) {
        setUser(data.user);
      } else {
        removeToken();
      }
    } catch (err) {
      console.warn('Session expired or invalid:', err.message);
      removeToken();
    } finally {
      setLoading(false);
    }
  };

  const handleAuthSuccess = (authenticatedUser) => {
    setUser(authenticatedUser);
  };

  const handleLogout = () => {
    removeToken();
    setUser(null);
  };

  const handleSeedDemo = async () => {
    try {
      const res = await api.seedDemoData();
      alert(res.message);
      // Reload profile
      checkCurrentUser();
    } catch (err) {
      alert('Error seeding demo data: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500 to-teal-400 p-0.5 shadow-xl animate-pulse mb-4">
          <img src="/logo.jpg" alt="Logo" className="w-full h-full object-cover rounded-[14px]" />
        </div>
        <div className="text-sm font-extrabold text-white">MetricsEdu</div>
        <div className="text-xs text-teal-400 font-mono mt-1">One Connected Platform. One Smart Classroom.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-teal-500 selection:text-slate-950">
      
      {/* Top Navbar */}
      <Navbar
        user={user}
        onLogout={handleLogout}
        onOpenDemoSeed={handleSeedDemo}
      />

      {/* Main Content Body */}
      <main className="flex-1">
        {!user ? (
          <AuthView onAuthSuccess={handleAuthSuccess} />
        ) : user.role === 'admin' ? (
          <AdminDashboard user={user} />
        ) : user.role === 'teacher' ? (
          <TeacherDashboard user={user} />
        ) : user.role === 'student' ? (
          <StudentDashboard user={user} onUserUpdated={(u) => setUser(u)} />
        ) : (
          <div className="p-8 text-center text-xs text-slate-400">
            Unrecognized role. Contact system administrator.
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-[#133966] bg-[#040d1a] py-4 px-6 text-center text-xs text-slate-400 font-medium">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-white">MetricsEdu</span>
            <span>—</span>
            <span className="italic text-cyan-200/80">"One Connected Platform. One Smart Classroom"</span>
          </div>
          <div className="text-[11px] font-mono text-slate-400 flex items-center gap-3">
            <span>MERN Stack</span>
            <span>•</span>
            <span className="text-[#00C49F]">Passport Authentication</span>
            <span>•</span>
            <span className="text-[#38bdf8]">Zero Python (100% JS Vision)</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
