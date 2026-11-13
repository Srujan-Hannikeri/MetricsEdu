import React, { useState, useEffect, useRef } from 'react';
import {
  Camera, Upload, CheckCircle2, XCircle, AlertCircle, Users,
  Sparkles, Download, RefreshCw, Eye, BookOpen, Clock, FileSpreadsheet,
  FileText, Calendar, Lock, Unlock, UserCheck, ShieldCheck, Info, ChevronRight, Megaphone,
  Award, TrendingUp
} from 'lucide-react';
import { api } from '../services/api';
import { downloadAttendance } from '../utils/exportUtils';
import TimetableTable from './TimetableTable';
import AcademicHub from './AcademicHub';
import TeacherMarksEntry from './TeacherMarksEntry';
import MarksOverviewPage from './MarksOverviewPage';

const TIME_SLOTS = [
  '08:30 AM - 09:25 AM', '09:25 AM - 10:20 AM', '10:50 AM - 11:45 AM',
  '11:45 AM - 12:40 PM', '01:30 PM - 03:30 PM'
];

export default function TeacherDashboard({ user }) {
  const [activeTab, setActiveTab] = useState('my-classes');

  // ── My Assigned Classes (from timetable) ───────────────────────────────────
  const [assignedSlots, setAssignedSlots] = useState([]);       // ALL timetable slots for this teacher
  const [departmentSlots, setDepartmentSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [activeSlot, setActiveSlot] = useState(null);           // live slot right now
  const [todaySlots, setTodaySlots] = useState([]);             // today's schedule
  const [selectedSlot, setSelectedSlot] = useState(null);       // slot teacher picks to take attendance

  // ── Attendance state ───────────────────────────────────────────────────────
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [classroomName, setClassroomName] = useState('');
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().slice(0, 10));
  const [timeSlot, setTimeSlot] = useState(TIME_SLOTS[0]);
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  // Attendance window
  const [windowStatus, setWindowStatus] = useState({ allowed: false, reason: 'Loading...', todaySlots: [] });

  // Teacher selfie
  const [teacherSelfiePreview, setTeacherSelfiePreview] = useState(user?.profileImage || '/logo.jpg');
  const [teacherSelfieFile, setTeacherSelfieFile] = useState(null);

  // Timetable tab
  const [timetableScope, setTimetableScope] = useState('assigned');
  const [timetableCohort, setTimetableCohort] = useState('ALL');
  const [selectedTimetableDiv, setSelectedTimetableDiv] = useState('A');
  const [loadingTimetable, setLoadingTimetable] = useState(false);

  // Classroom photo
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isSamplePhoto, setIsSamplePhoto] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [detectionResults, setDetectionResults] = useState(null);
  const [studentStatusMap, setStudentStatusMap] = useState({});
  const [overriddenMap, setOverriddenMap] = useState({});

  // Sessions
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [successBanner, setSuccessBanner] = useState('');
  const [lastSavedSession, setLastSavedSession] = useState(null);
  const [previewPhotoModal, setPreviewPhotoModal] = useState(null);

  const fileInputRef = useRef(null);
  const teacherFileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  // ─────────────────────────────────────────────────────────────────────────
  // Load on mount
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadAssignedSlots();
    loadCourses();
    loadPastSessions();
  }, []);

  // ── Load all timetable slots assigned to this teacher ───────────────────
  const loadAssignedSlots = async () => {
    setLoadingSlots(true);
    setLoadingTimetable(true);
    try {
      const data = await api.getTeacherTimetable(user._id);
      const slots = data.slots || [];
      setAssignedSlots(slots);
      setDepartmentSlots(data.departmentSlots || slots);
      const cohortSlots = data.departmentSlots?.length ? data.departmentSlots : slots;
      const firstSlot = cohortSlots[0];
      if (firstSlot) {
        const cohort = user?.institutionType === 'pu_college'
          ? firstSlot.pucYear
          : user?.institutionType === 'school'
            ? firstSlot.standard
            : String(firstSlot.semester || firstSlot.course?.semester || '');
        if (cohort) setTimetableCohort(cohort);
      }

      // Determine today's slots
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const todayName = dayNames[new Date().getDay()];
      const todays = slots.filter(s => s.day === todayName);
      setTodaySlots(todays);

      // Find the currently active slot (within time window)
      const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
      const live = todays.find(s => {
        const start = s.startMinutes || parseTimeStr(s.timeSlot?.split(/[-–]/)[0]);
        const end = s.endMinutes || parseTimeStr(s.timeSlot?.split(/[-–]/)[1] || '');
        return nowMin >= start && nowMin <= end + 30;
      });
      setActiveSlot(live || null);
      if (live) {
        setSelectedSlot(live);
        setSelectedCourseId(live.course?._id || '');
        setTimeSlot(live.timeSlot);
        setClassroomName(live.classroom || '');
      }
    } catch (e) {
      console.error('Error loading teacher timetable:', e);
    } finally {
      setLoadingSlots(false);
      setLoadingTimetable(false);
    }
  };

  function parseTimeStr(t) {
    if (!t) return 0;
    let s = t.trim().toLowerCase();
    const pm = s.includes('pm'); const am = s.includes('am');
    s = s.replace(/[ap]m/g, '').trim();
    let [h, m] = s.split(':').map(Number);
    if (pm && h < 12) h += 12;
    if (am && h === 12) h = 0;
    if (!pm && !am && h >= 1 && h <= 6) h += 12;
    return (h || 0) * 60 + (m || 0);
  }

  const loadCourses = async () => {
    try {
      const data = await api.getTeacherCourses();
      setCourses(data.courses || []);
      if (!selectedCourseId && data.courses?.length > 0) {
        setSelectedCourseId(data.courses[0]._id);
      }
    } catch (e) { console.error(e); }
  };

  const loadPastSessions = async () => {
    setLoadingSessions(true);
    try {
      const data = await api.getTeacherSessions();
      setSessions(data.sessions || []);
    } catch (e) { console.error(e); }
    finally { setLoadingSessions(false); }
  };

  // ── Check attendance window whenever course changes ──────────────────────
  useEffect(() => {
    if (!selectedCourseId) return;
    api.checkAttendanceWindow(selectedCourseId)
      .then(d => setWindowStatus({ allowed: d.allowed, reason: d.reason, todaySlots: d.todaySlots || [] }))
      .catch(() => setWindowStatus({ allowed: false, reason: 'Could not verify window.', todaySlots: [] }));
  }, [selectedCourseId]);

  useEffect(() => {
    if (!selectedCourseId) return;
    const selectedDivision = selectedSlot?.course?._id === selectedCourseId
      ? selectedSlot.division
      : '';
    loadStudents(selectedCourseId, selectedDivision);
  }, [selectedCourseId, selectedSlot]);

  const loadStudents = async (cId, division) => {
    setLoadingStudents(true);
    try {
      const data = await api.getCourseStudents(cId, division);
      setStudents(data.students || []);
      const map = {};
      (data.students || []).forEach(s => { map[s._id] = 'Absent'; });
      setStudentStatusMap(map);
      setOverriddenMap({});
      setDetectionResults(null);
      setImagePreview(null);
      setImageFile(null);
      setIsSamplePhoto(false);
    } catch (e) { console.error(e); }
    finally { setLoadingStudents(false); }
  };

  // When a slot is picked from "My Classes" panel
  const handleSelectSlot = (slot) => {
    setSelectedSlot(slot);
    setSelectedCourseId(slot.course?._id || '');
    setTimeSlot(slot.timeSlot || TIME_SLOTS[0]);
    setClassroomName(slot.classroom || '');
    setActiveTab('take-attendance');
  };

  // Photo handlers
  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file); setIsSamplePhoto(false);
    const reader = new FileReader();
    reader.onload = ev => { setImagePreview(ev.target.result); setDetectionResults(null); };
    reader.readAsDataURL(file);
  };

  const handleUseSampleClassroom = (path = '/classroom_60_divA.jpg') => {
    setImageFile(null); setIsSamplePhoto(true);
    setImagePreview(path); setDetectionResults(null);
  };

  const handleAnalyzePhoto = async () => {
    if (!imagePreview) return;
    setIsAnalyzing(true); setSuccessBanner('');
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = imagePreview;
      await new Promise(r => { img.onload = r; });
      const { detectClassroomFaces, drawClassroomCanvas } = await import('../utils/faceUtils');
      const result = await detectClassroomFaces(img, students);
      const updated = {};
      students.forEach(s => { updated[s._id] = 'Absent'; });
      if (result.detections?.length > 0) {
        result.detections.forEach(d => { if (d.isMatch && d.student) updated[d.student._id] = 'Present'; });
      }
      setStudentStatusMap(updated);
      setDetectionResults(result);
      setTimeout(() => { if (canvasRef.current) drawClassroomCanvas(canvasRef.current, img, result.detections); }, 100);
    } catch (e) { alert('Face recognition error: ' + e.message); }
    finally { setIsAnalyzing(false); }
  };

  const handleToggleStatus = (studentId, newStatus) => {
    setStudentStatusMap(p => ({ ...p, [studentId]: newStatus }));
    setOverriddenMap(p => ({ ...p, [studentId]: true }));
  };

  const handleSaveAttendance = async () => {
    if (!selectedCourseId) { alert('Please select a course.'); return; }
    setSavingAttendance(true); setSuccessBanner('');
    try {
      const formData = new FormData();
      formData.append('courseId', selectedCourseId);
      formData.append('classroom', classroomName);
      formData.append('timeSlot', timeSlot);
      formData.append('sessionDate', sessionDate);
      if (teacherSelfieFile) {
        const teacherPhotoUrl = await api.uploadBlob(teacherSelfieFile, 'classroom');
        if (teacherPhotoUrl) formData.append('teacherPhotoUrl', teacherPhotoUrl);
        else formData.append('teacherPhoto', teacherSelfieFile);
      }
      else if (teacherSelfiePreview) formData.append('teacherPhoto', teacherSelfiePreview);
      if (imageFile) {
        const classroomPhotoUrl = await api.uploadBlob(imageFile, 'classroom');
        if (classroomPhotoUrl) formData.append('classroomPhotoUrl', classroomPhotoUrl);
        else formData.append('classroomPhoto', imageFile);
      }
      else if (isSamplePhoto && imagePreview) formData.append('samplePhotoUrl', imagePreview);
      if (detectionResults?.detections) formData.append('detections', JSON.stringify(detectionResults.detections));
      formData.append('manualOverrides', JSON.stringify(studentStatusMap));
      const res = await api.submitClassroomAttendance(formData);
      setLastSavedSession(res.session);
      setSuccessBanner(`Attendance saved! ${res.session.totalPresent}/${res.session.totalEnrolled} present.`);
      loadPastSessions();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { alert('Failed to save: ' + e.message); }
    finally { setSavingAttendance(false); }
  };

  const selectedCourse = courses.find(c => c._id === selectedCourseId);
  const presentCount = Object.values(studentStatusMap).filter(s => s === 'Present').length;
  const attendanceRate = students.length > 0 ? Math.round((presentCount / students.length) * 100) : 0;

  // Determine if attendance submission is allowed
  const isWindowOpen = windowStatus.allowed;

  // Group assigned slots by day for the "My Classes" view
  const slotsByDay = assignedSlots.reduce((acc, slot) => {
    if (!acc[slot.day]) acc[slot.day] = [];
    acc[slot.day].push(slot);
    return acc;
  }, {});
  const orderedDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const timetableSourceSlots = timetableScope === 'department' ? departmentSlots : assignedSlots;
  const getTimetableCohort = slot => user?.institutionType === 'pu_college'
    ? slot.pucYear || slot.course?.pucYear || ''
    : user?.institutionType === 'school'
      ? slot.standard || slot.course?.standard || ''
      : String(slot.semester || slot.course?.semester || '');
  const timetableCohorts = [...new Set(timetableSourceSlots.map(getTimetableCohort).filter(Boolean))]
    .sort((a, b) => /^\d+$/.test(a) && /^\d+$/.test(b) ? Number(a) - Number(b) : a.localeCompare(b));
  const activeTimetableCohort = timetableCohorts.includes(timetableCohort)
    ? timetableCohort
    : timetableCohorts[0] || '';
  const timetableDivisions = [...new Set(timetableSourceSlots.map(slot => (slot.division || 'A').toUpperCase()))]
    .sort();
  const activeTimetableDivision = timetableDivisions.includes(selectedTimetableDiv)
    ? selectedTimetableDiv
    : timetableDivisions[0] || 'A';
  const timetableSlots = timetableSourceSlots.filter(slot =>
    (slot.division || 'A').toUpperCase() === activeTimetableDivision &&
    (!activeTimetableCohort || getTimetableCohort(slot) === activeTimetableCohort)
  );

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-4 sm:space-y-6">

      {/* Header */}
      <div>
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 px-2.5 rounded-lg bg-[#00a896]/15 text-[#00C49F] font-mono text-xs font-bold border border-[#00a896]/30">FACULTY PORTAL</span>
            <span className="text-xs text-slate-400 font-mono">ID: {user?.teacherId}</span>
          </div>
          <h1 className="text-xl sm:text-3xl font-extrabold text-white mt-1.5 tracking-tight">Welcome, {user?.name}</h1>
          <p className="text-xs sm:text-sm text-cyan-200/70 font-medium">Smart Classroom Attendance · Timetable · Session Reports</p>
        </div>
        <div className="mt-4 w-full overflow-x-auto no-scrollbar rounded-2xl border border-[#133966] bg-[#071b34] p-1.5 shadow-md touch-scroll">
          <div className="flex w-max min-w-full items-center gap-1">
          {[
            { id: 'my-classes', label: 'My Assigned Classes', icon: BookOpen },
            { id: 'take-attendance', label: 'Take Attendance', icon: Camera },
            { id: 'marks-entry', label: 'Exam Marks Entry', icon: Award },
            { id: 'marks-overview', label: 'Student Marks & Standings', icon: TrendingUp },
            { id: 'timetable', label: 'Timetable', icon: Calendar },
            { id: 'calendar', label: 'Calendar', icon: Calendar },
            { id: 'announcements', label: 'Announcements', icon: Megaphone },
            { id: 'materials', label: 'Study Materials', icon: BookOpen },
            { id: 'history', label: `Sessions (${sessions.length})`, icon: Clock }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === tab.id
                  ? 'bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] shadow-md'
                  : 'text-slate-400 hover:text-white'}`}>
                <Icon className="w-4 h-4" />{tab.label}
              </button>
            );
          })}
          </div>
        </div>
      </div>

      {/* Success banner */}
      {successBanner && (
        <div className="p-4 rounded-2xl bg-[#00a896]/15 border border-[#00a896]/40 text-[#67e8f9] text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2.5"><CheckCircle2 className="w-5 h-5 text-[#00C49F] shrink-0" /><span className="font-semibold">{successBanner}</span></div>
          <div className="flex items-center gap-2">
            {lastSavedSession && (
              <>
                <button onClick={() => downloadAttendance(lastSavedSession, 'pdf')} className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" /> PDF
                </button>
                <button onClick={() => downloadAttendance(lastSavedSession, 'excel')} className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1">
                  <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                </button>
                <button onClick={() => downloadAttendance(lastSavedSession, 'csv')} className="px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-bold flex items-center gap-1">
                  <Download className="w-3.5 h-3.5" /> CSV
                </button>
              </>
            )}
            <button onClick={() => setSuccessBanner('')} className="text-xs text-[#00C49F] hover:underline font-mono ml-2">Dismiss</button>
          </div>
        </div>
      )}

      {/* ====================================================================
          TAB: MY ASSIGNED CLASSES (from timetable)
      ==================================================================== */}
      {activeTab === 'my-classes' && (
        <div className="space-y-6">
          {/* Today's live class highlight */}
          {activeSlot ? (
            <div className="p-5 rounded-3xl bg-gradient-to-r from-[#00a896]/20 to-[#040d1a] border border-[#00C49F]/50 shadow-xl">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-[#00C49F] animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-[#00C49F]">Live Now — Class in Session</span>
              </div>
              <div className="text-lg font-extrabold text-white">{activeSlot.course?.code} — {activeSlot.course?.title}</div>
              <div className="text-xs text-slate-300 mt-1">{activeSlot.timeSlot} · {activeSlot.classroom} · Division {activeSlot.division}</div>
              <button onClick={() => handleSelectSlot(activeSlot)}
                className="mt-3 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] text-xs font-black flex items-center gap-2 w-fit">
                <Camera className="w-4 h-4" /> Take Attendance for This Class
              </button>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-[#071b34]/95 border border-[#133966] text-xs text-slate-400 flex items-center gap-2">
              <Info className="w-4 h-4 text-slate-500" />
              No live class right now. Your upcoming classes are listed below.
            </div>
          )}

          {/* Weekly schedule */}
          {loadingSlots ? (
            <div className="py-10 text-center text-slate-400 text-xs">Loading your schedule...</div>
          ) : assignedSlots.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm bg-[#071b34]/95 border border-[#133966] rounded-3xl">
              No classes assigned in the timetable yet. Contact admin to schedule your classes.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {orderedDays.filter(d => slotsByDay[d]?.length > 0).map(day => (
                <div key={day} className="bg-[#071b34]/95 border border-[#133966] rounded-2xl overflow-hidden shadow-lg">
                  <div className="bg-[#040d1a] px-4 py-2.5 border-b border-[#133966]">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">{day}</span>
                    <span className="text-[10px] text-slate-400 ml-2">({slotsByDay[day].length} class{slotsByDay[day].length > 1 ? 'es' : ''})</span>
                  </div>
                  <div className="divide-y divide-[#133966]">
                    {slotsByDay[day].sort((a, b) => (a.startMinutes || 0) - (b.startMinutes || 0)).map(slot => {
                      const isLive = activeSlot?._id === slot._id;
                      return (
                        <div key={slot._id} className={`p-3 ${isLive ? 'bg-[#00a896]/10' : 'hover:bg-[#0b2444]/30'} transition-all`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                {isLive && <div className="w-1.5 h-1.5 rounded-full bg-[#00C49F] animate-pulse shrink-0" />}
                                <span className="text-xs font-bold text-white truncate">{slot.course?.code}</span>
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#133966] text-slate-300">Div {slot.division}</span>
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5 truncate">{slot.course?.title}</div>
                              <div className="text-[10px] text-[#00C49F] font-mono mt-0.5">{slot.timeSlot}</div>
                              <div className="text-[10px] text-slate-500 truncate">{slot.classroom}</div>
                            </div>
                            <button onClick={() => handleSelectSlot(slot)}
                              className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${isLive
                                ? 'bg-[#00C49F] text-[#040d1a] border-[#00C49F]'
                                : 'border-[#133966] text-slate-400 hover:text-[#00C49F] hover:border-[#00C49F]'}`}>
                              {isLive ? 'Take Now' : 'Select'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Subject summary */}
          {assignedSlots.length > 0 && (
            <div className="bg-[#071b34]/95 border border-[#133966] rounded-2xl p-4 shadow-lg">
              <h3 className="text-xs font-bold uppercase text-slate-400 mb-3 tracking-wider">My Subjects This Semester</h3>
              <div className="flex flex-wrap gap-2">
                {[...new Map(assignedSlots.map(s => [s.course?._id, s.course])).values()].filter(Boolean).map(course => (
                  <div key={course._id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#040d1a] border border-[#133966]">
                    <span className="text-[10px] font-mono font-bold text-[#00C49F] bg-[#00a896]/20 px-1.5 py-0.5 rounded border border-[#00a896]/30">{course.code}</span>
                    <span className="text-xs text-white">{course.title}</span>
                    <span className="text-[10px] text-slate-400">Sem {course.semester}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <AcademicHub user={user} page="calendar" />
        </div>
      )}

      {/* ====================================================================
          TAB: TAKE ATTENDANCE
      ==================================================================== */}
      {activeTab === 'take-attendance' && (
        <div className="space-y-6">

          {/* Session setup */}
          <div className="bg-[#071b34]/95 border border-[#133966] rounded-3xl p-6 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-4 h-4 text-[#00C49F]" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-200">1. Session Details</h2>
            </div>

            {/* Selected slot info */}
            {selectedSlot && (
              <div className="mb-4 p-3 rounded-xl bg-[#00a896]/10 border border-[#00C49F]/30 text-xs text-[#00C49F] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Taking attendance for: <strong className="text-white">{selectedSlot.course?.code} — {selectedSlot.course?.title}</strong>
                &nbsp;·&nbsp;{selectedSlot.timeSlot}&nbsp;·&nbsp;Division {selectedSlot.division}
                <button onClick={() => setActiveTab('my-classes')} className="ml-auto text-[10px] underline opacity-70 hover:opacity-100">Change class</button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Subject / Course</label>
                <select value={selectedCourseId} onChange={e => setSelectedCourseId(e.target.value)}
                  className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#00a896]">
                  {courses.map(c => (
                    <option key={c._id} value={c._id}>{c.code} — {c.title} (Sem {c.semester})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Time Slot</label>
                <select value={timeSlot} onChange={e => setTimeSlot(e.target.value)}
                  className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#00a896] font-mono">
                  {TIME_SLOTS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Classroom</label>
                <input type="text" value={classroomName} onChange={e => setClassroomName(e.target.value)}
                  placeholder="e.g. AS-11" className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#00a896] font-mono" />
              </div>
              <div className="md:col-span-4">
                <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Class Date</label>
                <input type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)}
                  className="w-full sm:w-64 bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#00a896] font-mono" />
              </div>
            </div>

            {/* Attendance window status */}
            <div className={`mt-4 p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-all ${
              isWindowOpen
                ? 'bg-[#00a896]/10 border-[#00a896]/30'
                : 'bg-amber-500/10 border-amber-500/30'}`}>
              <div className="flex items-center gap-2">
                {isWindowOpen
                  ? <Unlock className="w-4 h-4 text-[#00C49F] shrink-0" />
                  : <Lock className="w-4 h-4 text-amber-400 shrink-0" />}
                <div>
                  <span className={`font-bold mr-2 ${isWindowOpen ? 'text-[#00C49F]' : 'text-amber-300'}`}>
                    {isWindowOpen ? 'Attendance Window Open' : 'Attendance Window Locked'}
                  </span>
                  <span className="text-slate-300 text-[11px] font-mono">
                    {windowStatus.reason}
                  </span>
                </div>
              </div>
            </div>

            {/* Today's schedule quick reference */}
            {todaySlots.length > 0 && (
              <div className="mt-3 p-3 rounded-xl bg-[#040d1a] border border-[#133966]">
                <div className="text-[10px] font-bold uppercase text-slate-400 mb-2 tracking-wider">Today's Schedule</div>
                <div className="flex flex-wrap gap-2">
                  {todaySlots.map(s => {
                    const isActive = activeSlot?._id === s._id;
                    return (
                      <button key={s._id} onClick={() => handleSelectSlot(s)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                          isActive ? 'bg-[#00C49F] text-[#040d1a] border-[#00C49F]' :
                          selectedSlot?._id === s._id ? 'bg-[#00a896]/20 text-[#00C49F] border-[#00a896]/50' :
                          'border-[#133966] text-slate-400 hover:text-[#00C49F] hover:border-[#00C49F]'}`}>
                        {isActive && <div className="w-1.5 h-1.5 rounded-full bg-[#040d1a] animate-pulse" />}
                        {s.course?.code} · Div {s.division} · {s.timeSlot}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Teacher selfie */}
          <div className="bg-[#071b34]/95 border border-[#133966] rounded-3xl p-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-[#00C49F]" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-200">2. Faculty Verification Selfie</h2>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setTeacherSelfiePreview(user?.profileImage || '/logo.jpg'); setTeacherSelfieFile(null); }}
                  className="px-3 py-1.5 rounded-xl bg-[#0b2444] text-cyan-200 text-xs font-semibold border border-[#133966]">
                  Use Profile Photo
                </button>
                <button onClick={() => teacherFileInputRef.current?.click()}
                  className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] text-xs font-bold flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" /> Upload Selfie
                </button>
                <input type="file" ref={teacherFileInputRef} accept=".jpg,.jpeg,.png,.webp" onChange={e => {
                  const f = e.target.files[0];
                  if (f) {
                    setTeacherSelfieFile(f);
                    const r = new FileReader();
                    r.onload = ev => setTeacherSelfiePreview(ev.target.result);
                    r.readAsDataURL(f);
                  }
                }} className="hidden" />
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-[#040d1a] border border-[#133966]">
              <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-[#00C49F] bg-[#071b34] shadow-md shrink-0">
                <img src={teacherSelfiePreview} alt="Faculty" className="w-full h-full object-cover" onError={e => { e.target.src = '/logo.jpg'; }} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-xs">{user?.name}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#00a896]/20 text-[#00C49F] border border-[#00a896]/40">
                    ID: {user?.teacherId}
                  </span>
                </div>
                <div className="text-[11px] text-[#00C49F] mt-1 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Faculty verified · Attendance for: {classroomName || selectedSlot?.classroom || 'Not set'}
                </div>
              </div>
            </div>
          </div>

          {/* Classroom photo */}
          <div className="bg-[#071b34]/95 border border-[#133966] rounded-3xl p-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-[#00C49F]" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-200">3. Classroom Photo (Face Recognition)</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => handleUseSampleClassroom('/classroom_60_divA.jpg')}
                  className="px-3.5 py-2 rounded-xl bg-[#0b2444] text-[#00C49F] text-xs font-bold border border-[#00a896]/40 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Sample (Div A)
                </button>
                <button onClick={() => handleUseSampleClassroom('/classroom_60_divB.jpg')}
                  className="px-3.5 py-2 rounded-xl bg-[#0b2444] text-[#38bdf8] text-xs font-bold border border-cyan-500/40 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Sample (Div B)
                </button>
                <button onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] text-xs font-extrabold shadow-md flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" /> Upload Photo
                </button>
                <input type="file" ref={fileInputRef} onChange={handlePhotoUpload} accept=".jpg,.jpeg,.png,.webp" className="hidden" />
              </div>
            </div>

            {imagePreview ? (
              <div className="space-y-4">
                <div className="relative rounded-2xl overflow-hidden border-2 border-[#133966] bg-[#040d1a] flex items-center justify-center min-h-[300px] max-h-[560px] shadow-2xl">
                  <canvas ref={canvasRef} className={`max-w-full max-h-[560px] object-contain ${detectionResults ? 'block' : 'hidden'}`} />
                  {!detectionResults && (
                    <img ref={imgRef} src={imagePreview} alt="Classroom" className="max-w-full max-h-[560px] object-contain" />
                  )}
                  {isAnalyzing && (
                    <div className="absolute inset-0 bg-[#040d1a]/85 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                      <div className="w-12 h-12 border-4 border-[#00C49F] border-t-transparent rounded-full animate-spin mb-4" />
                      <div className="text-base font-extrabold text-white">Scanning Faces with AI Vision...</div>
                      <div className="text-xs text-[#00C49F] mt-1 font-mono">Detecting · Extracting 128D embeddings · Matching roster</div>
                    </div>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-[#040d1a] border border-[#133966]">
                  <div className="flex items-center gap-4 text-xs">
                    <div><span className="text-slate-400 block text-[10px] uppercase font-bold">Enrolled</span><span className="text-white font-mono font-bold text-sm">{students.length}</span></div>
                    {detectionResults && (
                      <>
                        <div className="h-8 w-px bg-[#133966]" />
                        <div><span className="text-slate-400 block text-[10px] uppercase font-bold">Detected</span><span className="text-[#38bdf8] font-mono font-bold text-sm">{detectionResults.totalFaces}</span></div>
                        <div className="h-8 w-px bg-[#133966]" />
                        <div><span className="text-slate-400 block text-[10px] uppercase font-bold">Matched</span><span className="text-[#00C49F] font-mono font-bold text-sm">{detectionResults.matchedCount}</span></div>
                      </>
                    )}
                  </div>
                  <button onClick={handleAnalyzePhoto} disabled={isAnalyzing}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] text-xs font-black uppercase shadow-lg flex items-center gap-2 disabled:opacity-50">
                    <Sparkles className="w-4 h-4" />
                    {detectionResults ? 'Re-Analyze' : 'Scan & Recognize Faces'}
                  </button>
                </div>
              </div>
            ) : (
              <div onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#133966] hover:border-[#00C49F] rounded-3xl p-12 text-center bg-[#040d1a]/60 hover:bg-[#040d1a] transition-all cursor-pointer group">
                <div className="w-16 h-16 rounded-2xl bg-[#00a896]/15 border border-[#00a896]/30 text-[#00C49F] flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <Camera className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-white mb-1">Upload classroom photo or use a sample</h3>
                <p className="text-xs text-slate-300 max-w-md mx-auto">AI automatically scans and recognizes each face against enrolled student profiles.</p>
              </div>
            )}
          </div>

          {/* Attendance roster */}
          {students.length > 0 && (
            <div className="bg-[#071b34]/95 border border-[#133966] rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#00C49F]" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-200">4. Attendance Roster</h2>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 bg-[#040d1a] p-3 sm:px-4 sm:py-2.5 rounded-2xl border border-[#133966]">
                  <div className="flex sm:flex-col items-center justify-between sm:items-end text-left sm:text-right gap-2 sm:gap-0">
                    <div className="text-xs font-bold text-white">
                      <span className="text-[#00C49F]">{presentCount} Present</span> · <span className="text-rose-400">{students.length - presentCount} Absent</span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      Rate: <span className={attendanceRate >= 75 ? 'text-[#00C49F] font-bold' : 'text-amber-400 font-bold'}>{attendanceRate}%</span>
                    </div>
                  </div>
                  <button onClick={handleSaveAttendance} disabled={savingAttendance || !isWindowOpen}
                    className={`w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-black uppercase transition-all flex items-center justify-center gap-1.5 ${isWindowOpen
                      ? 'bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] shadow-md hover:opacity-95'
                      : 'bg-[#133966] text-slate-500 cursor-not-allowed'} disabled:opacity-50`}>
                    {savingAttendance ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving...</> : <><ShieldCheck className="w-3.5 h-3.5" /> Save Attendance</>}
                  </button>
                </div>
              </div>

              {!isWindowOpen && (
                <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>Attendance is locked. {windowStatus.reason} Enable "Testing Mode" above to override during development.</span>
                </div>
              )}

              {loadingStudents ? (
                <div className="py-8 text-center text-slate-400 text-xs">Loading students...</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {students.map(s => {
                    const status = studentStatusMap[s._id] || 'Absent';
                    const isPresent = status === 'Present';
                    const wasOverridden = overriddenMap[s._id];
                    return (
                      <div key={s._id} className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${isPresent
                        ? 'bg-[#00a896]/10 border-[#00C49F]/30' : 'bg-[#040d1a] border-[#133966]'}`}>
                        <div className="w-10 h-10 rounded-xl overflow-hidden border border-[#133966] shrink-0">
                          <img src={s.profileImage || '/logo.jpg'} alt={s.name} className="w-full h-full object-cover"
                            onError={e => { e.target.src = '/logo.jpg'; }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-white truncate">{s.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{s.usn || '—'}</div>
                          {wasOverridden && <div className="text-[9px] text-amber-400">Manual override</div>}
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          <button onClick={() => handleToggleStatus(s._id, 'Present')}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-all ${isPresent
                              ? 'bg-[#00C49F] text-[#040d1a] border-[#00C49F]' : 'border-[#133966] text-slate-400 hover:border-[#00C49F] hover:text-[#00C49F]'}`}>
                            P
                          </button>
                          <button onClick={() => handleToggleStatus(s._id, 'Absent')}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-all ${!isPresent
                              ? 'bg-rose-500 text-white border-rose-500' : 'border-[#133966] text-slate-400 hover:border-rose-500 hover:text-rose-400'}`}>
                            A
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          TAB: TIMETABLE
      ==================================================================== */}
      {activeTab === 'timetable' && (
        <div className="bg-[#071b34]/95 border border-[#133966] rounded-3xl p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-base font-bold text-white flex items-center gap-2"><Calendar className="w-5 h-5 text-[#00C49F]" /> Weekly Timetable</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex bg-[#040d1a] p-1 rounded-xl border border-[#133966]">
                {[
                  { id: 'assigned', label: 'My Assigned Timetable' },
                  { id: 'department', label: 'Department Timetables' }
                ].map(scope => (
                  <button key={scope.id} onClick={() => setTimetableScope(scope.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${timetableScope === scope.id ? 'bg-[#00C49F] text-[#040d1a]' : 'text-slate-400 hover:text-white'}`}>
                    {scope.label}
                  </button>
                ))}
              </div>
              <select value={activeTimetableCohort} onChange={event => setTimetableCohort(event.target.value)}
                className="bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white">
                {timetableCohorts.map(cohort => (
                  <option key={cohort} value={cohort}>
                    {user?.institutionType === 'pu_college' ? cohort : user?.institutionType === 'school' ? cohort : `Semester ${cohort}`}
                  </option>
                ))}
              </select>
              <select value={activeTimetableDivision} onChange={event => setSelectedTimetableDiv(event.target.value)}
                className="bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white">
                {timetableDivisions.map(div => <option key={div} value={div}>Division {div}</option>)}
              </select>
            </div>
          </div>

          {timetableScope === 'department' && (
            <div className="p-3 rounded-xl bg-[#00a896]/10 border border-[#00a896]/30 text-xs text-[#00C49F] flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              Department view includes all scheduled semesters and divisions. Your own teaching assignments are highlighted.
            </div>
          )}

          {loadingTimetable ? (
            <div className="py-10 text-center text-slate-400 text-xs">Loading timetable...</div>
          ) : timetableSlots.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-xs">
              {timetableScope === 'department' ? 'No department timetable has been created yet.' : 'No classes have been assigned to you yet.'}
            </div>
          ) : (
            <TimetableTable
              division={activeTimetableDivision}
              semester={user?.institutionType === 'institute' || user?.institutionType === 'diploma' ? Number(activeTimetableCohort) : null}
              standard={user?.institutionType === 'pu_college' || user?.institutionType === 'school' ? activeTimetableCohort : ''}
              institutionType={user?.institutionType || 'institute'}
              branch={user?.branch || user?.department || ''}
              pucDept={user?.pucDept || user?.department || ''}
              slots={timetableSlots}
              courses={courses}
              teachers={[]}
              isAdmin={false}
              highlightTeacherId={user?._id}
            />
          )}
          {timetableScope === 'department' && (
            <div className="rounded-2xl border border-[#133966] overflow-hidden">
              <div className="px-4 py-3 bg-[#040d1a] text-xs font-bold text-white">
                Department schedule · {departmentSlots.length} slots across all semesters and divisions
              </div>
              <div className="max-h-80 overflow-auto divide-y divide-[#133966]">
                {departmentSlots.map(slot => {
                  const assignedToMe = (slot.teacher?._id || slot.teacher)?.toString() === user?._id?.toString();
                  const cohort = getTimetableCohort(slot);
                  return (
                    <div key={slot._id} className={`px-4 py-2.5 grid grid-cols-2 md:grid-cols-6 gap-2 text-[11px] ${assignedToMe ? 'bg-[#00a896]/10 text-[#9df5e7]' : 'text-slate-300'}`}>
                      <span>{slot.day} · {slot.timeSlot}</span>
                      <span>{user?.institutionType === 'pu_college' ? cohort : user?.institutionType === 'school' ? cohort : `Sem ${cohort}`}</span>
                      <span>Div {slot.division}</span>
                      <span>{slot.course?.code} · {slot.course?.title}</span>
                      <span>{slot.teacher?.name || 'Faculty unassigned'}</span>
                      <span>{slot.classroom}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          TAB: SESSION HISTORY
      ==================================================================== */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="bg-[#071b34]/95 border border-[#133966] rounded-3xl p-6 shadow-xl">
            <h2 className="text-base font-bold text-white flex items-center gap-2 mb-4"><Clock className="w-5 h-5 text-[#00C49F]" /> Attendance Session History</h2>
            {loadingSessions ? (
              <div className="py-8 text-center text-slate-400 text-xs">Loading sessions...</div>
            ) : sessions.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">No attendance sessions recorded yet.</div>
            ) : (
              <div className="space-y-3">
                {sessions.map(s => (
                  <div key={s._id} className="p-4 rounded-2xl bg-[#040d1a] border border-[#133966]">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">{s.course?.code} — {s.course?.title}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${s.attendancePercentage >= 75 ? 'bg-[#00a896]/20 text-[#00C49F] border border-[#00a896]/30' : 'bg-amber-500/20 text-amber-300 border amber-500/30'}`}>
                            {s.attendancePercentage}%
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {new Date(s.sessionDate).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} · {s.timeSlot}
                        </div>
                        <div className="text-[11px] text-slate-400">Present: {s.totalPresent} / {s.totalEnrolled} · Absent: {s.totalAbsent}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {s.classPhoto && (
                          <img src={s.classPhoto} alt="Class" className="w-10 h-10 rounded-xl object-cover border border-[#133966] cursor-pointer"
                            onClick={() => setPreviewPhotoModal({ url: s.classPhoto, title: 'Classroom Photo' })} />
                        )}
                        <button onClick={() => downloadAttendance(s, 'pdf')} className="px-2.5 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5" /> PDF
                        </button>
                        <button onClick={() => downloadAttendance(s, 'excel')} className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1">
                          <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                        </button>
                        <a href={api.getExportCsvUrl(s._id)} target="_blank" rel="noreferrer"
                          className="px-2.5 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-bold flex items-center gap-1">
                          <Download className="w-3.5 h-3.5" /> CSV
                        </a>
                      </div>
                    </div>

                    {/* Records preview (collapsed) */}
                    <details className="mt-3 group">
                      <summary className="text-[11px] text-slate-400 cursor-pointer hover:text-[#00C49F] list-none flex items-center gap-1.5">
                        <ChevronRight className="w-3.5 h-3.5 group-open:rotate-90 transition-transform" />
                        View student records ({s.records?.length || 0})
                      </summary>
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {(s.records || []).map(r => (
                          <div key={r._id || r.usn} className={`flex items-center gap-2 p-2 rounded-xl border text-[10px] ${r.status === 'Present'
                            ? 'bg-[#00a896]/10 border-[#00C49F]/20' : 'bg-[#040d1a] border-[#133966]'}`}>
                            <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 font-bold ${r.status === 'Present' ? 'bg-[#00C49F] text-[#040d1a]' : 'bg-rose-500/80 text-white'}`}>
                              {r.status === 'Present' ? '✓' : '✗'}
                            </span>
                            <span className="text-white font-medium truncate">{r.name}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'marks-entry' && <TeacherMarksEntry user={user} />}
      {activeTab === 'marks-overview' && <MarksOverviewPage user={user} isAdmin={false} />}
      {activeTab === 'calendar' && <AcademicHub user={user} page="calendar" />}
      {activeTab === 'announcements' && <AcademicHub user={user} page="announcements" />}
      {activeTab === 'materials' && <AcademicHub user={user} page="materials" />}

      {/* Photo lightbox */}
      {previewPhotoModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setPreviewPhotoModal(null)}>
          <div className="max-w-2xl w-full space-y-3" onClick={e => e.stopPropagation()}>
            <img src={previewPhotoModal.url} alt={previewPhotoModal.title} className="w-full rounded-2xl border border-[#133966] shadow-2xl max-h-[70vh] object-contain" />
            <button onClick={() => setPreviewPhotoModal(null)} className="block mx-auto px-6 py-2 rounded-xl bg-[#071b34] text-slate-300 text-xs font-bold border border-[#133966]">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
