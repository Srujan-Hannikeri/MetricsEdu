import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  ShieldCheck, GraduationCap, School, LogOut, Sparkles, UserCheck, 
  X, Mail, User, BookOpen, CheckCircle2, ChevronRight 
} from 'lucide-react';

export default function Navbar({ user, onLogout, onOpenDemoSeed }) {
  const [showProfileModal, setShowProfileModal] = useState(false);

  const getRoleBadge = (role) => {
    switch (role) {
      case 'admin':
        return {
          label: 'Admin',
          color: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
          icon: ShieldCheck,
          idLabel: 'Admin ID:',
          idVal: user?.adminId
        };
      case 'teacher':
        return {
          label: 'Teacher / Lecturer',
          color: 'bg-[#00a896]/20 text-[#00C49F] border-[#00a896]/40',
          icon: School,
          idLabel: 'Teacher ID:',
          idVal: user?.teacherId
        };
      case 'student':
        return {
          label: user?.institutionType === 'school' ? 'School Student' : 'College Student',
          color: 'bg-cyan-500/15 text-[#38bdf8] border-cyan-500/30',
          icon: GraduationCap,
          idLabel: user?.institutionType === 'school' ? 'Roll No:' : 'USN:',
          idVal: user?.usn
        };
      default:
        return {
          label: 'Guest',
          color: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
          icon: UserCheck,
          idLabel: 'ID:',
          idVal: 'N/A'
        };
    }
  };

  const badge = getRoleBadge(user?.role);
  const IconComponent = badge.icon;

  return (
    <header className="sticky top-0 z-40 w-full bg-[#040d1a]/95 backdrop-blur-md border-b border-[#133966] shadow-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        
        {/* Brand & High-Definition Logo */}
        <div className="flex items-center gap-3.5">
          <div className="relative group shrink-0">
            {/* Crisp High-Res Logo Container */}
            <div className="h-14 w-auto rounded-xl bg-[#071b34] border border-[#133966] p-1 flex items-center justify-center shadow-lg hover:border-[#00C49F] transition-colors">
              <img
                src="/logo.jpg"
                alt="MetricsEdu Logo"
                className="h-12 w-auto object-contain rounded-lg"
                style={{ imageRendering: '-webkit-optimize-contrast' }}
              />
            </div>
            <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-[#00C49F] border-2 border-[#040d1a] rounded-full" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black tracking-tight text-white">
                Metrics<span className="text-[#00C49F]">Edu</span>
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#00a896]/20 text-[#00C49F] border border-[#00a896]/40 uppercase tracking-wider">
                Vision AI
              </span>
            </div>
            <p className="text-xs text-cyan-200/80 font-medium tracking-wide">
              One Connected Platform. One Smart Classroom.
            </p>
          </div>
        </div>

        {/* User Status / Role / Interactive Profile Pill */}
        {user ? (
          <div className="flex items-center gap-3">
            {/* Clickable Profile Pill (Opens Profile Modal & Sign Out) */}
            <button
              type="button"
              onClick={() => setShowProfileModal(true)}
              className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-[#071b34] hover:bg-[#0b2444] border border-[#133966] hover:border-[#00C49F] transition-all group shadow-sm text-left"
              title="Click to view profile & sign out"
            >
              <div className={`p-1.5 rounded-lg border ${badge.color} group-hover:scale-105 transition-transform`}>
                <IconComponent className="w-4 h-4" />
              </div>
              <div className="leading-tight">
                <div className="font-bold text-white flex items-center gap-1.5 text-xs">
                  <span className="group-hover:text-[#00C49F] transition-colors">{user.name}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.2 rounded border ${badge.color}`}>
                    {badge.label}
                  </span>
                </div>
                <div className="text-slate-400 font-mono text-[11px] mt-0.5 flex items-center gap-1">
                  <span className="text-slate-500">{badge.idLabel}</span>
                  <span className="text-[#00C49F] font-bold">{badge.idVal || user.email}</span>
                  <span className="text-[10px] text-slate-500 group-hover:text-[#00C49F] ml-1">▼</span>
                </div>
              </div>
            </button>
          </div>
        ) : (
          <div className="text-xs text-cyan-200/70 font-mono">
            Secured by Passport.js
          </div>
        )}

      </div>

      {/* User Profile Modal with Academic Details & Signout Button (Rendered via Portal to ensure 100% visibility) */}
      {showProfileModal && user && typeof document !== 'undefined' && createPortal(
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowProfileModal(false);
          }}
          className="fixed inset-0 z-[9999] bg-[#040d1a]/85 backdrop-blur-md overflow-y-auto flex items-center justify-center p-4 sm:p-6"
        >
          <div className="w-full max-w-md bg-[#071b34] border border-[#133966] rounded-3xl p-6 shadow-2xl relative text-white animate-in fade-in zoom-in-95 duration-200 my-auto">
            
            {/* Close Button */}
            <button
              onClick={() => setShowProfileModal(false)}
              className="absolute top-5 right-5 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-[#0b2444] transition-colors"
              title="Close Profile"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Profile Header */}
            <div className="flex items-center gap-4 pb-4 border-b border-[#133966]">
              <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-[#00C49F] bg-[#040d1a] shadow-lg shrink-0">
                <img
                  src={user.profileImage || '/logo.jpg'}
                  alt={user.name}
                  className="w-full h-full object-cover"
                  onError={(e) => { e.target.src = '/logo.jpg'; }}
                />
              </div>
              <div>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${badge.color} uppercase`}>
                  {badge.label}
                </span>
                <h2 className="text-lg font-black text-white mt-1 leading-snug">
                  {user.name}
                </h2>
                <p className="text-xs text-[#00C49F] font-mono font-bold">
                  {badge.idLabel} {badge.idVal || 'N/A'}
                </p>
              </div>
            </div>

            {/* Academic Details List */}
            <div className="py-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#040d1a] border border-[#133966]">
                <span className="text-slate-400">Institution Mode:</span>
                <span className="font-bold text-white uppercase font-mono">
                  {user.institutionType === 'school' ? 'School (K-12)' : 'College / University'}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#040d1a] border border-[#133966]">
                <span className="text-slate-400">
                  {user.institutionType === 'school' ? 'Standard / Class:' : 'Department & Semester:'}
                </span>
                <span className="font-bold text-cyan-200">
                  {user.institutionType === 'school'
                    ? (user.standard || '10th Std')
                    : `${user.department || 'CSE'} (Sem ${user.semester || 5})`}
                </span>
              </div>

              {user.role === 'student' && (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#040d1a] border border-[#133966]">
                  <span className="text-slate-400">Assigned Division:</span>
                  <span className="font-bold text-[#00C49F] font-mono">
                    Division {user.division || user.section || 'C'}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#040d1a] border border-[#133966]">
                <span className="text-slate-400">Email Address:</span>
                <span className="font-mono text-slate-200 text-[11px] truncate max-w-[200px]">
                  {user.email}
                </span>
              </div>

              {user.parentsEmail && (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#040d1a] border border-[#133966]">
                  <span className="text-slate-400">Parent's Email:</span>
                  <span className="font-mono text-amber-300 text-[11px] truncate max-w-[200px]">
                    {user.parentsEmail}
                  </span>
                </div>
              )}

              {/* Biometrics ONLY for Students (PER REQUIREMENT: Removed for Admin & Teachers) */}
              {user.role === 'student' && (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#040d1a] border border-[#133966]">
                  <span className="text-slate-400">Biometric Recognition:</span>
                  <span className="font-bold text-[#00C49F] flex items-center gap-1 font-mono">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#00C49F]" />
                    {user.faceRegistered ? `Enrolled (${user.lastConfidenceScore || 95}%)` : 'Active'}
                  </span>
                </div>
              )}
            </div>

            {/* Modal Actions: Sign Out inside profile page */}
            <div className="pt-4 border-t border-[#133966] flex items-center justify-between gap-3">
              <span className="text-[11px] text-slate-500 font-mono">
                MetricsEdu Platform
              </span>
              <button
                type="button"
                onClick={() => {
                  setShowProfileModal(false);
                  onLogout();
                }}
                className="px-4 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 hover:text-white border border-rose-500/40 text-xs font-bold transition-all flex items-center gap-2 shadow-sm"
              >
                <LogOut className="w-4 h-4 text-rose-400" />
                Sign Out
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}

    </header>
  );
}

