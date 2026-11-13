import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Megaphone, BookOpen, FileText, Trash2, Upload, Plus, RefreshCw, Download, Check, Award, CheckCircle2, XCircle, Users } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { api } from '../services/api';

const dateValue = (date) => {
  const value = new Date(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
};
const formatEventDate = (date) => new Date(`${String(date).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
  day: 'numeric', month: 'short', year: 'numeric'
});
const calendarDataCache = { events: null, semesters: null, timestamp: 0 };
const eventGroupKey = event => JSON.stringify([
  event.title?.trim().toLowerCase(),
  event.description?.trim(),
  event.category,
  dateValue(event.startDate),
  dateValue(event.endDate),
  event.branch || '',
  event.standard || '',
  event.pucYear || '',
  event.pucDept || '',
  event.division || ''
]);
const eventCohortLabel = event => {
  const branch = event.branch ? ` · ${event.branch}` : '';
  if (event.semester) return `Semester ${event.semester}${branch}`;
  if (event.standard) return event.standard;
  if (event.pucYear) return `${event.pucYear}${event.pucDept ? ` · ${event.pucDept}` : ''}`;
  return branch ? `All semesters${branch}` : 'Institution-wide';
};
const groupEvents = events => {
  const groups = new Map();
  events.forEach(event => {
    const key = eventGroupKey(event);
    const group = groups.get(key);
    if (group) {
      group._ids.push(event._id);
      group._cohorts.push(event);
    } else {
      groups.set(key, { ...event, _ids: [event._id], _cohorts: [event] });
    }
  });
  return [...groups.values()].map(group => {
    const cohortLabels = [...new Set(group._cohorts.map(eventCohortLabel))];
    const semesters = group._cohorts
      .map(event => Number(event.semester))
      .filter(Number.isFinite);
    const cohort = semesters.length
      ? `Semester${new Set(semesters).size > 1 ? 's' : ''} ${[...new Set(semesters)].sort((a, b) => a - b).join(', ')}${group.branch ? ` · ${group.branch}` : ''}`
      : cohortLabels.join(', ');
    return { ...group, cohort };
  });
};
const adminCohortValue = cohort => {
  if (cohort.semester) return `semester:${cohort.semester}`;
  if (cohort.standard) return `standard:${cohort.standard}`;
  if (cohort.pucYear) return `pucYear:${cohort.pucYear}`;
  return 'all';
};
const matchesEventCohort = (item, cohortValue) => {
  const separatorIndex = cohortValue.indexOf(':');
  if (separatorIndex < 0) return true;
  const selectedField = cohortValue.slice(0, separatorIndex);
  const field = selectedField === 'semester' ? 'semester' : selectedField;
  const value = cohortValue.slice(separatorIndex + 1);
  return !item[field] || String(item[field]) === value;
};
const matchesSemesterCohort = (semester, cohortValue) => {
  const separatorIndex = cohortValue.indexOf(':');
  if (separatorIndex < 0) return true;
  const selectedField = cohortValue.slice(0, separatorIndex);
  const field = selectedField === 'semester' ? 'semesterNumber' : selectedField;
  return String(semester[field] ?? '') === cohortValue.slice(separatorIndex + 1);
};

const EMPTY_EVENT = {
  title: '', description: '', category: 'event',
  startDate: dateValue(new Date()), endDate: dateValue(new Date())
};
const createEmptyQuestion = () => ({ prompt: '', options: ['', ''], correctAnswerIndex: 0 });

export default function AcademicHub({ user, adminCohort = {}, page = 'calendar' }) {
  const [events, setEvents] = useState([]);
  const [semesterDates, setSemesterDates] = useState([]);
  const [scheduledListCohort, setScheduledListCohort] = useState(() => adminCohortValue(adminCohort));
  const [posts, setPosts] = useState([]);
  const [courses, setCourses] = useState([]);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(dateValue(new Date()));
  const [eventForm, setEventForm] = useState(EMPTY_EVENT);
  const [selectedEventCohort, setSelectedEventCohort] = useState('all');
  const [eventTarget, setEventTarget] = useState(() => {
    if (adminCohort.semester) return `semester:${adminCohort.semester}`;
    if (adminCohort.standard) return `standard:${adminCohort.standard}`;
    if (adminCohort.pucYear) return `pucYear:${adminCohort.pucYear}`;
    return 'all';
  });
  const [examTargets, setExamTargets] = useState(() => {
    if (adminCohort.semester) return [`semester:${adminCohort.semester}`];
    if (adminCohort.standard) return [`standard:${adminCohort.standard}`];
    if (adminCohort.pucYear) return [`pucYear:${adminCohort.pucYear}`];
    return [];
  });
  const [selectedSubjectId, setSelectedSubjectId] = useState('all');
  const [postForm, setPostForm] = useState({
    type: 'announcement', title: '', body: '', courseId: '',
    questions: [createEmptyQuestion()]
  });
  const [attachment, setAttachment] = useState(null);
  const [announcementFilter, setAnnouncementFilter] = useState('all');
  const [quizAnswers, setQuizAnswers] = useState({});
  const [submittingQuiz, setSubmittingQuiz] = useState({});
  const [viewingResults, setViewingResults] = useState({});
  const [quizResultsData, setQuizResultsData] = useState({});
  const attachmentInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isAdmin = user?.role === 'admin';
  const isTeacher = user?.role === 'teacher';
  const isCalendarPage = page === 'calendar';
  const isAnnouncementPage = page === 'announcements';
  const isMaterialsPage = page === 'materials';
  const hasCohortFilter = isAdmin || isTeacher;
  const institutionType = user?.institutionType === 'college' ? 'institute' : user?.institutionType;

  useEffect(() => {
    if (isAdmin) setScheduledListCohort(adminCohortValue(adminCohort));
  }, [isAdmin, adminCohort.semester, adminCohort.standard, adminCohort.pucYear]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      if (isCalendarPage) {
        const [eventResponse, semesterResponse] = await Promise.all([
          api.getAcademicEvents(),
          api.getSemesters()
        ]);
        setEvents(eventResponse.events || []);
        setSemesterDates(semesterResponse.semesters || []);
      } else {
        const postResponse = await api.getLearningPosts();
        setPosts(postResponse.posts || []);
      }
      if (isTeacher && (isMaterialsPage || isAnnouncementPage)) {
        const courseResponse = await api.getTeacherCourses();
        setCourses(courseResponse.courses || []);
        setPostForm(previous => ({
          ...previous,
          type: isMaterialsPage ? (previous.type === 'quiz' ? 'quiz' : 'material') : 'announcement',
          courseId: courseResponse.courses?.some(course => course._id === previous.courseId)
            ? previous.courseId
            : courseResponse.courses?.[0]?._id || ''
        }));
      }
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [page, isTeacher, user?._id, adminCohort.branch, adminCohort.semester, adminCohort.standard, adminCohort.pucYear, adminCohort.pucDept, scheduledListCohort]);
  useEffect(() => {
    const refresh = () => loadData();
    window.addEventListener('focus', refresh);
    const intervalId = window.setInterval(refresh, 60000);
    return () => {
      window.removeEventListener('focus', refresh);
      window.clearInterval(intervalId);
    };
  }, [isTeacher, page, user?._id, adminCohort.branch, adminCohort.semester, adminCohort.standard, adminCohort.pucYear, adminCohort.pucDept, scheduledListCohort]);

  useEffect(() => {
    setPostForm(previous => ({
      ...previous,
      type: isMaterialsPage ? 'material' : 'announcement',
      questions: previous.questions?.length ? previous.questions : [createEmptyQuestion()]
    }));
  }, [page, isMaterialsPage]);

  const monthDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const startOffset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - startOffset);
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [month]);

  const eventCohortOptions = useMemo(() => {
    if (institutionType === 'school') {
      return Array.from({ length: 10 }, (_, index) => ({
        value: `standard:${index + 1}${['st', 'nd', 'rd'][index] || 'th'} Std`,
        label: `${index + 1}${['st', 'nd', 'rd'][index] || 'th'} Standard`
      }));
    }
    if (institutionType === 'pu_college') {
      return ['1st PUC', '2nd PUC'].map(year => ({ value: `pucYear:${year}`, label: year }));
    }
    const semesterCount = institutionType === 'diploma' ? 6 : 8;
    return Array.from({ length: semesterCount }, (_, index) => ({
      value: `semester:${index + 1}`,
      label: `Semester ${index + 1}`
    }));
  }, [institutionType]);
  const calendarEvents = useMemo(() => {
    const filterIndex = selectedEventCohort.indexOf(':');
    const field = filterIndex >= 0 ? selectedEventCohort.slice(0, filterIndex) : '';
    const value = filterIndex >= 0 ? selectedEventCohort.slice(filterIndex + 1) : '';
    return groupEvents(events.filter(event => {
      if (isAdmin && adminCohort.branch && event.branch && event.branch !== adminCohort.branch) return false;
      if (isAdmin && adminCohort.pucDept && event.pucDept && event.pucDept !== adminCohort.pucDept) return false;
      if (!hasCohortFilter || !field || !event[field]) return true;
      return String(event[field]) === value;
    }));
  }, [events, hasCohortFilter, isAdmin, adminCohort.branch, adminCohort.pucDept, selectedEventCohort]);
  const calendarSemesterDates = useMemo(() => {
    const filterIndex = selectedEventCohort.indexOf(':');
    const selectedField = filterIndex >= 0 ? selectedEventCohort.slice(0, filterIndex) : '';
    const field = selectedField === 'semester' ? 'semesterNumber' : selectedField;
    const value = filterIndex >= 0 ? selectedEventCohort.slice(filterIndex + 1) : '';
    return semesterDates.filter(semester => {
      if (isAdmin && adminCohort.branch && semester.branch && semester.branch !== adminCohort.branch) return false;
      if (isAdmin && adminCohort.pucDept && semester.pucDept && semester.pucDept !== adminCohort.pucDept) return false;
      if (!isAdmin && user?.role === 'student') {
        if (institutionType === 'school' && semester.standard !== user.standard) return false;
        if (institutionType === 'pu_college' &&
            (semester.pucYear !== user.pucYear || semester.pucDept !== (user.pucDept || user.department))) return false;
        if ((institutionType === 'institute' || institutionType === 'diploma') &&
            (semester.semesterNumber !== Number(user.semester) ||
             semester.branch !== (user.branch || user.department))) return false;
      }
      if (!isAdmin && user?.role === 'teacher') {
        if ((institutionType === 'institute' || institutionType === 'diploma') &&
            semester.branch !== (user.branch || user.department)) return false;
        if (institutionType === 'pu_college' &&
            semester.pucDept !== (user.pucDept || user.department)) return false;
      }
      return !field || !semester[field] || String(semester[field]) === value;
    });
  }, [semesterDates, isAdmin, adminCohort.branch, adminCohort.pucDept, selectedEventCohort, user, institutionType]);
  const scheduledListEvents = useMemo(() => groupEvents(events.filter(event => {
    if (isAdmin && adminCohort.branch && event.branch && event.branch !== adminCohort.branch) return false;
    if (isAdmin && adminCohort.pucDept && event.pucDept && event.pucDept !== adminCohort.pucDept) return false;
    return matchesEventCohort(event, scheduledListCohort);
  })), [events, isAdmin, adminCohort.branch, adminCohort.pucDept, scheduledListCohort]);
  const scheduledListSemesterDates = useMemo(() => semesterDates.filter(semester => {
    if (isAdmin && adminCohort.branch && semester.branch && semester.branch !== adminCohort.branch) return false;
    if (isAdmin && adminCohort.pucDept && semester.pucDept && semester.pucDept !== adminCohort.pucDept) return false;
    if (!isAdmin && user?.role === 'student') {
      if (institutionType === 'school' && semester.standard !== user.standard) return false;
      if (institutionType === 'pu_college' &&
          (semester.pucYear !== user.pucYear || semester.pucDept !== (user.pucDept || user.department))) return false;
      if ((institutionType === 'institute' || institutionType === 'diploma') &&
          (semester.semesterNumber !== Number(user.semester) ||
           semester.branch !== (user.branch || user.department))) return false;
    }
    if (!isAdmin && user?.role === 'teacher') {
      if ((institutionType === 'institute' || institutionType === 'diploma') &&
          semester.branch !== (user.branch || user.department)) return false;
      if (institutionType === 'pu_college' &&
          semester.pucDept !== (user.pucDept || user.department)) return false;
    }
    return matchesSemesterCohort(semester, scheduledListCohort);
  }), [semesterDates, isAdmin, adminCohort.branch, adminCohort.pucDept, scheduledListCohort, user, institutionType]);
  const eventsForDate = (date) => {
    const key = dateValue(date);
    return calendarEvents.filter(event => key >= dateValue(event.startDate) && key <= dateValue(event.endDate));
  };
  const selectedEvents = eventsForDate(new Date(`${selectedDate}T00:00:00`));
  const scheduledEvents = [...scheduledListEvents].sort((a, b) =>
    String(a.startDate).localeCompare(String(b.startDate)) || String(a.title).localeCompare(String(b.title))
  );
  const scheduledRows = [
    ...scheduledListSemesterDates.map(semester => ({
      id: `semester-${semester._id}`,
      type: 'Semester',
      title: semester.academicYear || 'Academic semester',
      category: 'Academic term',
      startDate: semester.startDate,
      endDate: semester.endDate,
      cohort: semester.semesterNumber
        ? `Semester ${semester.semesterNumber}${semester.branch ? ` · ${semester.branch}` : ''}`
        : semester.standard || (semester.pucYear ? `${semester.pucYear}${semester.pucDept ? ` · ${semester.pucDept}` : ''}` : 'Institution'),
      description: ''
    })),
    ...scheduledEvents.map(event => ({
      id: event._id,
      type: 'Event',
      title: event.title,
      category: event.category,
      startDate: event.startDate,
      endDate: event.endDate,
      cohort: event.cohort,
      description: event.description || '',
      eventIds: event._ids
    }))
  ].sort((a, b) =>
    a.cohort.localeCompare(b.cohort, undefined, { numeric: true }) ||
    String(a.startDate).localeCompare(String(b.startDate)) ||
    a.title.localeCompare(b.title)
  );

  const downloadScheduledList = (format) => {
    const cohortLabel = eventCohortOptions.find(option => option.value === scheduledListCohort)?.label || 'All cohorts';
    const cohortFilename = cohortLabel.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '');
    const filename = `Scheduled_Academic_Dates_${cohortFilename}_${new Date().toISOString().slice(0, 10)}`;
    if (format === 'csv') {
      const escapeCsv = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const rows = [
        ['Type', 'Title', 'Category', 'Start Date', 'End Date', 'Semester / Class', 'Details'],
        ...scheduledRows.map(row => [
          row.type, row.title, row.category, formatEventDate(row.startDate),
          formatEventDate(row.endDate), row.cohort, row.description
        ])
      ];
      const blob = new Blob([`\uFEFF${rows.map(row => row.map(escapeCsv).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      return;
    }

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(16);
    doc.text(`Scheduled Events and Semester Dates — ${cohortLabel}`, 40, 38);
    autoTable(doc, {
      startY: 54,
      head: [['Type', 'Title', 'Category', 'Start Date', 'End Date', 'Semester / Class', 'Details']],
      body: scheduledRows.map(row => [
        row.type, row.title, row.category, formatEventDate(row.startDate),
        formatEventDate(row.endDate), row.cohort, row.description
      ]),
      styles: { fontSize: 8, cellPadding: 5, overflow: 'linebreak' },
      headStyles: { fillColor: [11, 37, 69] },
      alternateRowStyles: { fillColor: [241, 245, 249] }
    });
    doc.save(`${filename}.pdf`);
  };

  const submitEvent = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const targets = eventForm.category === 'exam'
        ? examTargets
        : [eventTarget];
      if (eventForm.category === 'exam' && !targets.length) {
        throw new Error('Select at least one semester or class for this exam.');
      }
      const createEvent = async target => {
        const cohort = target === 'all'
          ? {
              branch: '',
              semester: null,
              standard: '',
              pucYear: '',
              pucDept: '',
              division: ''
            }
          : { ...adminCohort };
        if (target !== 'all') {
          const separatorIndex = target.indexOf(':');
          cohort[target.slice(0, separatorIndex)] = target.slice(separatorIndex + 1);
        }
        return api.createAcademicEvent({
          ...eventForm,
          ...cohort,
          institutionType: user.institutionType
        });
      };
      await Promise.all(targets.map(createEvent));
      setEventForm({ ...EMPTY_EVENT, startDate: selectedDate, endDate: selectedDate });
      await loadData();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const submitPost = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const formData = new FormData();
      const postType = isAnnouncementPage ? 'announcement' : postForm.type;
      formData.append('type', postType);
      formData.append('title', postForm.title);
      formData.append('body', postForm.body);
      if (isTeacher) {
        formData.append('courseId', postForm.courseId);
        if (postType === 'quiz') {
          const questions = postForm.questions.map(question => {
            const options = question.options.map(option => option.trim());
            return {
              prompt: question.prompt.trim(),
              options,
              correctAnswer: options[question.correctAnswerIndex]
            };
          });
          if (questions.some(question => !question.prompt || question.options.some(option => !option))) {
            throw new Error('Complete every question and option before publishing the quiz.');
          }
          formData.append('questions', JSON.stringify(questions));
        }
      }
      if (attachment) {
        const attachmentUrl = await api.uploadBlob(attachment, 'materials');
        if (attachmentUrl) formData.append('attachmentUrl', attachmentUrl);
        else formData.append('attachment', attachment);
      }
      await api.createLearningPost(formData);
      setPostForm(previous => ({
        ...previous,
        title: '',
        body: '',
        questions: [createEmptyQuestion()]
      }));
      setAttachment(null);
      if (attachmentInputRef.current) attachmentInputRef.current.value = '';
      await loadData();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async (eventIds) => {
    try {
      await Promise.all((Array.isArray(eventIds) ? eventIds : [eventIds]).map(eventId => api.deleteAcademicEvent(eventId)));
      await loadData();
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };
  const deletePost = async (postId) => {
    try {
      await api.deleteLearningPost(postId);
      await loadData();
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };
  const handleSelectQuizOption = (postId, qIndex, option) => {
    setQuizAnswers(prev => ({
      ...prev,
      [postId]: {
        ...(prev[postId] || {}),
        [qIndex]: option
      }
    }));
  };

  const handleQuizSubmit = async (postId, questions) => {
    const postAnswers = quizAnswers[postId] || {};
    const formatted = questions.map((_, idx) => ({
      questionIndex: idx,
      selectedOption: postAnswers[idx] || ''
    }));

    if (formatted.some(a => !a.selectedOption)) {
      alert('Please select an answer for all questions before submitting.');
      return;
    }

    setSubmittingQuiz(prev => ({ ...prev, [postId]: true }));
    try {
      const res = await api.submitQuiz(postId, formatted);
      setPosts(prev => prev.map(p => {
        if (p._id === postId) {
          return {
            ...p,
            mySubmission: res.submission
          };
        }
        return p;
      }));
    } catch (err) {
      alert(err.message || 'Failed to submit quiz.');
    } finally {
      setSubmittingQuiz(prev => ({ ...prev, [postId]: false }));
    }
  };

  const toggleQuizResults = async (postId) => {
    if (viewingResults[postId]) {
      setViewingResults(prev => ({ ...prev, [postId]: false }));
      return;
    }
    setViewingResults(prev => ({ ...prev, [postId]: true }));
    setQuizResultsData(prev => ({ ...prev, [postId]: { loading: true, results: [] } }));
    try {
      const res = await api.getQuizResults(postId);
      setQuizResultsData(prev => ({
        ...prev,
        [postId]: { loading: false, results: res.results || [] }
      }));
    } catch (err) {
      alert(err.message || 'Failed to load student marks.');
      setQuizResultsData(prev => ({ ...prev, [postId]: { loading: false, results: [] } }));
    }
  };

  const visiblePosts = posts.filter(post =>
    isAnnouncementPage ? post.type === 'announcement' : post.type === 'material' || post.type === 'quiz'
  ).filter(post => {
    if (selectedSubjectId !== 'all' && post.course?._id !== selectedSubjectId) return false;
    if (isAnnouncementPage && announcementFilter !== 'all') {
      const isClass = Boolean(post.course || post.authorRole === 'teacher');
      if (announcementFilter === 'class' && !isClass) return false;
      if (announcementFilter === 'institution' && isClass) return false;
    }
    return true;
  });
  const materialSubjects = [...new Map(
    posts.filter(post => post.type === 'material' || post.type === 'quiz')
      .filter(post => post.course?._id)
      .map(post => [post.course._id, post.course])
  ).values()];
  const updateQuestion = (questionIndex, update) => {
    setPostForm(previous => ({
      ...previous,
      questions: previous.questions.map((question, index) =>
        index === questionIndex ? { ...question, ...update } : question
      )
    }));
  };
  const updateQuestionOption = (questionIndex, optionIndex, value) => {
    const question = postForm.questions[questionIndex];
    const options = question.options.map((option, index) => index === optionIndex ? value : option);
    updateQuestion(questionIndex, { options });
  };
  const addQuestionOption = (questionIndex) => {
    const question = postForm.questions[questionIndex];
    updateQuestion(questionIndex, { options: [...question.options, ''] });
  };
  const removeQuestionOption = (questionIndex, optionIndex) => {
    const question = postForm.questions[questionIndex];
    if (question.options.length <= 2) return;
    const options = question.options.filter((_, index) => index !== optionIndex);
    const correctAnswerIndex = question.correctAnswerIndex === optionIndex
      ? 0
      : question.correctAnswerIndex > optionIndex ? question.correctAnswerIndex - 1 : question.correctAnswerIndex;
    updateQuestion(questionIndex, { options, correctAnswerIndex });
  };

  const removeQuestion = (questionIndex) => {
    setPostForm(previous => ({
      ...previous,
      questions: previous.questions.length > 1
        ? previous.questions.filter((_, index) => index !== questionIndex)
        : previous.questions
    }));
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {error && <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">{error}</div>}
      {isCalendarPage && <section className="rounded-2xl sm:rounded-3xl border border-[#133966] bg-[#071b34]/95 p-4 sm:p-6 shadow-xl space-y-4 sm:space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-white"><CalendarDays className="h-5 w-5 text-[#00C49F]" /> Academic Calendar</h2>
            <p className="mt-1 text-xs text-slate-400">Holidays, examinations, and campus events shared with your institution.</p>
          </div>
          <div className="flex items-center gap-2">
            {hasCohortFilter && (
              <select
                value={selectedEventCohort}
                onChange={event => setSelectedEventCohort(event.target.value)}
                aria-label="Filter calendar by academic level"
                className="rounded-xl border border-[#133966] bg-[#040d1a] px-3 py-2 text-xs text-white"
              >
                <option value="all">All semesters / classes</option>
                {eventCohortOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            )}
            <button type="button" onClick={loadData} className="rounded-xl border border-[#133966] p-2 text-slate-300 hover:text-white" aria-label="Refresh calendar">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,0.7fr)]">
          <div className="rounded-xl sm:rounded-2xl border border-[#133966] bg-[#040d1a] p-3 sm:p-4">
            <div className="mb-4 flex items-center justify-between">
              <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-lg p-2 text-slate-300 hover:bg-[#133966]" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
              <h3 className="text-sm font-bold text-white">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
              <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-lg p-2 text-slate-300 hover:bg-[#133966]" aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 sm:gap-1 text-center text-[10px] font-bold uppercase text-slate-500">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <span key={day} className="py-2">{day}</span>)}
              {monthDays.map(day => {
                const key = dateValue(day);
                const marked = eventsForDate(day);
                return (
                  <button key={key} type="button" onClick={() => setSelectedDate(key)}
                    className={`relative min-h-10 sm:min-h-12 rounded-lg border px-0.5 sm:px-1 py-1.5 sm:py-2 text-[11px] sm:text-xs ${day.getMonth() === month.getMonth() ? 'text-slate-200' : 'text-slate-600'} ${key === selectedDate ? 'border-[#00C49F] bg-[#00a896]/15' : 'border-transparent hover:border-[#133966]'}`}>
                    {day.getDate()}
                    {marked.length > 0 && <span className="absolute bottom-1 left-1/2 flex -translate-x-1/2 gap-0.5">{marked.slice(0, 3).map((item, index) => <i key={`${item._id}-${index}`} className={`h-1 w-1 rounded-full ${item.category === 'exam' ? 'bg-rose-400' : item.category === 'holiday' ? 'bg-amber-300' : 'bg-[#00C49F]'}`} />)}</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="rounded-xl sm:rounded-2xl border border-[#133966] bg-[#040d1a] p-3 sm:p-4">
            <h3 className="mb-3 text-sm font-bold text-white">{new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
            {selectedEvents.length ? <div className="space-y-2">{selectedEvents.map(event => (
              <article key={event._id} className="rounded-xl border border-[#133966] bg-[#071b34] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div><span className="text-[9px] font-bold uppercase tracking-wider text-[#00C49F]">{event.category}</span><h4 className="mt-1 text-xs font-bold text-white">{event.title}</h4></div>
                  {isAdmin && <button onClick={() => deleteEvent(event._ids || event._id)} aria-label="Delete event" className="text-rose-300 hover:text-rose-200"><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
                {event.description && <p className="mt-2 text-[11px] leading-relaxed text-slate-300">{event.description}</p>}
                <p className="mt-2 text-[10px] text-slate-400">
                  {formatEventDate(event.startDate)}{String(event.startDate).slice(0, 10) !== String(event.endDate).slice(0, 10) && ` – ${formatEventDate(event.endDate)}`}
                </p>
              </article>
            ))}</div> : <p className="py-5 text-center text-xs text-slate-500">No events scheduled.</p>}
          </div>
        </div>

        {isAdmin && (
          <form onSubmit={submitEvent} className="grid gap-3 rounded-xl sm:rounded-2xl border border-[#133966] bg-[#040d1a] p-3.5 sm:p-4 sm:grid-cols-2 lg:grid-cols-6">
            <input required maxLength={120} value={eventForm.title} onChange={e => setEventForm({ ...eventForm, title: e.target.value })} placeholder="Event title" className="lg:col-span-2 rounded-xl border border-[#133966] bg-[#071b34] px-3 py-2 text-xs text-white" />
            <label className="flex flex-col gap-1 text-[10px] font-bold text-slate-300">
              Event type
              <select value={eventForm.category} onChange={e => setEventForm({ ...eventForm, category: e.target.value })} className="rounded-xl border border-[#133966] bg-[#071b34] px-3 py-2 text-xs text-white">
              <option value="event">Campus event</option><option value="holiday">Holiday</option><option value="exam">Examination</option>
              </select>
            </label>
            {eventForm.category === 'exam' ? (
              <fieldset className="rounded-xl border border-[#133966] bg-[#071b34] p-3 sm:col-span-2 lg:col-span-2">
                <legend className="px-1 text-[10px] font-bold text-slate-300">Select all semesters / classes with this exam</legend>
                <div className="mt-1 grid max-h-32 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                  {eventCohortOptions.map(option => {
                    const checked = examTargets.includes(option.value);
                    return (
                      <label key={option.value} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-[10px] font-semibold transition-colors ${checked ? 'border-[#00C49F]/60 bg-[#00a896]/15 text-[#9df5e7]' : 'border-[#133966] bg-[#040d1a] text-slate-300 hover:border-[#00a896]/50'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setExamTargets(previous => checked
                            ? previous.filter(target => target !== option.value)
                            : [...previous, option.value])}
                          className="sr-only"
                        />
                        <span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? 'border-[#00C49F] bg-[#00C49F] text-[#040d1a]' : 'border-slate-500'}`}>
                          {checked && <Check className="h-3 w-3" />}
                        </span>
                        {option.label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ) : (
              <label className="flex flex-col gap-1 text-[10px] font-bold text-slate-300">
                Schedule for
                <select value={eventTarget} onChange={e => setEventTarget(e.target.value)} className="rounded-xl border border-[#133966] bg-[#071b34] px-3 py-2 text-xs text-white">
                  <option value="all">Common event — all semesters / classes</option>
                  {eventCohortOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1 text-[10px] font-bold text-slate-300">
              Start Date
              <input required type="date" value={eventForm.startDate} onChange={e => setEventForm({ ...eventForm, startDate: e.target.value })} className="w-full rounded-xl border border-[#133966] bg-[#071b34] px-3 py-2 text-xs text-white" />
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-bold text-slate-300">
              End Date
              <input required type="date" min={eventForm.startDate} value={eventForm.endDate} onChange={e => setEventForm({ ...eventForm, endDate: e.target.value })} className="w-full rounded-xl border border-[#133966] bg-[#071b34] px-3 py-2 text-xs text-white" />
            </label>
            <input maxLength={2000} value={eventForm.description} onChange={e => setEventForm({ ...eventForm, description: e.target.value })} placeholder="Details (optional)" className="sm:col-span-2 lg:col-span-4 rounded-xl border border-[#133966] bg-[#071b34] px-3 py-2 text-xs text-white" />
            <button disabled={saving || (eventForm.category === 'exam' && !examTargets.length)} className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] px-4 py-2 text-xs font-black text-[#040d1a] disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" /> Schedule {eventForm.category === 'exam' && examTargets.length > 1 ? `${examTargets.length} Exams` : ''}</button>
          </form>
        )}
        <section className="rounded-2xl border border-[#133966] bg-[#040d1a] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-white">Scheduled Events & Semester Dates</h3>
              <p className="mt-1 text-[10px] text-slate-400">Events, holidays, and semester start/end dates.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isAdmin && (
                <label className="flex items-center gap-2 text-[10px] font-semibold text-slate-400">
                  Schedule list
                  <select
                    value={scheduledListCohort}
                    onChange={event => setScheduledListCohort(event.target.value)}
                    aria-label="Filter scheduled list by semester or class"
                    className="rounded-lg border border-[#133966] bg-[#071b34] px-2.5 py-1.5 text-[10px] text-white"
                  >
                    <option value="all">All semesters / classes</option>
                    {eventCohortOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              )}
              <button type="button" disabled={!scheduledRows.length} onClick={() => downloadScheduledList('pdf')} className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[10px] font-bold text-rose-200 disabled:opacity-40">
                <Download className="h-3 w-3" /> PDF
              </button>
              <button type="button" disabled={!scheduledRows.length} onClick={() => downloadScheduledList('csv')} className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-bold text-emerald-200 disabled:opacity-40">
                <Download className="h-3 w-3" /> CSV
              </button>
            </div>
          </div>
          {loading ? <p className="py-4 text-center text-xs text-slate-400">Loading scheduled dates...</p> : scheduledRows.length ? (
            <div className="space-y-2">
              {!scheduledListSemesterDates.length && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[10px] text-amber-200">
                  Semester start and end dates are not configured for the selected academic cohort.
                </p>
              )}
              {scheduledRows.map(row => (
                <article key={row.id} className="flex flex-col gap-2 rounded-xl border border-[#133966] bg-[#071b34] p-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[#00C49F]">{row.type === 'Semester' ? 'SEMESTER START / END DATES' : `${row.type} · ${row.category}`}</span>
                    <h4 className="mt-1 text-xs font-bold text-white">{row.title}</h4>
                    <p className="mt-1 text-[10px] text-slate-300">
                      Start Date: {formatEventDate(row.startDate)} <span className="mx-1 text-slate-500">|</span> End Date: {formatEventDate(row.endDate)}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400">{row.cohort}</p>
                    {row.description && <p className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-400">{row.description}</p>}
                  </div>
                  {isAdmin && row.type === 'Event' && <button type="button" onClick={() => deleteEvent(row.eventIds || row.id)} aria-label={`Delete ${row.title}`} className="self-end text-rose-300 hover:text-rose-200 sm:self-start"><Trash2 className="h-3.5 w-3.5" /></button>}
                </article>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {!scheduledListSemesterDates.length && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[10px] text-amber-200">
                  Semester start and end dates are not configured for the selected academic cohort.
                </p>
              )}
              <p className="py-4 text-center text-xs text-slate-500">No events or semester dates are available.</p>
            </div>
          )}
        </section>
      </section>}

      {!isCalendarPage && (isTeacher || user?.role === 'student' || (isAdmin && isAnnouncementPage)) && <section className="rounded-2xl sm:rounded-3xl border border-[#133966] bg-[#071b34]/95 p-4 sm:p-6 shadow-xl space-y-4 sm:space-y-5">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-white">
            {isAnnouncementPage ? <Megaphone className="h-5 w-5 text-[#00C49F]" /> : <BookOpen className="h-5 w-5 text-[#00C49F]" />}
            {isAnnouncementPage ? 'Announcements' : 'Study Materials & Quizzes'}
          </h2>
          <p className="mt-1 text-xs text-slate-400">{isAnnouncementPage
            ? isAdmin ? 'Institution-wide announcements for students and teachers.' : isTeacher ? 'Announcements for students in your assigned classes.' : 'Institution announcements and announcements from your teachers.'
            : isTeacher ? 'Share notes, study materials, and quizzes with your assigned classes.' : 'Study materials and quizzes shared by your teachers.'}</p>
        </div>
        {user?.role === 'student' && isMaterialsPage && materialSubjects.length > 0 && (
          <label className="flex w-full max-w-sm flex-col gap-1 text-[10px] font-bold text-slate-300">
            Filter by subject
            <select
              value={selectedSubjectId}
              onChange={event => setSelectedSubjectId(event.target.value)}
              className="rounded-xl border border-[#133966] bg-[#040d1a] px-3 py-2 text-xs text-white"
            >
              <option value="all">All subjects</option>
              {materialSubjects.map(course => <option key={course._id} value={course._id}>{course.code} — {course.title}</option>)}
            </select>
          </label>
        )}
        {(isTeacher || (isAdmin && isAnnouncementPage)) && (
          <form onSubmit={submitPost} className="grid gap-3 rounded-xl sm:rounded-2xl border border-[#133966] bg-[#040d1a] p-3.5 sm:p-4 md:grid-cols-2">
            <input required maxLength={160} value={postForm.title} onChange={e => setPostForm({ ...postForm, title: e.target.value })} placeholder="Title" className="rounded-xl border border-[#133966] bg-[#071b34] px-3 py-2 text-xs text-white" />
            <select value={isAnnouncementPage ? 'announcement' : postForm.type} onChange={e => setPostForm({ ...postForm, type: e.target.value })} disabled={isAdmin || isAnnouncementPage} className="rounded-xl border border-[#133966] bg-[#071b34] px-3 py-2 text-xs text-white disabled:opacity-70">
              {isAnnouncementPage
                ? <option value="announcement">{isAdmin ? 'Institution announcement' : 'Class announcement'}</option>
                : <><option value="material">Study material / notes</option><option value="quiz">Quiz</option></>}
            </select>
            {isTeacher && <select required value={postForm.courseId} onChange={e => setPostForm({ ...postForm, courseId: e.target.value })} className="rounded-xl border border-[#133966] bg-[#071b34] px-3 py-2 text-xs text-white">
              <option value="">Select assigned course</option>{courses.map(course => <option key={course._id} value={course._id}>{course.code} — {course.title} (Div {course.section || '—'})</option>)}
            </select>}
            <textarea value={postForm.body} onChange={e => setPostForm({ ...postForm, body: e.target.value })} rows={3} placeholder="Announcement or material details" className="md:col-span-2 rounded-xl border border-[#133966] bg-[#071b34] px-3 py-2 text-xs text-white" />
            {isTeacher && isMaterialsPage && postForm.type === 'quiz' && (
              <div className="md:col-span-2 space-y-4">
                {postForm.questions.map((question, questionIndex) => (
                  <fieldset key={questionIndex} className="rounded-2xl border border-[#133966] bg-[#071b34] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-extrabold text-[#00C49F]">Question {questionIndex + 1}</span>
                      {postForm.questions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeQuestion(questionIndex)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[10px] font-bold text-rose-300 hover:bg-rose-500/20 transition-colors"
                        >
                          <Trash2 className="h-3 w-3" /> Remove question
                        </button>
                      )}
                    </div>
                    <label className="mb-3 block text-[11px] font-bold text-slate-300">
                      Question
                      <textarea
                        required
                        maxLength={1000}
                        value={question.prompt}
                        onChange={event => updateQuestion(questionIndex, { prompt: event.target.value })}
                        rows={2}
                        placeholder="Enter the question"
                        className="mt-1 w-full rounded-xl border border-[#133966] bg-[#040d1a] px-3 py-2 text-xs text-white"
                      />
                    </label>
                    <div className="overflow-hidden rounded-xl border border-[#133966]">
                      <div className="grid grid-cols-[52px_minmax(0,1fr)_44px] bg-[#040d1a] px-3 py-2 text-[10px] font-bold uppercase text-slate-400">
                        <span>Option</span><span>Answer</span><span>Key</span>
                      </div>
                      {question.options.map((option, optionIndex) => (
                        <div key={optionIndex} className="grid grid-cols-[52px_minmax(0,1fr)_44px] items-center gap-2 border-t border-[#133966] px-3 py-2">
                          <span className="text-xs font-black text-[#00C49F]">{String.fromCharCode(65 + optionIndex)}</span>
                          <input
                            required
                            maxLength={500}
                            value={option}
                            onChange={event => updateQuestionOption(questionIndex, optionIndex, event.target.value)}
                            placeholder={`Option ${String.fromCharCode(65 + optionIndex)}`}
                            className="min-w-0 rounded-lg border border-[#133966] bg-[#040d1a] px-3 py-2 text-xs text-white"
                          />
                          <div className="flex items-center justify-center">
                            <input
                              type="radio"
                              name={`correct-answer-${questionIndex}`}
                              checked={question.correctAnswerIndex === optionIndex}
                              onChange={() => updateQuestion(questionIndex, { correctAnswerIndex: optionIndex })}
                              aria-label={`Mark option ${String.fromCharCode(65 + optionIndex)} correct`}
                              className="accent-[#00C49F]"
                            />
                          </div>
                          {question.options.length > 2 && (
                            <button
                              type="button"
                              onClick={() => removeQuestionOption(questionIndex, optionIndex)}
                              className="col-start-2 justify-self-start text-[10px] text-rose-300 hover:text-rose-200"
                            >
                              Remove option
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        disabled={question.options.length >= 26}
                        onClick={() => addQuestionOption(questionIndex)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#00a896]/40 px-3 py-1.5 text-[10px] font-bold text-[#67e8f9] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Plus className="h-3 w-3" /> Add option
                      </button>
                      <span className="text-[10px] text-slate-400">Select the radio button beside the correct answer.</span>
                    </div>
                  </fieldset>
                ))}
                <button
                  type="button"
                  onClick={() => setPostForm(previous => ({
                    ...previous,
                    questions: [...previous.questions, createEmptyQuestion()]
                  }))}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#133966] px-3 py-2 text-[11px] font-bold text-white hover:bg-[#071b34]"
                >
                  <Plus className="h-3.5 w-3.5" /> Add question
                </button>
              </div>
            )}
            {isTeacher && isMaterialsPage && (
              <div className="md:col-span-2 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-[#00a896]/50 bg-[#071b34]/60 p-3">
                <input
                  ref={attachmentInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.webp"
                  onChange={event => setAttachment(event.target.files?.[0] || null)}
                  className="sr-only"
                  tabIndex={-1}
                />
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#00a896]/30 bg-[#00a896]/10 text-[#00C49F]">
                  <Upload className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white">Study material attachment</p>
                  <p className="truncate text-[10px] text-slate-400">{attachment?.name || 'PDF, Office documents, text, or image files'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => attachmentInputRef.current?.click()}
                  className="rounded-lg border border-[#00a896]/50 bg-[#00a896]/15 px-3 py-2 text-[10px] font-bold text-[#9df5e7] transition-colors hover:bg-[#00a896]/25"
                >
                  {attachment ? 'Change file' : 'Choose file'}
                </button>
                {attachment && (
                  <button
                    type="button"
                    onClick={() => {
                      setAttachment(null);
                      if (attachmentInputRef.current) attachmentInputRef.current.value = '';
                    }}
                    aria-label="Remove attachment"
                    className="rounded-lg border border-rose-500/30 p-2 text-rose-300 hover:bg-rose-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
            <button disabled={saving || (isTeacher && (!courses.length || !postForm.courseId))} className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] px-4 py-2 text-xs font-black text-[#040d1a] disabled:opacity-50"><Plus className="h-4 w-4" /> Publish</button>
          </form>
        )}
        {isAnnouncementPage && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <button
              type="button"
              onClick={() => setAnnouncementFilter('all')}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                announcementFilter === 'all'
                  ? 'bg-[#00a896] text-[#040d1a] shadow-md shadow-[#00a896]/20'
                  : 'bg-[#071b34] text-slate-300 hover:text-white border border-[#133966]'
              }`}
            >
              All Announcements
            </button>
            <button
              type="button"
              onClick={() => setAnnouncementFilter('class')}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                announcementFilter === 'class'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'bg-[#071b34] text-slate-300 hover:text-white border border-[#133966]'
              }`}
            >
              Class Announcements
            </button>
            <button
              type="button"
              onClick={() => setAnnouncementFilter('institution')}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                announcementFilter === 'institution'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20'
                  : 'bg-[#071b34] text-slate-300 hover:text-white border border-[#133966]'
              }`}
            >
              Institution Announcements
            </button>
          </div>
        )}
        {loading ? <p className="py-6 text-center text-xs text-slate-400">Loading posts...</p> : visiblePosts.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {visiblePosts.map(post => (
              <article key={post._id} className="rounded-2xl border border-[#133966] bg-[#040d1a] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2"><span className="rounded-lg bg-[#00a896]/15 p-2 text-[#00C49F]">{post.type === 'announcement' ? <Megaphone className="h-4 w-4" /> : post.type === 'quiz' ? <BookOpen className="h-4 w-4" /> : <FileText className="h-4 w-4" />}</span>
                    <div><h3 className="text-sm font-bold text-white">{post.title}</h3><p className="mt-0.5 text-[10px] text-slate-500">{post.author?.name || 'MetricsEdu'} · {new Date(post.createdAt).toLocaleString()} {post.course && `· ${post.course.code} / Div ${post.course.section || '—'}`}</p></div>
                  </div>
                  {(isAdmin || post.author?._id === user?._id) && <button onClick={() => deletePost(post._id)} aria-label="Delete post" className="text-rose-300 hover:text-rose-200"><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
                {post.body && <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-slate-300">{post.body}</p>}
                {post.attachmentUrl && <a className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-[#67e8f9] underline" href={post.attachmentUrl} target="_blank" rel="noreferrer"><FileText className="h-3.5 w-3.5" /> Open attached material</a>}
                {post.type === 'announcement' && (
                  <div className="mt-2.5">
                    {post.course || post.authorRole === 'teacher' ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-bold text-blue-400 border border-blue-500/20">
                        Class Announcement {post.course?.code ? `• ${post.course.code}` : ''} {post.course?.section ? `(Div ${post.course.section})` : ''}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/10 px-2.5 py-0.5 text-[10px] font-bold text-purple-400 border border-purple-500/20">
                        Institution Announcement • Campus Administration
                      </span>
                    )}
                  </div>
                )}
                {post.type === 'quiz' && (
                  <div className="mt-3 space-y-4">
                    {user?.role === 'student' && post.mySubmission ? (
                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Award className="h-5 w-5 text-emerald-400" />
                            <div>
                              <p className="text-xs font-black text-emerald-300">Quiz Completed</p>
                              <p className="text-[10px] text-emerald-400/80">Submitted on {new Date(post.mySubmission.submittedAt).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-base font-black text-white">{post.mySubmission.score} / {post.mySubmission.totalQuestions}</span>
                            <span className="ml-1.5 text-xs font-bold text-emerald-400">({post.mySubmission.percentage}%)</span>
                          </div>
                        </div>
                        <div className="mt-3 divide-y divide-emerald-500/10 space-y-2 text-xs text-slate-300">
                          {post.questions?.map((question, index) => {
                            const studentAns = post.mySubmission.answers?.find(a => a.questionIndex === index);
                            const isCorrect = studentAns?.isCorrect;
                            return (
                              <div key={`${post._id}-rev-${index}`} className="pt-2">
                                <div className="flex items-start gap-2">
                                  {isCorrect ? <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />}
                                  <div>
                                    <p className="font-semibold text-white">{index + 1}. {question.prompt}</p>
                                    <p className="mt-0.5 text-[11px]">
                                      Your answer: <span className={isCorrect ? "font-bold text-emerald-400" : "font-bold text-rose-400"}>{studentAns?.selectedOption || 'None'}</span>
                                    </p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : user?.role === 'student' ? (
                      <div className="space-y-3">
                        {post.questions?.map((question, qIdx) => (
                          <div key={`${post._id}-q-${qIdx}`} className="rounded-xl border border-[#133966]/60 bg-[#071b34]/40 p-3">
                            <p className="text-xs font-bold text-white mb-2">{qIdx + 1}. {question.prompt}</p>
                            <div className="space-y-1.5 pl-1">
                              {question.options?.map((option, optIdx) => {
                                const isSelected = quizAnswers[post._id]?.[qIdx] === option;
                                return (
                                  <label
                                    key={`${post._id}-q-${qIdx}-opt-${optIdx}`}
                                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs cursor-pointer transition-colors ${
                                      isSelected
                                        ? 'bg-[#00a896]/20 border border-[#00a896]/60 text-white font-medium'
                                        : 'hover:bg-white/5 text-slate-300 border border-transparent'
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name={`quiz-${post._id}-q-${qIdx}`}
                                      value={option}
                                      checked={Boolean(isSelected)}
                                      onChange={() => handleSelectQuizOption(post._id, qIdx, option)}
                                      className="accent-[#00a896] h-4 w-4 cursor-pointer shrink-0"
                                    />
                                    <span className="font-bold text-[#00C49F] shrink-0">{String.fromCharCode(65 + optIdx)}.</span>
                                    <span className="flex-1">{option}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => handleQuizSubmit(post._id, post.questions)}
                          disabled={submittingQuiz[post._id]}
                          className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] py-2 text-xs font-black text-[#040d1a] hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
                        >
                          {submittingQuiz[post._id] ? 'Submitting...' : 'Submit Quiz Answers'}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <ol className="space-y-2 text-xs text-slate-300">
                          {post.questions?.map((question, index) => (
                            <li key={`${post._id}-${index}`} className="rounded-lg bg-[#071b34]/50 p-2.5">
                              <p className="font-semibold text-white">{index + 1}. {question.prompt}</p>
                              <div className="mt-1 space-y-0.5 pl-3 text-slate-400">
                                {question.options?.map((option, optionIndex) => (
                                  <p key={`${post._id}-${index}-${optionIndex}`} className={option === question.correctAnswer ? "font-bold text-emerald-400" : ""}>
                                    <span className="mr-2 text-[#00C49F]">{String.fromCharCode(65 + optionIndex)}.</span>{option}
                                    {option === question.correctAnswer && " (Correct)"}
                                  </p>
                                ))}
                              </div>
                            </li>
                          ))}
                        </ol>
                        <div className="pt-2 border-t border-[#133966]/50">
                          <button
                            type="button"
                            onClick={() => toggleQuizResults(post._id)}
                            className="flex items-center gap-2 rounded-xl border border-[#00a896]/40 bg-[#00a896]/10 px-3 py-1.5 text-xs font-bold text-[#67e8f9] hover:bg-[#00a896]/20 transition-all"
                          >
                            <Users className="h-3.5 w-3.5" />
                            {viewingResults[post._id] ? 'Hide Student Marks' : `View Student Marks (${post.submissionCount ?? 0})`}
                          </button>
                          {viewingResults[post._id] && (
                            <div className="mt-3 rounded-xl border border-[#133966] bg-[#071b34] p-3 overflow-x-auto">
                              {quizResultsData[post._id]?.loading ? (
                                <p className="py-3 text-center text-xs text-slate-400">Loading student scores...</p>
                              ) : quizResultsData[post._id]?.results?.length ? (
                                <table className="w-full text-left text-xs text-slate-300 min-w-[360px]">
                                  <thead className="border-b border-[#133966] text-[10px] uppercase text-slate-400">
                                    <tr>
                                      <th className="py-1.5 px-2">Student</th>
                                      <th className="py-1.5 px-2">USN / ID</th>
                                      <th className="py-1.5 px-2 text-center">Score</th>
                                      <th className="py-1.5 px-2 text-center">Percentage</th>
                                      <th className="py-1.5 px-2 text-right">Submitted</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[#133966]/40">
                                    {quizResultsData[post._id].results.map(r => (
                                      <tr key={r._id} className="hover:bg-white/5">
                                        <td className="py-1.5 px-2 font-medium text-white">{r.studentName}</td>
                                        <td className="py-1.5 px-2 font-mono text-slate-400">{r.studentUsn || '—'}</td>
                                        <td className="py-1.5 px-2 text-center font-bold text-[#00C49F]">{r.score} / {r.totalQuestions}</td>
                                        <td className="py-1.5 px-2 text-center font-bold">
                                          <span className={r.percentage >= 75 ? 'text-emerald-400' : r.percentage >= 40 ? 'text-amber-400' : 'text-rose-400'}>
                                            {r.percentage}%
                                          </span>
                                        </td>
                                        <td className="py-1.5 px-2 text-right text-[10px] text-slate-400">{new Date(r.submittedAt).toLocaleDateString()}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : (
                                <p className="py-3 text-center text-xs text-slate-400">No student submissions recorded yet.</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : <p className="py-6 text-center text-xs text-slate-500">{isAnnouncementPage ? 'No announcements yet.' : 'No study materials or quizzes yet.'}</p>}
      </section>}
    </div>
  );
}
