import React from 'react';
import {
  Video, BookOpen, Camera, Award, TrendingUp, Calendar,
  Megaphone, Clock, ShieldCheck, Layers, Users, School,
  UserCheck, LogOut, Bug, ChevronRight, X
} from 'lucide-react';

export default function Sidebar({
  user,
  activeTab,
  onSelectTab,
  isOpen,
  onClose,
  onLogout,
  onOpenFeedback
}) {
  if (!user) return null;

  // Role-specific navigation items
  const getNavItems = () => {
    switch (user.role) {
      case 'teacher':
        return [
          { id: 'online-class', label: 'Live Online Classes', desc: 'Interactive video & 80% attendance', icon: Video, badge: 'Live' },
          { id: 'my-classes', label: 'My Assigned Classes', desc: 'Daily schedule & attendance', icon: BookOpen },
          { id: 'take-attendance', label: 'Take Attendance', desc: 'Face vision photo scanner', icon: Camera },
          { id: 'marks-entry', label: 'Exam Marks Entry', desc: 'Internal & exam assessments', icon: Award },
          { id: 'marks-overview', label: 'Student Marks & Standings', desc: 'Class performance metrics', icon: TrendingUp },
          { id: 'timetable', label: 'Weekly Timetable', desc: 'Department & division matrix', icon: Calendar },
          { id: 'calendar', label: 'Academic Calendar', desc: 'Holidays & campus events', icon: Calendar },
          { id: 'announcements', label: 'Announcements', desc: 'Notices & circulars', icon: Megaphone },
          { id: 'materials', label: 'Study Materials', desc: 'Lecture notes & syllabus', icon: BookOpen },
          { id: 'history', label: 'Session Reports', desc: 'Past logs & PDF / CSV download', icon: Clock }
        ];

      case 'student':
        return [
          { id: 'online-class', label: 'Live Online Classes', desc: 'Live video lectures & 80% tracker', icon: Video, badge: 'Live' },
          { id: 'attendance', label: 'My Attendance & Subjects', desc: 'Subject percentages & overview', icon: BookOpen },
          { id: 'timetable', label: 'Class Timetable', desc: 'Weekly lecture schedule', icon: Calendar },
          { id: 'marks', label: 'Marks & Analytics', desc: 'Assessment scores & rank', icon: Award },
          { id: 'calendar', label: 'Academic Calendar', desc: 'Events & term dates', icon: Calendar },
          { id: 'announcements', label: 'Announcements', desc: 'Department bulletins', icon: Megaphone },
          { id: 'materials', label: 'Study Materials', desc: 'Download notes & guides', icon: BookOpen }
        ];

      case 'admin':
        return [
          { id: 'overview', label: 'Executive Overview', desc: 'Institutional KPIs & metrics', icon: ShieldCheck },
          { id: 'online-class', label: 'Live Classes Monitor', desc: 'Virtual classroom tracking', icon: Video, badge: 'Live' },
          { id: 'timetable', label: 'Timetable Master', desc: 'Matrix allocation & periods', icon: Calendar },
          { id: 'schedule-setup', label: 'Schedule Setup', desc: 'Semesters, branches & subjects', icon: Layers },
          { id: 'divisions', label: 'Division Allocator', desc: 'Student batch allocation', icon: Users },
          { id: 'faculty-tracker', label: 'Faculty Tracker', desc: 'Live teacher status & periods', icon: School },
          { id: 'courses', label: 'Courses Directory', desc: 'Curriculum & subject codes', icon: BookOpen },
          { id: 'users', label: 'User Directory', desc: 'Faculty, students & credentials', icon: UserCheck },
          { id: 'marks-overview', label: 'Marks & Analytics', desc: 'Institutional academic standings', icon: TrendingUp },
          { id: 'calendar', label: 'Academic Calendar', desc: 'Term events & exam dates', icon: Calendar }
        ];

      default:
        return [];
    }
  };

  const navItems = getNavItems();

  const getRoleBadge = (role) => {
    switch (role) {
      case 'admin':
        return { label: 'Admin Portal', color: 'bg-rose-500/15 text-rose-400 border-rose-500/30' };
      case 'teacher':
        return { label: 'Faculty Portal', color: 'bg-[#00a896]/20 text-[#00C49F] border-[#00a896]/40' };
      case 'student':
        return { label: 'Student Portal', color: 'bg-cyan-500/15 text-[#38bdf8] border-cyan-500/30' };
      default:
        return { label: 'Portal', color: 'bg-slate-500/15 text-slate-300 border-slate-500/30' };
    }
  };

  const badge = getRoleBadge(user.role);

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#040d1a] border-r border-[#133966] select-none">
      
      {/* ── Top Header of Menu with Close Button at the RIGHT TOP ───────────── */}
      <div className="p-3 border-b border-[#133966] bg-[#030914] flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-[#071b34] border border-[#133966] p-0.5 flex items-center justify-center shrink-0">
            <img src="/logo.jpg" alt="Logo" className="w-full h-full object-contain rounded" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-black text-white truncate">Navigation Menu</div>
            <div className="text-[9px] text-[#00C49F] font-mono font-bold">{badge.label.toUpperCase()}</div>
          </div>
        </div>

        {/* Close Button at the right top of the menu */}
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-xl bg-[#071b34] hover:bg-[#0b2444] text-slate-400 hover:text-white border border-[#133966] hover:border-rose-500/40 transition-colors shrink-0 shadow-sm"
          title="Close Menu"
          aria-label="Close Menu"
        >
          <X className="w-4 h-4 text-slate-300 hover:text-white" />
        </button>
      </div>

      {/* ── User Overview & Division Tag ──────────────────────────────────────── */}
      <div className="p-3.5 border-b border-[#133966] bg-[#071b34]/40">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl overflow-hidden border border-[#00C49F] bg-[#040d1a] shrink-0">
            <img
              src={user.profileImage || '/logo.jpg'}
              alt={user.name}
              className="w-full h-full object-cover"
              onError={(e) => { e.target.src = '/logo.jpg'; }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border ${badge.color} uppercase`}>
                {badge.label}
              </span>
              {user.division && (
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-[#00a896]/20 text-[#00C49F] border border-[#00a896]/40">
                  Div {user.division}
                </span>
              )}
            </div>
            <h4 className="text-xs font-black text-white truncate mt-1 leading-tight">
              {user.name}
            </h4>
            <p className="text-[10px] text-slate-400 font-mono truncate">
              {user.usn || user.teacherId || user.adminId || user.email}
            </p>
          </div>
        </div>
      </div>

      {/* ── Navigation Menu Items ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-1 touch-scroll">
        <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-400">
          Navigation Menu
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectTab(item.id);
                if (onClose) onClose();
              }}
              className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all group ${
                isActive
                  ? 'bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] font-black shadow-md shadow-teal-500/20'
                  : 'text-slate-300 hover:text-white hover:bg-[#071b34] border border-transparent hover:border-[#133966]'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`p-1.5 rounded-lg shrink-0 ${
                  isActive ? 'bg-[#040d1a]/20 text-[#040d1a]' : 'bg-[#071b34] text-[#00C49F] group-hover:scale-105 transition-transform'
                }`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 leading-tight">
                  <div className="text-xs truncate flex items-center gap-1.5">
                    <span>{item.label}</span>
                    {item.badge && !isActive && (
                      <span className="text-[9px] px-1 py-0.2 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 uppercase font-mono font-bold animate-pulse">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <div className={`text-[10px] truncate ${isActive ? 'text-[#040d1a]/80 font-normal' : 'text-slate-400 font-normal'}`}>
                    {item.desc}
                  </div>
                </div>
              </div>
              <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-[#040d1a]' : 'text-slate-500 group-hover:text-white'}`} />
            </button>
          );
        })}
      </div>

      {/* ── Bottom Actions (Feedback & Logout) ───────────────────────────────── */}
      <div className="p-3 border-t border-[#133966] bg-[#071b34]/30 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              if (onClose) onClose();
              if (onOpenFeedback) onOpenFeedback();
            }}
            className="px-2 py-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
          >
            <Bug className="w-3.5 h-3.5" />
            <span>Feedback</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (onClose) onClose();
              if (onLogout) onLogout();
            }}
            className="px-2 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 hover:text-white border border-rose-500/40 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

    </div>
  );

  return (
    <>
      {/* ── Desktop Collapsible Sidebar (Toggles on ALL screens) ──────────────── */}
      <aside
        className={`hidden md:flex flex-col shrink-0 border-r border-[#133966] bg-[#040d1a] sticky top-[84px] sm:top-[92px] h-[calc(100vh-84px)] sm:h-[calc(100vh-92px)] z-30 shadow-xl transition-all duration-300 ease-in-out overflow-hidden ${
          isOpen ? 'w-64 lg:w-72 opacity-100' : 'w-0 opacity-0 border-r-0 pointer-events-none'
        }`}
      >
        <div className="w-64 lg:w-72 h-full flex flex-col">
          {sidebarContent}
        </div>
      </aside>

      {/* ── Mobile & Tablet Slide-over Drawer (when isOpen) ─────────────────── */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#040d1a]/85 backdrop-blur-md flex md:hidden animate-in fade-in duration-200"
          onClick={onClose}
        >
          <div
            className="w-72 sm:w-80 h-full bg-[#040d1a] shadow-2xl flex flex-col animate-in slide-in-from-left duration-200 relative"
            onClick={(e) => e.stopPropagation()}
          >
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
