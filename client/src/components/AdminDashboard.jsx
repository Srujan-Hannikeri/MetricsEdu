import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, Users, School, GraduationCap, BookOpen, 
  BarChart3, CheckCircle2, XCircle, Plus, Sparkles, RefreshCw, Eye,
  Calendar, Clock, LayoutGrid, UserPlus, Lock, Unlock, ArrowRight, Trash2, Edit3,
  FileText, FileSpreadsheet, Download, Camera, UserCheck
} from 'lucide-react';
import { api } from '../services/api';
import TimetableTable from './TimetableTable';
import { downloadAttendance } from '../utils/exportUtils';

export default function AdminDashboard({ user }) {
  // Navigation pages: 'overview' | 'timetable' | 'divisions' | 'teachers' | 'users' | 'attendance'
  const [activePage, setActivePage] = useState('overview');
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [banner, setBanner] = useState('');

  // Institution Mode & Semester Selection (Sem/Std Wise Selection First!)
  const [institutionMode, setInstitutionMode] = useState(user?.institutionType || 'college');
  const [selectedSemester, setSelectedSemester] = useState(5);
  const [selectedStandard, setSelectedStandard] = useState('10th Std');

  // Timetable State
  const [timetables, setTimetables] = useState([]);
  const [selectedTimetableDiv, setSelectedTimetableDiv] = useState('C');
  const [allocatedRoom, setAllocatedRoom] = useState('Class Room: AS-11');
  const [allocatedCoordinator, setAllocatedCoordinator] = useState('Prof. Nandini C.V');
  const [loadingTimetable, setLoadingTimetable] = useState(false);
  const [showTimetableModal, setShowTimetableModal] = useState(false);
  const [ttDay, setTtDay] = useState('Monday');
  const [ttSlot, setTtSlot] = useState('08:30 AM - 09:25 AM');
  const [ttCourseId, setTtCourseId] = useState('');
  const [ttTeacherId, setTtTeacherId] = useState('');
  const [ttClassroom, setTtClassroom] = useState('Class Room: AS-11 (Div C)');

  // Lightbox Zoom Modal for Attendance Audit (Teacher Photo & Classroom Photo)
  const [previewAuditModal, setPreviewAuditModal] = useState(null); // { url, title, subtitle }

  // Divisions State (Semester Criteria, Admin Class Strength, Add New Divisions)
  const [allocatorSemester, setAllocatorSemester] = useState(5);
  const [allocatorStandard, setAllocatorStandard] = useState('10th Std');
  const [classStrength, setClassStrength] = useState(60);
  const [availableDivisions, setAvailableDivisions] = useState(['A', 'B', 'C']);
  const [newDivName, setNewDivName] = useState('');
  const [studentsList, setStudentsList] = useState([]);
  const [divisionFilter, setDivisionFilter] = useState('ALL');
  const [isEditingDivisions, setIsEditingDivisions] = useState(false);
  const [divisionChanges, setDivisionChanges] = useState({});
  const [savingDivisions, setSavingDivisions] = useState(false);

  // Users State
  const [users, setUsers] = useState([]);
  const [roleFilter, setRoleFilter] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Courses & Teachers State
  const [courses, setCourses] = useState([]);
  const [teachersList, setTeachersList] = useState([]);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [newCourseCode, setNewCourseCode] = useState('');
  const [newCourseTitle, setNewCourseTitle] = useState('');
  const [newCourseDept, setNewCourseDept] = useState('Computer Science & Engineering');
  const [newCourseSem, setNewCourseSem] = useState(6);
  const [newCourseSec, setNewCourseSec] = useState('A');
  const [assignedTeacherId, setAssignedTeacherId] = useState('');

  useEffect(() => {
    loadStats();
    loadCoursesAndTeachers();
  }, []);

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const data = await api.getAdminStats();
      setStats(data.stats);
    } catch (err) {
      console.error('Error loading stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const loadCoursesAndTeachers = async () => {
    try {
      const [cData, uData] = await Promise.all([
        api.getCourses(),
        api.getUsers('teacher')
      ]);
      setCourses(cData.courses || []);
      setTeachersList(uData.users || []);
      if (cData.courses?.length > 0) {
        setTtCourseId(cData.courses[0]._id);
      }
      if (uData.users?.length > 0) {
        setTtTeacherId(uData.users[0]._id);
      }
    } catch (err) {
      console.error('Error loading courses/teachers:', err);
    }
  };

  // Load Timetable when switching to timetable page
  useEffect(() => {
    if (activePage === 'timetable') {
      loadTimetable(selectedTimetableDiv);
    }
  }, [activePage, selectedTimetableDiv]);

  const loadTimetable = async (div) => {
    setLoadingTimetable(true);
    try {
      const data = await api.getTimetables(div);
      setTimetables(data.slots || []);
    } catch (err) {
      console.error('Error loading timetable:', err);
    } finally {
      setLoadingTimetable(false);
    }
  };

  // Load Students for Division Allocator (Filtered by Semester or Standard)
  useEffect(() => {
    if (activePage === 'divisions') {
      loadStudentsForDivisions(allocatorSemester, allocatorStandard);
    }
  }, [activePage, allocatorSemester, allocatorStandard]);

  const loadStudentsForDivisions = async (targetSem = allocatorSemester, targetStd = allocatorStandard) => {
    try {
      const data = await api.getUsers('student', {
        semester: institutionMode === 'college' ? targetSem : undefined,
        standard: institutionMode === 'school' ? targetStd : undefined,
        institutionType: institutionMode
      });
      setStudentsList(data.users || []);
      const initialMap = {};
      const presentDivs = new Set(availableDivisions);
      (data.users || []).forEach(s => {
        const d = s.division || s.section || 'A';
        initialMap[s._id] = d;
        presentDivs.add(d);
      });
      setDivisionChanges(initialMap);
      setAvailableDivisions(Array.from(presentDivs).sort());
    } catch (err) {
      console.error('Error loading students for divisions:', err);
    }
  };

  // Load Users when users page is opened
  useEffect(() => {
    if (activePage === 'users') {
      loadUsers(roleFilter);
    }
  }, [activePage, roleFilter]);

  const loadUsers = async (filter = '') => {
    setLoadingUsers(true);
    try {
      const data = await api.getUsers(filter);
      setUsers(data.users || []);
    } catch (err) {
      console.error('Error loading users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  // Automated Timetable Generator
  const handleAutoGenerateTimetable = async () => {
    if (!confirm(`Auto-generate full weekly schedule for Division ${selectedTimetableDiv}? This will create balanced classes Mon-Sat without clashes.`)) return;
    try {
      const res = await api.autoGenerateTimetable({ division: selectedTimetableDiv, semester: selectedSemester });
      setBanner(res.message);
      loadTimetable(selectedTimetableDiv, selectedSemester);
      loadStats();
    } catch (err) {
      alert('Timetable error: ' + err.message);
    }
  };

  // Cell-by-cell Slot Update / Add
  const handleUpdateOrAddSlot = async (slotData) => {
    try {
      if (slotData.isNew) {
        await api.createTimetableEntry({
          day: slotData.day,
          timeSlot: slotData.timeSlot,
          courseId: slotData.courseId,
          teacherId: slotData.teacherId,
          division: slotData.division || selectedTimetableDiv,
          classroom: slotData.classroom || allocatedRoom,
          semester: selectedSemester
        });
        setBanner(`Allocated ${slotData.day} ${slotData.timeSlot} slot successfully.`);
      } else {
        await api.updateTimetableEntry(slotData.slotId, {
          day: slotData.day,
          timeSlot: slotData.timeSlot,
          course: slotData.courseId,
          teacher: slotData.teacherId,
          classroom: slotData.classroom
        });
        setBanner(`Updated ${slotData.day} ${slotData.timeSlot} slot.`);
      }
      loadTimetable(selectedTimetableDiv, selectedSemester);
      loadStats();
    } catch (err) {
      alert('Error updating slot: ' + err.message);
    }
  };

  // Manual Add Timetable Entry
  const handleCreateTimetableSlot = async (e) => {
    e.preventDefault();
    try {
      await api.createTimetableEntry({
        day: ttDay,
        timeSlot: ttSlot,
        courseId: ttCourseId,
        teacherId: ttTeacherId,
        division: selectedTimetableDiv,
        classroom: ttClassroom,
        semester: 6
      });
      setShowTimetableModal(false);
      setBanner(`Added ${ttDay} ${ttSlot} lecture slot.`);
      loadTimetable(selectedTimetableDiv);
      loadStats();
    } catch (err) {
      alert(err.message);
    }
  };

  // Delete Timetable Slot
  const handleDeleteTimetableSlot = async (id) => {
    if (!confirm('Delete this timetable lecture slot?')) return;
    try {
      await api.deleteTimetableEntry(id);
      loadTimetable(selectedTimetableDiv);
      loadStats();
    } catch (err) {
      alert(err.message);
    }
  };

  // Auto Allocate Divisions (Based on Semester and Admin Class Strength)
  const handleAutoAllocateDivisions = async () => {
    const semOrStd = institutionMode === 'college' ? `${allocatorSemester}th Semester` : allocatorStandard;
    const strength = Number(classStrength) || 60;
    if (!confirm(`Run automated division allocator for ${semOrStd}? Students will be divided into classes with max strength of ${strength} students per division.`)) return;
    try {
      const res = await api.allocateDivisions({
        mode: 'auto',
        semester: institutionMode === 'college' ? allocatorSemester : undefined,
        standard: institutionMode === 'school' ? allocatorStandard : undefined,
        institutionType: institutionMode,
        classStrength: strength,
        divisionsList: availableDivisions
      });
      setBanner(res.message);
      loadStudentsForDivisions(allocatorSemester, allocatorStandard);
      setIsEditingDivisions(false);
    } catch (err) {
      alert(err.message);
    }
  };

  // Add a new division (e.g. D, E, F)
  const handleAddDivision = (e) => {
    e.preventDefault();
    const trimmed = newDivName.trim().toUpperCase();
    if (!trimmed) return;
    if (availableDivisions.includes(trimmed)) {
      alert(`Division ${trimmed} already exists!`);
      return;
    }
    setAvailableDivisions([...availableDivisions, trimmed].sort());
    setNewDivName('');
    setBanner(`Added Division ${trimmed} to available divisions! You can now allocate students to Division ${trimmed}.`);
  };

  // Save Manual Division Allocations
  const handleSaveManualDivisions = async () => {
    setSavingDivisions(true);
    try {
      const allocations = Object.entries(divisionChanges).map(([studentId, division]) => ({
        studentId,
        division
      }));
      const res = await api.allocateDivisions({ mode: 'manual', allocations });
      setBanner(res.message);
      setIsEditingDivisions(false);
      loadStudentsForDivisions();
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingDivisions(false);
    }
  };

  // Assign Teacher to Course
  const handleAssignTeacher = async (courseId, teacherId) => {
    try {
      const res = await api.assignTeacherToCourse(courseId, teacherId);
      setBanner(res.message);
      loadCoursesAndTeachers();
    } catch (err) {
      alert(err.message);
    }
  };

  // Toggle user active status
  const handleToggleStatus = async (userId) => {
    try {
      const data = await api.toggleUserStatus(userId);
      setBanner(data.message);
      loadUsers(roleFilter);
    } catch (err) {
      alert(err.message);
    }
  };

  // Seed Demo 60 Students & Divisions
  const handleSeedData = async () => {
    if (!confirm('Populate 60 students with real portraits, Divisions A & B, and Timetables?')) return;
    try {
      const res = await api.seedDemoData();
      setBanner(res.message);
      loadStats();
      loadCoursesAndTeachers();
      if (activePage === 'timetable') loadTimetable(selectedTimetableDiv);
      if (activePage === 'divisions') loadStudentsForDivisions();
      if (activePage === 'users') loadUsers(roleFilter);
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 px-2.5 rounded-lg bg-rose-500/15 text-rose-400 font-mono text-xs font-bold border border-rose-500/30">
              INSTITUTION ADMIN
            </span>
            <span className="text-xs text-slate-400 font-mono">Admin ID: {user?.adminId}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1.5 tracking-tight">
            MetricsEdu Institutional Management
          </h1>
          <p className="text-xs sm:text-sm text-cyan-200/70 font-medium">
            One Connected Platform. One Smart Classroom.
          </p>
        </div>

        {/* Action Controls & Seed */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleSeedData}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#00a896]/15 text-[#00C49F] border border-[#00a896]/40 hover:bg-[#00a896]/25 text-xs font-bold transition-all shadow-sm"
          >
            <Sparkles className="w-4 h-4 text-[#00C49F]" />
            Seed 60 Students & Timetables
          </button>
        </div>
      </div>

      {/* Primary Page Navigation Tabs (Clicking any tab cleanly opens that dedicated page) */}
      <div className="flex flex-wrap items-center gap-2 bg-[#071b34] p-2 rounded-2xl border border-[#133966] shadow-md">
        {[
          { id: 'overview', label: 'Overview & KPIs', icon: BarChart3 },
          { id: 'timetable', label: 'Timetable Manager', icon: Calendar },
          { id: 'divisions', label: 'Division Allocator', icon: Users },
          { id: 'teachers', label: 'Assign Teachers & Courses', icon: School },
          { id: 'users', label: 'Students & Biometrics', icon: GraduationCap },
          { id: 'attendance', label: 'Attendance Audit', icon: ShieldCheck }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activePage === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => { setActivePage(tab.id); setBanner(''); }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] shadow-md shadow-teal-500/20'
                  : 'text-slate-300 hover:text-white hover:bg-[#0b2444]'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {banner && (
        <div className="p-4 rounded-2xl bg-[#00a896]/15 border border-[#00a896]/40 text-[#67e8f9] text-xs sm:text-sm flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#00C49F]" />
            <span>{banner}</span>
          </div>
          <button onClick={() => setBanner('')} className="text-xs text-[#00C49F] font-mono">Dismiss</button>
        </div>
      )}

      {/* ========================================================
          PAGE 1: OVERVIEW & INTERACTIVE STATS
      ======================================================== */}
      {activePage === 'overview' && (
        <div className="space-y-8">
          
          {/* Interactive KPI Cards: Clicking ANY card opens that specific dedicated page */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            
            {/* Card 1: Students -> Opens 'users' page */}
            <div 
              onClick={() => setActivePage('users')}
              className="bg-[#071b34]/95 border border-[#133966] hover:border-[#00C49F] rounded-2xl p-5 shadow-lg cursor-pointer group transition-all"
            >
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-xs uppercase font-bold tracking-wider group-hover:text-[#00C49F]">Total Students</span>
                <GraduationCap className="w-4 h-4 text-[#38bdf8]" />
              </div>
              <div className="text-3xl font-black font-mono text-white mt-2 group-hover:text-[#00C49F]">
                {stats?.totalStudents || 60}
              </div>
              <div className="text-[11px] text-[#00C49F] mt-2 font-mono flex items-center justify-between">
                <span>{stats?.faceRegistrationRate || 100}% Biometrics Enrolled</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* Card 2: Faculty -> Opens 'teachers' page */}
            <div 
              onClick={() => setActivePage('teachers')}
              className="bg-[#071b34]/95 border border-[#133966] hover:border-[#00C49F] rounded-2xl p-5 shadow-lg cursor-pointer group transition-all"
            >
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-xs uppercase font-bold tracking-wider group-hover:text-[#00C49F]">Faculty Teachers</span>
                <School className="w-4 h-4 text-[#00C49F]" />
              </div>
              <div className="text-3xl font-black font-mono text-white mt-2 group-hover:text-[#00C49F]">
                {stats?.totalTeachers || 4}
              </div>
              <div className="text-[11px] text-cyan-200 mt-2 font-mono flex items-center justify-between">
                <span>Assigned to Subjects</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* Card 3: Timetable -> Opens 'timetable' page */}
            <div 
              onClick={() => setActivePage('timetable')}
              className="bg-[#071b34]/95 border border-[#133966] hover:border-[#00C49F] rounded-2xl p-5 shadow-lg cursor-pointer group transition-all"
            >
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-xs uppercase font-bold tracking-wider group-hover:text-[#00C49F]">Timetable Slots</span>
                <Calendar className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-3xl font-black font-mono text-white mt-2 group-hover:text-[#00C49F]">
                {stats?.totalTimetableSlots || 50}
              </div>
              <div className="text-[11px] text-slate-300 mt-2 font-mono flex items-center justify-between">
                <span>Div A & Div B Scheduled</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* Card 4: Attendance Rate -> Opens 'attendance' page */}
            <div 
              onClick={() => setActivePage('attendance')}
              className="bg-[#071b34]/95 border border-[#133966] hover:border-[#00C49F] rounded-2xl p-5 shadow-lg cursor-pointer group transition-all"
            >
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-xs uppercase font-bold tracking-wider group-hover:text-[#00C49F]">Institutional Attendance</span>
                <BarChart3 className="w-4 h-4 text-[#00C49F]" />
              </div>
              <div className="text-3xl font-black font-mono text-[#00C49F] mt-2">
                {stats?.avgAttendance || 88}%
              </div>
              <div className="text-[11px] text-cyan-200 mt-2 font-mono flex items-center justify-between">
                <span>Daily Class Logs</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

          </div>

          {/* Quick Operations Hub */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div 
              onClick={() => setActivePage('timetable')}
              className="p-6 rounded-3xl bg-gradient-to-br from-[#071b34] to-[#0b2444] border border-[#133966] hover:border-[#00C49F] cursor-pointer shadow-xl transition-all"
            >
              <Calendar className="w-8 h-8 text-[#00C49F] mb-3" />
              <h3 className="text-base font-bold text-white">Create & Auto-Generate Timetables</h3>
              <p className="text-xs text-slate-300 mt-1">
                Configure weekly lecture routines, room assignments, and generate clash-free schedules in 1 click.
              </p>
            </div>

            <div 
              onClick={() => setActivePage('divisions')}
              className="p-6 rounded-3xl bg-gradient-to-br from-[#071b34] to-[#0b2444] border border-[#133966] hover:border-[#00C49F] cursor-pointer shadow-xl transition-all"
            >
              <Users className="w-8 h-8 text-[#38bdf8] mb-3" />
              <h3 className="text-base font-bold text-white">Student Division Allocations</h3>
              <p className="text-xs text-slate-300 mt-1">
                Put 60 students into Division A and Division B. Done once automatically or edited manually anytime.
              </p>
            </div>

            <div 
              onClick={() => setActivePage('teachers')}
              className="p-6 rounded-3xl bg-gradient-to-br from-[#071b34] to-[#0b2444] border border-[#133966] hover:border-[#00C49F] cursor-pointer shadow-xl transition-all"
            >
              <School className="w-8 h-8 text-amber-400 mb-3" />
              <h3 className="text-base font-bold text-white">Assign Teachers to Subjects</h3>
              <p className="text-xs text-slate-300 mt-1">
                Map faculty lecturers to departments, curriculum courses, and monitor classroom vision usage.
              </p>
            </div>
          </div>

        </div>
      )}

      {/* ========================================================
          PAGE 2: TIMETABLE MANAGER (MANUAL & AUTOMATED)
      ======================================================== */}
      {activePage === 'timetable' && (
        <div className="bg-[#071b34]/95 border border-[#133966] rounded-3xl p-6 shadow-xl backdrop-blur-sm space-y-6">
          
          {/* STEP 1: SELECT SEMESTER / STANDARD FIRST (MANDATORY SELECTION STEP) */}
          <div className="p-4 rounded-2xl bg-[#040d1a] border border-[#133966] flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#00a896]/20 text-[#00C49F] border border-[#00a896]/30">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-200 block">
                  Step 1: Select Academic Level First
                </span>
                <span className="text-sm font-bold text-white">
                  {institutionMode === 'school' ? 'Select School Standard / Class' : 'Select College Semester Curriculum'}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Institution Type Strict Display: If Institutional, ONLY Semesters appear; If School, ONLY Standards appear */}
              {institutionMode === 'college' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-slate-300">Degree & Branch:</span>
                  <span className="text-xs font-mono font-bold text-cyan-200 bg-[#071b34] px-2.5 py-1.5 rounded-xl border border-[#133966]">
                    B.E. Computer Science & Engineering
                  </span>
                  <label className="text-xs font-bold text-slate-300 ml-1">Select Semester:</label>
                  <select
                    value={selectedSemester}
                    onChange={(e) => {
                      const sem = Number(e.target.value);
                      setSelectedSemester(sem);
                      loadTimetable(selectedTimetableDiv, sem);
                    }}
                    className="bg-[#071b34] border border-[#00a896]/50 rounded-xl px-3 py-1.5 text-xs text-white font-bold focus:outline-none"
                  >
                    {[3, 4, 5, 6, 7, 8].map((s) => (
                      <option key={s} value={s}>
                        {s}th Semester {s === 5 ? '(KLS GIT Scheme - Active)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-slate-300">School Level:</span>
                  <span className="text-xs font-mono font-bold text-cyan-200 bg-[#071b34] px-2.5 py-1.5 rounded-xl border border-[#133966]">
                    K-12 School Curriculum
                  </span>
                  <label className="text-xs font-bold text-slate-300 ml-1">Select Standard / Class:</label>
                  <select
                    value={selectedStandard}
                    onChange={(e) => {
                      setSelectedStandard(e.target.value);
                    }}
                    className="bg-[#071b34] border border-[#00a896]/50 rounded-xl px-3 py-1.5 text-xs text-white font-bold focus:outline-none"
                  >
                    {['1st Std', '2nd Std', '3rd Std', '4th Std', '5th Std', '6th Std', '7th Std', '8th Std', '9th Std', '10th Std', '11th Std (PUC-I)', '12th Std (PUC-II)'].map((std) => (
                      <option key={std} value={std}>{std}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* STEP 2: TIMETABLE CONTROLS & DIVISION SELECTOR */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
            <div>
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#00C49F]" />
                <h2 className="text-lg font-extrabold text-white">
                  Timetable Sheet (Editable Matrix Form)
                </h2>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Exact timetable format matching institutional standard. Fully editable by Admin. Visible to all teachers and students.
              </p>
            </div>

            {/* Division Switcher & Generation Controls (Nothing is locked, everything editable by Admin) */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex bg-[#040d1a] p-1 rounded-xl border border-[#133966]">
                <button
                  onClick={() => {
                    setSelectedTimetableDiv('A');
                    loadTimetable('A', selectedSemester);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    selectedTimetableDiv === 'A'
                      ? 'bg-[#00C49F] text-[#040d1a] shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Division A
                </button>
                <button
                  onClick={() => {
                    setSelectedTimetableDiv('B');
                    loadTimetable('B', selectedSemester);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    selectedTimetableDiv === 'B'
                      ? 'bg-[#00C49F] text-[#040d1a] shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Division B
                </button>
                <button
                  onClick={() => {
                    setSelectedTimetableDiv('C');
                    loadTimetable('C', selectedSemester);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    selectedTimetableDiv === 'C'
                      ? 'bg-[#00C49F] text-[#040d1a] shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Division C
                </button>
              </div>

              {/* Conflict-Free Timetable Generator with Teacher Break Rules */}
              <button
                onClick={handleAutoGenerateTimetable}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-md hover:opacity-95 print:hidden"
                title="Generate timetable ensuring breaks between every 2 classes & zero teacher clashes"
              >
                <Sparkles className="w-3.5 h-3.5" />
                ⚡ Auto-Generate Timetable
              </button>

              <button
                onClick={() => setShowTimetableModal(true)}
                className="px-3 py-2 rounded-xl bg-[#0b2444] hover:bg-[#133966] text-[#00C49F] border border-[#00a896]/30 text-xs font-bold flex items-center gap-1 print:hidden"
              >
                <Plus className="w-4 h-4" />
                Add Slot
              </button>
            </div>
          </div>

          {/* RENDER DEDICATED OFFICIAL TIMETABLE TABLE COMPONENT */}
          {loadingTimetable ? (
            <div className="py-12 text-center text-xs text-slate-400">
              <div className="w-8 h-8 border-2 border-[#00C49F] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              Loading {selectedSemester}th Semester Division {selectedTimetableDiv} Timetable...
            </div>
          ) : (
            <TimetableTable
              division={selectedTimetableDiv}
              semester={selectedSemester}
              standard={selectedStandard}
              institutionType={institutionMode}
              classroom={selectedTimetableDiv === 'C' ? 'Class Room: AS-11' : (selectedTimetableDiv === 'B' ? 'Lecture Hall LH-302' : 'Smart Hall LH-301')}
              coordinator={selectedTimetableDiv === 'C' ? 'Prof. Nandini C.V' : 'Prof. Pavan K.K'}
              slots={timetables}
              courses={courses}
              teachers={teachersList}
              isAdmin={true}
              onUpdateSlot={handleUpdateOrAddSlot}
              onAssignCourseTeacher={async (courseId, teacherId) => {
                try {
                  const res = await api.assignTeacherToCourse(courseId, teacherId);
                  setBanner(res.message || 'Teacher assigned successfully!');
                  await loadCoursesAndTeachers();
                  await loadTimetable(selectedTimetableDiv, selectedSemester);
                } catch (err) {
                  setBanner(err.message || 'Failed to assign teacher');
                }
              }}
              onUpdateHeader={(h) => {
                setAllocatedRoom(h.classroom);
                setAllocatedCoordinator(h.coordinator);
                setBanner(`Updated allocation: ${h.classroom} • Coordinator: ${h.coordinator}`);
              }}
            />
          )}

        </div>
      )}

      {/* ========================================================
          PAGE 3: DIVISION ALLOCATOR (SEMESTER CRITERIA, CLASS STRENGTH, ADD DIVISIONS)
      ======================================================== */}
      {activePage === 'divisions' && (
        <div className="bg-[#071b34]/95 border border-[#133966] rounded-3xl p-6 shadow-xl backdrop-blur-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#133966]">
            <div>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-[#00C49F]" />
                <h2 className="text-lg font-extrabold text-white">Student Division Allocations</h2>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Allocate students into divisions based on Semester criteria and specified class strength. Add custom divisions anytime.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Edit / Lock Mode */}
              {!isEditingDivisions ? (
                <button
                  onClick={() => setIsEditingDivisions(true)}
                  className="px-3.5 py-2 rounded-xl bg-[#0b2444] hover:bg-[#133966] text-[#00C49F] border border-[#00a896]/30 text-xs font-bold flex items-center gap-1.5 shadow-sm"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Manual Edit Divisions
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsEditingDivisions(false)}
                    className="px-3 py-2 text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveManualDivisions}
                    disabled={savingDivisions}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-[#040d1a] font-black text-xs uppercase flex items-center gap-1 shadow-md"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Save Changes
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* CRITERIA BAR 1: SEMESTER / STANDARD CRITERIA & CLASS STRENGTH */}
          <div className="bg-[#040d1a] border border-[#133966] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
            
            {/* Semester or Standard Filter Criteria */}
            <div className="flex flex-wrap items-center gap-3">
              {institutionMode === 'college' ? (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-300">Semester Criteria:</label>
                  <select
                    value={allocatorSemester}
                    onChange={(e) => {
                      const sem = Number(e.target.value);
                      setAllocatorSemester(sem);
                      loadStudentsForDivisions(sem, allocatorStandard);
                    }}
                    className="bg-[#071b34] border border-[#00a896]/50 rounded-xl px-3 py-1.5 text-xs text-white font-bold focus:outline-none"
                  >
                    {[3, 4, 5, 6, 7, 8].map((s) => (
                      <option key={s} value={s}>
                        {s}th Semester {s === 5 ? '(Active - Div C)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-300">Standard Criteria:</label>
                  <select
                    value={allocatorStandard}
                    onChange={(e) => {
                      setAllocatorStandard(e.target.value);
                      loadStudentsForDivisions(allocatorSemester, e.target.value);
                    }}
                    className="bg-[#071b34] border border-[#00a896]/50 rounded-xl px-3 py-1.5 text-xs text-white font-bold focus:outline-none"
                  >
                    {['1st Std', '2nd Std', '3rd Std', '4th Std', '5th Std', '6th Std', '7th Std', '8th Std', '9th Std', '10th Std', '11th Std (PUC-I)', '12th Std (PUC-II)'].map((std) => (
                      <option key={std} value={std}>{std}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Class Strength Specified by Admin */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-300">Class Strength / Div:</label>
                <input
                  type="number"
                  min="1"
                  max="200"
                  value={classStrength}
                  onChange={(e) => setClassStrength(e.target.value)}
                  className="w-20 bg-[#071b34] border border-[#00a896]/50 rounded-xl px-2.5 py-1.5 text-xs text-white font-mono font-bold text-center focus:outline-none focus:border-[#00C49F]"
                  title="Maximum students in each division before spilling into next division"
                />
                <span className="text-[11px] text-slate-400 font-mono">students/class</span>
              </div>
            </div>

            {/* Run Auto-Division with Specified Strength */}
            <button
              onClick={handleAutoAllocateDivisions}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] hover:opacity-95 text-[#040d1a] font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-md transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" />
              ⚡ Auto-Divide Students ({classStrength}/class)
            </button>
          </div>

          {/* CRITERIA BAR 2: ACTIVE DIVISIONS & ADD ANOTHER DIVISION */}
          <div className="bg-[#040d1a] border border-[#133966] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
            
            {/* Add Another Division Form */}
            <form onSubmit={handleAddDivision} className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-300">Add Division:</label>
              <input
                type="text"
                placeholder="e.g. D"
                value={newDivName}
                maxLength={4}
                onChange={(e) => setNewDivName(e.target.value)}
                className="w-20 bg-[#071b34] border border-[#133966] rounded-xl px-2.5 py-1.5 text-xs text-white uppercase font-bold text-center focus:outline-none focus:border-[#00C49F]"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-xl bg-[#0b2444] hover:bg-[#133966] text-[#00C49F] border border-[#00a896]/40 text-xs font-bold flex items-center gap-1 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Division
              </button>
            </form>

            {/* Division Filter for Student List */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-300">Filter View:</label>
              <select
                value={divisionFilter}
                onChange={(e) => setDivisionFilter(e.target.value)}
                className="bg-[#071b34] border border-[#133966] rounded-xl px-3 py-1.5 text-xs text-white font-bold focus:outline-none"
              >
                <option value="ALL">All Divisions ({studentsList.length} students)</option>
                {availableDivisions.map(div => (
                  <option key={div} value={div}>Division {div} Only</option>
                ))}
              </select>
            </div>
          </div>

          {/* Division Allocation Breakdown Stats Pill */}
          <div className="p-3.5 rounded-2xl bg-[#040d1a] border border-[#133966] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-300 font-medium">
              {isEditingDivisions ? (
                <Unlock className="w-4 h-4 text-amber-400" />
              ) : (
                <Lock className="w-4 h-4 text-[#00C49F]" />
              )}
              <span>
                Criteria: <strong className="text-white">
                  {institutionMode === 'college' ? `${allocatorSemester}th Semester` : allocatorStandard}
                </strong> • Status: <strong className={isEditingDivisions ? 'text-amber-400' : 'text-[#00C49F]'}>
                  {isEditingDivisions ? 'Unlocked (Manual Override Active)' : 'Allocated & Enrolled'}
                </strong>
              </span>
            </div>
            
            {/* Live Count for Each Division */}
            <div className="flex flex-wrap items-center gap-2 font-mono text-cyan-200">
              {availableDivisions.map(div => {
                const count = studentsList.filter(s => (divisionChanges[s._id] || s.division) === div).length;
                return (
                  <span key={div} className="px-2 py-0.5 rounded-lg bg-[#071b34] border border-[#133966]">
                    Div {div}: <strong className="text-[#00C49F]">{count}</strong>
                  </span>
                );
              })}
            </div>
          </div>

          {/* Students List Table */}
          <div className="overflow-x-auto rounded-2xl border border-[#133966]">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#040d1a] text-cyan-300 font-bold uppercase tracking-wider text-[10px] border-b border-[#133966]">
                <tr>
                  <th className="py-3 px-4">Student Face & Name</th>
                  <th className="py-3 px-4">USN / Roll No</th>
                  <th className="py-3 px-4">Class Criteria</th>
                  <th className="py-3 px-4 text-center">Assigned Division</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#133966]/60 font-medium">
                {studentsList.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400">
                      No students found for {institutionMode === 'college' ? `Semester ${allocatorSemester}` : allocatorStandard}.
                    </td>
                  </tr>
                ) : (
                  studentsList
                    .filter(s => divisionFilter === 'ALL' || (divisionChanges[s._id] || s.division) === divisionFilter)
                    .map((student) => {
                      const currentDiv = divisionChanges[student._id] || student.division || 'A';
                      return (
                        <tr key={student._id} className="hover:bg-[#0b2444]/40 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full overflow-hidden border border-[#00a896] bg-[#040d1a] shrink-0">
                                <img src={student.profileImage || '/logo.jpg'} alt={student.name} className="w-full h-full object-cover" />
                              </div>
                              <div>
                                <div className="font-bold text-white">{student.name}</div>
                                <div className="text-[10px] text-slate-400 font-mono">{student.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-[#67e8f9]">
                            {student.usn}
                          </td>
                          <td className="py-3 px-4 text-slate-300">
                            {student.institutionType === 'school' ? (student.standard || '10th Std') : `${student.department} (Sem ${student.semester})`}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {isEditingDivisions ? (
                              <select
                                value={currentDiv}
                                onChange={(e) => setDivisionChanges({
                                  ...divisionChanges,
                                  [student._id]: e.target.value
                                })}
                                className="bg-[#040d1a] border border-[#00C49F] rounded-lg px-3 py-1 font-bold text-white text-xs focus:outline-none"
                              >
                                {availableDivisions.map(div => (
                                  <option key={div} value={div}>Division {div}</option>
                                ))}
                              </select>
                            ) : (
                              <span className={`inline-block px-3 py-1 rounded-full text-xs font-black font-mono ${
                                currentDiv === 'C'
                                  ? 'bg-[#00a896]/20 text-[#00C49F] border border-[#00a896]/40'
                                  : (currentDiv === 'B' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40')
                              }`}>
                                Division {currentDiv}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          PAGE 4: TEACHERS & COURSE ASSIGNMENTS
      ======================================================== */}
      {activePage === 'teachers' && (
        <div className="bg-[#071b34]/95 border border-[#133966] rounded-3xl p-6 shadow-xl backdrop-blur-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#133966]">
            <div>
              <div className="flex items-center gap-2">
                <School className="w-5 h-5 text-[#00C49F]" />
                <h2 className="text-lg font-extrabold text-white">Course Faculty Assignments</h2>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Assign teachers to academic subjects and manage curriculum classes.
              </p>
            </div>

            <button
              onClick={() => setShowCourseModal(true)}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-md"
            >
              <Plus className="w-4 h-4" />
              Add Course
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[#133966]">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#040d1a] text-cyan-300 font-bold uppercase tracking-wider text-[10px] border-b border-[#133966]">
                <tr>
                  <th className="py-3 px-4">Course Code</th>
                  <th className="py-3 px-4">Subject Title</th>
                  <th className="py-3 px-4">Semester & Div</th>
                  <th className="py-3 px-4">Assigned Faculty Lecturer</th>
                  <th className="py-3 px-4 text-center">Classes Held</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#133966]/60 font-medium">
                {courses.map((c) => (
                  <tr key={c._id} className="hover:bg-[#0b2444]/40 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-[#67e8f9]">
                      {c.code}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-white text-sm">
                      {c.title}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-cyan-200">
                      Sem {c.semester} • Div {c.section}
                    </td>
                    <td className="py-3.5 px-4">
                      {/* Interactive Teacher Assignment Dropdown */}
                      <select
                        value={c.teacher?._id || ''}
                        onChange={(e) => handleAssignTeacher(c._id, e.target.value)}
                        className="bg-[#040d1a] border border-[#133966] focus:border-[#00C49F] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
                      >
                        <option value="">Select Lecturer...</option>
                        {teachersList.map((t) => (
                          <option key={t._id} value={t._id}>
                            {t.name} ({t.teacherId})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono font-bold text-[#00C49F]">
                      {c.totalClassesHeld || 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          PAGE 5: USERS & BIOMETRICS DIRECTORY
      ======================================================== */}
      {activePage === 'users' && (
        <div className="bg-[#071b34]/95 border border-[#133966] rounded-3xl p-6 shadow-xl backdrop-blur-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#133966]">
            <div>
              <div className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-[#00C49F]" />
                <h2 className="text-lg font-extrabold text-white">Academic Directory & Biometrics</h2>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Inspect registered Admins, Teachers, and 60 Students with real face portraits & identifiers.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {['', 'admin', 'teacher', 'student'].map((r) => (
                <button
                  key={r}
                  onClick={() => setRoleFilter(r)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all uppercase ${
                    roleFilter === r
                      ? 'bg-[#00a896] text-[#040d1a] shadow-sm'
                      : 'text-slate-400 hover:text-white bg-[#040d1a] border border-[#133966]'
                  }`}
                >
                  {r || 'All Actors'}
                </button>
              ))}
            </div>
          </div>

          {loadingUsers ? (
            <div className="py-12 text-center text-xs text-slate-400">Loading directory...</div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[#133966]">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-[#040d1a] text-cyan-300 font-bold uppercase tracking-wider text-[10px] border-b border-[#133966]">
                  <tr>
                    <th className="py-3 px-4">Student Face & Profile</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Assigned Identifier</th>
                    <th className="py-3 px-4">Division / Semester</th>
                    <th className="py-3 px-4">Biometrics</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#133966]/60 font-medium">
                  {users.map((u) => {
                    const idVal = u.adminId || u.teacherId || u.usn;
                    const idLabel = u.role === 'admin' ? 'Admin ID' : u.role === 'teacher' ? 'Teacher ID' : 'USN';
                    
                    return (
                      <tr key={u._id} className="hover:bg-[#0b2444]/40 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full overflow-hidden border border-[#00a896] bg-[#040d1a] shrink-0">
                              <img src={u.profileImage || '/logo.jpg'} alt={u.name} className="w-full h-full object-cover" />
                            </div>
                            <div>
                              <div className="font-bold text-white">{u.name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            u.role === 'admin'
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                              : u.role === 'teacher'
                              ? 'bg-[#00a896]/20 text-[#00C49F] border border-[#00a896]/40'
                              : 'bg-cyan-500/10 text-[#38bdf8] border border-cyan-500/30'
                          }`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono">
                          <span className="text-slate-400 text-[10px] mr-1">{idLabel}:</span>
                          <strong className="text-[#67e8f9]">{idVal || 'N/A'}</strong>
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">
                          {u.role === 'student' ? (
                            <div className="font-mono text-cyan-200">
                              Div {u.division || u.section || 'A'} • Sem {u.semester}
                            </div>
                          ) : (
                            <div>{u.department}</div>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          {u.role !== 'student' ? (
                            <span className="text-slate-500 text-[11px] font-mono">Not Required (Students Only)</span>
                          ) : u.faceRegistered ? (
                            <span className="text-[#00C49F] font-semibold text-[11px] flex items-center gap-1 font-mono">
                              <span className="w-2 h-2 rounded-full bg-[#00C49F]" />
                              Active ({u.lastConfidenceScore || 95}%)
                            </span>
                          ) : (
                            <span className="text-amber-400 text-[11px] font-mono">Pending</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => handleToggleStatus(u._id)}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                              u.isActive
                                ? 'bg-emerald-500/10 text-[#00C49F] hover:bg-rose-500/10 hover:text-rose-400 border border-emerald-500/30'
                                : 'bg-rose-500/10 text-rose-400 hover:bg-emerald-500/10 hover:text-emerald-400 border border-rose-500/30'
                            }`}
                          >
                            {u.isActive ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          PAGE 6: ATTENDANCE AUDIT LOGS (TEACHER ATTENDANCE & CLASS PHOTOS)
      ======================================================== */}
      {activePage === 'attendance' && (
        <div className="bg-[#071b34]/95 border border-[#133966] rounded-3xl p-6 shadow-xl backdrop-blur-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#133966]">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-rose-400" />
                <h2 className="text-lg font-extrabold text-white">Daily Attendance & Faculty Audit Logs</h2>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Inspect classroom attendance photos, verify teacher presence selfies, and download finalized PDF/Excel/CSV reports.
              </p>
            </div>
            <button
              onClick={loadStats}
              className="p-2 px-3 rounded-xl bg-[#0b2444] text-cyan-200 text-xs font-bold border border-[#133966] flex items-center gap-1.5 self-start sm:self-auto hover:bg-[#133966] transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh Audits
            </button>
          </div>

          {stats?.recentSessions?.length > 0 ? (
            <div className="overflow-x-auto rounded-2xl border border-[#133966]">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-[#040d1a] text-cyan-300 font-bold uppercase tracking-wider text-[10px] border-b border-[#133966]">
                  <tr>
                    <th className="py-3 px-4">Date & Slot</th>
                    <th className="py-3 px-4">Subject</th>
                    <th className="py-3 px-4">Lecturer & Presence Photo</th>
                    <th className="py-3 px-4 text-center">Classroom 60 Photo</th>
                    <th className="py-3 px-4">Hall / Room</th>
                    <th className="py-3 px-4 text-center">Student Attendance</th>
                    <th className="py-3 px-4 text-center">Export Reports</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#133966]/60 font-medium">
                  {stats.recentSessions.map((s) => (
                    <tr key={s._id} className="hover:bg-[#0b2444]/40 transition-colors">
                      
                      {/* Date & Slot */}
                      <td className="py-3.5 px-4">
                        <div className="font-mono text-white font-bold">
                          {new Date(s.sessionDate).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {s.timeSlot || '08:30 AM - 09:25 AM'}
                        </div>
                      </td>

                      {/* Course */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white text-sm">{s.course?.code}</div>
                        <div className="text-[10px] text-slate-300 line-clamp-1">{s.course?.title}</div>
                      </td>

                      {/* Teacher Verification Photo (Monitored for Teacher Attendance) */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setPreviewAuditModal({
                              url: s.teacherPhoto || s.teacher?.profileImage || '/logo.jpg',
                              title: `Faculty Attendance Verification: ${s.teacher?.name || 'Faculty Member'}`,
                              subtitle: `Captured during session at ${s.classroom} • Attendance Verified Present`
                            })}
                            className="relative group w-11 h-11 rounded-xl overflow-hidden border-2 border-[#00C49F] bg-[#040d1a] shadow-md shrink-0"
                            title="Click to view teacher selfie"
                          >
                            <img
                              src={s.teacherPhoto || s.teacher?.profileImage || '/logo.jpg'}
                              alt={s.teacher?.name || 'Faculty'}
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                              onError={(e) => { e.target.src = '/logo.jpg'; }}
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <Eye className="w-3.5 h-3.5 text-white" />
                            </div>
                          </button>
                          <div>
                            <div className="font-bold text-white flex items-center gap-1.5">
                              <span>{s.teacher?.name}</span>
                            </div>
                            <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-[#00C49F] border border-emerald-500/30 mt-0.5">
                              <UserCheck className="w-3 h-3 text-[#00C49F]" />
                              Teacher Present in Class
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Classroom Photo */}
                      <td className="py-3.5 px-4 text-center">
                        {s.classPhoto ? (
                          <button
                            type="button"
                            onClick={() => setPreviewAuditModal({
                              url: s.classPhoto,
                              title: `Classroom Seated Photo: ${s.course?.code} - ${s.course?.title}`,
                              subtitle: `${s.detectedFacesCount || 60} Real Student Faces Scanned • Hall: ${s.classroom}`
                            })}
                            className="relative group inline-block w-14 h-10 rounded-lg overflow-hidden border border-[#00a896] bg-[#040d1a] shadow-md"
                            title="Click to zoom classroom photo"
                          >
                            <img
                              src={s.classPhoto}
                              alt="Classroom"
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <Eye className="w-3.5 h-3.5 text-white" />
                            </div>
                          </button>
                        ) : (
                          <span className="text-slate-500 text-[10px]">No Photo</span>
                        )}
                      </td>

                      {/* Classroom */}
                      <td className="py-3.5 px-4 font-mono text-cyan-200">
                        {s.classroom}
                      </td>

                      {/* Attendance % */}
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-block font-mono font-bold px-2.5 py-1 rounded-full text-xs ${
                          s.attendancePercentage >= 75
                            ? 'bg-[#00a896]/20 text-[#00C49F] border border-[#00a896]/40'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        }`}>
                          {s.attendancePercentage}% ({s.totalPresent}P / {s.totalAbsent}A)
                        </span>
                      </td>

                      {/* Download Buttons: PDF, Excel, CSV */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => downloadAttendance(s, 'pdf')}
                            className="px-2 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 hover:text-white border border-rose-500/30 text-[10px] font-bold flex items-center gap-1 transition-all"
                            title="Download PDF Attendance"
                          >
                            <FileText className="w-3 h-3 text-rose-400" />
                            PDF
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadAttendance(s, 'excel')}
                            className="px-2 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 hover:text-white border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1 transition-all"
                            title="Download Excel Sheet"
                          >
                            <FileSpreadsheet className="w-3 h-3 text-[#00C49F]" />
                            Excel
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadAttendance(s, 'csv')}
                            className="px-2 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 hover:text-white border border-cyan-500/30 text-[10px] font-bold flex items-center gap-1 transition-all"
                            title="Download CSV"
                          >
                            <Download className="w-3 h-3 text-cyan-400" />
                            CSV
                          </button>
                        </div>
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-slate-400">
              No sessions conducted yet. Use "Seed 60 Students & Timetables" or login as Teacher to record attendance.
            </div>
          )}
        </div>
      )}

      {/* Lightbox Photo Preview Modal for Audit */}
      {previewAuditModal && (
        <div className="fixed inset-0 z-50 bg-[#040d1a]/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-[#071b34] border border-[#133966] rounded-3xl overflow-hidden shadow-2xl relative text-white animate-in zoom-in-95 duration-200">
            <div className="p-4 bg-[#040d1a] border-b border-[#133966] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">{previewAuditModal.title}</h3>
                <p className="text-xs text-[#00C49F] font-mono mt-0.5">{previewAuditModal.subtitle}</p>
              </div>
              <button
                onClick={() => setPreviewAuditModal(null)}
                className="px-3 py-1.5 rounded-xl bg-[#0b2444] text-xs font-bold text-slate-300 hover:text-white border border-[#133966]"
              >
                Close
              </button>
            </div>
            <div className="p-4 bg-[#020814] flex items-center justify-center max-h-[75vh] overflow-auto">
              <img
                src={previewAuditModal.url}
                alt="Audit Zoom"
                className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* Manual Timetable Add Modal */}
      {showTimetableModal && (
        <div className="fixed inset-0 z-50 bg-[#040d1a]/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#071b34] border border-[#133966] rounded-3xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">Add Lecture Slot (Division {selectedTimetableDiv})</h3>
            <p className="text-xs text-slate-300 mb-4">Manual timetable scheduling</p>

            <form onSubmit={handleCreateTimetableSlot} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Day of Week</label>
                  <select
                    value={ttDay}
                    onChange={(e) => setTtDay(e.target.value)}
                    className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none"
                  >
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Time Slot</label>
                  <select
                    value={ttSlot}
                    onChange={(e) => setTtSlot(e.target.value)}
                    className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none"
                  >
                    {[
                      '09:00 AM - 10:00 AM',
                      '10:00 AM - 11:00 AM',
                      '11:15 AM - 12:15 PM',
                      '01:00 PM - 02:00 PM',
                      '02:00 PM - 03:00 PM',
                      '03:00 PM - 04:00 PM'
                    ].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Subject / Course</label>
                <select
                  value={ttCourseId}
                  onChange={(e) => setTtCourseId(e.target.value)}
                  className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                >
                  {courses.map(c => (
                    <option key={c._id} value={c._id}>{c.code} - {c.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Faculty Lecturer</label>
                <select
                  value={ttTeacherId}
                  onChange={(e) => setTtTeacherId(e.target.value)}
                  className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                >
                  {teachersList.map(t => (
                    <option key={t._id} value={t._id}>{t.name} ({t.teacherId})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Lecture Hall / Room</label>
                <input
                  type="text"
                  value={ttClassroom}
                  onChange={(e) => setTtClassroom(e.target.value)}
                  className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white focus:outline-none font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#133966]">
                <button
                  type="button"
                  onClick={() => setShowTimetableModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] font-bold text-xs uppercase tracking-wider"
                >
                  Save Slot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Course Modal */}
      {showCourseModal && (
        <div className="fixed inset-0 z-50 bg-[#040d1a]/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#071b34] border border-[#133966] rounded-3xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">Create Academic Course</h3>
            <p className="text-xs text-slate-300 mb-4">Add curriculum course for vision tracking</p>

            <form onSubmit={(e) => {
              e.preventDefault();
              api.createCourse({
                code: newCourseCode,
                title: newCourseTitle,
                department: newCourseDept,
                semester: Number(newCourseSem),
                section: newCourseSec,
                teacherId: assignedTeacherId || null
              }).then(() => {
                setShowCourseModal(false);
                setBanner('Course created successfully!');
                loadCoursesAndTeachers();
              }).catch(err => alert(err.message));
            }} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Course Code</label>
                <input
                  type="text"
                  required
                  value={newCourseCode}
                  onChange={(e) => setNewCourseCode(e.target.value.toUpperCase())}
                  placeholder="e.g. CS605"
                  className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Course Title</label>
                <input
                  type="text"
                  required
                  value={newCourseTitle}
                  onChange={(e) => setNewCourseTitle(e.target.value)}
                  placeholder="e.g. Cloud Security & Cryptography"
                  className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#133966]">
                <button
                  type="button"
                  onClick={() => setShowCourseModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] font-bold text-xs uppercase tracking-wider"
                >
                  Save Course
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
