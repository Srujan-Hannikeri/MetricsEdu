import React, { useState, useEffect, lazy, Suspense } from 'react';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
  const [currentActiveTab, setCurrentActiveTab] = useState('overview');
  const [concurrentLogoutNotice, setConcurrentLogoutNotice] = useState(null);

  // Background initialization & auth restoration
  useEffect(() => {
    checkCurrentUser();
  }, []);

  // Listen for single-session invalidation / concurrent login event
  useEffect(() => {
    const handleConcurrentLogout = (e) => {
      const message = e.detail?.message || 'This account was logged in from another device or browser. Only one active login is permitted.';
      removeToken();
      setUser(null);
      setConcurrentLogoutNotice(message);
    };
    window.addEventListener('metricsedu:concurrent-logout', handleConcurrentLogout);
    return () => window.removeEventListener('metricsedu:concurrent-logout', handleConcurrentLogout);
  }, []);

  // Periodic heartbeat / active session validator (detects if account logged in on another device)
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(async () => {
      try {
        await api.getMe();
      } catch (err) {
        // Automatically handled by metricsedu:concurrent-logout in api.js
      }
    }, 12000);

    const handleFocus = async () => {
      try {
        await api.getMe();
      } catch (err) {}
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user]);

  // Listen for tab changes from dashboard
  useEffect(() => {
    const handleTabChange = (e) => {
      if (e.detail?.tab) setCurrentActiveTab(e.detail.tab);
    };
    window.addEventListener('metricsedu:tab-changed', handleTabChange);
    return () => window.removeEventListener('metricsedu:tab-changed', handleTabChange);
  }, []);

  // Path change / popstate listener and hidden dev shortcut (Ctrl+Shift+D)
  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);

    const handleKeyDown = (e) => {
      // Secret developer shortcut: Ctrl+Shift+D ONLY on the main login page (when !user) or to exit dev portal
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        const isDev = currentPath === '/developer' || currentPath === '/dev';
        if (!user || isDev) {
          e.preventDefault();
          const next = isDev ? '/' : '/developer';
          window.history.pushState({}, '', next);
          setCurrentPath(next);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentPath, user]);

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

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (_) {}
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

  // ─── Hidden Web Developer Team Portal Route (Accessible via /developer, /dev, or Ctrl+Shift+D) ──
  const isDevRoute = currentPath === '/developer' || currentPath === '/dev' || window.location.hash === '#developer';

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        navigateTo(isDevRoute ? '/' : '/developer');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDevRoute]);

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
        onToggleMobileMenu={() => setIsSidebarOpen(prev => !prev)}
        isMobileMenuOpen={isSidebarOpen}
      />

      {/* Main Layout: Sidebar on Desktop & Mobile Drawer + Content on Right */}
      <div className="flex-1 flex min-w-0 relative">
        {user && (
          <Sidebar
            user={user}
            activeTab={currentActiveTab}
            onSelectTab={(tabId) => {
              setCurrentActiveTab(tabId);
              window.dispatchEvent(new CustomEvent('metricsedu:navigate-tab', { detail: { tab: tabId } }));
            }}
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
            onLogout={handleLogout}
            onOpenFeedback={() => setShowFeedbackModal(true)}
          />
        )}

        {/* Main Content Body */}
        <main className="flex-1 min-w-0 overflow-y-auto">
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
      </div>

      {/* Feedback Modal */}
      <FeedbackModal
        isOpen={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        user={user}
      />

      {/* Concurrent Login Security Alert Modal */}
      {concurrentLogoutNotice && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md bg-gradient-to-b from-[#0d1f38] to-[#071324] border border-amber-500/40 rounded-2xl p-6 shadow-2xl text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Session Terminated</h3>
            <p className="text-xs text-amber-200/90 leading-relaxed mb-5 font-medium">
              {concurrentLogoutNotice || 'This account was logged in from another device. Please logout from old device and login here.'}
            </p>
            <div className="bg-[#040e1e]/90 border border-slate-800 rounded-xl p-3 mb-6 text-[11px] text-slate-300 text-left space-y-1.5">
              <div className="flex items-center gap-2 text-slate-200 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                <span>Single-Session Security Policy</span>
              </div>
              <p className="text-slate-400 text-[10px] leading-normal">
                To protect account security and academic integrity, MetricsEdu permits only one active device at a time. If you need to access your account on this device, please logout from the old device and login here.
              </p>
            </div>
            <button
              onClick={() => setConcurrentLogoutNotice(null)}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-teal-500/20 active:scale-95"
            >
              Logout From Old Device & Login Here
            </button>
          </div>
        </div>
      )}

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
