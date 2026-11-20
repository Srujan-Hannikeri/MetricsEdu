import React, { useState, useEffect } from 'react';
import {
  Video, Radio, Play, CheckCircle2, XCircle, Clock, Users,
  BookOpen, Calendar, AlertTriangle, ShieldCheck, ChevronRight,
  Sparkles, RefreshCw
} from 'lucide-react';
import { api } from '../services/api';
import OnlineClassRoom from './OnlineClassRoom';

export default function OnlineClassesTab({ user }) {
  const isTeacher = user?.role === 'teacher';

  // State
  const [activeClassroom, setActiveClassroom] = useState(null); // When inside live room, holds classId
  const [liveClasses, setLiveClasses] = useState([]);
  const [pastClasses, setPastClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Teacher Start Form State
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedDivision, setSelectedDivision] = useState(user?.division || 'A');
  const [classTitle, setClassTitle] = useState('');
  const [startingClass, setStartingClass] = useState(false);

  useEffect(() => {
    loadData();
    if (isTeacher) {
      loadTeacherCourses();
    }
  }, []);

  const loadData = async () => {
    try {
      setError('');
      const [activeRes, historyRes] = await Promise.all([
        api.getActiveOnlineClass(),
        api.getOnlineClassHistory()
      ]);
      setLiveClasses(activeRes.classes || []);
      setPastClasses(historyRes.classes || []);
    } catch (err) {
      console.error('Failed to load online classes:', err);
      setError(err.message || 'Unable to load live online classes.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadTeacherCourses = async () => {
    try {
      const res = await api.getTeacherCourses();
      const courseList = res.courses || [];
      setCourses(courseList);
      if (courseList.length > 0 && !selectedCourseId) {
        setSelectedCourseId(courseList[0]._id);
      }
    } catch (err) {
      console.warn('Failed to load teacher courses:', err);
    }
  };

  const handleStartClass = async (e) => {
    e.preventDefault();
    if (!selectedCourseId) {
      alert('Please select a course to start an online class.');
      return;
    }
    if (!selectedDivision) {
      alert('Please select the division for this online class.');
      return;
    }

    try {
      setStartingClass(true);
      const res = await api.startOnlineClass({
        courseId: selectedCourseId,
        division: selectedDivision,
        title: classTitle
      });

      if (res.onlineClass) {
        setActiveClassroom(res.onlineClass._id);
      }
    } catch (err) {
      alert('Failed to start online class: ' + err.message);
    } finally {
      setStartingClass(false);
    }
  };

  // If currently in a live online classroom, render the room component full stage
  if (activeClassroom) {
    return (
      <OnlineClassRoom
        classId={activeClassroom}
        user={user}
        onLeave={() => {
          setActiveClassroom(null);
          loadData();
        }}
        onClassEnded={() => {
          setActiveClassroom(null);
          loadData();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-br from-[#071b34] to-[#040d1a] border border-[#133966] shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 px-2.5 rounded-lg bg-[#00a896]/15 text-[#00C49F] font-mono text-xs font-bold border border-[#00a896]/30 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
              LIVE ONLINE CLASSROOM
            </span>
            <span className="text-xs text-slate-400 font-mono">
              {isTeacher ? 'Host Mode · Division Targeting' : `Division ${user?.division || 'A'}`}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white mt-2 tracking-tight">
            Online Lectures & 80% Automated Attendance
          </h2>
          <p className="text-xs sm:text-sm text-cyan-200/70 mt-1">
            Conduct live classes with video, chat, screen share, and raise-hand tools.
            Attendance is automatically recorded for students attending at least 80% of the session.
          </p>
        </div>

        <button
          onClick={() => { setRefreshing(true); loadData(); }}
          disabled={refreshing}
          className="self-start sm:self-auto px-4 py-2.5 rounded-2xl bg-[#0b2444] hover:bg-[#133966] border border-[#133966] text-xs font-bold text-slate-200 flex items-center gap-2 transition-all shadow-md"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh Status
        </button>
      </div>

      {/* ── Active Live Classes Section (Ongoing Right Now) ───────────────────── */}
      {liveClasses.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-400">
            <Radio className="w-4 h-4 animate-ping" />
            Live Now ({liveClasses.length})
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {liveClasses.map((cls) => (
              <div
                key={cls._id}
                className="p-5 rounded-3xl bg-[#071b34]/95 border-2 border-rose-500/40 shadow-xl shadow-rose-950/20 relative overflow-hidden flex flex-col justify-between gap-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                        <Radio className="w-3 h-3 text-rose-400" /> Live Class
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-[#00a896]/20 text-[#00C49F] border border-[#00a896]/40 text-[11px] font-mono font-bold">
                        Division {cls.division}
                      </span>
                    </div>
                    <h3 className="text-base font-extrabold text-white">{cls.title}</h3>
                    <p className="text-xs text-slate-300 font-mono mt-0.5">
                      {cls.courseCode} · {cls.courseTitle}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#133966] text-xs">
                  <div className="text-slate-400 flex items-center gap-1.5 font-mono text-[11px]">
                    <Clock className="w-3.5 h-3.5 text-[#00C49F]" />
                    Started: {new Date(cls.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>

                  <button
                    onClick={() => setActiveClassroom(cls._id)}
                    className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] font-black text-xs flex items-center gap-2 shadow-lg shadow-teal-500/20 hover:scale-105 transition-all"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    {isTeacher ? 'Enter / Resume Room' : 'Join Live Class'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Teacher Form: Start New Live Online Class for a Division ─────────── */}
      {isTeacher && (
        <div className="p-6 rounded-3xl bg-[#071b34]/95 border border-[#133966] shadow-xl space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[#133966]">
            <Video className="w-5 h-5 text-[#00C49F]" />
            <h3 className="text-base font-bold text-white">Start New Live Class</h3>
          </div>

          <form onSubmit={handleStartClass} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              
              {/* Select Course */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Assigned Course / Subject *
                </label>
                <select
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#040d1a] border border-[#133966] text-white text-xs focus:outline-none focus:border-[#00C49F]"
                >
                  {courses.map(c => (
                    <option key={c._id} value={c._id}>
                      {c.code} — {c.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Select Division */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Target Division *
                </label>
                <select
                  value={selectedDivision}
                  onChange={(e) => setSelectedDivision(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#040d1a] border border-[#133966] text-[#00C49F] font-bold text-xs focus:outline-none focus:border-[#00C49F]"
                >
                  {['A', 'B', 'C', 'D', 'E', 'F'].map(div => (
                    <option key={div} value={div}>
                      Division {div}
                    </option>
                  ))}
                </select>
              </div>

              {/* Class Topic */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Topic / Lecture Title (Optional)
                </label>
                <input
                  type="text"
                  value={classTitle}
                  onChange={(e) => setClassTitle(e.target.value)}
                  placeholder="e.g. Chapter 4 - Neural Networks"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#040d1a] border border-[#133966] text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-[#00C49F]"
                />
              </div>

            </div>

            {/* Explainer Box */}
            <div className="p-3 rounded-2xl bg-[#040d1a] border border-[#133966] text-xs text-slate-300 flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[#00C49F] shrink-0" />
              <span>
                <strong>80% Attendance Automation:</strong> The system automatically records presence for any student in Division {selectedDivision} who stays for 80% or more of the class duration when you click "End Class".
              </span>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={startingClass || courses.length === 0}
                className="px-6 py-3 rounded-2xl bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] font-black text-xs flex items-center gap-2 shadow-lg shadow-teal-500/20 hover:scale-105 transition-all disabled:opacity-50"
              >
                {startingClass ? (
                  <>
                    <div className="w-4 h-4 border-2 border-[#040d1a] border-t-transparent rounded-full animate-spin" />
                    Launching Live Class...
                  </>
                ) : (
                  <>
                    <Video className="w-4 h-4" />
                    Start Live Online Class Now
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Student Information Box (if no active class right now) ─────────────── */}
      {!isTeacher && liveClasses.length === 0 && (
        <div className="p-8 rounded-3xl bg-[#071b34]/70 border border-[#133966] text-center max-w-lg mx-auto space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#040d1a] border border-[#133966] text-slate-400 flex items-center justify-center mx-auto">
            <Radio className="w-6 h-6 text-slate-500" />
          </div>
          <h3 className="text-base font-bold text-white">No Live Online Class Right Now</h3>
          <p className="text-xs text-slate-400">
            When your subject teacher starts an online lecture for Division {user?.division || 'A'},
            a live join button will appear right here with instant live connection.
          </p>
          <div className="p-3 rounded-xl bg-[#040d1a] border border-[#133966] text-[11px] text-cyan-200/80 font-mono">
            ⚠️ Reminder: You must attend at least 80% of the class to get automatic attendance credit!
          </div>
        </div>
      )}

      {/* ── Past Online Classes History Table ─────────────────────────────────── */}
      <div className="p-6 rounded-3xl bg-[#071b34]/95 border border-[#133966] shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#133966]">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#00C49F]" />
            <h3 className="text-base font-bold text-white">Online Sessions History</h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">{pastClasses.length} sessions recorded</span>
        </div>

        {pastClasses.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500">
            No completed online class sessions found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#040d1a] text-slate-400 font-mono text-[11px] uppercase border-b border-[#133966]">
                <tr>
                  <th className="p-3">Date & Time</th>
                  <th className="p-3">Course / Topic</th>
                  <th className="p-3">Division</th>
                  <th className="p-3">Duration</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Attendance Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#133966]">
                {pastClasses.map((cls) => {
                  // For student: find my participant record
                  let studentRecord = null;
                  if (!isTeacher && cls.participants) {
                    studentRecord = cls.participants.find(
                      p => p.student?.toString() === user._id.toString() || p.usn === user.usn
                    );
                  }

                  return (
                    <tr key={cls._id} className="hover:bg-[#0b2444]/40 transition-colors">
                      <td className="p-3 text-slate-300 font-mono whitespace-nowrap">
                        {new Date(cls.startedAt).toLocaleDateString('en-IN', {
                          day: '2-digit', month: 'short', year: 'numeric'
                        })}
                        <span className="block text-[10px] text-slate-500">
                          {new Date(cls.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>

                      <td className="p-3">
                        <div className="font-bold text-white">{cls.title}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{cls.courseCode} · {cls.courseTitle}</div>
                      </td>

                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-md bg-[#00a896]/15 text-[#00C49F] font-mono font-bold border border-[#00a896]/30">
                          Div {cls.division}
                        </span>
                      </td>

                      <td className="p-3 font-mono text-slate-300">
                        {cls.durationMinutes > 0 ? `${cls.durationMinutes} mins` : `${cls.durationSeconds || 0}s`}
                      </td>

                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          cls.status === 'live'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : 'bg-slate-700/40 text-slate-300 border border-slate-600/40'
                        }`}>
                          {cls.status}
                        </span>
                      </td>

                      <td className="p-3 text-right">
                        {isTeacher ? (
                          <div className="font-mono text-xs">
                            <span className="text-[#00C49F] font-bold">
                              {cls.attendanceProcessed ? 'Recorded (80% Rule)' : 'In Progress'}
                            </span>
                            <span className="block text-[10px] text-slate-400">
                              {cls.participants?.length || 0} attendees
                            </span>
                          </div>
                        ) : studentRecord ? (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold border ${
                            studentRecord.attendedEightyPercent
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          }`}>
                            {studentRecord.attendedEightyPercent ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5" />
                            )}
                            {studentRecord.attendedEightyPercent ? 'Present (≥80%)' : 'Absent (<80%)'}
                          </span>
                        ) : (
                          <span className="text-slate-500 font-mono text-[11px]">Not Joined</span>
                        )}
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
