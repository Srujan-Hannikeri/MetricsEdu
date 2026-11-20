import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  ShieldCheck, GraduationCap, School, LogOut, Sparkles, UserCheck, 
  X, Mail, User, BookOpen, CheckCircle2, ChevronRight, Clock, Bug,
  Menu, Video, Camera, Calendar, Megaphone, Award, TrendingUp, Layers, Users
} from 'lucide-react';

// Live clock hook
function useLiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

export default function Navbar({ user, onLogout, onOpenFeedback, onToggleMobileMenu, isMobileMenuOpen }) {
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const now = useLiveClock();

  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

  // Handle navigation from mobile hamburger menu
  const handleMobileNav = (tabId) => {
    setShowMobileMenu(false);
    window.dispatchEvent(new CustomEvent('metricsedu:navigate-tab', { detail: { tab: tabId } }));
  };

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

  // Navigation items for the mobile hamburger drawer based on role
  const getNavItems = () => {
    if (user?.role === 'teacher') {
      return [
        { id: 'online-class', label: 'Live Online Classes', desc: 'Live video lecture & 80% attendance', icon: Video, color: 'text-rose-400 bg-rose-500/15 border-rose-500/30' },
        { id: 'my-classes', label: 'My Assigned Classes', desc: 'Schedule & daily lectures', icon: BookOpen, color: 'text-[#00C49F] bg-[#00a896]/15 border-[#00a896]/30' },
        { id: 'take-attendance', label: 'Take Attendance', desc: 'Face vision photo scanner', icon: Camera, color: 'text-cyan-400 bg-cyan-500/15 border-cyan-500/30' },
        { id: 'marks-entry', label: 'Exam Marks Entry', desc: 'IA & Semester evaluations', icon: Award, color: 'text-amber-400 bg-amber-500/15 border-amber-500/30' },
        { id: 'marks-overview', label: 'Student Marks & Standings', desc: 'Performance analytics', icon: TrendingUp, color: 'text-purple-400 bg-purple-500/15 border-purple-500/30' },
        { id: 'timetable', label: 'Weekly Timetable', desc: 'Complete division matrix', icon: Calendar, color: 'text-blue-400 bg-blue-500/15 border-blue-500/30' },
        { id: 'calendar', label: 'Academic Calendar', desc: 'Events & holidays schedule', icon: Calendar, color: 'text-indigo-400 bg-indigo-500/15 border-indigo-500/30' },
        { id: 'announcements', label: 'Announcements', desc: 'Campus bulletins & alerts', icon: Megaphone, color: 'text-yellow-400 bg-yellow-500/15 border-yellow-500/30' },
        { id: 'materials', label: 'Study Materials', desc: 'Upload notes & syllabi', icon: BookOpen, color: 'text-teal-400 bg-teal-500/15 border-teal-500/30' },
        { id: 'history', label: 'Attendance Sessions', desc: 'Past logs & PDF / CSV export', icon: Clock, color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' }
      ];
    } else if (user?.role === 'student') {
      return [
        { id: 'online-class', label: 'Online Classes (Live)', desc: 'Join live lecture & track 80%', icon: Video, color: 'text-rose-400 bg-rose-500/15 border-rose-500/30' },
        { id: 'attendance', label: 'My Attendance & Subjects', desc: 'Attendance % & subject metrics', icon: BookOpen, color: 'text-[#00C49F] bg-[#00a896]/15 border-[#00a896]/30' },
        { id: 'timetable', label: 'Weekly Timetable', desc: 'Class division matrix', icon: Calendar, color: 'text-blue-400 bg-blue-500/15 border-blue-500/30' },
        { id: 'marks', label: 'My Marks & Report Card', desc: 'Internal & exam scores', icon: Award, color: 'text-amber-400 bg-amber-500/15 border-amber-500/30' },
        { id: 'calendar', label: 'Academic Calendar', desc: 'Campus events & exams', icon: Calendar, color: 'text-indigo-400 bg-indigo-500/15 border-indigo-500/30' },
        { id: 'announcements', label: 'Announcements', desc: 'Important campus notices', icon: Megaphone, color: 'text-yellow-400 bg-yellow-500/15 border-yellow-500/30' },
        { id: 'materials', label: 'Study Materials', desc: 'Download notes & syllabus', icon: BookOpen, color: 'text-teal-400 bg-teal-500/15 border-teal-500/30' }
      ];
    } else if (user?.role === 'admin') {
      return [
        { id: 'overview', label: 'Institutional Overview', desc: 'Analytics & attendance rates', icon: ShieldCheck, color: 'text-rose-400 bg-rose-500/15 border-rose-500/30' },
        { id: 'online-class', label: 'Online Classes Monitor', desc: 'Active virtual lectures & stats', icon: Video, color: 'text-purple-400 bg-purple-500/15 border-purple-500/30' },
        { id: 'timetable', label: 'Timetable Matrix', desc: 'Edit & allocate classes', icon: Calendar, color: 'text-cyan-400 bg-cyan-500/15 border-cyan-500/30' },
        { id: 'schedule-setup', label: 'Schedule Setup', desc: 'Semesters, branches & dates', icon: Layers, color: 'text-blue-400 bg-blue-500/15 border-blue-500/30' },
        { id: 'divisions', label: 'Divisions Allocator', desc: 'Manage section division lists', icon: Users, color: 'text-teal-400 bg-teal-500/15 border-teal-500/30' },
        { id: 'faculty-tracker', label: 'Faculty Tracker', desc: 'Lecturer live locations & gaps', icon: School, color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' },
        { id: 'courses', label: 'Department Courses', desc: 'Curriculum & subject codes', icon: BookOpen, color: 'text-amber-400 bg-amber-500/15 border-amber-500/30' },
        { id: 'users', label: 'User Directory', desc: 'Students, teachers & credentials', icon: UserCheck, color: 'text-indigo-400 bg-indigo-500/15 border-indigo-500/30' },
        { id: 'marks-overview', label: 'Marks Analytics', desc: 'Student standings & stats', icon: TrendingUp, color: 'text-pink-400 bg-pink-500/15 border-pink-500/30' },
        { id: 'calendar', label: 'Academic Calendar', desc: 'Campus events & holidays', icon: Calendar, color: 'text-indigo-400 bg-indigo-500/15 border-indigo-500/30' }
      ];
    }
    return [];
  };

  const navItems = getNavItems();

  return (
    <header className="sticky top-0 z-40 w-full bg-[#040d1a]/95 backdrop-blur-md border-b border-[#133966] shadow-xl">
      {/* Top Header Row: Logo & Brand at far Left, Name & Sign Out at far Right */}
      <div className="max-w-7xl mx-auto min-w-0 px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-3">
        
        {/* Left: Brand Logo & Title */}
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3.5">
          {/* Crisp High-Res Logo Container */}
          <div className="relative group shrink-0">
            <div className="h-9 w-9 sm:h-11 sm:w-11 rounded-xl bg-[#071b34] border border-[#133966] p-1 flex items-center justify-center shadow-lg hover:border-[#00C49F] transition-colors">
              <img
                src="/logo.jpg"
                alt="MetricsEdu Logo"
                className="h-7 w-7 sm:h-9 sm:w-9 object-contain rounded-lg"
                style={{ imageRendering: '-webkit-optimize-contrast' }}
              />
            </div>
            <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-[#00C49F] border-2 border-[#040d1a] rounded-full" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-lg sm:text-2xl font-black tracking-tight text-white">
                Metrics<span className="text-[#00C49F]">Edu</span>
              </span>
              <span className="hidden sm:inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#00a896]/20 text-[#00C49F] border border-[#00a896]/40 uppercase tracking-wider">
                Vision AI
              </span>
            </div>
            <p className="hidden sm:block truncate text-xs text-cyan-200/80 font-medium tracking-wide">
              One Connected Platform. One Smart Classroom.
            </p>
          </div>
        </div>

        {/* Right: User Status / Name & Direct Sign Out Button towards Right */}
        {user ? (
          <div className="flex shrink-0 items-center gap-2 sm:gap-3 ml-auto">
            {/* Live Clock (Desktop only) */}
            <div className="hidden lg:flex flex-col items-end px-3 py-1 rounded-xl bg-[#071b34] border border-[#133966]">
              <div className="text-xs font-black font-mono text-[#00C49F] tracking-widest leading-none">
                {timeStr}
              </div>
              <div className="text-[9px] text-slate-400 font-mono mt-0.5">{dateStr}</div>
            </div>

            {/* User Profile Pill */}
            <button
              type="button"
              onClick={() => setShowProfileModal(true)}
              aria-label="Open profile"
              className="flex shrink-0 items-center gap-2 sm:gap-2.5 p-1 sm:px-3 sm:py-1.5 rounded-xl bg-[#071b34] hover:bg-[#0b2444] border border-[#133966] hover:border-[#00C49F] transition-all group shadow-sm text-left"
              title="Click to view profile"
            >
              {user.profileImage ? (
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg overflow-hidden border border-[#00C49F] shrink-0 bg-[#040d1a]">
                  <img
                    src={user.profileImage}
                    alt={user.name}
                    className="w-full h-full object-cover"
                    onError={(e) => { e.target.src = '/logo.jpg'; }}
                  />
                </div>
              ) : (
                <div className={`p-1.5 rounded-lg border ${badge.color} group-hover:scale-105 transition-transform`}>
                  <IconComponent className="w-4 h-4" />
                </div>
              )}
              {/* Mobile name tag */}
              <div className="block sm:hidden leading-tight pr-0.5">
                <span className="text-[11px] font-bold text-white block truncate max-w-[70px]">{user.name?.split(' ')[0]}</span>
                <span className={`text-[9px] font-mono px-1 py-0 rounded border ${badge.color} block text-center truncate`}>
                  {badge.label.split(' ')[0]}
                </span>
              </div>
              <div className="hidden sm:block leading-tight">
                <div className="font-bold text-white flex items-center gap-1.5 text-xs">
                  <span className="group-hover:text-[#00C49F] transition-colors truncate max-w-[120px] lg:max-w-[160px]">{user.name}</span>
                  <span className={`text-[9px] font-semibold px-1.5 py-0.2 rounded border ${badge.color}`}>
                    {badge.label}
                  </span>
                </div>
                <div className="text-slate-400 font-mono text-[10px] mt-0.5 flex items-center gap-1">
                  <span className="text-slate-500">{badge.idLabel}</span>
                  <span className="text-[#00C49F] font-bold truncate max-w-[100px] lg:max-w-[140px]">{badge.idVal || user.email}</span>
                </div>
              </div>
            </button>

            {/* Direct Sign Out Button towards right */}
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 hover:text-white border border-rose-500/40 hover:border-rose-500/60 transition-all font-bold text-xs shadow-sm group shrink-0"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4 text-rose-400 group-hover:scale-110 transition-transform" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        ) : (
          <div className="shrink-0 text-[10px] sm:text-xs text-cyan-200/70 font-mono ml-auto">
            Secured by JWT
          </div>
        )}

      </div>

      {/* ── SUB-BAR: Hamburger Menu Button Down & Context Strip ──────────── */}
      {user && (
        <div className="border-t border-[#133966]/70 bg-[#030914] px-3 sm:px-6 lg:px-8 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onToggleMobileMenu || (() => setShowMobileMenu(!showMobileMenu))}
              aria-label="Toggle navigation menu"
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#071b34] hover:bg-[#0b2444] border border-[#133966] hover:border-[#00C49F] text-[#00C49F] transition-all text-xs font-bold shadow-sm group"
              title={(isMobileMenuOpen !== undefined ? isMobileMenuOpen : showMobileMenu) ? 'Close Menu' : 'Open Menu'}
            >
              {(isMobileMenuOpen !== undefined ? isMobileMenuOpen : showMobileMenu) ? (
                <>
                  <X className="w-4 h-4 text-slate-300 group-hover:text-white" />
                  <span className="text-slate-300 group-hover:text-white font-medium">Close Menu</span>
                </>
              ) : (
                <>
                  <Menu className="w-4 h-4 text-[#00C49F] group-hover:scale-105 transition-transform" />
                  <span className="text-white font-medium">Menu</span>
                </>
              )}
            </button>

            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
              <span className="text-slate-500">Navigation:</span>
              <span className="text-cyan-300 font-bold">{badge.label}</span>
              {user.division && (
                <span className="ml-1 px-1.5 py-0.2 rounded bg-[#00a896]/20 text-[#00C49F] border border-[#00a896]/40 text-[10px]">
                  Div {user.division}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onOpenFeedback}
              className="text-[11px] text-slate-400 hover:text-[#00C49F] flex items-center gap-1.5 transition-colors"
              title="Feedback & Bug Report"
            >
              <Bug className="w-3.5 h-3.5 text-slate-500 hover:text-[#00C49F]" />
              <span className="hidden sm:inline">Feedback</span>
            </button>
          </div>
        </div>
      )}

      {/* ── MOBILE HAMBURGER MENU DRAWER ────────────────────────────────────── */}
      {showMobileMenu && user && typeof document !== 'undefined' && createPortal(
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowMobileMenu(false);
          }}
          className="fixed inset-0 z-[9990] bg-[#040d1a]/85 backdrop-blur-md flex flex-col justify-start animate-in fade-in duration-200"
        >
          <div className="w-4/5 max-w-sm bg-[#071b34] border-r border-[#133966] h-full flex flex-col shadow-2xl animate-in slide-in-from-left duration-200 overflow-hidden">
            
            {/* Drawer Header with Close Button at RIGHT TOP */}
            <div className="p-3.5 border-b border-[#133966] flex items-center justify-between bg-[#040d1a]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#00a896]/20 border border-[#00a896]/40 p-1 flex items-center justify-center">
                  <img src="/logo.jpg" alt="Logo" className="w-full h-full object-cover rounded-lg" />
                </div>
                <div>
                  <div className="text-xs font-black text-white">MetricsEdu</div>
                  <div className="text-[9px] text-[#00C49F] font-mono font-bold">NAVIGATION MENU</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMobileMenu(false)}
                className="p-1.5 rounded-xl bg-[#071b34] text-slate-400 hover:text-white hover:bg-[#0b2444] border border-[#133966] transition-colors"
                title="Close Menu"
                aria-label="Close Menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* User Profile Mini Banner */}
            <div className="p-4 border-b border-[#133966] bg-[#0b2444]/40 flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl overflow-hidden border-2 border-[#00C49F] shrink-0 bg-[#040d1a]">
                <img
                  src={user.profileImage || '/logo.jpg'}
                  alt={user.name}
                  className="w-full h-full object-cover"
                  onError={(e) => { e.target.src = '/logo.jpg'; }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border ${badge.color}`}>
                  {badge.label}
                </span>
                <div className="text-xs font-bold text-white truncate mt-0.5">{user.name}</div>
                <div className="text-[10px] text-cyan-200/80 font-mono truncate">
                  {badge.idLabel} {badge.idVal || user.email}
                </div>
              </div>
            </div>

            {/* Navigation Tab Links */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5 divide-y-0">
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 px-2 py-1">
                Dashboard Pages &amp; Tools
              </div>

              {navItems.map(item => {
                const ItemIcon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleMobileNav(item.id)}
                    className="w-full p-2.5 rounded-xl hover:bg-[#0b2444] border border-transparent hover:border-[#133966] transition-all flex items-center justify-between text-left group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`p-1.5 rounded-lg border ${item.color}`}>
                        <ItemIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-100 group-hover:text-[#00C49F] truncate">
                          {item.label}
                        </div>
                        <div className="text-[9px] text-slate-400 truncate">
                          {item.desc}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#00C49F] shrink-0" />
                  </button>
                );
              })}
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-3 border-t border-[#133966] bg-[#040d1a] space-y-2">
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono px-1">
                <span>{timeStr}</span>
                <span>{dateStr}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileMenu(false);
                    if (onOpenFeedback) onOpenFeedback();
                  }}
                  className="px-2.5 py-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[11px] font-bold flex items-center justify-center gap-1.5"
                >
                  <Bug className="w-3.5 h-3.5" />
                  <span>Feedback</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileMenu(false);
                    onLogout();
                  }}
                  className="px-2.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 text-[11px] font-bold flex items-center justify-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>

          </div>
        </div>,
        document.body
      )}

      {/* ── USER PROFILE MODAL ──────────────────────────────────────────────── */}
      {showProfileModal && user && typeof document !== 'undefined' && createPortal(
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowProfileModal(false);
          }}
          className="fixed inset-0 z-[9999] bg-[#040d1a]/85 backdrop-blur-md overflow-y-auto flex items-center justify-center p-4 sm:p-6"
        >
          <div className="w-full max-w-md bg-[#071b34] border border-[#133966] rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl relative text-white animate-in fade-in zoom-in-95 duration-200 my-auto max-h-[92vh] overflow-y-auto">
            
            {/* Close Button */}
            <button
              onClick={() => setShowProfileModal(false)}
              className="absolute top-4 right-4 sm:top-5 sm:right-5 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-[#0b2444] transition-colors"
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
                  {user.institutionType === 'school' && user.role === 'student'
                    ? 'Standard / Class:'
                    : user.role === 'student' ? 'Department & Semester:' : 'Department:'}
                </span>
                <span className="font-bold text-cyan-200">
                  {user.institutionType === 'school'
                    ? user.role === 'student' ? (user.standard || '10th Std') : 'School'
                    : user.role === 'student'
                      ? `${user.department || 'CSE'} (Sem ${user.semester || 5})`
                      : user.institutionType === 'pu_college'
                        ? `${user.pucDept || user.department || '—'} · ${user.pucYear || '—'}`
                        : (user.department || user.branch || '—')}
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

              {/* Biometrics ONLY for Students */}
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

            {/* Modal Actions */}
            <div className="pt-4 border-t border-[#133966] flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowProfileModal(false);
                  if (onOpenFeedback) onOpenFeedback();
                }}
                className="px-3 py-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <Bug className="w-3.5 h-3.5 text-blue-400" />
                Report Bug / Feedback
              </button>
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
