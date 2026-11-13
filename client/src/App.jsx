import React, { useState, useEffect, lazy, Suspense } from 'react';
import Navbar from './components/Navbar';
import AuthView from './components/AuthView';
import FeedbackModal from './components/FeedbackModal';

const TeacherDashboard = lazy(() => import('./components/TeacherDashboard'));
const StudentDashboard = lazy(() => import('./components/StudentDashboard'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const DeveloperPortal = lazy(() => import('./components/DeveloperPortal'));

import { api, getToken, removeToken } from './services/api';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  // Background initialization & auth restoration
  useEffect(() => {
    checkCurrentUser();
  }, []);

  // Path change / popstate listener and hidden dev shortcut (Ctrl+Shift+D)
  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);

    const handleKeyDown = (e) => {
      // Secret developer shortcut: Ctrl+Shift+D
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        const next = currentPath === '/developer' ? '/' : '/developer';
        window.history.pushState({}, '', next);
        setCurrentPath(next);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentPath]);

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

  const navigateTo = (path) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
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

  // ─── Hidden Web Developer Team Portal Route ─────────────────────────────────
  const isDevRoute = currentPath === '/developer' || currentPath === '/dev' || window.location.hash === '#developer';
  if (isDevRoute) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-[#020813] flex items-center justify-center text-xs text-slate-400">Loading Core Console...</div>}>
        <DeveloperPortal onExit={() => navigateTo('/')} />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-teal-500 selection:text-slate-950">
      
      {/* Top Navbar */}
      <Navbar
        user={user}
        onLogout={handleLogout}
        onOpenFeedback={() => setShowFeedbackModal(true)}
      />

      {/* Main Content Body */}
      <main className="flex-1">
        <Suspense fallback={<div className="p-8 text-center text-xs text-slate-400">Loading dashboard...</div>}>
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
        </Suspense>
      </main>

      {/* Feedback Modal */}
      <FeedbackModal
        isOpen={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        user={user}
      />

      {/* Footer */}
      <footer className="w-full border-t border-[#133966] bg-[#040d1a] py-3.5 sm:py-4 px-4 sm:px-6 text-center text-xs text-slate-400 font-medium">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-2">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 sm:gap-2 text-[11px] sm:text-xs">
            <span className="font-extrabold text-white">MetricsEdu</span>
            <span>—</span>
            <span className="italic text-cyan-200/80">"One Connected Platform. One Smart Classroom"</span>
          </div>
          <div className="text-[10px] sm:text-[11px] font-mono text-slate-400 flex flex-wrap items-center justify-center sm:justify-end gap-2 sm:gap-3">
            <button
              onClick={() => setShowFeedbackModal(true)}
              className="text-slate-400 hover:text-[#00C49F] transition-colors underline decoration-dotted"
            >
              Feedback & Bug Report
            </button>
            <span>•</span>
            <span>MERN Stack</span>
            <span>•</span>
            <span className="text-[#00C49F]">JWT Auth</span>
            <span>•</span>
            <span className="text-[#38bdf8]">JS Vision</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
