import React, { useState, useEffect } from 'react';
import {
  Video, Play, Users, Clock, Calendar, CheckCircle2, AlertCircle, RefreshCw,
  Award, ShieldCheck, ArrowRight, BookOpen, Layers, Sparkles
} from 'lucide-react';
import { api } from '../services/api';

export default function OnlineClassesManager({ user, onJoinClass }) {
  const isTeacher = user.role === 'teacher' || user.role === 'admin';
  const isStudent = user.role === 'student';

  // Teacher Creation Form state
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedDivision, setSelectedDivision] = useState(user.division || 'C');
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [classTitle, setClassTitle] = useState('');
  const [startingClass, setStartingClass] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Active / History sessions
  const [activeSession, setActiveSession] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInitialData();
    // Poll active session every 10s
    const timer = setInterval(checkActiveSession, 10000);
    return () => clearInterval(timer);
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    await Promise.all([
      checkActiveSession(),
      loadHistory(),
      isTeacher ? loadTeacherCourses() : Promise.resolve()
    ]);
    setLoading(false);
  };

  const loadTeacherCourses = async () => {
    try {
      const res = await api.getTeacherCourses();
      if (res.courses && res.courses.length > 0) {
        setCourses(res.courses);
        setSelectedCourseId(res.courses[0]._id);
      }
    } catch (err) {
      console.warn('Error loading teacher courses:', err);
    }
  };

  const checkActiveSession = async () => {
    try {
      const div = user.division || user.section || 'C';
      const res = await api.getActiveOnlineClass({ division: div });
      if (res.success) {
        setActiveSession(res.session);
      }
    } catch (err) {
      console.warn('Error checking active online class:', err);
    }
  };

  const loadHistory = async () => {
    try {
      const res = await api.getOnlineClassHistory({ division: user.division });
      if (res.success) {
        setHistory(res.sessions || []);
      }
    } catch (err) {
      console.warn('Error loading history:', err);
    }
  };

  // Teacher launches class
  const handleStartClass = async (e) => {
    e.preventDefault();
    if (!selectedCourseId) {
      setErrorMsg('Please select a course.');
      return;
    }

    setStartingClass(true);
    setErrorMsg('');

    try {
      const res = await api.startOnlineClass({
        courseId: selectedCourseId,
        division: selectedDivision,
        durationMinutes: Number(durationMinutes) || 45,
        title: classTitle.trim() || undefined
      });

      if (res.success && res.session) {
        setActiveSession(res.session);
        if (onJoinClass) {
          onJoinClass(res.session);
        }
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to start online class.');
    } finally {
      setStartingClass(false);
    }
  };

  // Student joins active class
  const handleJoinActive = async () => {
    if (!activeSession) return;
    try {
      const res = await api.joinOnlineClass(activeSession._id);
      if (res.success && onJoinClass) {
        onJoinClass(activeSession);
      }
    } catch (err) {
      alert(err.message || 'Error joining class.');
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      
      {/* ── HEADER BANNER ────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-[#071b34] via-[#0b2444] to-[#071b34] border border-[#133966] rounded-3xl p-5 sm:p-7 shadow-xl backdrop-blur-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#00a896]/10 rounded-full blur-3xl -z-10" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#00a896] to-[#00C49F] p-0.5 shadow-lg flex items-center justify-center shrink-0">
              <div className="w-full h-full bg-[#040d1a] rounded-[14px] flex items-center justify-center text-[#00C49F]">
                <Video className="w-6 h-6" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#00a896]/20 text-[#00C49F] border border-[#00a896]/40 uppercase tracking-wider font-mono">
                  WebRTC Live Classroom
                </span>
                <span className="text-[10px] font-mono text-cyan-200">
                  Strict 80% Attendance Rule
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white mt-1">
                {isTeacher ? 'Online Class Broadcast Studio' : 'Virtual Classroom & Live Lectures'}
              </h1>
              <p className="text-xs text-slate-300 mt-0.5">
                Take live division classes with integrated screen-sharing, instant chat, hand raising, and automated 80% attendance.
              </p>
            </div>
          </div>

          <button
            onClick={loadInitialData}
            className="self-start sm:self-center px-3 py-1.5 rounded-xl bg-[#040d1a] hover:bg-[#0b2444] text-cyan-300 border border-[#133966] text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ── ACTIVE LIVE CLASS ALERT (If session is running) ──────────────────── */}
      {activeSession && (activeSession.status === 'active' || activeSession.status === 'live') && (
        <div className="bg-gradient-to-r from-emerald-950/40 via-[#071b34] to-cyan-950/40 border-2 border-[#00C49F] rounded-3xl p-5 sm:p-6 shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-xs font-black uppercase text-[#00C49F] tracking-wider">
                  Live Session In Progress Now
                </span>
                <span className="px-2 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold">
                  Division {activeSession.division}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-white">
                {activeSession.courseCode}: {activeSession.courseTitle}
              </h2>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300 font-mono">
                <span>Lecturer: <strong className="text-white">{activeSession.teacherName}</strong></span>
                <span>•</span>
                <span>Enrolled attendees: <strong className="text-[#00C49F]">{activeSession.participants?.length || 0}</strong></span>
                <span>•</span>
                <span className="text-amber-300 font-bold">80% duration required for Present</span>
              </div>
            </div>

            <button
              onClick={handleJoinActive}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-[#00a896] via-[#00C49F] to-emerald-400 hover:brightness-110 text-[#040d1a] font-black text-xs uppercase tracking-wider shadow-xl shadow-teal-500/25 flex items-center justify-center gap-2 shrink-0 transition-transform active:scale-95"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{isTeacher ? 'Return to Live Broadcast' : 'Join Online Class Now'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── TEACHER: START NEW ONLINE CLASS FORM ─────────────────────────────── */}
      {isTeacher && (
        <div className="bg-[#071b34]/95 border border-[#133966] rounded-3xl p-5 sm:p-7 shadow-xl">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#133966]">
            <Sparkles className="w-5 h-5 text-[#00C49F]" />
            <h2 className="text-sm sm:text-base font-bold text-white">
              Launch Division Online Class
            </h2>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleStartClass} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              
              {/* Select Course */}
              <div className="sm:col-span-2">
                <label className="text-slate-300 font-bold block mb-1">
                  Subject / Course *
                </label>
                <select
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-[#00C49F]"
                >
                  {courses.map(c => (
                    <option key={c._id} value={c._id}>
                      {c.code} - {c.title} (Div {c.section || 'A'})
                    </option>
                  ))}
                  {courses.length === 0 && (
                    <option value="">No assigned courses found. Select or create in Courses tab.</option>
                  )}
                </select>
              </div>

              {/* Select Division */}
              <div>
                <label className="text-slate-300 font-bold block mb-1">
                  Target Division *
                </label>
                <select
                  value={selectedDivision}
                  onChange={(e) => setSelectedDivision(e.target.value.toUpperCase())}
                  className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2.5 text-white text-xs font-mono font-bold focus:outline-none focus:border-[#00C49F]"
                >
                  {['A', 'B', 'C', 'D', 'E'].map(d => (
                    <option key={d} value={d}>Division {d}</option>
                  ))}
                </select>
              </div>

            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              
              {/* Lecture Topic */}
              <div className="sm:col-span-2">
                <label className="text-slate-300 font-bold block mb-1">
                  Lecture Title / Topic (Optional)
                </label>
                <input
                  type="text"
                  value={classTitle}
                  onChange={(e) => setClassTitle(e.target.value)}
                  placeholder="e.g. Chapter 4: Context-Free Grammars & Pushdown Automata"
                  className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2.5 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-[#00C49F]"
                />
              </div>

              {/* Planned Duration */}
              <div>
                <label className="text-slate-300 font-bold block mb-1">
                  Planned Duration
                </label>
                <select
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2.5 text-white text-xs font-mono focus:outline-none focus:border-[#00C49F]"
                >
                  <option value={30}>30 Minutes</option>
                  <option value={45}>45 Minutes (Standard)</option>
                  <option value={60}>60 Minutes (1 Hour)</option>
                  <option value={90}>90 Minutes (Lab/Block)</option>
                </select>
              </div>

            </div>

            {/* Attendance Rule Notice Card */}
            <div className="p-3 rounded-2xl bg-[#040d1a] border border-[#133966] flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-[#00C49F] shrink-0 mt-0.5" />
              <div className="text-xs text-slate-300 leading-relaxed">
                <strong className="text-white block font-bold">Automated 80% Attendance Criteria</strong>
                When you click "End Class & Mark Attendance", the system computes each student's total connected duration. Students attaining at least 80% of total class duration are automatically saved as <strong className="text-emerald-400">Present</strong> in the official attendance records.
              </div>
            </div>

            <button
              type="submit"
              disabled={startingClass || !selectedCourseId}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#00a896] via-[#028090] to-[#00C49F] hover:brightness-110 text-[#040d1a] font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-teal-500/20 transition-all disabled:opacity-50"
            >
              {startingClass ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Initializing Classroom...</span>
                </>
              ) : (
                <>
                  <Video className="w-4 h-4" />
                  <span>Start WebRTC Online Class for Division {selectedDivision}</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* ── STUDENT: NO ACTIVE CLASS PLACEHOLDER ────────────────────────────── */}
      {isStudent && (!activeSession || (activeSession.status !== 'active' && activeSession.status !== 'live')) && (
        <div className="bg-[#071b34]/95 border border-[#133966] rounded-3xl p-8 text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-[#0b2444] border border-[#133966] p-3 mx-auto flex items-center justify-center text-slate-400">
            <Video className="w-8 h-8 text-[#00C49F]" />
          </div>
          <h2 className="text-base font-bold text-white">
            No Active Online Class Right Now
          </h2>
          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            There is currently no live lecture running for <strong>Division {user.division || user.section || 'C'}</strong>. When your lecturer launches an online class, it will appear here automatically with a 1-click join button.
          </p>
          <div className="pt-2">
            <span className="text-[11px] font-mono text-cyan-300 bg-[#00a896]/15 px-3 py-1 rounded-full border border-[#00a896]/30">
              Attendance policy: 80% presence during lecture = Present
            </span>
          </div>
        </div>
      )}

      {/* ── PAST ONLINE CLASSES & ATTENDANCE HISTORY ──────────────────────────── */}
      <div className="bg-[#071b34]/95 border border-[#133966] rounded-3xl p-5 sm:p-7 shadow-xl">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#133966]">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm sm:text-base font-bold text-white">
              Online Class History & Attendance Logs
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {history.length} Session{history.length === 1 ? '' : 's'}
          </span>
        </div>

        {history.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            No past online classes recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[#133966]">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#040d1a] text-cyan-300 font-bold uppercase tracking-wider text-[10px] border-b border-[#133966]">
                <tr>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Subject</th>
                  <th className="py-3 px-4">Lecturer</th>
                  <th className="py-3 px-4 text-center">Division</th>
                  <th className="py-3 px-4 text-center">Duration</th>
                  <th className="py-3 px-4 text-center">Attendance Result</th>
                  <th className="py-3 px-4 text-center">80% Rule</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#133966]/60 font-medium">
                {history.map(h => {
                  const durationMins = Math.round((h.totalDurationSeconds || 0) / 60);
                  const att = h.attendanceSessionId;
                  return (
                    <tr key={h._id} className="hover:bg-[#0b2444]/40 transition-colors">
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-300">
                        {new Date(h.startedAt).toLocaleDateString()} {new Date(h.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-white">{h.courseCode}</div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[200px]">{h.courseTitle}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-200">
                        {h.teacherName}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-cyan-300">
                        Div {h.division}
                      </td>
                      <td className="py-3 px-4 text-center font-mono">
                        {durationMins || h.durationMinutes} mins
                      </td>
                      <td className="py-3 px-4 text-center">
                        {att ? (
                          <span className={`px-2 py-0.5 rounded-full font-mono font-bold text-[10px] border ${
                            att.attendancePercentage >= 75
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          }`}>
                            {att.attendancePercentage}% ({att.totalPresent}P / {att.totalAbsent}A)
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[10px]">In Progress</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#00C49F]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Enforced</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
