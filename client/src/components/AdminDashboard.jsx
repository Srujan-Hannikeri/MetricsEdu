import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck, Users, School, GraduationCap, BookOpen,
  BarChart3, CheckCircle2, XCircle, Plus, Sparkles, RefreshCw, Eye,
  Calendar, Clock, LayoutGrid, UserPlus, Lock, Unlock, ArrowRight, Trash2, Edit3,
  FileText, FileSpreadsheet, Download, Camera, UserCheck, ChevronRight, Settings,
  Building2, Layers, Tag, AlertTriangle, Megaphone, Award
} from 'lucide-react';
import { api } from '../services/api';
import TimetableTable from './TimetableTable';
import FacultyTrackerPage from './FacultyTrackerPage';
import AcademicHub from './AcademicHub';
import MarksOverviewPage from './MarksOverviewPage';
import { downloadAttendance } from '../utils/exportUtils';

// ─── Constants ────────────────────────────────────────────────────────────────
const COLLEGE_BRANCHES = [
  'Computer Science & Engineering',
  'Computer Science & Engineering (AI & ML)',
  'Computer Science & Engineering (Data Science)',
  'Information Science & Engineering',
  'Electronics & Communication Engineering',
  'Electrical & Electronics Engineering',
  'Mechanical Engineering',
  'Civil Engineering',
  'Chemical Engineering',
  'Biotechnology'
];
const COLLEGE_SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];
const SCHOOL_STANDARDS = [
  '1st Std', '2nd Std', '3rd Std', '4th Std', '5th Std',
  '6th Std', '7th Std', '8th Std', '9th Std', '10th Std',
  '11th Std (PUC-I)', '12th Std (PUC-II)'
];
const DIVISIONS = ['A', 'B', 'C', 'D', 'E', 'F'];
const TIME_SLOTS = [
  '08:30 AM - 09:25 AM', '09:25 AM - 10:20 AM', '10:50 AM - 11:45 AM',
  '11:45 AM - 12:40 PM', '01:30 PM - 03:30 PM'
];

function getCourseIdentity(course) {
  const sectionMatch = String(course.title || '').match(/^(.*?)(?:\s*-\s*|\s+)Section\s+([A-F])$/i);
  const division = sectionMatch?.[2]?.toUpperCase();
  const code = String(course.code || '');
  const hasDivisionCode = division && code.toUpperCase().endsWith(division);
  return {
    code: hasDivisionCode ? code.replace(new RegExp(`[-_ ]?${division}$`, 'i'), '') : code,
    title: sectionMatch ? sectionMatch[1].trim() : course.title,
    division: String(course.division || course.section || division || '').toUpperCase()
  };
}

function getCourseGroups(courses) {
  const groups = new Map();
  for (const course of courses) {
    const identity = getCourseIdentity(course);
    const key = [
      course.branch, course.semester, course.standard, course.pucYear, course.pucDept,
      identity.code.toUpperCase(), identity.title.toLowerCase(), identity.division
    ].join('|');
    const group = groups.get(key) || { ...identity, courses: [] };
    group.courses.push(course);
    groups.set(key, group);
  }
  return Array.from(groups.values());
}

function getSemesterSubjectGroups(subjects) {
  const groups = new Map();
  for (const subject of subjects) {
    const identity = getCourseIdentity(subject);
    const key = `${identity.code.toUpperCase()}|${identity.division}`;
    const group = groups.get(key) || { ...identity, subjects: [] };
    group.subjects.push({ ...subject, division: identity.division });
    groups.set(key, group);
  }
  return Array.from(groups.values());
}

export default function AdminDashboard({ user }) {
  const [activePage, setActivePage] = useState('overview');
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [banner, setBanner] = useState({ type: '', msg: '' });
  const showBanner = (msg, type = 'success') => { setBanner({ msg, type }); setTimeout(() => setBanner({ type: '', msg: '' }), 6000); };

  // ── Institution mode — locked to admin's registered type, never toggleable ─
  // Treat legacy 'college' as 'institute'
  const rawMode = user?.institutionType || 'institute';
  const institutionMode = rawMode === 'college' ? 'institute' : rawMode;

  // Derived: which branches/semesters to show per institution type
  const isInstitute = institutionMode === 'institute';
  const isDiploma   = institutionMode === 'diploma';
  const isSchool    = institutionMode === 'school';
  const isPUC       = institutionMode === 'pu_college';
  const hasBranchSem = isInstitute || isDiploma;

  const ACTIVE_BRANCHES = isDiploma ? [
    'Computer Science & Engineering',
    'Information Science & Engineering',
    'Electronics & Communication Engineering',
    'Electrical & Electronics Engineering',
    'Mechanical Engineering',
    'Civil Engineering'
  ] : COLLEGE_BRANCHES;

  const ACTIVE_SEMESTERS = isDiploma ? [1,2,3,4,5,6] : COLLEGE_SEMESTERS;
  const SCHOOL_STDS = ['1st Std','2nd Std','3rd Std','4th Std','5th Std',
                       '6th Std','7th Std','8th Std','9th Std','10th Std'];
  const PUC_YEARS = ['1st PUC','2nd PUC'];
  const PUC_DEPTS_LIST = ['Science','Arts','Commerce'];

  // ── Hierarchy selection ────────────────────────────────────────────────────
  const [selectedBranch, setSelectedBranch] = useState(ACTIVE_BRANCHES[0]);
  const [selectedSemester, setSelectedSemester] = useState(isDiploma ? 1 : isInstitute ? 5 : 1);
  const [selectedStandard, setSelectedStandard] = useState('10th Std');
  const [selectedPucYear, setSelectedPucYear] = useState('1st PUC');
  const [selectedPucDept, setSelectedPucDept] = useState('Science');
  const [selectedDivisions, setSelectedDivisions] = useState(['A', 'B', 'C']);
  const [selectedSubjectDivision, setSelectedSubjectDivision] = useState('A');
  const [selectedTimetableDiv, setSelectedTimetableDiv] = useState('A');
  const [selectedCourseDivision, setSelectedCourseDivision] = useState('A');

  // ── Semester config state ─────────────────────────────────────────────────
  const [semesterConfigs, setSemesterConfigs] = useState([]);
  const [activeSemConfig, setActiveSemConfig] = useState(null);
  const [semConfigForm, setSemConfigForm] = useState({ startDate: '', endDate: '', academicYear: '', pucYear: '1st PUC', pucDept: 'Science' });
  const [showSemForm, setShowSemForm] = useState(false);
  const [savingSem, setSavingSem] = useState(false);

  // ── Subject management state ──────────────────────────────────────────────
  const [subjectForm, setSubjectForm] = useState({ code: '', title: '', semesterHours: 60, teacherId: '' });
  const [savingSubject, setSavingSubject] = useState(false);

  // ── Timetable state ───────────────────────────────────────────────────────
  const [timetables, setTimetables] = useState([]);
  const [loadingTimetable, setLoadingTimetable] = useState(false);
  const [generatingTimetable, setGeneratingTimetable] = useState(false);
  const [showTimetableModal, setShowTimetableModal] = useState(false);
  const [ttDay, setTtDay] = useState('Monday');
  const [ttSlot, setTtSlot] = useState(TIME_SLOTS[0]);
  const [ttCourseId, setTtCourseId] = useState('');
  const [ttTeacherId, setTtTeacherId] = useState('');
  const [ttClassroom, setTtClassroom] = useState('Class Room: AS-11');

  // ── Division allocator state ──────────────────────────────────────────────
  const [allocatorSemester, setAllocatorSemester] = useState(5);
  const [allocatorStandard, setAllocatorStandard] = useState('10th Std');
  const [availableDivisions, setAvailableDivisions] = useState(['A', 'B', 'C', 'D']);
  const [newDivName, setNewDivName] = useState('');
  const [studentsList, setStudentsList] = useState([]);
  const [divisionFilter, setDivisionFilter] = useState('ALL');
  const [allocatorBranch, setAllocatorBranch] = useState(ACTIVE_BRANCHES[0]);
  const [isEditingDivisions, setIsEditingDivisions] = useState(false);
  const [divisionChanges, setDivisionChanges] = useState({});
  const [savingDivisions, setSavingDivisions] = useState(false);

  // ── Users / Students state ─────────────────────────────────────────────────
  const [users, setUsers] = useState([]);
  const [roleFilter, setRoleFilter] = useState('student');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [debouncedUserSearch, setDebouncedUserSearch] = useState('');
  const [usersBranch, setUsersBranch] = useState('');
  const [usersSemester, setUsersSemester] = useState('');
  const [usersDivision, setUsersDivision] = useState('');
  const [usersStandard, setUsersStandard] = useState('');
  const [usersPucYear, setUsersPucYear] = useState('');
  const [usersPucDept, setUsersPucDept] = useState('');
  const [usersPage, setUsersPage] = useState(1);
  const [usersPagination, setUsersPagination] = useState({ total: 0, totalPages: 0 });
  const usersRequestId = useRef(0);

  // ── Courses & Teachers state ──────────────────────────────────────────────
  const [courses, setCourses] = useState([]);
  const [teachersList, setTeachersList] = useState([]);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [newCourseCode, setNewCourseCode] = useState('');
  const [newCourseTitle, setNewCourseTitle] = useState('');
  const [newCourseSem, setNewCourseSem] = useState(5);
  const [assignedTeacherId, setAssignedTeacherId] = useState('');

  // ── Audit modal ───────────────────────────────────────────────────────────
  const [previewAuditModal, setPreviewAuditModal] = useState(null);

  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => { loadStats(); loadCoursesAndTeachers(); }, []);

  const loadStats = async () => {
    setLoadingStats(true);
    try { const d = await api.getAdminStats(); setStats(d.stats); }
    catch (e) { console.error(e); }
    finally { setLoadingStats(false); }
  };

  const loadCoursesAndTeachers = async () => {
    try {
      const courseParams = {};
      if (hasBranchSem) { courseParams.branch = selectedBranch; courseParams.semester = selectedSemester; }
      if (isSchool) courseParams.standard = selectedStandard;
      if (isPUC) { courseParams.pucYear = selectedPucYear; courseParams.pucDept = selectedPucDept; }
      const teacherParams = {};
      if (hasBranchSem) teacherParams.branch = selectedBranch;
      if (isPUC) teacherParams.pucDept = selectedPucDept;
      const [cData, uData] = await Promise.all([
        api.getCourses({ ...courseParams, institutionType: institutionMode }),
        api.getUsers('teacher', teacherParams)
      ]);
      setCourses(cData.courses || []);
      setTeachersList(uData.users || []);
      if (cData.courses?.length > 0) setTtCourseId(cData.courses[0]._id);
      if (uData.users?.length > 0) setTtTeacherId(uData.users[0]._id);
    } catch (e) { console.error(e); }
  };

  // ── Reload courses whenever branch/sem changes ────────────────────────────
  useEffect(() => {
    loadCoursesAndTeachers();
  }, [selectedBranch, selectedSemester, selectedStandard, selectedPucYear, selectedPucDept]);

  // ── Semester config loader ────────────────────────────────────────────────
  // allBranchConfigs: ALL semester configs for the selected branch (to show scheduled indicators)
  const [allBranchConfigs, setAllBranchConfigs] = useState([]);

  const loadSemesterConfigs = async () => {
    try {
      // Load ALL configs for selected branch (to show scheduled badges on sem buttons)
      const branchFilter = {};
      if (hasBranchSem) { branchFilter.branch = selectedBranch; }
      else if (isSchool) {} // no extra filter needed — getSemesters already scoped to admin
      else if (isPUC) { branchFilter.pucDept = selectedPucDept; }

      const allData = await api.getSemesters(branchFilter);
      setAllBranchConfigs(allData.semesters || []);

      // Filter for currently selected sem/standard/puc
      const specificFilter = {};
      if (hasBranchSem) { specificFilter.branch = selectedBranch; specificFilter.semesterNumber = selectedSemester; }
      else if (isSchool) { specificFilter.standard = selectedStandard; }
      else if (isPUC)   { specificFilter.pucYear = selectedPucYear; specificFilter.pucDept = selectedPucDept; }

      const d = await api.getSemesters(specificFilter);
      setSemesterConfigs(d.semesters || []);
      const active = (d.semesters || []).find(s => s.isActive) || (d.semesters || [])[0] || null;
      setActiveSemConfig(active);
    } catch (e) { console.error(e); }
  };

  // Helper: is a given semester number already scheduled for current branch?
  const isSemScheduled = (semNum) => {
    return allBranchConfigs.some(c =>
      c.semesterNumber === semNum &&
      c.branch === selectedBranch &&
      c.subjects?.length > 0
    );
  };

  // Helper: get the config for a specific semNum (for the current branch)
  const getConfigForSem = (semNum) => {
    return allBranchConfigs.find(c =>
      c.semesterNumber === semNum && c.branch === selectedBranch
    ) || null;
  };

  useEffect(() => {
    if (activePage === 'timetable' || activePage === 'schedule-setup') {
      loadSemesterConfigs();
      loadTimetable(selectedTimetableDiv);
    }
  }, [activePage, selectedBranch, selectedSemester, selectedStandard, selectedPucYear, selectedPucDept, institutionMode]);

  const loadTimetable = async (div) => {
    setLoadingTimetable(true);
    try {
      // Always pass semester + branch so query is scoped correctly
      const semParam   = hasBranchSem ? selectedSemester : null;
      const branchParam = hasBranchSem ? selectedBranch : null;
      const stdParam   = isSchool ? selectedStandard : null;

      const d = await api.getTimetables(
        div, semParam, null, branchParam, stdParam, institutionMode,
        isPUC ? selectedPucYear : null,
        isPUC ? selectedPucDept : null
      );
      setTimetables(d.slots || []);
    } catch (e) { console.error('loadTimetable error:', e); }
    finally { setLoadingTimetable(false); }
  };

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedUserSearch(userSearch.trim()), 300);
    return () => clearTimeout(timeout);
  }, [userSearch]);

  useEffect(() => {
    if (activePage === 'users') loadUsers();
  }, [activePage, roleFilter, usersBranch, usersSemester, usersDivision, usersStandard, usersPucYear, usersPucDept, usersPage, debouncedUserSearch]);

  const loadUsers = async () => {
    const requestId = ++usersRequestId.current;
    setLoadingUsers(true);
    try {
      const params = {};
      if (hasBranchSem && usersBranch) params.branch = usersBranch;
      if (isPUC && usersPucDept) params.pucDept = usersPucDept;
      if (roleFilter === 'student') {
        if (hasBranchSem && usersSemester) params.semester = usersSemester;
        if (isSchool && usersStandard) params.standard = usersStandard;
        if (isPUC && usersPucYear) params.pucYear = usersPucYear;
        if (usersDivision) params.division = usersDivision;
      }
      params.page = usersPage;
      params.limit = 50;
      if (debouncedUserSearch) params.search = debouncedUserSearch;
      const d = await api.getUsers(roleFilter || 'student', params);
      if (requestId !== usersRequestId.current) return;
      setUsers(d.users || []);
      setUsersPagination(d.pagination || { total: (d.users || []).length, totalPages: 1 });
    } catch (e) {
      if (requestId === usersRequestId.current) console.error(e);
    } finally {
      if (requestId === usersRequestId.current) setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (activePage === 'divisions') loadStudentsForDivisions();
  }, [activePage, allocatorSemester, allocatorBranch, allocatorStandard, selectedPucYear, selectedPucDept]);

  const loadStudentsForDivisions = async () => {
    try {
      const params = {};
      if (hasBranchSem) { params.branch = allocatorBranch; params.semester = allocatorSemester; }
      if (isSchool) params.standard = allocatorStandard;
      if (isPUC) { params.pucYear = selectedPucYear; params.pucDept = selectedPucDept; }

      const d = await api.getUsers('student', params);
      setStudentsList(d.users || []);
      const map = {};
      const divSet = new Set(availableDivisions);
      (d.users || []).forEach(s => { const div = s.division || 'A'; map[s._id] = div; divSet.add(div); });
      setDivisionChanges(map);
      setAvailableDivisions(Array.from(divSet).sort());
    } catch (e) { console.error(e); }
  };

  // ─── Semester config actions ───────────────────────────────────────────────
  const handleCreateSemester = async (e) => {
    e.preventDefault();
    setSavingSem(true);
    try {
      // Build payload based on admin's institution type
      const payload = {
        startDate: semConfigForm.startDate,
        endDate: semConfigForm.endDate,
        academicYear: semConfigForm.academicYear,
        ...(hasBranchSem ? { branch: selectedBranch, semesterNumber: selectedSemester } : {}),
        ...(isSchool ? { standard: selectedStandard } : {}),
        ...(isPUC ? { pucYear: selectedPucYear, pucDept: selectedPucDept } : {})
      };
      const d = await api.createSemester(payload);
      showBanner(`Semester configured for ${semConfigForm.academicYear || 'academic year'}`);
      setShowSemForm(false);
      setSemConfigForm({ startDate: '', endDate: '', academicYear: '', pucYear: '1st PUC', pucDept: 'Science' });
      loadSemesterConfigs();
    } catch (e) { showBanner(e.message, 'error'); }
    finally { setSavingSem(false); }
  };

  const handleDeleteSemester = async (id) => {
    if (!confirm('Delete this semester configuration?')) return;
    try { await api.deleteSemester(id); loadSemesterConfigs(); showBanner('Semester config deleted.'); }
    catch (e) { showBanner(e.message, 'error'); }
  };

  const handleLockSemester = async (id) => {
    if (!confirm('Lock this semester? No further edits will be allowed until you unlock it.')) return;
    try {
      const d = await api.lockSemester(id);
      showBanner(d.message);
      loadSemesterConfigs();
    } catch (e) { showBanner(e.message, 'error'); }
  };

  const handleUnlockSemester = async (id) => {
    try {
      const d = await api.unlockSemester(id);
      showBanner(d.message);
      loadSemesterConfigs();
    } catch (e) { showBanner(e.message, 'error'); }
  };

  // ─── Subject actions ──────────────────────────────────────────────────────
  const handleAddSubject = async (e) => {
    e.preventDefault();
    if (!activeSemConfig) { showBanner('Create a semester configuration first.', 'error'); return; }
    if (!subjectForm.code || !subjectForm.title) { showBanner('Subject code and title are required.', 'error'); return; }
    setSavingSubject(true);
    try {
      const d = await api.addSubjectsToSemester(activeSemConfig._id, [{
        code: subjectForm.code,
        title: subjectForm.title,
        semesterHours: Number(subjectForm.semesterHours) || 60,
        division: selectedSubjectDivision,
        teacherId: subjectForm.teacherId || null
      }]);
      showBanner(`Subject "${subjectForm.title}" added.`);
      setSubjectForm({ code: '', title: '', semesterHours: 60, teacherId: '' });
      loadSemesterConfigs();
    } catch (e) { showBanner(e.message, 'error'); }
    finally { setSavingSubject(false); }
  };

  const handleRemoveSubject = async (code) => {
    if (!activeSemConfig) return;
    if (!confirm(`Remove subject ${code}?`)) return;
    try {
      await api.removeSubjectFromSemester(activeSemConfig._id, code, selectedSubjectDivision);
      showBanner(`Subject ${code} removed.`);
      loadSemesterConfigs();
    } catch (e) { showBanner(e.message, 'error'); }
  };

  const handleAssignSubjectTeacher = async (subjectCode, teacherId) => {
    if (!activeSemConfig) return;
    try {
      const matchingSubjects = activeSemConfig.subjects.filter(s =>
        getCourseIdentity(s).code.toUpperCase() === subjectCode.toUpperCase() &&
        String(s.division || getCourseIdentity(s).division).toUpperCase() === selectedSubjectDivision
      );
      const sub = matchingSubjects[0] || activeSemConfig.subjects.find(s =>
        getCourseIdentity(s).code.toUpperCase() === subjectCode.toUpperCase() &&
        !getCourseIdentity(s).division
      );
      if (!sub) return;
      await api.addSubjectsToSemester(activeSemConfig._id, [{
        code: getCourseIdentity(sub).code, title: getCourseIdentity(sub).title, semesterHours: sub.semesterHours,
        weeklyHours: sub.weeklyHours, division: selectedSubjectDivision, teacherId: teacherId || null, replaceTeacher: true
      }]);
      showBanner(`Teacher assigned to ${subjectCode}.`);
      loadSemesterConfigs();
    } catch (e) { showBanner(e.message, 'error'); }
  };

  // ─── Timetable auto-generate ──────────────────────────────────────────────
  const handleAutoGenerateTimetable = async () => {
    if (selectedDivisions.length === 0) { showBanner('Select at least one division.', 'error'); return; }
    if (!activeSemConfig) { showBanner('Please set up the semester dates and add subjects first.', 'error'); return; }
    const divLabel = selectedDivisions.join(', ');
    if (!confirm(`Generate timetable for Division(s) ${divLabel}?\n\nThis will replace existing schedules for these divisions.\n\nConstraints enforced:\n• 1 teacher = 1 subject per semester\n• No teacher double-booking\n• ≥15 min teacher break between classes\n• No classroom conflicts`)) return;
    setGeneratingTimetable(true);
    try {
      const payload = {
        divisions: selectedDivisions,
        semesterId: activeSemConfig?._id,
        institutionType: institutionMode,
        ...(hasBranchSem ? { semester: selectedSemester, branch: selectedBranch } : {}),
        ...(isSchool ? { standard: selectedStandard } : {}),
        ...(isPUC ? { pucYear: selectedPucYear, pucDept: selectedPucDept } : {})
      };
      const res = await api.autoGenerateTimetable(payload);
      showBanner(
        res.warnings?.length ? `${res.message} ${res.warnings.join(' ')}` : res.message,
        res.warnings?.length ? 'error' : 'success'
      );
      loadTimetable(selectedTimetableDiv);
      loadStats();
    } catch (e) { showBanner(e.message, 'error'); }
    finally { setGeneratingTimetable(false); }
  };

  const handleUpdateOrAddSlot = async (slotData) => {
    try {
      const cohortFields = {
        institutionType: institutionMode,
        ...(hasBranchSem ? { semester: selectedSemester, branch: selectedBranch } : {}),
        ...(isSchool ? { standard: selectedStandard } : {}),
        ...(isPUC ? { pucYear: selectedPucYear, pucDept: selectedPucDept } : {})
      };
      if (slotData.isNew) {
        await api.createTimetableEntry({
          day: slotData.day, timeSlot: slotData.timeSlot,
          courseId: slotData.courseId, teacherId: slotData.teacherId,
          division: slotData.division || selectedTimetableDiv,
          classroom: slotData.classroom || 'Class Room: AS-11',
          ...cohortFields
        });
        showBanner(`Slot added: ${slotData.day} ${slotData.timeSlot}`);
      } else {
        await api.updateTimetableEntry(slotData.slotId, { ...slotData, ...cohortFields });
        showBanner(`Slot updated: ${slotData.day} ${slotData.timeSlot}`);
      }
      loadTimetable(selectedTimetableDiv);
    } catch (e) { showBanner(e.message, 'error'); }
  };

  const handleDeleteTimetableSlot = async (id) => {
    if (!confirm('Delete this timetable slot?')) return;
    try { await api.deleteTimetableEntry(id); loadTimetable(selectedTimetableDiv); }
    catch (e) { showBanner(e.message, 'error'); }
  };

  const handleCreateTimetableSlot = async (e) => {
    e.preventDefault();
    try {
      await api.createTimetableEntry({
        day: ttDay, timeSlot: ttSlot, courseId: ttCourseId, teacherId: ttTeacherId,
        division: selectedTimetableDiv, classroom: ttClassroom,
        institutionType: institutionMode,
        ...(hasBranchSem ? { semester: selectedSemester, branch: selectedBranch } : {}),
        ...(isSchool ? { standard: selectedStandard } : {}),
        ...(isPUC ? { pucYear: selectedPucYear, pucDept: selectedPucDept } : {})
      });
      setShowTimetableModal(false);
      showBanner(`Slot added: ${ttDay} ${ttSlot}`);
      loadTimetable(selectedTimetableDiv);
    } catch (e) { showBanner(e.message, 'error'); }
  };

  // ─── Division allocation ──────────────────────────────────────────────────
  const handleAutoAllocateDivisions = async () => {
    const label = hasBranchSem ? `${allocatorBranch} Sem ${allocatorSemester}` : isSchool ? allocatorStandard : `${selectedPucYear} ${selectedPucDept}`;
    if (!availableDivisions.length) { showBanner('Select at least one division.', 'error'); return; }
    if (!confirm(`Split students of ${label} as evenly as possible across ${availableDivisions.join(', ')}?`)) return;
    try {
      const res = await api.allocateDivisions({
        mode: 'auto',
        semester: hasBranchSem ? allocatorSemester : undefined,
        branch: hasBranchSem ? allocatorBranch : undefined,
        standard: isSchool ? allocatorStandard : undefined,
        institutionType: institutionMode,
        divisionsList: availableDivisions,
        pucYear: isPUC ? selectedPucYear : undefined,
        pucDept: isPUC ? selectedPucDept : undefined
      });
      showBanner(res.message);
      loadStudentsForDivisions();
    } catch (e) { showBanner(e.message, 'error'); }
  };

  const handleSaveManualDivisions = async () => {
    setSavingDivisions(true);
    try {
      const allocations = Object.entries(divisionChanges).map(([studentId, division]) => ({ studentId, division }));
      const res = await api.allocateDivisions({ mode: 'manual', allocations });
      showBanner(res.message);
      setIsEditingDivisions(false);
      loadStudentsForDivisions();
    } catch (e) { showBanner(e.message, 'error'); }
    finally { setSavingDivisions(false); }
  };

  const handleAssignTeacher = async (courseId, teacherId) => {
    try {
      const res = await api.assignTeacherToCourse(courseId, teacherId);
      showBanner(res.message);
      loadCoursesAndTeachers();
    } catch (e) { showBanner(e.message, 'error'); }
  };

  const getAvailableTeachers = (division, subjectCode = '') => {
    const targetCode = String(subjectCode).trim().toUpperCase();
    const targetDivision = String(division || '').toUpperCase();
    const unavailable = new Set();
    const markBusy = (teacherValue, itemCode, itemDivision) => {
      const teacherId = String(teacherValue?._id || teacherValue || '');
      const assignedDivision = String(itemDivision || '').toUpperCase();
      if (!teacherId || (assignedDivision && assignedDivision !== targetDivision) ||
          (targetCode && String(itemCode || '').toUpperCase() === targetCode)) return;
      unavailable.add(teacherId);
    };

    courses.forEach(course => {
      const identity = getCourseIdentity(course);
      markBusy(course.teacher, identity.code, identity.division);
    });
    (activeSemConfig?.subjects || []).forEach(subject => {
      const identity = getCourseIdentity(subject);
      markBusy(subject.teacher, identity.code, subject.division || identity.division);
    });
    return teachersList.filter(teacher => !unavailable.has(String(teacher._id)));
  };

  const handleToggleStatus = async (userId) => {
    try { const d = await api.toggleUserStatus(userId); showBanner(d.message); loadUsers(roleFilter); }
    catch (e) { showBanner(e.message, 'error'); }
  };

  // ── Filtered students ─────────────────────────────────────────────────────
  const filteredStudents = divisionFilter === 'ALL'
    ? studentsList
    : studentsList.filter(s => (s.division || s.section || 'A') === divisionFilter);
  const allCourseGroups = getCourseGroups(courses);
  const explicitlyConfiguredCourseCodes = new Set(allCourseGroups
    .filter(group => group.division === selectedCourseDivision)
    .map(group => group.code.toUpperCase()));
  const courseGroups = allCourseGroups.filter(group =>
    group.division === selectedCourseDivision ||
    (!group.division && !explicitlyConfiguredCourseCodes.has(group.code.toUpperCase()))
  );
  const timetableCoursesForDivision = courses.filter(course =>
    String(course.section || '').toUpperCase() === selectedTimetableDiv
  );
  const timetableCourses = timetableCoursesForDivision.length
    ? timetableCoursesForDivision
    : courses.filter(course => !course.section);
  const allSemesterSubjectGroups = getSemesterSubjectGroups(activeSemConfig?.subjects || []);
  const explicitlyConfiguredCodes = new Set(allSemesterSubjectGroups
    .filter(group => group.division === selectedSubjectDivision)
    .map(group => group.code.toUpperCase()));
  const semesterSubjectGroups = allSemesterSubjectGroups.filter(group =>
    group.division === selectedSubjectDivision ||
    (!group.division && !explicitlyConfiguredCodes.has(group.code.toUpperCase()))
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-4 sm:space-y-8">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 px-2.5 rounded-lg bg-rose-500/15 text-rose-400 font-mono text-xs font-bold border border-rose-500/30">INSTITUTION ADMIN</span>
            <span className="text-xs text-slate-400 font-mono">ID: {user?.adminId}</span>
          </div>
          <h1 className="text-xl sm:text-3xl font-extrabold text-white mt-1.5 tracking-tight">MetricsEdu Institutional Management</h1>
          <p className="text-xs sm:text-sm text-cyan-200/70 font-medium">One Connected Platform. One Smart Classroom.</p>
        </div>
        <div className="flex items-center gap-2.5">
          {/* Institution type badge — read-only, locked to admin's registered type */}
          {(() => {
            const badges = {
              institute:  { label: '🏛️ Engineering Institute', cls: 'text-[#38bdf8] border-cyan-500/40 bg-cyan-500/10' },
              diploma:    { label: '📐 Diploma (Polytechnic)', cls: 'text-amber-300 border-amber-500/40 bg-amber-500/10' },
              pu_college: { label: '📚 PU College', cls: 'text-purple-300 border-purple-500/40 bg-purple-500/10' },
              school:     { label: '🏫 School (1–10th Std)', cls: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10' }
            };
            const b = badges[institutionMode] || badges.institute;
            return (
              <span className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${b.cls}`}>{b.label}</span>
            );
          })()}
        </div>
      </div>

      {/* Navigation tabs (Horizontally Scrollable on Mobile) */}
      <div className="w-full overflow-x-auto no-scrollbar rounded-2xl border border-[#133966] bg-[#071b34] p-1.5 shadow-md touch-scroll">
        <div className="flex w-max min-w-full items-center gap-1.5">
        {[
          { id: 'overview', label: 'Overview', icon: BarChart3 },
          { id: 'schedule-setup', label: 'Schedule Setup', icon: Settings },
          { id: 'timetable', label: 'Timetable', icon: Calendar },
          { id: 'divisions', label: 'Divisions', icon: Users },
          { id: 'faculty-tracker', label: 'Faculty Tracker', icon: UserCheck },
          { id: 'courses', label: 'Courses', icon: BookOpen },
          { id: 'calendar', label: 'Academic Calendar', icon: Calendar },
          { id: 'announcements', label: 'Announcements', icon: Megaphone },
          { id: 'users', label: 'Students', icon: GraduationCap },
          { id: 'marks', label: 'Student Marks', icon: Award },
          { id: 'attendance', label: 'Attendance Audit', icon: ShieldCheck }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activePage === tab.id;
          return (
            <button key={tab.id} onClick={() => { setActivePage(tab.id); setBanner({ type: '', msg: '' }); }}
              className={`whitespace-nowrap shrink-0 flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-bold transition-all ${isActive
                ? 'bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] shadow-md'
                : 'text-slate-300 hover:text-white hover:bg-[#0b2444]'}`}>
              <Icon className="w-4 h-4" />{tab.label}
            </button>
          );
        })}
        </div>
      </div>

      {/* Banner */}
      {banner.msg && (
        <div className={`p-4 rounded-2xl border text-xs sm:text-sm flex items-center justify-between shadow-lg ${banner.type === 'error'
          ? 'bg-red-500/15 border-red-500/40 text-red-300'
          : 'bg-[#00a896]/15 border-[#00a896]/40 text-[#67e8f9]'}`}>
          <div className="flex items-center gap-2">
            {banner.type === 'error' ? <AlertTriangle className="w-4 h-4 text-red-400" /> : <CheckCircle2 className="w-4 h-4 text-[#00C49F]" />}
            <span>{banner.msg}</span>
          </div>
          <button onClick={() => setBanner({ type: '', msg: '' })} className="text-xs font-mono opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      {/* ====================================================================
          PAGE: OVERVIEW
      ==================================================================== */}
      {activePage === 'overview' && (
        <div className="space-y-6 sm:space-y-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {[
              { label: 'Total Students', value: stats?.totalStudents ?? 60, sub: `${stats?.faceRegistrationRate ?? 100}% Biometrics`, icon: GraduationCap, color: 'text-[#38bdf8]', page: 'users' },
              { label: 'Faculty', value: stats?.totalTeachers ?? 8, sub: 'Assigned to Subjects', icon: School, color: 'text-[#00C49F]', page: 'teachers' },
              { label: 'Timetable Slots', value: stats?.totalTimetableSlots ?? 0, sub: 'All Divisions', icon: Calendar, color: 'text-amber-400', page: 'timetable' },
              { label: 'Avg Attendance', value: `${stats?.avgAttendance ?? 0}%`, sub: 'Institutional Average', icon: BarChart3, color: 'text-[#00C49F]', page: 'attendance' }
            ].map(card => {
              const Icon = card.icon;
              return (
                <div key={card.label} onClick={() => setActivePage(card.page)}
                  className="bg-[#071b34]/95 border border-[#133966] hover:border-[#00C49F] rounded-xl sm:rounded-2xl p-3.5 sm:p-5 shadow-lg cursor-pointer group transition-all">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-[10px] sm:text-xs uppercase font-bold tracking-wider group-hover:text-[#00C49F] truncate mr-1">{card.label}</span>
                    <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${card.color} shrink-0`} />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black font-mono text-white mt-1 sm:mt-2 group-hover:text-[#00C49F]">{card.value}</div>
                  <div className="text-[10px] sm:text-[11px] text-[#00C49F] mt-1.5 sm:mt-2 font-mono flex items-center justify-between">
                    <span className="truncate">{card.sub}</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform shrink-0 ml-1" />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-6">
            {[
              { page: 'schedule-setup', icon: Settings, color: 'text-[#00C49F]', title: 'Schedule Setup Wizard', desc: 'Step 1: Set semester dates → Step 2: Add subjects → Step 3: Auto-generate timetable for all divisions.' },
              { page: 'divisions', icon: Users, color: 'text-[#38bdf8]', title: 'Student Division Allocator', desc: 'Auto-split students into Div A, B, C by class strength. Manual overrides anytime.' },
              { page: 'faculty-tracker', icon: School, color: 'text-amber-400', title: 'Faculty Location Tracker', desc: 'See every teacher in real time — whether in class or in cabin, which subject, division, branch and semester.' }
            ].map(c => {
              const Icon = c.icon;
              return (
                <div key={c.page} onClick={() => setActivePage(c.page)}
                  className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-[#071b34] to-[#0b2444] border border-[#133966] hover:border-[#00C49F] cursor-pointer shadow-xl transition-all">
                  <Icon className={`w-6 h-6 sm:w-8 sm:h-8 ${c.color} mb-2 sm:mb-3`} />
                  <h3 className="text-sm sm:text-base font-bold text-white">{c.title}</h3>
                  <p className="text-xs text-slate-300 mt-1">{c.desc}</p>
                </div>
              );
            })}
          </div>

          {/* Recent Sessions */}
          {stats?.recentSessions?.length > 0 && (
            <div className="bg-[#071b34]/95 border border-[#133966] rounded-3xl p-6 shadow-xl">
              <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Clock className="w-4 h-4 text-[#00C49F]" /> Recent Attendance Sessions</h2>
              <div className="space-y-2">
                {stats.recentSessions.slice(0, 5).map(s => (
                  <div key={s._id} className="flex items-center justify-between p-3 rounded-xl bg-[#040d1a] border border-[#133966]">
                    <div>
                      <span className="text-xs font-bold text-white">{s.course?.code} — {s.teacher?.name}</span>
                      <div className="text-[11px] text-slate-400">{new Date(s.sessionDate).toLocaleDateString()} · {s.timeSlot}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-[#00C49F]">{s.attendancePercentage}%</div>
                      <div className="text-[10px] text-slate-400">{s.totalPresent}/{s.totalEnrolled} present</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <AcademicHub user={user} adminCohort={{
            branch: hasBranchSem ? selectedBranch : '',
            semester: hasBranchSem ? selectedSemester : null,
            standard: isSchool ? selectedStandard : '',
            pucYear: isPUC ? selectedPucYear : '',
            pucDept: isPUC ? selectedPucDept : ''
          }} page="calendar" />
        </div>
      )}

      {/* ====================================================================
          PAGE: SCHEDULE SETUP WIZARD
          Hierarchy: Branch → Sem → Date config → Add Subjects → Generate
      ==================================================================== */}
      {activePage === 'schedule-setup' && (
        <div className="space-y-6">

          {/* Step 0: Hierarchy selector */}
          <div className="bg-[#071b34]/95 border border-[#133966] rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Layers className="w-5 h-5 text-[#00C49F]" />
              <h2 className="text-base font-bold text-white">Step 1 — Select Academic Level</h2>
            </div>
            <p className="text-xs text-slate-400">Choose the branch/standard before setting dates and subjects.</p>

            {/* Institute or Diploma — branch + semester */}
            {hasBranchSem && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Branch / Programme</label>
                  <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}
                    className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#00a896]">
                    {ACTIVE_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Semester ({isDiploma ? '1–6' : '1–8'})</label>
                  <div className="flex flex-wrap gap-2">
                    {ACTIVE_SEMESTERS.map(s => {
                      const scheduled = isSemScheduled(s);
                      const isSelected = selectedSemester === s;
                      return (
                        <button key={s} onClick={() => setSelectedSemester(s)}
                          className={`relative px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                            isSelected
                              ? 'bg-[#00C49F] text-[#040d1a] border-[#00C49F]'
                              : scheduled
                                ? 'border-[#00a896]/60 text-[#00C49F] bg-[#00a896]/10 hover:bg-[#00a896]/20'
                                : 'border-[#133966] text-slate-300 hover:border-[#00C49F] hover:text-white'
                          }`}>
                          Sem {s}
                          {scheduled && !isSelected && (
                            <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-[#00C49F] border-2 border-[#071b34] flex items-center justify-center">
                              <span className="text-[#040d1a] text-[7px] font-black">✓</span>
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-1.5 text-[10px] text-slate-500 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#00C49F] inline-block" />
                    Teal border = already scheduled
                  </div>
                </div>
              </div>
            )}

            {/* School — standard 1st–10th */}
            {isSchool && (
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Standard / Class (1st–10th)</label>
                <div className="flex flex-wrap gap-2">
                  {SCHOOL_STDS.map(std => {
                    const scheduled = allBranchConfigs.some(c => c.standard === std && c.subjects?.length > 0);
                    const isSelected = selectedStandard === std;
                    return (
                      <button key={std} onClick={() => setSelectedStandard(std)}
                        className={`relative px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                          isSelected
                            ? 'bg-[#00C49F] text-[#040d1a] border-[#00C49F]'
                            : scheduled
                              ? 'border-[#00a896]/60 text-[#00C49F] bg-[#00a896]/10'
                              : 'border-[#133966] text-slate-300 hover:border-[#00C49F]'
                        }`}>
                        {std}
                        {scheduled && !isSelected && (
                          <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-[#00C49F] border-2 border-[#071b34] flex items-center justify-center">
                            <span className="text-[#040d1a] text-[7px] font-black">✓</span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* PU College — year + dept */}
            {isPUC && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1.5 block">PUC Year</label>
                  <div className="flex gap-2">
                    {PUC_YEARS.map(y => (
                      <button key={y} onClick={() => setSelectedPucYear(y)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition-all ${selectedPucYear === y
                          ? 'bg-[#00C49F] text-[#040d1a] border-[#00C49F]'
                          : 'border-[#133966] text-slate-300 hover:border-[#00C49F]'}`}>
                        {y}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Department</label>
                  <div className="flex gap-2">
                    {PUC_DEPTS_LIST.map(d => (
                      <button key={d} onClick={() => setSelectedPucDept(d)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition-all ${selectedPucDept === d
                          ? 'bg-[#00C49F] text-[#040d1a] border-[#00C49F]'
                          : 'border-[#133966] text-slate-300 hover:border-[#00C49F]'}`}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="p-3 rounded-xl bg-[#040d1a] border border-[#133966] text-xs text-cyan-200 flex items-center gap-2">
              <ChevronRight className="w-3.5 h-3.5 text-[#00C49F]" />
              Currently configuring:&nbsp;
              <strong className="text-white">
                {hasBranchSem ? `${selectedBranch} — Semester ${selectedSemester}` :
                 isSchool ? selectedStandard :
                 isPUC ? `${selectedPucYear} — ${selectedPucDept}` : ''}
              </strong>
            </div>
          </div>

          {/* Step 2: Semester dates */}
          <div className="bg-[#071b34]/95 border border-[#133966] rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#00C49F]" />
                <h2 className="text-base font-bold text-white">Step 2 — Set Semester Start & End Dates</h2>
              </div>
              {/* Only show "Add Dates" if no config exists yet for this sem */}
              {semesterConfigs.length === 0 && (
                <button onClick={() => setShowSemForm(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#00C49F]/20 text-[#00C49F] border border-[#00C49F]/40 text-xs font-bold hover:bg-[#00C49F]/30 transition-all">
                  <Plus className="w-3.5 h-3.5" /> Add Dates
                </button>
              )}
            </div>

            {/* Add new semester form */}
            {showSemForm && semesterConfigs.length === 0 && (
              <form onSubmit={handleCreateSemester} className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-2xl bg-[#040d1a] border border-[#133966]">
                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Academic Year</label>
                  <input type="text" placeholder="e.g. 2025-26" value={semConfigForm.academicYear}
                    onChange={e => setSemConfigForm(p => ({ ...p, academicYear: e.target.value }))}
                    className="w-full bg-[#071b34] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00a896]" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Start Date *</label>
                  <input type="date" required value={semConfigForm.startDate}
                    onChange={e => setSemConfigForm(p => ({ ...p, startDate: e.target.value }))}
                    className="w-full bg-[#071b34] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00a896]" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1.5 block">End Date *</label>
                  <input type="date" required value={semConfigForm.endDate}
                    onChange={e => setSemConfigForm(p => ({ ...p, endDate: e.target.value }))}
                    className="w-full bg-[#071b34] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00a896]" />
                </div>
                <div className="md:col-span-3 flex gap-3">
                  <button type="submit" disabled={savingSem}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] text-xs font-black disabled:opacity-50">
                    {savingSem ? 'Saving...' : 'Save Semester Dates'}
                  </button>
                  <button type="button" onClick={() => setShowSemForm(false)} className="px-4 py-2 rounded-xl bg-[#0b2444] text-slate-300 text-xs font-bold border border-[#133966]">Cancel</button>
                </div>
              </form>
            )}

            {semesterConfigs.length > 0 ? (
              <div className="space-y-2">
                {semesterConfigs.map(sc => (
                  <div key={sc._id} onClick={() => !sc.isLocked && setActiveSemConfig(sc)}
                    className={`p-4 rounded-2xl border transition-all ${activeSemConfig?._id === sc._id
                      ? 'border-[#00C49F] bg-[#00a896]/10'
                      : sc.isLocked
                        ? 'border-amber-500/40 bg-amber-500/5 cursor-not-allowed'
                        : 'border-[#133966] bg-[#040d1a] hover:border-[#00a896]/50 cursor-pointer'}`}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-white">{sc.academicYear || 'Academic Year TBD'}</span>
                          {sc.isActive && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#00C49F]/20 text-[#00C49F] border border-[#00C49F]/30">ACTIVE</span>}
                          {sc.isLocked
                            ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> LOCKED</span>
                            : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1"><Unlock className="w-2.5 h-2.5" /> UNLOCKED</span>}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          📅 <strong className="text-white">{new Date(sc.startDate).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}</strong>
                          &nbsp;→&nbsp;
                          <strong className="text-white">{new Date(sc.endDate).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}</strong>
                          &nbsp;·&nbsp; {sc.subjects.length} subject{sc.subjects.length !== 1 ? 's' : ''} configured
                        </div>
                        {sc.isLocked && sc.lockedAt && (
                          <div className="text-[10px] text-amber-400 mt-0.5">
                            Locked on {new Date(sc.lockedAt).toLocaleDateString('en-IN')}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {activeSemConfig?._id === sc._id && <CheckCircle2 className="w-4 h-4 text-[#00C49F]" />}
                        {sc.isLocked ? (
                          <button onClick={e => { e.stopPropagation(); handleUnlockSemester(sc._id); }}
                            className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 flex items-center gap-1 transition-all">
                            <Unlock className="w-3 h-3" /> Unlock to Edit
                          </button>
                        ) : (
                          <>
                            <button onClick={e => { e.stopPropagation(); setActiveSemConfig(sc); setShowSemForm(true); setSemConfigForm({ startDate: sc.startDate?.slice(0,10) || '', endDate: sc.endDate?.slice(0,10) || '', academicYear: sc.academicYear || '', pucYear: sc.pucYear || '1st PUC', pucDept: sc.pucDept || 'Science' }); }}
                              className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-[#071b34] text-slate-300 border border-[#133966] hover:border-[#00C49F] hover:text-[#00C49F] flex items-center gap-1 transition-all">
                              <Edit3 className="w-3 h-3" /> Edit Dates
                            </button>
                            <button onClick={e => { e.stopPropagation(); handleLockSemester(sc._id); }}
                              className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-[#00a896]/20 text-[#00C49F] border border-[#00a896]/30 hover:bg-[#00a896]/30 flex items-center gap-1 transition-all">
                              <Lock className="w-3 h-3" /> Save & Lock
                            </button>
                          </>
                        )}
                        <button onClick={e => { e.stopPropagation(); handleDeleteSemester(sc._id); }}
                          disabled={sc.isLocked}
                          className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Inline edit form for dates — shows when Edit Dates is clicked */}
                    {showSemForm && activeSemConfig?._id === sc._id && !sc.isLocked && (
                      <form onSubmit={async (e) => {
                        e.preventDefault();
                        setSavingSem(true);
                        try {
                          await api.updateSemester(sc._id, {
                            startDate: semConfigForm.startDate,
                            endDate: semConfigForm.endDate,
                            academicYear: semConfigForm.academicYear
                          });
                          showBanner('Semester dates updated.');
                          setShowSemForm(false);
                          loadSemesterConfigs();
                        } catch (err) { showBanner(err.message, 'error'); }
                        finally { setSavingSem(false); }
                      }} className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 p-3 rounded-xl bg-[#040d1a] border border-[#133966]" onClick={e => e.stopPropagation()}>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-400 mb-1 block">Academic Year</label>
                          <input type="text" placeholder="e.g. 2025-26" value={semConfigForm.academicYear}
                            onChange={e => setSemConfigForm(p => ({ ...p, academicYear: e.target.value }))}
                            className="w-full bg-[#071b34] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00a896]" />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-400 mb-1 block">Start Date *</label>
                          <input type="date" required value={semConfigForm.startDate}
                            onChange={e => setSemConfigForm(p => ({ ...p, startDate: e.target.value }))}
                            className="w-full bg-[#071b34] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00a896]" />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-400 mb-1 block">End Date *</label>
                          <input type="date" required value={semConfigForm.endDate}
                            onChange={e => setSemConfigForm(p => ({ ...p, endDate: e.target.value }))}
                            className="w-full bg-[#071b34] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00a896]" />
                        </div>
                        <div className="md:col-span-3 flex gap-2">
                          <button type="submit" disabled={savingSem}
                            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] text-xs font-black disabled:opacity-50">
                            {savingSem ? 'Updating...' : 'Update Dates'}
                          </button>
                          <button type="button" onClick={() => setShowSemForm(false)}
                            className="px-4 py-2 rounded-xl bg-[#0b2444] text-slate-300 text-xs font-bold border border-[#133966]">Cancel</button>
                        </div>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-slate-400 text-xs">
                No semester configured yet. Click "Add Dates" to set the semester duration.
              </div>
            )}
          </div>

          {/* Step 3: Add subjects */}
          <div className={`bg-[#071b34]/95 border rounded-3xl p-6 shadow-xl space-y-4 transition-all ${
            !activeSemConfig ? 'border-[#133966]/50 opacity-60 pointer-events-none' :
            activeSemConfig.isLocked ? 'border-amber-500/30' : 'border-[#133966]'
          }`}>
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[#00C49F]" />
              <h2 className="text-base font-bold text-white">Step 3 — Add Subjects & Assign Teachers</h2>
              {!activeSemConfig && <span className="text-xs text-amber-400 ml-2">(complete Step 2 first)</span>}
              {activeSemConfig?.isLocked && (
                <span className="ml-auto flex items-center gap-1 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
                  <Lock className="w-3 h-3" /> Locked — unlock to edit
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Subjects and course codes are semester-wide and shared by the selected divisions; do not add a division to the subject name or code. Enter total teaching hours for the semester. The timetable spreads them across Mon–Sat using 1-hour classes (up to 2 hours when needed).
            </p>

            <div className="rounded-2xl bg-[#040d1a] border border-[#133966] p-4">
              <label className="text-xs font-semibold text-slate-300 mb-2 block">Division group for these subjects</label>
              <div className="flex flex-wrap gap-2">
                {DIVISIONS.map(div => (
                  <button key={div} type="button" onClick={() => {
                    setSelectedDivisions(prev =>
                      prev.includes(div) ? prev.filter(value => value !== div) : [...prev, div]
                    );
                  }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${selectedDivisions.includes(div)
                      ? 'bg-[#00C49F] text-[#040d1a] border-[#00C49F]'
                      : 'border-[#133966] text-slate-300 hover:border-[#00C49F] hover:text-white'}`}>
                    Division {div}
                  </button>
                ))}
              </div>
              <label className="block mt-4 max-w-xs">
                <span className="text-xs font-semibold text-slate-300 mb-1 block">Configure subjects and teachers for division</span>
                <select value={selectedSubjectDivision} onChange={event => setSelectedSubjectDivision(event.target.value)}
                  className="w-full bg-[#071b34] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00a896]">
                  {DIVISIONS.map(div => <option key={div} value={div}>Division {div}</option>)}
                </select>
              </label>
              <div className="text-[10px] text-slate-400 mt-2">
                Teacher assignments are saved only for Division {selectedSubjectDivision}; the subject code and name stay the same across divisions.
              </div>
            </div>

            {/* Add subject form - hidden when locked */}
            {!activeSemConfig?.isLocked && (
            <form onSubmit={handleAddSubject} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-3 sm:p-4 rounded-2xl bg-[#040d1a] border border-[#133966]">
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">Subject Code *</label>
                <input type="text" placeholder="e.g. CS501 (same for every division)" value={subjectForm.code}
                  onChange={e => setSubjectForm(p => ({ ...p, code: e.target.value, teacherId: '' }))}
                  className="w-full bg-[#071b34] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00a896]" />
              </div>
              <div className="sm:col-span-2 lg:col-span-2">
                <label className="text-xs font-semibold text-slate-300 mb-1 block">Subject Title *</label>
                <input type="text" placeholder="e.g. Data Structures" value={subjectForm.title}
                  onChange={e => setSubjectForm(p => ({ ...p, title: e.target.value }))}
                  className="w-full bg-[#071b34] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00a896]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">Hours / Semester</label>
                <input type="number" min="1" max="1000" value={subjectForm.semesterHours}
                  onChange={e => setSubjectForm(p => ({ ...p, semesterHours: e.target.value }))}
                  className="w-full bg-[#071b34] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00a896]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">Assign Teacher</label>
                <select value={subjectForm.teacherId} onChange={e => setSubjectForm(p => ({ ...p, teacherId: e.target.value }))}
                  className="w-full bg-[#071b34] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00a896]">
                  <option value="">— Select —</option>
                  {getAvailableTeachers(selectedSubjectDivision, subjectForm.code).map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                  {getAvailableTeachers(selectedSubjectDivision, subjectForm.code).length === 0 && <option disabled>No available teachers</option>}
                </select>
              </div>
              <div className="sm:col-span-2 lg:col-span-5 flex gap-2">
                <button type="submit" disabled={savingSubject}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] text-xs font-black disabled:opacity-50 flex items-center justify-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> {savingSubject ? 'Adding...' : 'Add Subject'}
                </button>
              </div>
            </form>
            )}

            {/* Subject list */}
            {activeSemConfig && semesterSubjectGroups.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Configured Semester Subjects ({semesterSubjectGroups.length})</h3>
                {semesterSubjectGroups.map(group => {
                  const sub = group.subjects[0];
                  const teacherAssignments = group.subjects.filter(subject => subject.teacher);
                  const uniqueTeachers = [...new Map(teacherAssignments.map(subject => [
                    subject.teacher._id || subject.teacher,
                    subject.teacher
                  ])).values()];
                  return (
                  <div key={group.code} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-[#040d1a] border border-[#133966]">
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                      <span className="px-2 py-0.5 rounded-lg bg-[#00a896]/20 text-[#00C49F] text-[10px] font-mono font-bold border border-[#00a896]/30 shrink-0">{group.code}</span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">{group.title}</div>
                        <div className="text-[10px] text-slate-400">
                          {sub.semesterHours ? `${sub.semesterHours} hrs/semester` : `${sub.weeklyHours} hrs/week (legacy)`}
                          {` · Division ${selectedSubjectDivision}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-2.5 flex-wrap">
                      {uniqueTeachers.length > 0 && (
                        <span className="flex items-center gap-1.5 text-[11px] text-[#00C49F]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {uniqueTeachers[0].name}
                        </span>
                      )}
                      {!activeSemConfig?.isLocked && (
                        <select onChange={e => handleAssignSubjectTeacher(group.code, e.target.value)}
                          value={sub.teacher?._id || sub.teacher || ''}
                          className="bg-[#071b34] border border-amber-500/40 rounded-lg px-2 py-1 text-[10px] text-amber-300 focus:outline-none">
                          <option value="">Unassigned</option>
                          {getAvailableTeachers(selectedSubjectDivision, group.code).map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                          {getAvailableTeachers(selectedSubjectDivision, group.code).length === 0 && <option disabled>No available teachers</option>}
                        </select>
                      )}
                      <button onClick={() => handleRemoveSubject(group.code)}
                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/20 transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            ) : (
              activeSemConfig && <div className="text-center py-4 text-slate-400 text-xs">No subjects yet. Add subjects above.</div>
            )}
          </div>

          {/* Step 4: Select Divisions & Generate */}
          <div className={`bg-[#071b34]/95 border rounded-3xl p-6 shadow-xl space-y-4 transition-all ${activeSemConfig && activeSemConfig.subjects.length > 0 ? 'border-[#133966]' : 'border-[#133966]/50 opacity-60 pointer-events-none'}`}>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#00C49F]" />
              <h2 className="text-base font-bold text-white">Step 4 — Generate Timetable for the Division Group</h2>
            </div>
            <p className="text-xs text-slate-400">
              Subjects are configured once per semester and shared by the divisions selected in Step 3. The generator spreads each subject's semester hours across Monday–Saturday in 1-hour classes, using up to 2 hours when needed.
            </p>

            {/* Summary before generate */}
            <div className="p-4 rounded-2xl bg-[#040d1a] border border-[#133966] space-y-1 text-xs">
              {hasBranchSem && <div className="flex items-center gap-2 text-slate-300"><ChevronRight className="w-3.5 h-3.5 text-[#00C49F]" /> Branch: <span className="text-white font-semibold">{selectedBranch}</span></div>}
              {hasBranchSem && <div className="flex items-center gap-2 text-slate-300"><ChevronRight className="w-3.5 h-3.5 text-[#00C49F]" /> Semester: <span className="text-white font-semibold">{selectedSemester}</span></div>}
              {isSchool && <div className="flex items-center gap-2 text-slate-300"><ChevronRight className="w-3.5 h-3.5 text-[#00C49F]" /> Standard: <span className="text-white font-semibold">{selectedStandard}</span></div>}
              {isPUC && <div className="flex items-center gap-2 text-slate-300"><ChevronRight className="w-3.5 h-3.5 text-[#00C49F]" /> PUC: <span className="text-white font-semibold">{selectedPucYear} — {selectedPucDept}</span></div>}
              <div className="flex items-center gap-2 text-slate-300"><ChevronRight className="w-3.5 h-3.5 text-[#00C49F]" /> Divisions: <span className="text-white font-semibold">{selectedDivisions.join(', ') || 'None selected'}</span></div>
              <div className="flex items-center gap-2 text-slate-300"><ChevronRight className="w-3.5 h-3.5 text-[#00C49F]" /> Subjects: <span className="text-white font-semibold">{semesterSubjectGroups.length} semester subjects added</span></div>
              <div className="flex items-center gap-2 text-slate-300"><ChevronRight className="w-3.5 h-3.5 text-[#00C49F]" /> Date range: <span className="text-white font-semibold">{activeSemConfig ? `${new Date(activeSemConfig.startDate).toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'})} → ${new Date(activeSemConfig.endDate).toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'})}` : 'Not set'}</span></div>
              {activeSemConfig?.isLocked && <div className="flex items-center gap-2 text-amber-300"><ChevronRight className="w-3.5 h-3.5 text-amber-400" /> Status: <span className="font-semibold">🔒 Locked — timetable generation allowed</span></div>}
            </div>

            <button onClick={handleAutoGenerateTimetable} disabled={generatingTimetable || selectedDivisions.length === 0}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg hover:opacity-95 disabled:opacity-50 transition-all">
              {generatingTimetable ? (
                <><div className="w-4 h-4 border-2 border-[#040d1a] border-t-transparent rounded-full animate-spin" /> Generating...</>
              ) : (
                <><Sparkles className="w-5 h-5" /> ⚡ Generate Timetable for Division(s) {selectedDivisions.join(', ')}</>
              )}
            </button>

            <p className="text-[11px] text-slate-500 text-center">
              After generation, view the result in the <strong className="text-slate-300">Timetable</strong> tab.
            </p>
          </div>
        </div>
      )}

      {/* ====================================================================
          PAGE: TIMETABLE VIEWER
      ==================================================================== */}
      {activePage === 'timetable' && (
        <div className="bg-[#071b34]/95 border border-[#133966] rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xl space-y-4 sm:space-y-6">

          {/* Selectors — institution-aware */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            {hasBranchSem && (
              <>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">Branch</label>
                  <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}
                    className="bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00a896] max-w-xs">
                    {ACTIVE_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">Semester</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {ACTIVE_SEMESTERS.map(s => (
                      <button key={s} onClick={() => setSelectedSemester(s)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${selectedSemester === s ? 'bg-[#00C49F] text-[#040d1a] border-[#00C49F]' : 'border-[#133966] text-slate-400 hover:border-[#00C49F]'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
            {isSchool && (
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">Standard</label>
                <select value={selectedStandard} onChange={e => setSelectedStandard(e.target.value)}
                  className="bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00a896]">
                  {SCHOOL_STDS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
            {isPUC && (
              <>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">PUC Year</label>
                  <div className="flex gap-1.5">
                    {PUC_YEARS.map(y => (
                      <button key={y} onClick={() => setSelectedPucYear(y)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${selectedPucYear === y ? 'bg-[#00C49F] text-[#040d1a] border-[#00C49F]' : 'border-[#133966] text-slate-400 hover:border-[#00C49F]'}`}>
                        {y}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">Department</label>
                  <div className="flex gap-1.5">
                    {PUC_DEPTS_LIST.map(d => (
                      <button key={d} onClick={() => setSelectedPucDept(d)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${selectedPucDept === d ? 'bg-[#00C49F] text-[#040d1a] border-[#00C49F]' : 'border-[#133966] text-slate-400 hover:border-[#00C49F]'}`}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Division switcher */}
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">Division</label>
              <div className="flex bg-[#040d1a] p-1 rounded-xl border border-[#133966] gap-0.5 overflow-x-auto max-w-full">
                {DIVISIONS.map(div => (
                  <button key={div} onClick={() => { setSelectedTimetableDiv(div); loadTimetable(div); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedTimetableDiv === div ? 'bg-[#00C49F] text-[#040d1a]' : 'text-slate-400 hover:text-white'}`}>
                    {div}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:ml-auto">
              <button onClick={() => setShowTimetableModal(true)}
                className="flex-1 sm:flex-none justify-center px-3 py-2 rounded-xl bg-[#0b2444] hover:bg-[#133966] text-[#00C49F] border border-[#00a896]/30 text-xs font-bold flex items-center gap-1">
                <Plus className="w-4 h-4" /> Add Slot
              </button>
              <button onClick={() => setActivePage('schedule-setup')}
                className="flex-1 sm:flex-none justify-center px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] font-black text-xs flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Auto-Generate
              </button>
            </div>
          </div>

          {/* Timetable table */}
          {loadingTimetable ? (
            <div className="py-12 text-center text-xs text-slate-400">
              <div className="w-8 h-8 border-2 border-[#00C49F] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              Loading timetable...
            </div>
          ) : timetables.length === 0 ? (
            <div className="py-16 text-center space-y-3 bg-[#040d1a] rounded-2xl border border-[#133966]">
              <Calendar className="w-10 h-10 text-slate-600 mx-auto" />
              <div className="text-sm font-bold text-slate-300">No timetable found</div>
              <div className="text-xs text-slate-500 max-w-sm mx-auto">
                No schedule exists for{hasBranchSem ? ` ${selectedBranch} — Semester ${selectedSemester}` : isSchool ? ` ${selectedStandard}` : ''}, Division {selectedTimetableDiv}.
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button onClick={() => setActivePage('schedule-setup')}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] text-xs font-black flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Go to Schedule Setup
                </button>
                <button onClick={() => loadTimetable(selectedTimetableDiv)}
                  className="px-4 py-2 rounded-xl bg-[#0b2444] text-slate-300 text-xs font-bold border border-[#133966] flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" /> Retry
                </button>
              </div>
            </div>
          ) : (
            <TimetableTable
              division={selectedTimetableDiv}
              semester={selectedSemester}
              standard={selectedStandard}
              institutionType={institutionMode}
              classroom={selectedTimetableDiv === 'A' ? 'Smart Hall LH-301' : selectedTimetableDiv === 'B' ? 'LH-302' : 'Class Room: AS-11'}
              coordinator={selectedTimetableDiv === 'A' ? 'Prof. Pavan K.K' : selectedTimetableDiv === 'B' ? 'Dr. A.A. Quazi' : 'Prof. Nandini C.V'}
              slots={timetables}
              courses={courses}
              teachers={teachersList}
              isAdmin={true}
              semesterSubjects={(() => {
                const subs = activeSemConfig?.subjects || [];
                // Attach date metadata as non-enumerable-like properties on the array
                const arr = [...subs];
                arr.__startDate = activeSemConfig?.startDate;
                arr.__endDate = activeSemConfig?.endDate;
                arr.__academicYear = activeSemConfig?.academicYear;
                return arr;
              })()}
              onUpdateSlot={handleUpdateOrAddSlot}
              onAssignCourseTeacher={async (courseId, teacherId) => {
                try {
                  const res = await api.assignTeacherToCourse(courseId, teacherId);
                  showBanner(res.message);
                  await loadCoursesAndTeachers();
                  await loadTimetable(selectedTimetableDiv);
                } catch (e) { showBanner(e.message, 'error'); }
              }}
            />
          )}

          {/* Manual Add Slot Modal */}
          {showTimetableModal && (
            <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
              <div className="bg-[#071b34] border border-[#133966] rounded-3xl p-6 w-full max-w-md shadow-2xl">
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Plus className="w-4 h-4 text-[#00C49F]" /> Add Timetable Slot</h3>
                <form onSubmit={handleCreateTimetableSlot} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1 block">Day</label>
                      <select value={ttDay} onChange={e => setTtDay(e.target.value)}
                        className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white focus:outline-none">
                        {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(d => <option key={d}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1 block">Time Slot</label>
                      <select value={ttSlot} onChange={e => setTtSlot(e.target.value)}
                        className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white focus:outline-none">
                        {TIME_SLOTS.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300 mb-1 block">Subject</label>
                    <select value={ttCourseId} onChange={e => setTtCourseId(e.target.value)}
                      className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white focus:outline-none">
                      {timetableCourses.map(c => <option key={c._id} value={c._id}>{c.code} — {c.title}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300 mb-1 block">Teacher</label>
                    <select value={ttTeacherId} onChange={e => setTtTeacherId(e.target.value)}
                      className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white focus:outline-none">
                      {getAvailableTeachers(selectedTimetableDiv, courses.find(course => course._id === ttCourseId)?.code).map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                      {getAvailableTeachers(selectedTimetableDiv, courses.find(course => course._id === ttCourseId)?.code).length === 0 && <option disabled>No available teachers</option>}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300 mb-1 block">Classroom</label>
                    <input type="text" value={ttClassroom} onChange={e => setTtClassroom(e.target.value)}
                      className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white focus:outline-none" />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] text-xs font-black">Add Slot</button>
                    <button type="button" onClick={() => setShowTimetableModal(false)} className="flex-1 py-2.5 rounded-xl bg-[#0b2444] text-slate-300 text-xs font-bold border border-[#133966]">Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          PAGE: DIVISION ALLOCATOR
      ==================================================================== */}
      {activePage === 'divisions' && (
        <div className="space-y-6">
          <div className="bg-[#071b34]/95 border border-[#133966] rounded-3xl p-6 shadow-xl space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2"><Users className="w-5 h-5 text-[#00C49F]" /> Student Division Allocator</h2>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-4 p-4 rounded-2xl bg-[#040d1a] border border-[#133966]">
              {/* Branch (institute/diploma) */}
              {hasBranchSem && (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-300 shrink-0">Branch:</label>
                  <select value={allocatorBranch} onChange={e => setAllocatorBranch(e.target.value)}
                    className="bg-[#071b34] border border-[#133966] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#00a896] max-w-[200px]">
                    {ACTIVE_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              )}
              {/* Semester (institute/diploma) */}
              {hasBranchSem && (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-300">Semester:</label>
                  <div className="flex gap-1 flex-wrap">
                    {ACTIVE_SEMESTERS.map(s => (
                      <button key={s} onClick={() => setAllocatorSemester(s)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${allocatorSemester === s ? 'bg-[#00C49F] text-[#040d1a] border-[#00C49F]' : 'border-[#133966] text-slate-400'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Standard (school) */}
              {isSchool && (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-300">Standard:</label>
                  <select value={allocatorStandard} onChange={e => setAllocatorStandard(e.target.value)}
                    className="bg-[#071b34] border border-[#133966] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none">
                    {SCHOOL_STDS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              )}
              {/* PUC Year */}
              {isPUC && (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-300">PUC Year:</label>
                  {PUC_YEARS.map(y => (
                    <button key={y} onClick={() => setSelectedPucYear(y)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${selectedPucYear === y ? 'bg-[#00C49F] text-[#040d1a]' : 'border-[#133966] text-slate-400'}`}>
                      {y}
                    </button>
                  ))}
                </div>
              )}
              {isPUC && (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-300">Department:</label>
                  {PUC_DEPTS_LIST.map(dept => (
                    <button key={dept} onClick={() => setSelectedPucDept(dept)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${selectedPucDept === dept ? 'bg-[#00C49F] text-[#040d1a]' : 'border-[#133966] text-slate-400'}`}>
                      {dept}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-300">Divisions:</label>
                <div className="flex gap-1">
                  {DIVISIONS.map(d => (
                    <button key={d} onClick={() => setAvailableDivisions(prev =>
                      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort()
                    )}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${availableDivisions.includes(d) ? 'bg-[#00C49F] text-[#040d1a] border-[#00C49F]' : 'border-[#133966] text-slate-400'}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ml-auto flex gap-2">
                <button onClick={handleAutoAllocateDivisions}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] text-xs font-black flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Auto Allocate
                </button>
                <button onClick={() => setIsEditingDivisions(v => !v)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${isEditingDivisions ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-[#0b2444] text-slate-300 border-[#133966]'}`}>
                  {isEditingDivisions ? 'Cancel Edit' : 'Manual Edit'}
                </button>
              </div>
            </div>

            {/* Division filter tabs */}
            <div className="flex gap-2 flex-wrap">
              {['ALL', ...availableDivisions].map(d => (
                <button key={d} onClick={() => setDivisionFilter(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${divisionFilter === d ? 'bg-[#00C49F] text-[#040d1a] border-[#00C49F]' : 'border-[#133966] text-slate-400 hover:text-white'}`}>
                  {d === 'ALL' ? `All (${studentsList.length})` : `Div ${d} (${studentsList.filter(s => (s.division || 'A') === d).length})`}
                </button>
              ))}
            </div>

            {/* Students table */}
            <div className="overflow-auto max-h-96 rounded-2xl border border-[#133966] no-scrollbar touch-scroll">
              <table className="w-full text-xs min-w-[550px]">
                <thead className="bg-[#040d1a] text-slate-400 uppercase tracking-wider sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-bold">USN</th>
                    <th className="text-left p-3 font-bold">Name</th>
                    {hasBranchSem && <th className="text-left p-3 font-bold">Branch</th>}
                    {hasBranchSem && <th className="text-left p-3 font-bold">Sem</th>}
                    {isSchool && <th className="text-left p-3 font-bold">Standard</th>}
                    <th className="text-left p-3 font-bold">Division</th>
                    {isEditingDivisions && <th className="text-left p-3 font-bold">Change To</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map(s => (
                    <tr key={s._id} className="border-t border-[#133966] hover:bg-[#0b2444]/30">
                      <td className="p-3 font-mono text-cyan-300">{s.usn || '—'}</td>
                      <td className="p-3 text-white font-medium">{s.name}</td>
                      {hasBranchSem && <td className="p-3 text-slate-400 text-[10px] max-w-[100px] truncate" title={s.branch}>{s.branch?.split(' ').slice(0,2).join(' ') || '—'}</td>}
                      {hasBranchSem && <td className="p-3 text-slate-300">{s.semester || '—'}</td>}
                      {isSchool && <td className="p-3 text-slate-300">{s.standard || '—'}</td>}
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full bg-[#00a896]/20 text-[#00C49F] text-[10px] font-bold border border-[#00a896]/30">
                          Div {divisionChanges[s._id] || s.division || 'A'}
                        </span>
                      </td>
                      {isEditingDivisions && (
                        <td className="p-3">
                          <select value={divisionChanges[s._id] || 'A'}
                            onChange={e => setDivisionChanges(prev => ({ ...prev, [s._id]: e.target.value }))}
                            className="bg-[#071b34] border border-[#133966] rounded-lg px-2 py-1 text-xs text-white focus:outline-none">
                            {availableDivisions.map(d => <option key={d} value={d}>Div {d}</option>)}
                          </select>
                        </td>
                      )}
                    </tr>
                  ))}
                  {filteredStudents.length === 0 && (
                    <tr><td colSpan={8} className="p-8 text-center text-slate-400">No students found. Select branch/semester above.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {isEditingDivisions && (
              <button onClick={handleSaveManualDivisions} disabled={savingDivisions}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] text-xs font-black disabled:opacity-50">
                {savingDivisions ? 'Saving...' : `Save Division Changes (${Object.keys(divisionChanges).length} students)`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
      {/* ====================================================================
          PAGE: FACULTY TRACKER (replaces old Teachers & Courses assign page)
      ==================================================================== */}
      {activePage === 'faculty-tracker' && <FacultyTrackerPage api={api} teachersList={teachersList} />}

      {/* ====================================================================
          PAGE: COURSES MANAGEMENT
      ==================================================================== */}
      {activePage === 'courses' && (
        <div className="space-y-6">
          <div className="bg-[#071b34]/95 border border-[#133966] rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2"><BookOpen className="w-5 h-5 text-[#00C49F]" /> Course & Subject Management</h2>
              <button onClick={() => setShowCourseModal(true)}
                className="px-3 py-2 rounded-xl bg-[#0b2444] text-[#00C49F] border border-[#00a896]/30 text-xs font-bold flex items-center gap-1.5 hover:bg-[#133966]">
                <Plus className="w-4 h-4" /> Add Course
              </button>
            </div>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span><strong>Constraint:</strong> Each teacher can only be assigned to ONE subject per semester, department, and division.</span>
            </div>

            {/* Branch & semester filter */}
            <div className="flex flex-wrap gap-3 items-center">
              <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}
                className="bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white focus:outline-none">
                {ACTIVE_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <select value={selectedCourseDivision} onChange={e => setSelectedCourseDivision(e.target.value)}
                className="bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white focus:outline-none">
                {DIVISIONS.map(div => <option key={div} value={div}>Division {div}</option>)}
              </select>
              <div className="flex gap-1.5 flex-wrap">
                {ACTIVE_SEMESTERS.map(s => (
                  <button key={s} onClick={() => setSelectedSemester(s)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${selectedSemester === s ? 'bg-[#00C49F] text-[#040d1a]' : 'border-[#133966] text-slate-400'}`}>
                    Sem {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-auto rounded-2xl border border-[#133966] no-scrollbar touch-scroll">
              <table className="w-full text-xs min-w-[550px]">
                <thead className="bg-[#040d1a] text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="text-left p-3 font-bold">Code</th>
                    <th className="text-left p-3 font-bold">Subject</th>
                    <th className="text-left p-3 font-bold">Sem</th>
                    <th className="text-left p-3 font-bold">Assigned Teacher</th>
                    <th className="text-left p-3 font-bold">Change Teacher</th>
                  </tr>
                </thead>
                <tbody>
                  {courseGroups.map(group => {
                    const c = group.courses[0];
                    const assignedTeachers = [...new Map(group.courses
                      .filter(course => course.teacher)
                      .map(course => [course.teacher._id || course.teacher, course.teacher])).values()];
                    return (
                    <tr key={`${c._id}-${group.code}`} className="border-t border-[#133966] hover:bg-[#0b2444]/30">
                      <td className="p-3 font-mono text-cyan-300">{group.code}</td>
                      <td className="p-3 text-white font-medium">
                        {group.title}
                        <span className="ml-2 text-[10px] text-slate-400">Division {selectedCourseDivision}</span>
                      </td>
                      <td className="p-3 text-slate-300">Sem {c.semester}</td>
                      <td className="p-3">
                        {assignedTeachers.length === 1
                          ? <span className="flex items-center gap-1.5 text-[#00C49F]"><CheckCircle2 className="w-3.5 h-3.5" />{assignedTeachers[0].name}</span>
                          : assignedTeachers.length > 1
                            ? <span className="text-amber-300">Different by division</span>
                          : <span className="text-amber-300 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />Unassigned</span>}
                      </td>
                      <td className="p-3">
                        <select defaultValue="" onChange={e => handleAssignTeacher(c._id, e.target.value)}
                          className="bg-[#071b34] border border-[#133966] rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-[#00a896]">
                          <option value="">— Assign —</option>
                          {getAvailableTeachers(selectedCourseDivision, group.code).map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                          {getAvailableTeachers(selectedCourseDivision, group.code).length === 0 && <option disabled>No available teachers</option>}
                        </select>
                      </td>
                    </tr>
                    );
                  })}
                  {courseGroups.length === 0 && (
                    <tr><td colSpan={5} className="p-8 text-center text-slate-400">No courses found for selected branch/semester.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Add Course Modal */}
          {showCourseModal && (
            <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
              <div className="bg-[#071b34] border border-[#133966] rounded-3xl p-6 w-full max-w-md shadow-2xl">
                <h3 className="text-sm font-bold text-white mb-4">Add New Course</h3>
                <form onSubmit={async e => {
                  e.preventDefault();
                  try {
                    await api.createCourse({ code: newCourseCode, title: newCourseTitle, branch: selectedBranch, department: selectedBranch, semester: newCourseSem, section: selectedCourseDivision, teacherId: assignedTeacherId || null });
                    showBanner('Course created successfully.');
                    setShowCourseModal(false);
                    setNewCourseCode(''); setNewCourseTitle(''); setNewCourseSem(5); setAssignedTeacherId('');
                    loadCoursesAndTeachers();
                  } catch (e) { showBanner(e.message, 'error'); }
                }} className="space-y-3">
                  <div><label className="text-xs font-semibold text-slate-300 mb-1 block">Course Code *</label>
                    <input required value={newCourseCode} onChange={e => setNewCourseCode(e.target.value)} placeholder="e.g. CS501"
                      className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white focus:outline-none" /></div>
                  <div><label className="text-xs font-semibold text-slate-300 mb-1 block">Course Title *</label>
                    <input required value={newCourseTitle} onChange={e => setNewCourseTitle(e.target.value)} placeholder="e.g. Data Structures"
                      className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white focus:outline-none" /></div>
                  <div><label className="text-xs font-semibold text-slate-300 mb-1 block">Semester</label>
                    <select value={newCourseSem} onChange={e => setNewCourseSem(Number(e.target.value))}
                      className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white focus:outline-none">
                      {ACTIVE_SEMESTERS.map(s => <option key={s} value={s}>Semester {s}</option>)}
                    </select></div>
                  <div><label className="text-xs font-semibold text-slate-300 mb-1 block">Assign Teacher (Optional)</label>
                    <select value={assignedTeacherId} onChange={e => setAssignedTeacherId(e.target.value)}
                      className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white focus:outline-none">
                      <option value="">— None —</option>
                      {getAvailableTeachers(selectedCourseDivision, newCourseCode).map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                      {getAvailableTeachers(selectedCourseDivision, newCourseCode).length === 0 && <option disabled>No available teachers</option>}
                    </select></div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] text-xs font-black">Create Course</button>
                    <button type="button" onClick={() => setShowCourseModal(false)} className="flex-1 py-2.5 rounded-xl bg-[#0b2444] text-slate-300 text-xs font-bold border border-[#133966]">Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          PAGE: STUDENTS & BIOMETRICS — with Branch→Sem→Div hierarchy + search
      ==================================================================== */}
      {activePage === 'users' && (
        <div className="bg-[#071b34]/95 border border-[#133966] rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-[#00C49F]" /> Users & Biometrics
            </h2>
            <div className="flex gap-2 flex-wrap">
              {['student', 'teacher'].map(r => (
                <button key={r} onClick={() => { setRoleFilter(r); setUsersPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all capitalize ${roleFilter === r ? 'bg-[#00C49F] text-[#040d1a] border-[#00C49F]' : 'border-[#133966] text-slate-400 hover:text-white'}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Hierarchy filters — shown only for students */}
          {(roleFilter === 'student' || roleFilter === 'teacher') && (
            <div className="p-3 rounded-2xl bg-[#040d1a] border border-[#133966] flex flex-wrap gap-3 items-center">
              {/* Department / branch */}
              {hasBranchSem && (
                <select value={usersBranch} onChange={e => { setUsersBranch(e.target.value); setUsersPage(1); }}
                  className="bg-[#071b34] border border-[#133966] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#00a896]">
                  <option value="">All Departments</option>
                  {ACTIVE_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              )}
              {/* Semester (institute/diploma) */}
              {hasBranchSem && roleFilter === 'student' && (
                <select value={usersSemester} onChange={e => { setUsersSemester(e.target.value); setUsersPage(1); }}
                  className="bg-[#071b34] border border-[#133966] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#00a896]">
                  <option value="">All Semesters</option>
                  {ACTIVE_SEMESTERS.map(s => <option key={s} value={s}>Semester {s}</option>)}
                </select>
              )}
              {/* Standard (school) */}
              {isSchool && roleFilter === 'student' && (
                <select value={usersStandard} onChange={e => { setUsersStandard(e.target.value); setUsersPage(1); }}
                  className="bg-[#071b34] border border-[#133966] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#00a896]">
                  <option value="">All Standards</option>
                  {SCHOOL_STDS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
              {isPUC && roleFilter === 'student' && (
                <select value={usersPucYear} onChange={e => { setUsersPucYear(e.target.value); setUsersPage(1); }}
                  className="bg-[#071b34] border border-[#133966] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#00a896]">
                  <option value="">All PUC Years</option>
                  {['1st PUC', '2nd PUC'].map(year => <option key={year} value={year}>{year}</option>)}
                </select>
              )}
              {isPUC && (
                <select value={usersPucDept} onChange={e => { setUsersPucDept(e.target.value); setUsersPage(1); }}
                  className="bg-[#071b34] border border-[#133966] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#00a896]">
                  <option value="">All Departments</option>
                  {PUC_DEPTS_LIST.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                </select>
              )}
              {/* Division */}
              {roleFilter === 'student' && <select value={usersDivision} onChange={e => { setUsersDivision(e.target.value); setUsersPage(1); }}
                className="bg-[#071b34] border border-[#133966] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#00a896]">
                <option value="">All Divisions</option>
                {DIVISIONS.map(d => <option key={d} value={d}>Division {d}</option>)}
              </select>}
              {/* Clear filters */}
              {(usersBranch || usersSemester || usersDivision || usersStandard || usersPucYear || usersPucDept) && (
                <button onClick={() => {
                  setUsersBranch(''); setUsersSemester(''); setUsersDivision(''); setUsersStandard('');
                  setUsersPucYear(''); setUsersPucDept(''); setUsersPage(1);
                }}
                  className="text-[11px] text-[#00C49F] hover:underline">Clear filters</button>
              )}
            </div>
          )}

          {/* Search box */}
          <div className="relative">
            <input
              type="text"
              placeholder={`Search ${roleFilter || 'users'} by name, USN / ID...`}
              value={userSearch}
              onChange={e => { setUserSearch(e.target.value); setUsersPage(1); }}
              className="w-full bg-[#040d1a] border border-[#133966] rounded-xl pl-9 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00a896]"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {userSearch && (
              <button onClick={() => setUserSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs">✕</button>
            )}
          </div>

          {/* Results count */}
          {!loadingUsers && (
            <div className="text-[11px] text-slate-400">
              Showing <strong className="text-white">{users.length}</strong> of {usersPagination.total} {roleFilter || 'users'}
            </div>
          )}

          {loadingUsers ? (
            <div className="py-8 text-center text-slate-400 text-xs">Loading users...</div>
          ) : (
            <div className="overflow-auto rounded-2xl border border-[#133966] max-h-[600px] no-scrollbar touch-scroll">
              <table className="w-full text-xs min-w-[650px]">
                <thead className="bg-[#040d1a] text-slate-400 uppercase tracking-wider sticky top-0">
                  <tr>
                    <th className="text-left p-3">Name</th>
                    <th className="text-left p-3">ID / USN</th>
                    {hasBranchSem && <th className="text-left p-3">Department</th>}
                    {hasBranchSem && roleFilter === 'student' && <th className="text-left p-3">Sem</th>}
                    {isPUC && <th className="text-left p-3">Department</th>}
                    {isPUC && roleFilter === 'student' && <th className="text-left p-3">PUC Year</th>}
                    {isSchool && roleFilter === 'student' && <th className="text-left p-3">Standard</th>}
                    <th className="text-left p-3">Div</th>
                    {roleFilter === 'student' && <th className="text-left p-3">Face</th>}
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                      <tr key={u._id} className="border-t border-[#133966] hover:bg-[#0b2444]/30">
                        <td className="p-3 text-white font-medium">{u.name}</td>
                        <td className="p-3 font-mono text-cyan-300 text-[10px]">{u.usn || u.teacherId || u.adminId || '—'}</td>
                        {hasBranchSem && (
                          <td className="p-3 text-slate-400 text-[10px] max-w-[120px] truncate" title={u.branch || u.department}>{u.branch || u.department || '—'}</td>
                        )}
                        {hasBranchSem && roleFilter === 'student' && (
                          <td className="p-3 text-slate-300">{u.semester || '—'}</td>
                        )}
                        {isPUC && <td className="p-3 text-slate-300">{u.pucDept || u.department || '—'}</td>}
                        {isPUC && roleFilter === 'student' && <td className="p-3 text-slate-300">{u.pucYear || '—'}</td>}
                        {isSchool && roleFilter === 'student' && <td className="p-3 text-slate-300">{u.standard || '—'}</td>}
                        <td className="p-3">
                          {u.division ? (
                            <span className="px-2 py-0.5 rounded-full bg-[#00a896]/20 text-[#00C49F] text-[10px] font-bold border border-[#00a896]/30">
                              {u.division}
                            </span>
                          ) : <span className="text-slate-500">—</span>}
                        </td>
                        {roleFilter === 'student' && (
                          <td className="p-3">
                            {u.faceRegistered
                              ? <span className="text-[#00C49F] flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Yes</span>
                              : <span className="text-amber-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />No</span>}
                          </td>
                        )}
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${u.isActive ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-red-500/20 text-red-300 border-red-500/30'}`}>
                            {u.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="p-3">
                          <button onClick={() => handleToggleStatus(u._id)}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${u.isActive ? 'text-red-300 border-red-500/30 hover:bg-red-500/20' : 'text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'}`}>
                            {u.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  {users.length === 0 && (
                    <tr><td colSpan={9} className="p-8 text-center text-slate-400">
                      {userSearch ? `No ${roleFilter || 'users'} found matching "${userSearch}"` : `No ${roleFilter || 'users'} found.`}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {!loadingUsers && usersPagination.totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Page {usersPage} of {usersPagination.totalPages}</span>
              <div className="flex gap-2">
                <button disabled={usersPage <= 1} onClick={() => setUsersPage(page => Math.max(1, page - 1))}
                  className="px-3 py-1.5 rounded-lg border border-[#133966] disabled:opacity-40">Previous</button>
                <button disabled={usersPage >= usersPagination.totalPages} onClick={() => setUsersPage(page => Math.min(usersPagination.totalPages, page + 1))}
                  className="px-3 py-1.5 rounded-lg border border-[#133966] disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          PAGE: ATTENDANCE AUDIT
      ==================================================================== */}
      {activePage === 'attendance' && (
        <div className="bg-[#071b34]/95 border border-[#133966] rounded-3xl p-6 shadow-xl space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-[#00C49F]" /> Attendance Audit</h2>
          {stats?.recentSessions?.length > 0 ? (
            <div className="space-y-3">
              {stats.recentSessions.map(s => (
                <div key={s._id} className="p-4 rounded-2xl bg-[#040d1a] border border-[#133966]">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{s.course?.code} — {s.course?.title}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#00a896]/20 text-[#00C49F] border border-[#00a896]/30">{s.attendancePercentage}%</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Teacher: {s.teacher?.name} · {new Date(s.sessionDate).toLocaleDateString()} · {s.timeSlot}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Present: {s.totalPresent} / {s.totalEnrolled} · Absent: {s.totalAbsent}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.teacherPhoto && (
                        <img src={s.teacherPhoto} alt="Teacher" className="w-10 h-10 rounded-xl object-cover border border-[#133966] cursor-pointer"
                          onClick={() => setPreviewAuditModal({ url: s.teacherPhoto, title: 'Teacher Verification', subtitle: s.teacher?.name })} />
                      )}
                      {s.classPhoto && (
                        <img src={s.classPhoto} alt="Classroom" className="w-10 h-10 rounded-xl object-cover border border-[#133966] cursor-pointer"
                          onClick={() => setPreviewAuditModal({ url: s.classPhoto, title: 'Classroom Photo', subtitle: s.course?.code })} />
                      )}
                      <a href={api.getExportCsvUrl(s._id)} target="_blank" rel="noreferrer"
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1 hover:bg-emerald-500/30">
                        <Download className="w-3.5 h-3.5" /> CSV
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 text-sm">No attendance sessions recorded yet.</div>
          )}
        </div>
      )}

      {activePage === 'marks' && (
        <MarksOverviewPage user={user} isAdmin={true} />
      )}

      {['calendar', 'announcements'].includes(activePage) && (
        <AcademicHub user={user} adminCohort={{
          branch: hasBranchSem ? selectedBranch : '',
          semester: hasBranchSem ? selectedSemester : null,
          standard: isSchool ? selectedStandard : '',
          pucYear: isPUC ? selectedPucYear : '',
          pucDept: isPUC ? selectedPucDept : ''
        }} page={activePage} />
      )}

      {/* Audit photo lightbox */}
      {previewAuditModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setPreviewAuditModal(null)}>
          <div className="max-w-2xl w-full space-y-3" onClick={e => e.stopPropagation()}>
            <img src={previewAuditModal.url} alt={previewAuditModal.title} className="w-full rounded-2xl border border-[#133966] shadow-2xl max-h-[70vh] object-contain" />
            <div className="text-center text-xs text-white font-semibold">{previewAuditModal.title} — {previewAuditModal.subtitle}</div>
            <button onClick={() => setPreviewAuditModal(null)} className="block mx-auto px-6 py-2 rounded-xl bg-[#071b34] text-slate-300 text-xs font-bold border border-[#133966]">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
