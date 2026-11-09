import React, { useEffect, useState } from 'react';
import { Calendar, Clock, Edit3, Lock, ShieldCheck, Plus, CheckCircle2, Download, UserCheck, Trash2, AlertCircle, Sparkles } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { api } from '../services/api';

// Time parsing helpers for >= 15-minute teacher break validation
function parseTimeToMinutes(t) {
  if (!t) return 0;
  let str = t.trim().toLowerCase();
  let isPM = str.includes('pm');
  let isAM = str.includes('am');
  str = str.replace(/[ap]m/g, '').trim();
  const parts = str.split(':');
  let h = parseInt(parts[0], 10) || 0;
  let m = parseInt(parts[1], 10) || 0;
  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;
  if (!isPM && !isAM && h >= 1 && h <= 6) h += 12;
  return h * 60 + m;
}

function parseSlotTimes(slotStr) {
  if (!slotStr) return null;
  const parts = slotStr.split(/[-–—to]+/i);
  if (parts.length < 2) return null;
  const start = parseTimeToMinutes(parts[0]);
  const end = parseTimeToMinutes(parts[1]);
  return { start, end, rawStart: parts[0].trim(), rawEnd: parts[1].trim() };
}

function checkTeacherBreakViolationClient(newSlotStr, existingSlots, teacherName) {
  const newTimes = parseSlotTimes(newSlotStr);
  if (!newTimes) return null;

  for (const s of existingSlots) {
    const sTimes = parseSlotTimes(s.timeSlot);
    if (!sTimes) continue;

    // Direct Overlap
    if (newTimes.start < sTimes.end && newTimes.end > sTimes.start) {
      return `❌ Schedule Overlap: ${teacherName} is already teaching on ${s.day} during ${s.timeSlot} (Div ${s.division || 'A'}). A teacher cannot teach two classes simultaneously.`;
    }

    // Class starts AFTER existing class: must have >= 15 min break
    const gapAfter = newTimes.start - sTimes.end;
    if (gapAfter >= 0 && gapAfter < 15) {
      return `❌ Teacher Break Constraint: ${teacherName} has a class ending at ${sTimes.rawEnd} on ${s.day}. Faculty must have at least a 15-minute break after every class before being allocated another lecture (Current break: ${gapAfter} mins).`;
    }

    // Class ends BEFORE existing class: must have >= 15 min break
    const gapBefore = sTimes.start - newTimes.end;
    if (gapBefore >= 0 && gapBefore < 15) {
      return `❌ Teacher Break Constraint: ${teacherName} has a class starting at ${sTimes.rawStart} on ${s.day}. Faculty must have at least a 15-minute break between consecutive classes (Current break: ${gapBefore} mins).`;
    }
  }

  return null;
}

export default function TimetableTable({
  division = 'C',
  semester = 5,
  standard = '',
  institutionType = 'college',
  branch = '',
  pucDept = '',
  classroom = 'Class Room: AS-11',
  coordinator = 'Prof. Nandini C.V',
  slots = [],
  courses = [],
  teachers = [],
  isAdmin = false,
  highlightTeacherId = null,
  semesterSubjects = [],   // subjects from Semester model (admin-added)
  onUpdateSlot,
  onUpdateHeader,
  onAssignCourseTeacher
}) {
  const [editingSlot, setEditingSlot] = useState(null);
  const [editingHeader, setEditingHeader] = useState(false);
  const [roomInput, setRoomInput] = useState(classroom);
  const [coordInput, setCoordInput] = useState(coordinator);
  const [modalError, setModalError] = useState('');
  const [configuredSemester, setConfiguredSemester] = useState(null);
  const [semesterDatesLoading, setSemesterDatesLoading] = useState(false);
  const [semesterDatesError, setSemesterDatesError] = useState('');
  const configuredStartDate = semesterSubjects?.__startDate || configuredSemester?.startDate;
  const configuredEndDate = semesterSubjects?.__endDate || configuredSemester?.endDate;
  const normalizedInstitutionType = institutionType === 'college' ? 'institute' : institutionType;

  useEffect(() => {
    if (semesterSubjects?.__startDate && semesterSubjects?.__endDate) {
      setConfiguredSemester(null);
      setSemesterDatesLoading(false);
      setSemesterDatesError('');
      return;
    }

    let query;
    if (normalizedInstitutionType === 'school' && standard) {
      query = { standard };
    } else if (normalizedInstitutionType === 'pu_college' && standard) {
      query = { pucYear: standard, pucDept };
    } else if ((normalizedInstitutionType === 'institute' || normalizedInstitutionType === 'diploma') && semester && branch) {
      query = { semesterNumber: semester, branch };
    } else {
      setConfiguredSemester(null);
      setSemesterDatesLoading(false);
      setSemesterDatesError('');
      return;
    }

    let cancelled = false;
    setConfiguredSemester(null);
    setSemesterDatesLoading(true);
    setSemesterDatesError('');
    api.getSemesters(query)
      .then(response => {
        if (cancelled) return;
        const semesters = response.semesters || [];
        setConfiguredSemester(semesters.find(item => item.isActive) || semesters[0] || null);
        setSemesterDatesLoading(false);
      })
      .catch(error => {
        if (!cancelled) {
          setConfiguredSemester(null);
          setSemesterDatesLoading(false);
          setSemesterDatesError(error.message || 'Unable to load semester dates.');
        }
      });

    return () => { cancelled = true; };
  }, [
    normalizedInstitutionType,
    semester,
    standard,
    branch,
    pucDept,
    semesterSubjects?.__startDate,
    semesterSubjects?.__endDate
  ]);

  // 1. EDITABLE TIMINGS STATE (Persisted in localStorage)
  const [periodRows, setPeriodRows] = useState(() => {
    try {
      const saved = localStorage.getItem(`metricsedu_timings_${semester}_${division}`);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [
      { id: '1', type: 'period', time: '08:30-09:25', label: '08:30-09:25' },
      { id: '2', type: 'period', time: '09:25-10:20', label: '09:25-10:20' },
      { id: '3', type: 'break', label: 'TEA BREAK', time: '10:20-10:50' },
      { id: '4', type: 'period', time: '10:50-11:45', label: '10:50-11:45' },
      { id: '5', type: 'period', time: '11:45-12:40', label: '11:45-12:40' },
      { id: '6', type: 'break', label: 'LUNCH BREAK', time: '12:40-01:30' },
      { id: '7', type: 'period', time: '01:30-03:30', label: '01:30-03:30' }
    ];
  });
  const [editingTimingIdx, setEditingTimingIdx] = useState(null);
  const [timingInput, setTimingInput] = useState('');
  const [newTimingType, setNewTimingType] = useState('period');
  const [newTimingTime, setNewTimingTime] = useState('');

  // 2. EDITABLE LAB SUBTABLE STATE (Division/Batch, Lab Name, Lab Number, Faculty) - Persisted in localStorage
  const [labRows, setLabRows] = useState(() => {
    try {
      const saved = localStorage.getItem(`metricsedu_labs_${semester}_${division}`);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [
      {
        id: 'lab-1',
        division: division,
        labName: 'Formal Languages and Automata Theory [22CS52]',
        labNumber: 'Lab Number-2',
        faculty: 'Prof. Sneha Y, Prof. Nandini C.V'
      },
      {
        id: 'lab-2',
        division: division,
        labName: 'Micro-Controller and Embedded Systems Laboratory [22CSL59]',
        labNumber: 'Lab Number-6',
        faculty: 'Dr. Jyoti Y. A, Prof. Roopa U.K'
      }
    ];
  });
  // 3. EDITABLE LEGEND TEACHERS STATE (Persisted in localStorage)
  const [legendTeachers, setLegendTeachers] = useState(() => {
    try {
      const saved = localStorage.getItem(`metricsedu_legend_teachers_${semester}_${division}`);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {};
  });

  const handleLegendTeacherChange = (subj, teacherId) => {
    const teacherObj = teachers.find(t => t._id === teacherId);
    const teacherName = teacherObj ? teacherObj.name : '';

    // 1. Update optimistic legend state
    const updatedLegend = { ...legendTeachers, [subj.code]: teacherId };
    setLegendTeachers(updatedLegend);
    try {
      localStorage.setItem(`metricsedu_legend_teachers_${semester}_${division}`, JSON.stringify(updatedLegend));
    } catch (e) {}

    // 2. Also synchronize the corresponding lab subtable below if matching
    const updatedLabs = labRows.map(l => {
      if (l.labName.includes(subj.code) || l.labName.toLowerCase().includes(subj.title.toLowerCase())) {
        return { ...l, faculty: teacherName };
      }
      return l;
    });
    setLabRows(updatedLabs);
    try {
      localStorage.setItem(`metricsedu_labs_${semester}_${division}`, JSON.stringify(updatedLabs));
    } catch (e) {}

    // 3. Trigger backend assignment if course exists
    const course = getCourseForCode(subj.code);
    if (course && onAssignCourseTeacher) {
      onAssignCourseTeacher(course._id, teacherId);
    }
  };

  // Form state for slot modal
  const [modalDay, setModalDay] = useState('Monday');
  const [modalSlot, setModalSlot] = useState('08:30-09:25');
  const [modalCourseId, setModalCourseId] = useState('');
  const [modalTeacherId, setModalTeacherId] = useState('');
  const [modalClassroom, setModalClassroom] = useState(classroom);

  const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const fullDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const matchingDivisionCourses = courses.filter(course =>
    String(course.section || '').toUpperCase() === division.toUpperCase()
  );
  const coursesForDivision = matchingDivisionCourses.length
    ? matchingDivisionCourses
    : courses.filter(course => !course.section);

  const dayAbbrMap = {
    'MON': 'Monday',
    'TUE': 'Tuesday',
    'WED': 'Wednesday',
    'THU': 'Thursday',
    'FRI': 'Friday',
    'SAT': 'Saturday'
  };

  // Helper to find slot in array matching Day and Time
  const findSlot = (dayAbbr, timeRange) => {
    const fullDay = dayAbbrMap[dayAbbr];
    return slots.find(s => {
      if ((s.division || 'A').toUpperCase() !== String(division).toUpperCase()) return false;
      const matchDay = (s.day || '').toLowerCase() === fullDay.toLowerCase();
      const rawSlot = (s.timeSlot || '').replace(/\s+/g, '').toLowerCase();
      const targetTime = timeRange.replace(/\s+/g, '').toLowerCase();
      const matchTime = rawSlot.includes(targetTime.slice(0, 5)) || rawSlot.includes(targetTime.slice(0, 4));
      return matchDay && matchTime;
    });
  };

  // Helper to get course display name — uses admin-added subject title if available, else course code
  const getCourseShortCode = (slot) => {
    if (!slot) return '';
    const code = slot.course?.code || '';
    const title = slot.course?.title || '';

    // Check if admin has configured this subject in the semester
    const semSubject = legendSubjects.find(s => s.code === code);
    if (semSubject) {
      // Use short abbreviation: first letters of each meaningful word
      const words = semSubject.title.split(/[\s&]+/).filter(w => w.length > 2);
      if (words.length >= 2) {
        return words.slice(0, 3).map(w => w[0].toUpperCase()).join('');
      }
      return semSubject.title.slice(0, 10);
    }

    // Fallback: use last segment of code or truncated title
    if (code) return code.split('-').pop() || code.slice(-6);
    return title.slice(0, 12);
  };

  // ─── Duplicate-subject helpers ─────────────────────────────────────────────
  // Check if the chosen course already appears in the same ROW (same time-slot,
  // any other day) or the same COLUMN (same day, any other time-slot).
  const getCourseConflictReason = (courseId, day, timeSlot, excludeSlotId) => {
    if (!courseId) return null;

    const rawTime = (timeSlot || '').replace(/\s+/g, '').toLowerCase();
    const dayLow  = (day || '').toLowerCase();

    for (const s of slots) {
      if (excludeSlotId && s._id === excludeSlotId) continue;
      const sCourseId = s.course?._id || s.course;
      if (sCourseId !== courseId) continue;
      if ((s.division || '').toUpperCase() !== (division || '').toUpperCase()) continue;

      const rawS    = (s.timeSlot || '').replace(/\s+/g, '').toLowerCase();
      const sDayLow = (s.day || '').toLowerCase();

      const sameRow = rawS.includes(rawTime.slice(0, 5)) || rawTime.includes(rawS.slice(0, 5));
      const sameCol = sDayLow === dayLow;

      if (sameRow && !sameCol) {
        const courseName = courses.find(c => c._id === courseId)?.code || 'This subject';
        return `❌ Row Conflict: "${courseName}" is already scheduled on ${s.day} at the same time slot (${s.timeSlot}). The same subject cannot appear twice in the same period row.`;
      }
      if (sameCol && !sameRow) {
        const courseName = courses.find(c => c._id === courseId)?.code || 'This subject';
        return `❌ Column Conflict: "${courseName}" is already scheduled on ${day} at ${s.timeSlot}. The same subject cannot appear twice on the same day.`;
      }
    }
    return null;
  };

  // ─── Compute which teachers are FREE for a given day+slot ──────────────────
  // A teacher is FREE when:
  //   • They have NO slot that overlaps the given time range, AND
  //   • Every other slot on that day leaves >= 15 min gap.
  const getFreeTeachersForSlot = (day, timeSlot, excludeSlotId) => {
    return teachers.filter(t => {
      const occupiedOnDay = slots.filter(s => {
        if (excludeSlotId && s._id === excludeSlotId) return false;
        const tId = s.teacher?._id || s.teacher;
        return (s.day || '').toLowerCase() === (day || '').toLowerCase() && tId === t._id;
      });
      const violation = checkTeacherBreakViolationClient(timeSlot, occupiedOnDay, t.name);
      return !violation; // null = no violation = teacher is free
    });
  };

  // Open Edit Modal for a cell — defaults teacher to first FREE teacher for that slot
  const handleCellClick = (dayAbbr, timeRange) => {
    if (!isAdmin) return;
    setModalError('');
    const existing = findSlot(dayAbbr, timeRange);
    const fullDay = dayAbbrMap[dayAbbr];
    setModalDay(fullDay);
    setModalSlot(timeRange);
    setModalClassroom(existing?.classroom || classroom);

    // Pick a sane default teacher: existing assigned > first free > first overall
    const firstFree = getFreeTeachersForSlot(fullDay, timeRange, existing?._id)?.[0];

    if (existing) {
      setEditingSlot(existing);
      setModalCourseId(existing.course?._id || courses[0]?._id || '');
      setModalTeacherId(existing.teacher?._id || firstFree?._id || teachers[0]?._id || '');
    } else {
      setEditingSlot({ isNew: true, day: fullDay, timeSlot: timeRange });
      setModalCourseId(courses[0]?._id || '');
      setModalTeacherId(firstFree?._id || teachers[0]?._id || '');
    }
  };

  // Save Modal with strict conflict check & >= 15 min teacher break check
  const handleSaveModal = (e) => {
    e.preventDefault();
    setModalError('');

    // 1. Conflict Check: Different subjects at the same time in same class/division
    const existingConflict = slots.find(s => {
      if (editingSlot?._id && s._id === editingSlot._id) return false;
      const sameDay = (s.day || '').toLowerCase() === modalDay.toLowerCase();
      const rawS = (s.timeSlot || '').replace(/\s+/g, '').toLowerCase();
      const rawM = (modalSlot || '').replace(/\s+/g, '').toLowerCase();
      const sameSlot = rawS.includes(rawM.slice(0, 5)) || rawM.includes(rawS.slice(0, 5));
      const sameDiv = (s.division || '').toUpperCase() === (division || '').toUpperCase();
      return sameDay && sameSlot && sameDiv;
    });

    if (existingConflict && existingConflict.course && (existingConflict.course._id || existingConflict.course) !== modalCourseId) {
      const codeOrTitle = existingConflict.course?.code || existingConflict.course?.title || 'Another Subject';
      setModalError(`❌ Schedule Conflict: Division ${division} already has "${codeOrTitle}" scheduled on ${modalDay} at ${modalSlot}. Cannot allocate two different subjects to the same class at the same time.`);
      return;
    }

    // 2. Row / Column duplicate-subject check
    const dupReason = getCourseConflictReason(modalCourseId, modalDay, modalSlot, editingSlot?._id);
    if (dupReason) {
      setModalError(dupReason);
      return;
    }

    // 3. Conflict Check: Teacher >= 15 min break constraint
    const teacherDaySlots = slots.filter(s => {
      if (editingSlot?._id && s._id === editingSlot._id) return false;
      const sameDay = (s.day || '').toLowerCase() === modalDay.toLowerCase();
      const tId = s.teacher?._id || s.teacher;
      return sameDay && tId === modalTeacherId;
    });

    const teacherObj = teachers.find(t => t._id === modalTeacherId);
    const tName = teacherObj?.name || 'Selected Faculty';
    const breakViolation = checkTeacherBreakViolationClient(modalSlot, teacherDaySlots, tName);
    if (breakViolation) {
      setModalError(breakViolation);
      return;
    }

    // Execute save
    if (onUpdateSlot) {
      onUpdateSlot({
        slotId: editingSlot?._id,
        isNew: !!editingSlot?.isNew,
        day: modalDay,
        timeSlot: modalSlot,
        courseId: modalCourseId,
        teacherId: modalTeacherId,
        classroom: modalClassroom,
        division,
        semester
      });
    }
    setEditingSlot(null);
  };

  const handleSaveHeader = () => {
    if (onUpdateHeader) {
      onUpdateHeader({ classroom: roomInput, coordinator: coordInput });
    }
    setEditingHeader(false);
  };

  // Timings Row Edit Handlers with LocalStorage Persistence
  const handleSaveTiming = (idx) => {
    if (!timingInput.trim()) return;
    const updated = [...periodRows];
    updated[idx].time = timingInput.trim();
    updated[idx].label = timingInput.trim();
    setPeriodRows(updated);
    try {
      localStorage.setItem(`metricsedu_timings_${semester}_${division}`, JSON.stringify(updated));
    } catch (e) {}
    setEditingTimingIdx(null);
  };

  const handleAddTiming = () => {
    if (!newTimingTime.trim()) return;
    const isBreak = newTimingType === 'break';
    const newEntry = {
      id: Date.now().toString(),
      type: newTimingType,
      time: newTimingTime.trim(),
      label: isBreak ? `BREAK (${newTimingTime.trim()})` : newTimingTime.trim()
    };
    const updated = [...periodRows, newEntry];
    setPeriodRows(updated);
    try {
      localStorage.setItem(`metricsedu_timings_${semester}_${division}`, JSON.stringify(updated));
    } catch (e) {}
    setNewTimingTime('');
  };

  const handleDeleteTiming = (idx) => {
    if (periodRows.length <= 1) return;
    const updated = periodRows.filter((_, i) => i !== idx);
    setPeriodRows(updated);
    try {
      localStorage.setItem(`metricsedu_timings_${semester}_${division}`, JSON.stringify(updated));
    } catch (e) {}
  };

  // ── Header label: "Time Table For 1st Semester (2025-26)" ───────────────────
  const semOrStdLabel = (() => {
    if (institutionType === 'school') return standard || '10th Standard';
    if (institutionType === 'pu_college') return standard || '1st PUC';
    if (institutionType === 'diploma') {
      const ordinals = ['','1st','2nd','3rd','4th','5th','6th'];
      return `${ordinals[semester] || (semester + 'th')} Semester`;
    }
    // institute (default)
    const ordinals = ['','1st','2nd','3rd','4th','5th','6th','7th','8th'];
    if (!semester) return 'Semester';
    return `${ordinals[semester] || (semester + 'th')} Semester`;
  })();

  const formatAcademicDate = value => value
    ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    })
    : '';
  const semesterDateRange = configuredStartDate && configuredEndDate
    ? `${formatAcademicDate(configuredStartDate)} – ${formatAcademicDate(configuredEndDate)}`
    : '';

  // Academic year — from admin config or fallback
  const academicYear = semesterSubjects?.__academicYear || configuredSemester?.academicYear || '2026-27';

  // Start-to-end year range: "2026-27" stays as-is; raw dates produce "2026 to 2027"
  const yearRange = (() => {
    if (configuredStartDate && configuredEndDate) {
      const sy = new Date(configuredStartDate).getFullYear();
      const ey = new Date(configuredEndDate).getFullYear();
      return sy === ey ? `${sy}` : `${sy}-${String(ey).slice(-2)}`;
    }
    return academicYear;
  })();

  // Final header: "Time Table For 1st Semester (2026-27)"
  const timetableHeaderTitle = `Time Table For ${semOrStdLabel} (${yearRange})`;

  // Export only the real timetable rows visible to this role and cohort.
  const handleDownloadCSV = () => {
    const csvEscape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const dayOrder = new Map(fullDays.map((day, index) => [day, index]));
    const getSlotStart = slot => slot.startMinutes > 0
      ? slot.startMinutes
      : parseSlotTimes(slot.timeSlot)?.start ?? 0;
    const scheduleSlots = slots
      .filter(slot => (slot.division || 'A').toUpperCase() === String(division).toUpperCase())
      .slice()
      .sort((a, b) =>
        (dayOrder.get(a.day) ?? fullDays.length) - (dayOrder.get(b.day) ?? fullDays.length) ||
        getSlotStart(a) - getSlotStart(b)
      );
    const csvRows = [
      [timetableHeaderTitle],
      [`Division ${division}`, `Classroom: ${roomInput}`, `Coordinator: ${coordInput}`],
      ['Semester Start Date', formatAcademicDate(configuredStartDate), 'Semester End Date', formatAcademicDate(configuredEndDate)],
      [],
      ['Day', 'Time', 'Course Code', 'Subject', 'Teacher', 'Division', 'Semester / Class', 'Classroom'],
      ...scheduleSlots.map(slot => [
        slot.day,
        slot.timeSlot,
        slot.course?.code,
        slot.course?.title,
        slot.teacher?.name,
        slot.division || division,
        semOrStdLabel,
        slot.classroom || roomInput
      ])
    ];
    const csvContent = `\uFEFF${csvRows.map(row => row.map(csvEscape).join(',')).join('\r\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Timetable_${semOrStdLabel.replace(/\s+/g, '_')}_Div_${division}_${yearRange}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPDF = () => {
    const dayOrder = new Map(fullDays.map((day, index) => [day, index]));
    const getSlotStart = slot => slot.startMinutes > 0
      ? slot.startMinutes
      : parseSlotTimes(slot.timeSlot)?.start ?? 0;
    const scheduleSlots = slots
      .filter(slot => (slot.division || 'A').toUpperCase() === String(division).toUpperCase())
      .slice()
      .sort((a, b) =>
        (dayOrder.get(a.day) ?? fullDays.length) - (dayOrder.get(b.day) ?? fullDays.length) ||
        getSlotStart(a) - getSlotStart(b)
      );
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(18);
    doc.text(timetableHeaderTitle, 40, 38);
    doc.setFontSize(10);
    doc.text(`Division ${division}  |  Classroom: ${roomInput}  |  Coordinator: ${coordInput}`, 40, 56);
    doc.text(
      semesterDateRange
        ? `Semester dates: ${semesterDateRange}`
        : 'Semester dates: Not set by administration',
      40,
      70
    );
    autoTable(doc, {
      startY: 86,
      head: [['Day', 'Time', 'Course Code', 'Subject', 'Teacher', 'Division', 'Semester / Class', 'Classroom']],
      body: scheduleSlots.map(slot => [
        slot.day || '',
        slot.timeSlot || '',
        slot.course?.code || '',
        slot.course?.title || '',
        slot.teacher?.name || '',
        slot.division || division,
        semOrStdLabel,
        slot.classroom || roomInput
      ]),
      styles: { fontSize: 8, cellPadding: 5 },
      headStyles: { fillColor: [11, 37, 69] },
      alternateRowStyles: { fillColor: [241, 245, 249] }
    });
    const safeLabel = semOrStdLabel.replace(/[^\w-]+/g, '_');
    doc.save(`Timetable_${safeLabel}_Div_${division}_${yearRange}.pdf`);
  };

  // Build legendSubjects dynamically from semesterSubjects prop (admin-added subjects)
  // Fall back to courses already in the timetable if no semesterSubjects provided
  const legendSubjects = (() => {
    if (semesterSubjects && semesterSubjects.length > 0) {
      const uniqueSubjects = new Map();
      semesterSubjects.forEach(subject => {
        const sectionMatch = String(subject.title || '').match(/^(.*?)(?:\s*-\s*|\s+)Section\s+([A-F])$/i);
        const subjectDivision = String(subject.division || sectionMatch?.[2] || '').toUpperCase();
        if (subjectDivision && subjectDivision !== division.toUpperCase()) return;
        const legacyDivision = sectionMatch?.[2]?.toUpperCase();
        const displayCode = legacyDivision && subject.code?.toUpperCase().endsWith(legacyDivision)
          ? subject.code.replace(new RegExp(`[-_ ]?${legacyDivision}$`, 'i'), '')
          : subject.code;
        if (uniqueSubjects.has(displayCode.toUpperCase())) return;
        uniqueSubjects.set(displayCode.toUpperCase(), {
          code: subject.code,
          displayCode,
          title: sectionMatch ? sectionMatch[1].trim() : subject.title,
          credits: subject.semesterHours
            ? `(${subject.semesterHours} hrs/semester)`
            : subject.weeklyHours ? `(${subject.weeklyHours} hrs/wk)` : '',
          defaultTeacher: subject.teacher?.name || ''
        });
      });
      return Array.from(uniqueSubjects.values());
    }
    // Derive from unique courses in the timetable slots
    const seen = new Set();
    const derived = [];
    for (const slot of slots) {
      const code = slot.course?.code;
      if (code && !seen.has(code)) {
        seen.add(code);
        derived.push({
          code,
          title: slot.course?.title || code,
          credits: '',
          defaultTeacher: slot.teacher?.name || ''
        });
      }
    }
    return derived;
  })();

  const getCourseForCode = (code) => courses.find(course =>
    course.code === code && String(course.section || '').toUpperCase() === division.toUpperCase()
  ) || courses.find(course => {
      const sectionMatch = String(course.title || '').match(/^(.*?)(?:\s*-\s*|\s+)Section\s+([A-F])$/i);
      const division = sectionMatch?.[2]?.toUpperCase();
      const normalizedCode = division && course.code?.toUpperCase().endsWith(division)
        ? course.code.replace(new RegExp(`[-_ ]?${division}$`, 'i'), '')
        : course.code;
      return normalizedCode?.toUpperCase() === code?.toUpperCase();
    });

  const getAvailableTeachersForSubject = (subject) => {
    const subjectCode = String(subject.displayCode || subject.code || '').toUpperCase();
    const unavailable = new Set();
    const markBusy = (teacherValue, itemCode, itemTitle, itemDivision) => {
      const teacherId = String(teacherValue?._id || teacherValue || '');
      const sectionMatch = String(itemTitle || '').match(/^(.*?)(?:\s*-\s*|\s+)Section\s+([A-F])$/i);
      const normalizedCode = String(itemCode || '').toUpperCase().replace(
        sectionMatch ? new RegExp(`[-_ ]?${sectionMatch[2]}$`, 'i') : /$^/,
        ''
      );
      const assignedDivision = String(itemDivision || sectionMatch?.[2] || '').toUpperCase();
      if (!teacherId || (assignedDivision && assignedDivision !== division.toUpperCase()) ||
          normalizedCode === subjectCode) return;
      unavailable.add(teacherId);
    };

    courses.forEach(course => markBusy(course.teacher, course.code, course.title, course.section));
    semesterSubjects.forEach(item => markBusy(item.teacher, item.code, item.title, item.division));
    return teachers.filter(teacher => !unavailable.has(String(teacher._id)));
  };

  return (
    <div className="w-full space-y-4">

      {/* Timetable download */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#071b34] border border-[#133966] p-3 rounded-2xl print:hidden">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#00C49F]" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            {timetableHeaderTitle} — Division {division}
          </span>
          <span className="text-[11px] font-mono text-cyan-200 bg-[#00a896]/20 px-2 py-0.5 rounded-full border border-[#00a896]/30">
            {semesterDateRange ? `Dates: ${semesterDateRange}` : semesterDatesLoading ? 'Loading semester dates...' : semesterDatesError ? 'Semester dates unavailable' : 'Semester dates not set'}
          </span>
        </div>
        {semesterDatesError && (
          <p role="status" className="w-full text-[10px] text-amber-300">{semesterDatesError}</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadCSV}
            disabled={!slots.length}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] hover:opacity-95 text-[#040d1a] text-xs font-black flex items-center gap-1.5 shadow-md transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Download Semester Schedule (CSV)
          </button>
          <button
            type="button"
            onClick={handleDownloadPDF}
            disabled={!slots.length}
            className="px-3.5 py-1.5 rounded-xl border border-[#00a896]/50 bg-[#040d1a] hover:border-[#00C49F] text-cyan-100 text-xs font-black flex items-center gap-1.5 shadow-md transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Download Schedule (PDF)
          </button>
        </div>
      </div>
      
      {/* Visual Timetable Document Container (Target for Official Print View) */}
      <div
        id="printable-timetable-sheet"
        className="printable-timetable-sheet bg-white text-slate-900 rounded-3xl p-4 sm:p-6 shadow-2xl border-2 border-slate-300 font-sans overflow-x-auto print:border-none print:shadow-none print:p-0"
      >
        
        {/* Document Header Table Banner */}
        <div className="border-2 border-black mb-0">
          
          {/* Main Title Row */}
          <div className="bg-[#bfe2f7] py-2 px-4 text-center font-black tracking-wide text-black text-xs sm:text-sm uppercase border-b-2 border-black">
            {timetableHeaderTitle}
          </div>

          <div className="border-b-2 border-black bg-[#f2f6fa] px-4 py-1.5 text-center text-[10px] font-bold uppercase text-slate-800">
            Semester dates: {semesterDateRange || (semesterDatesLoading ? 'Loading...' : semesterDatesError ? 'Unavailable' : 'Not set by administration')}
          </div>

          {/* Division, Coordinator, Class Room Row */}
          <div className="grid grid-cols-12 text-[11px] sm:text-xs font-bold divide-x-2 divide-black bg-[#f2f6fa]">
            
            {/* Division */}
            <div className="col-span-2 py-2 px-3 bg-[#e8f1f8] font-black uppercase flex items-center">
              DIVISION-{division}
            </div>

            {/* Coordinator */}
            <div className="col-span-7 py-2 px-3 flex items-center justify-between">
              <div>
                <span className="text-slate-600 font-semibold mr-1">CLASS COORDINATOR:</span>
                <span className="font-extrabold uppercase text-slate-950">{coordInput}</span>
              </div>
              {isAdmin && !editingHeader && (
                <button
                  onClick={() => setEditingHeader(true)}
                  className="text-[10px] text-blue-700 hover:underline flex items-center gap-1 font-mono print:hidden"
                >
                  <Edit3 className="w-3 h-3" /> Edit
                </button>
              )}
            </div>

            {/* Class Room */}
            <div className="col-span-3 py-2 px-3 bg-[#e8f1f8] flex items-center justify-between">
              <div>
                <span className="text-slate-600 font-semibold mr-1">CLASS ROOM :</span>
                <span className="font-extrabold uppercase text-slate-950">{roomInput}</span>
              </div>
              {isAdmin && !editingHeader && (
                <button
                  onClick={() => setEditingHeader(true)}
                  className="text-[10px] text-blue-700 hover:underline flex items-center gap-1 font-mono print:hidden"
                >
                  <Edit3 className="w-3 h-3" /> Edit
                </button>
              )}
            </div>
          </div>

          {/* Inline Header Editor for Admin */}
          {editingHeader && (
            <div className="p-3 bg-amber-50 border-t-2 border-black flex flex-wrap items-center gap-3 text-xs print:hidden">
              <div>
                <label className="text-[10px] font-bold text-slate-700 block">Class Coordinator:</label>
                <input
                  type="text"
                  value={coordInput}
                  onChange={(e) => setCoordInput(e.target.value)}
                  className="px-2 py-1 border border-black rounded text-xs font-bold"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-700 block">Allocated Classroom / Hall:</label>
                <input
                  type="text"
                  value={roomInput}
                  onChange={(e) => setRoomInput(e.target.value)}
                  className="px-2 py-1 border border-black rounded text-xs font-bold"
                />
              </div>
              <div className="flex items-center gap-2 mt-3.5">
                <button
                  onClick={handleSaveHeader}
                  className="px-3 py-1 bg-emerald-600 text-white font-bold rounded text-xs hover:bg-emerald-700"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingHeader(false)}
                  className="px-2.5 py-1 text-slate-600 text-xs hover:text-black"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Main Weekly Timetable Grid Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border-2 border-black text-center text-xs font-semibold">
            
            {/* Header Row */}
            <thead>
              <tr className="bg-[#fce5cd] text-black divide-x-2 divide-black border-b-2 border-black text-[11px] font-black uppercase">
                <th className="py-2.5 px-3 w-36 tracking-wider">
                  <div className="flex items-center justify-center gap-1">
                    <span>TIMINGS</span>
                    {isAdmin && (
                      <span className="text-[9px] text-blue-700 font-mono font-bold print:hidden" title="Click ✏️ next to any timing below to edit">
                        [✏️]
                      </span>
                    )}
                  </div>
                </th>
                {days.map(d => (
                  <th key={d} className="py-2.5 px-3 tracking-wider">{d}</th>
                ))}
              </tr>
            </thead>

            {/* Timetable Rows */}
            <tbody className="divide-y-2 divide-black">
              {periodRows.map((row, idx) => {
                
                // Break Rows (Tea Break / Lunch Break)
                if (row.type === 'break') {
                  return (
                    <tr key={row.id || idx} className="bg-[#fff2cc] border-y-2 border-black">
                      <td className="py-2 px-2 text-[10px] font-mono font-bold text-slate-800 border-r-2 border-black group relative">
                        {editingTimingIdx === idx ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={timingInput}
                              onChange={(e) => setTimingInput(e.target.value)}
                              className="w-20 px-1 py-0.5 text-[10px] border border-black rounded font-mono"
                            />
                            <button
                              onClick={() => handleSaveTiming(idx)}
                              className="text-[9px] bg-emerald-600 text-white px-1.5 py-0.5 rounded font-bold"
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => setEditingTimingIdx(null)}
                              className="text-[9px] text-slate-500 hover:text-black px-1"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div
                            onClick={() => {
                              if (isAdmin) {
                                setEditingTimingIdx(idx);
                                setTimingInput(row.time);
                              }
                            }}
                            className={`flex items-center justify-between ${isAdmin ? 'cursor-pointer hover:bg-amber-100/70 p-0.5 rounded' : ''}`}
                            title={isAdmin ? "Click to edit break timing" : ""}
                          >
                            <span>{row.time}</span>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingTimingIdx(idx);
                                  setTimingInput(row.time);
                                }}
                                className="text-blue-700 hover:text-blue-900 ml-1 print:hidden p-0.5"
                                title="Edit break timing"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td
                        colSpan={6}
                        className="py-1.5 text-center font-black text-rose-700 tracking-widest text-xs uppercase"
                      >
                        {row.label}
                      </td>
                    </tr>
                  );
                }

                // Regular Lecture Periods (Fully Editable Timings)
                return (
                  <tr key={row.id || idx} className="divide-x-2 divide-black hover:bg-slate-50 transition-colors">
                    
                    {/* Timing Column (Click ✏️ or cell to edit period timing directly) */}
                    <td className="py-3 px-2 font-mono font-bold text-[11px] bg-[#f9fafb] text-slate-800 whitespace-nowrap group relative">
                      {editingTimingIdx === idx ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={timingInput}
                            onChange={(e) => setTimingInput(e.target.value)}
                            className="w-24 px-1 py-0.5 text-[10px] border border-black rounded font-mono"
                          />
                          <button
                            onClick={() => handleSaveTiming(idx)}
                            className="text-[9px] bg-emerald-600 text-white px-1.5 py-0.5 rounded font-bold"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingTimingIdx(null)}
                            className="text-[9px] text-slate-500 hover:text-black px-1"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={() => {
                            if (isAdmin) {
                              setEditingTimingIdx(idx);
                              setTimingInput(row.label);
                            }
                          }}
                          className={`flex items-center justify-between ${isAdmin ? 'cursor-pointer hover:bg-amber-100/70 p-0.5 rounded' : ''}`}
                          title={isAdmin ? "Click to edit period timing" : ""}
                        >
                          <span>{row.label}</span>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingTimingIdx(idx);
                                setTimingInput(row.label);
                              }}
                              className="text-blue-700 hover:text-blue-900 ml-1.5 print:hidden p-0.5"
                              title="Edit period timing"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Day Cells (Mon - Sat) */}
                    {days.map(d => {
                      const slot = findSlot(d, row.time);
                      const shortCode = getCourseShortCode(slot);
                      const isMiniProject = shortCode.includes('Mini Project');
                      const isLab = shortCode.includes('LAB');
                      const slotTeacherId = slot?.teacher?._id || slot?.teacher;
                      const isMyAssignment = Boolean(highlightTeacherId && slotTeacherId?.toString() === highlightTeacherId.toString());

                      return (
                        <td
                          key={d}
                          onClick={() => handleCellClick(d, row.time)}
                          className={`py-2 px-2 h-14 relative align-middle transition-all group ${
                            isAdmin ? 'cursor-pointer hover:bg-amber-100/60' : ''
                          } ${
                            isMyAssignment ? 'bg-emerald-100 ring-inset ring-2 ring-emerald-500' :
                              isLab ? 'bg-[#e6f4ea]' : isMiniProject ? 'bg-[#fce8e6]' : ''
                          }`}
                        >
                          {slot ? (
                            <div className="flex flex-col items-center justify-center leading-tight">
                              <span className="font-extrabold text-slate-900 text-xs">
                                {shortCode}
                              </span>
                              {slot.teacher?.name && (
                                <span className="text-[10px] text-slate-600 font-medium mt-0.5">
                                  {slot.teacher.name.split(' ').slice(0, 2).join(' ')}
                                </span>
                              )}
                              {isMyAssignment && (
                                <span className="text-[8px] uppercase font-black tracking-wide text-emerald-800">My assignment</span>
                              )}
                              {slot.classroom && slot.classroom !== classroom && (
                                <span className="text-[9px] font-mono text-emerald-800 bg-emerald-100 px-1 rounded mt-0.5">
                                  {slot.classroom.replace('Class Room: ', '')}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300 text-xs font-mono">
                              {isAdmin ? <Plus className="w-3.5 h-3.5 mx-auto opacity-0 group-hover:opacity-100 text-amber-600 transition-opacity" /> : '—'}
                            </span>
                          )}

                          {isAdmin && slot && (
                            <Edit3 className="w-3 h-3 absolute top-1 right-1 text-slate-400 group-hover:text-amber-700 opacity-0 group-hover:opacity-100 transition-opacity print:hidden" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Legend: Subject, Faculty & Lab Allocation Table (Directly assign teachers right here!) */}
        <div className="mt-4 border-2 border-black text-xs font-medium divide-y-2 divide-black">
          
          {/* Header Row */}
          <div className="grid grid-cols-12 font-extrabold uppercase bg-[#e1edf7] divide-x-2 divide-black text-center text-[11px] py-1.5">
            <div className="col-span-4">Subject [Code]</div>
            <div className="col-span-2">Faculty (Assigned Here)</div>
            <div className="col-span-4">Subject [Code]</div>
            <div className="col-span-2">Faculty (Assigned Here)</div>
          </div>

          {/* Dynamic 2-column Grid of Courses & Assigned Faculty */}
          {Array.from({ length: Math.max(4, Math.ceil(legendSubjects.length / 2)) }, (_, row) => {
            const i = row * 2;
            const left = legendSubjects[i];
            const right = legendSubjects[i + 1];

            const renderFacultyCell = (subj) => {
              if (!subj) return <span>—</span>;
              const course = getCourseForCode(subj.code);
              const teacherIdFromLegend = legendTeachers[subj.code];
              const teacherIdFromCourse = course?.teacher?._id || course?.teacher;
              const defaultTeacherObj = teachers.find(t => t.name.toLowerCase().includes(subj.defaultTeacher.toLowerCase()) || subj.defaultTeacher.toLowerCase().includes(t.name.toLowerCase()));
              const activeTeacherId = teacherIdFromLegend || teacherIdFromCourse || defaultTeacherObj?._id || '';
              const activeTeacherObj = teachers.find(t => t._id === activeTeacherId);
              const displayName = activeTeacherObj?.name || subj.defaultTeacher;

              if (isAdmin) {
                return (
                  <div className="w-full flex items-center">
                    <select
                      value={activeTeacherId}
                      onChange={(e) => handleLegendTeacherChange(subj, e.target.value)}
                      className="w-full bg-amber-50 border border-slate-400 rounded px-1 py-0.5 text-[10px] font-bold text-slate-900 focus:outline-none print:hidden"
                    >
                      <option value="">Select Faculty...</option>
                      {getAvailableTeachersForSubject(subj).map(t => (
                        <option key={t._id} value={t._id}>{t.name}</option>
                      ))}
                    </select>
                    <span className="hidden print:inline text-[10px] font-bold uppercase text-black">
                      {displayName}
                    </span>
                  </div>
                );
              }

              return (
                <span className="text-[10px] font-bold uppercase">
                  {displayName}
                </span>
              );
            };

            return (
              <div key={i} className={`grid grid-cols-12 divide-x-2 divide-black py-1.5 px-2 text-[11px] ${i % 4 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                
                {/* Left Subject */}
                <div className="col-span-4 pl-1 flex items-center">
                  {left ? <span>{left.title} [{left.displayCode || left.code}] {left.credits}</span> : <span>—</span>}
                </div>

                {/* Left Faculty (Editable inline by Admin for all courses) */}
                <div className="col-span-2 font-bold pl-1 uppercase text-slate-900 flex items-center">
                  {renderFacultyCell(left)}
                </div>

                {/* Right Subject */}
                <div className="col-span-4 pl-1 flex items-center">
                  {right ? <span>{right.title} [{right.displayCode || right.code}] {right.credits}</span> : <span>—</span>}
                </div>

                {/* Right Faculty (Editable inline by Admin for all courses, including Salesforce) */}
                <div className="col-span-2 font-bold pl-1 uppercase text-slate-900 flex items-center">
                  {renderFacultyCell(right)}
                </div>
              </div>
            );
          })}

          {/* Lab assignments are displayed read-only in the timetable. */}
          <div className="grid grid-cols-12 font-extrabold uppercase bg-[#bfe2f7] divide-x-2 divide-black text-center text-[10px] py-1.5 border-t-2 border-black items-center">
            <div className="col-span-2">Division/Batch</div>
            <div className="col-span-4">Lab Name</div>
            <div className="col-span-3">Lab Number</div>
            <div className="col-span-3">Faculty In-Charge</div>
          </div>

          {labRows.map((lab, idx) => (
            <div
              key={lab.id || idx}
              className={`grid grid-cols-12 divide-x-2 divide-black py-1.5 px-2 text-[10.5px] items-center ${
                idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'
              }`}
            >
              <div className="col-span-2 text-center font-bold">
                <span>{lab.division}</span>
              </div>
              <div className="col-span-4 pl-1">
                <span>{lab.labName}</span>
              </div>
              <div className="col-span-3 font-mono font-bold text-center">
                <span>{lab.labNumber}</span>
              </div>
              <div className="col-span-3 font-bold pl-1 flex items-center">
                <span>{lab.faculty}</span>
              </div>
            </div>
          ))}

        </div>

        {/* Footer Note */}
        <div className="mt-2 text-right text-[10px] text-slate-500 font-mono">
          * Authorized by Institutional Academic Dean & Timetable Committee • Generated via MetricsEdu
        </div>
      </div>

      {/* Admin Slot Edit Modal with Proper Conflict & 15-min Break Validation */}
      {editingSlot && (
        <div className="fixed inset-0 z-50 bg-[#040d1a]/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#071b34] border border-[#133966] rounded-3xl p-6 shadow-2xl text-white">
            <div className="flex items-center justify-between pb-3 border-b border-[#133966] mb-4">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-[#00C49F]" />
                <h3 className="text-base font-bold text-white">
                  {editingSlot?.isNew ? 'Assign Lecture Slot' : 'Edit Lecture Slot'}
                </h3>
              </div>
              <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#00a896]/20 text-[#00C49F]">
                Div {division} • {modalDay}
              </span>
            </div>

            {/* Error Message Alert (Conflict & Break Violation) */}
            {modalError && (
              <div className="p-3 mb-4 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs font-medium flex items-start gap-2 shadow-sm">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="leading-snug">{modalError}</div>
              </div>
            )}

            <form onSubmit={handleSaveModal} className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-slate-300 font-bold block mb-1">Day of Week</label>
                  <select
                    value={modalDay}
                    onChange={(e) => { setModalDay(e.target.value); setModalError(''); }}
                    className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2 text-white focus:outline-none"
                  >
                    {fullDays.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-slate-300 font-bold block mb-1">Time Period (Editable)</label>
                  <input
                    type="text"
                    value={modalSlot}
                    onChange={(e) => { setModalSlot(e.target.value); setModalError(''); }}
                    placeholder="e.g. 08:30-09:25"
                    className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-[#00a896]"
                  />
                </div>
              </div>

              {/* Subject / Course — shows inline conflict hint if already in same row/col */}
              <div>
                <label className="text-xs text-slate-300 font-bold block mb-1">Assigned Subject / Course</label>
                <select
                  value={modalCourseId}
                  onChange={(e) => { setModalCourseId(e.target.value); setModalError(''); }}
                  className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none font-medium"
                >
                  {coursesForDivision.map(c => {
                    const rowColConflict = getCourseConflictReason(c._id, modalDay, modalSlot, editingSlot?._id);
                    return (
                      <option key={c._id} value={c._id} disabled={!!rowColConflict} style={{ color: rowColConflict ? '#f87171' : undefined }}>
                        {rowColConflict ? `🚫 ${c.code} – already used (row/col conflict)` : `${c.code} - ${c.title}`}
                      </option>
                    );
                  })}
                </select>
                {/* Live row/col conflict hint below the dropdown */}
                {(() => {
                  const hint = getCourseConflictReason(modalCourseId, modalDay, modalSlot, editingSlot?._id);
                  return hint ? (
                    <p className="mt-1 text-[10px] text-rose-400 flex items-start gap-1 leading-snug">
                      <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                      {hint.replace('❌ ', '')}
                    </p>
                  ) : null;
                })()}
              </div>

              {/* Assigned Teacher — only shows FREE teachers (no overlap, >= 15 min gap) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-300 font-bold">Assigned Teacher</label>
                  <span className="text-[10px] text-amber-300 font-mono">only free faculty shown ✓</span>
                </div>
                {(() => {
                  const selectedCourse = coursesForDivision.find(course => course._id === modalCourseId);
                  const subjectAvailableTeachers = selectedCourse
                    ? getAvailableTeachersForSubject({ code: selectedCourse.code })
                    : teachers;
                  const subjectAvailableIds = new Set(subjectAvailableTeachers.map(teacher => String(teacher._id)));
                  const freeTeachers = getFreeTeachersForSlot(modalDay, modalSlot, editingSlot?._id)
                    .filter(teacher => subjectAvailableIds.has(String(teacher._id)));
                  const busyTeachers = teachers.filter(t => !freeTeachers.find(f => f._id === t._id));
                  // If currently selected teacher is busy (edge case on day/slot change), clear them
                  const selectedIsBusy = !!busyTeachers.find(t => t._id === modalTeacherId);
                  return (
                    <>
                      <select
                        value={selectedIsBusy ? '' : modalTeacherId}
                        onChange={(e) => { setModalTeacherId(e.target.value); setModalError(''); }}
                        className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none font-medium"
                      >
                        <option value="">— Select Faculty —</option>
                        {/* Free teachers */}
                        {freeTeachers.length > 0 && (
                          <optgroup label="✅ Available Faculty">
                            {freeTeachers.map(t => (
                              <option key={t._id} value={t._id}>
                                {t.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {/* Busy teachers (disabled) */}
                        {busyTeachers.length > 0 && (
                          <optgroup label="🔴 Busy / Insufficient Break">
                            {busyTeachers.map(t => (
                              <option key={t._id} value={t._id} disabled style={{ color: '#f87171' }}>
                                🚫 {t.name} — not available
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      {freeTeachers.length === 0 && (
                        <p className="mt-1 text-[10px] text-rose-400 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          No faculty available for this slot — all have overlapping classes or insufficient break.
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Classroom Allocation */}
              <div>
                <label className="text-xs text-slate-300 font-bold block mb-1">Allocated Classroom / Lab</label>
                <input
                  type="text"
                  value={modalClassroom}
                  onChange={(e) => setModalClassroom(e.target.value)}
                  placeholder="e.g. Class Room: AS-11"
                  className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2 text-xs text-white focus:outline-none font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#133966]">
                <button
                  type="button"
                  onClick={() => setEditingSlot(null)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] text-xs font-bold shadow-md hover:opacity-95"
                >
                  Save Slot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
