import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, RefreshCw, MapPin, BookOpen, Users, Clock,
  GraduationCap, Building2, CheckCircle2, Layers, ChevronDown, ChevronUp
} from 'lucide-react';
import { api } from '../services/api';

// ─── Live clock hook ─────────────────────────────────────────────────────────
function useLiveClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id); }, []);
  return t;
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  if (status === 'in_class') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        In Class
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-500/20 text-slate-400 border border-slate-500/30">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
      In Cabin
    </span>
  );
}

// ─── Single teacher card ──────────────────────────────────────────────────────
function TeacherCard({ teacher }) {
  const [expanded, setExpanded] = useState(false);
  const inClass = teacher.status === 'in_class';

  return (
    <div className={`rounded-2xl border transition-all shadow-lg ${inClass
      ? 'bg-[#071b34] border-emerald-500/40 shadow-emerald-900/20'
      : 'bg-[#071b34]/80 border-[#133966]'}`}>

      {/* Main row */}
      <div className="flex items-start sm:items-center gap-3 p-3.5 sm:p-4">
        {/* Avatar */}
        <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl overflow-hidden shrink-0 border-2 ${inClass ? 'border-emerald-500/60' : 'border-[#133966]'}`}>
          <img
            src={teacher.profileImage || '/logo.jpg'}
            alt={teacher.name}
            className="w-full h-full object-cover"
            onError={e => { e.target.src = '/logo.jpg'; }}
          />
        </div>

        {/* Name + status */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs sm:text-sm font-bold text-white truncate">{teacher.name}</span>
            <StatusBadge status={teacher.status} />
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-400 font-mono mt-0.5 truncate">
            {teacher.teacherId} · {teacher.department}
          </div>

          {/* Active class details */}
          {inClass && teacher.activeClass && (
            <div className="mt-2 p-2 sm:p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[10px] sm:text-[11px] space-y-0.5">
              <div className="flex items-center gap-1.5 text-emerald-300 font-bold">
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                {teacher.activeClass.subject}
              </div>
              <div className="flex items-center gap-2 sm:gap-3 text-slate-300 mt-1 flex-wrap">
                <span className="flex items-center gap-1"><Layers className="w-3 h-3 text-cyan-400" /> Sem {teacher.activeClass.semester}</span>
                <span className="flex items-center gap-1"><Users className="w-3 h-3 text-cyan-400" /> Div {teacher.activeClass.division}</span>
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-cyan-400" /> {teacher.activeClass.classroom}</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-cyan-400" /> {teacher.activeClass.timeSlot}</span>
              </div>
              {teacher.activeClass.branch && (
                <div className="flex items-center gap-1 text-slate-400 mt-0.5">
                  <Building2 className="w-3 h-3" /> {teacher.activeClass.branch}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Expand toggle (today's schedule) */}
        {teacher.todaySchedule?.length > 0 && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="shrink-0 p-2 rounded-xl border border-[#133966] text-slate-400 hover:text-white hover:border-[#00C49F] transition-all"
            title="Toggle today's schedule"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Expanded: today's full schedule */}
      {expanded && teacher.todaySchedule?.length > 0 && (
        <div className="px-4 pb-4 pt-0">
          <div className="text-[10px] font-bold uppercase text-slate-500 mb-2 tracking-wider">Today's Schedule</div>
          <div className="space-y-1.5">
            {teacher.todaySchedule.map((slot, i) => (
              <div key={i} className={`flex items-center gap-3 p-2.5 rounded-xl border text-[11px] transition-all ${slot.isActive
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                : 'bg-[#040d1a] border-[#133966] text-slate-300'}`}>
                {slot.isActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />}
                <span className="font-mono shrink-0 w-36">{slot.timeSlot}</span>
                <span className="flex-1 font-medium truncate">{slot.subject}</span>
                <span className="shrink-0 text-slate-400">Div {slot.division}</span>
                <span className="shrink-0 text-slate-500">{slot.classroom}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main FacultyTrackerPage ──────────────────────────────────────────────────
export default function FacultyTrackerPage() {
  const now = useLiveClock();
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'in_class' | 'in_cabin'
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadTracker = useCallback(async () => {
    try {
      const data = await api.getFacultyTracker();
      setTeachers(data.teachers || []);
      setLastRefresh(new Date());
    } catch (e) {
      console.error('Faculty tracker error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + auto-refresh every 60 seconds
  useEffect(() => {
    loadTracker();
  }, [loadTracker]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(loadTracker, 60000);
    return () => clearInterval(id);
  }, [autoRefresh, loadTracker]);

  // ── Derived data ────────────────────────────────────────────────────────────
  const departments = ['ALL', ...Array.from(new Set(teachers.map(t => t.department).filter(Boolean))).sort()];

  const filtered = teachers.filter(t => {
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase())
      || (t.teacherId || '').toLowerCase().includes(search.toLowerCase())
      || (t.department || '').toLowerCase().includes(search.toLowerCase());
    const matchDept = deptFilter === 'ALL' || t.department === deptFilter;
    const matchStatus = statusFilter === 'ALL' || t.status === statusFilter;
    return matchSearch && matchDept && matchStatus;
  });

  const inClassCount = teachers.filter(t => t.status === 'in_class').length;
  const inCabinCount = teachers.filter(t => t.status === 'in_cabin').length;

  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const todayName = dayNames[now.getDay()];

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="bg-[#071b34]/95 border border-[#133966] rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
              <MapPin className="w-5 h-5 text-[#00C49F]" />
              Faculty Location Tracker
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Real-time status of all faculty — in class or in cabin, updated every 60 seconds
            </p>
          </div>

          {/* Live clock + last refresh */}
          <div className="flex items-center justify-between md:justify-end gap-3 sm:gap-4 w-full md:w-auto">
            <div className="text-left md:text-right">
              <div className="text-lg sm:text-xl font-black font-mono text-[#00C49F] tracking-widest">{timeStr}</div>
              <div className="text-[10px] text-slate-400 font-mono">{todayName} · {now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
              {lastRefresh && (
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Last updated: {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                </div>
              )}
            </div>
            <button
              onClick={() => { setLoading(true); loadTracker(); }}
              disabled={loading}
              className="p-2.5 rounded-xl bg-[#0b2444] border border-[#133966] text-[#00C49F] hover:border-[#00C49F] transition-all disabled:opacity-50"
              title="Refresh now"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-4 sm:mt-5">
          <div
            onClick={() => setStatusFilter('ALL')}
            className={`p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border cursor-pointer transition-all text-center ${statusFilter === 'ALL' ? 'bg-[#00a896]/15 border-[#00C49F]/50' : 'bg-[#040d1a] border-[#133966] hover:border-[#00a896]/50'}`}>
            <div className="text-xl sm:text-2xl font-black text-white font-mono">{teachers.length}</div>
            <div className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 truncate">Total Faculty</div>
          </div>
          <div
            onClick={() => setStatusFilter('in_class')}
            className={`p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border cursor-pointer transition-all text-center ${statusFilter === 'in_class' ? 'bg-emerald-500/15 border-emerald-500/50' : 'bg-[#040d1a] border-[#133966] hover:border-emerald-500/30'}`}>
            <div className="text-xl sm:text-2xl font-black text-emerald-300 font-mono">{inClassCount}</div>
            <div className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 truncate">In Class</div>
          </div>
          <div
            onClick={() => setStatusFilter('in_cabin')}
            className={`p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border cursor-pointer transition-all text-center ${statusFilter === 'in_cabin' ? 'bg-slate-500/15 border-slate-500/50' : 'bg-[#040d1a] border-[#133966] hover:border-slate-500/30'}`}>
            <div className="text-xl sm:text-2xl font-black text-slate-400 font-mono">{inCabinCount}</div>
            <div className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 truncate">In Cabin / Free</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by name, ID or department..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#071b34] border border-[#133966] rounded-xl pl-9 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00a896]"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs">✕</button>
          )}
        </div>

        {/* Department filter */}
        <select
          value={deptFilter}
          onChange={e => setDeptFilter(e.target.value)}
          className="bg-[#071b34] border border-[#133966] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#00a896] min-w-[200px]"
        >
          {departments.map(d => (
            <option key={d} value={d}>{d === 'ALL' ? 'All Departments' : d}</option>
          ))}
        </select>

        {/* Auto-refresh toggle */}
        <button
          onClick={() => setAutoRefresh(v => !v)}
          className={`px-3.5 py-2.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${autoRefresh
            ? 'bg-[#00a896]/15 text-[#00C49F] border-[#00a896]/40'
            : 'bg-[#071b34] text-slate-400 border-[#133966]'}`}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
        </button>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>
          Showing <strong className="text-white">{filtered.length}</strong> of {teachers.length} faculty
          {statusFilter !== 'ALL' && <> · Filter: <strong className="text-[#00C49F]">{statusFilter === 'in_class' ? 'In Class' : 'In Cabin'}</strong></>}
          {deptFilter !== 'ALL' && <> · Dept: <strong className="text-[#00C49F]">{deptFilter}</strong></>}
        </span>
        {(search || statusFilter !== 'ALL' || deptFilter !== 'ALL') && (
          <button onClick={() => { setSearch(''); setStatusFilter('ALL'); setDeptFilter('ALL'); }} className="text-[#00C49F] hover:underline">Clear filters</button>
        )}
      </div>

      {/* Teacher grid */}
      {loading ? (
        <div className="py-16 text-center">
          <div className="w-10 h-10 border-4 border-[#00C49F] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <div className="text-sm text-slate-400">Loading faculty status...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center bg-[#071b34]/95 border border-[#133966] rounded-3xl">
          <MapPin className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <div className="text-sm text-slate-400">No faculty found matching your filters.</div>
        </div>
      ) : (
        <>
          {/* Group by department */}
          {deptFilter === 'ALL' ? (
            departments.filter(d => d !== 'ALL').map(dept => {
              const deptTeachers = filtered.filter(t => t.department === dept);
              if (deptTeachers.length === 0) return null;
              const deptInClass = deptTeachers.filter(t => t.status === 'in_class').length;
              return (
                <div key={dept} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-[#00C49F]" />
                      <h3 className="text-sm font-bold text-white">{dept}</h3>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="px-2 py-0.5 rounded-full bg-[#133966] text-slate-300 font-mono">{deptTeachers.length} faculty</span>
                      {deptInClass > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                          {deptInClass} in class
                        </span>
                      )}
                    </div>
                    <div className="flex-1 h-px bg-[#133966]" />
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {deptTeachers
                      .sort((a, b) => {
                        // In-class teachers first
                        if (a.status === 'in_class' && b.status !== 'in_class') return -1;
                        if (b.status === 'in_class' && a.status !== 'in_class') return 1;
                        return a.name.localeCompare(b.name);
                      })
                      .map(t => <TeacherCard key={t._id} teacher={t} />)}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {filtered
                .sort((a, b) => {
                  if (a.status === 'in_class' && b.status !== 'in_class') return -1;
                  if (b.status === 'in_class' && a.status !== 'in_class') return 1;
                  return a.name.localeCompare(b.name);
                })
                .map(t => <TeacherCard key={t._id} teacher={t} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
