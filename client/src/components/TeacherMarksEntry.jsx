import React, { useState, useEffect } from 'react';
import {
  Upload,
  Save,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  BookOpen,
  Users,
  Award,
  Calendar,
  Layers,
  Sparkles,
  HelpCircle,
  TrendingUp,
  Search
} from 'lucide-react';
import { api } from '../services/api';
import StudentMarksAnalyticsModal from './StudentMarksAnalyticsModal';

export default function TeacherMarksEntry({ user, onMarksSaved }) {
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedDivision, setSelectedDivision] = useState('ALL');
  const [assessmentName, setAssessmentName] = useState('Internal Assessment 1');
  const [assessmentType, setAssessmentType] = useState('internal');
  const [maxScore, setMaxScore] = useState(25);
  const [examDate, setExamDate] = useState(new Date().toISOString().split('T')[0]);

  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState({ type: '', msg: '' });

  // Student roster state: array of { studentId, name, usn, division, score, status, remarks, profileImage }
  const [roster, setRoster] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Student analytics modal state
  const [activeStudentForAnalytics, setActiveStudentForAnalytics] = useState(null);

  // Load courses on mount
  useEffect(() => {
    loadCourses();
  }, []);

  const loadCourses = async () => {
    setLoadingCourses(true);
    try {
      const res = await api.getMarksCourses();
      if (res.success && res.courses?.length > 0) {
        setCourses(res.courses);
        setSelectedCourseId(res.courses[0]._id);
      }
    } catch (err) {
      console.error('Failed to load courses:', err);
      setBanner({ type: 'error', msg: 'Failed to load courses: ' + err.message });
    } finally {
      setLoadingCourses(false);
    }
  };

  const selectedCourse = courses.find(c => c._id === selectedCourseId) || null;

  // Load roster when course, division, or assessment name changes
  useEffect(() => {
    if (!selectedCourseId) return;
    loadRoster();
  }, [selectedCourseId, selectedDivision, assessmentName]);

  const loadRoster = async () => {
    setLoadingRoster(true);
    setBanner({ type: '', msg: '' });
    try {
      const res = await api.getMarksRoster({
        courseId: selectedCourseId,
        division: selectedDivision,
        assessmentName: assessmentName.trim()
      });

      if (res.success) {
        if (res.assessmentInfo) {
          // If assessment marks previously existed, adapt maxScore and type
          setMaxScore(res.assessmentInfo.maxScore || 25);
          if (res.assessmentInfo.assessmentType) {
            setAssessmentType(res.assessmentInfo.assessmentType);
          }
          if (res.assessmentInfo.examDate) {
            setExamDate(new Date(res.assessmentInfo.examDate).toISOString().split('T')[0]);
          }
        }

        const currentMax = res.assessmentInfo?.maxScore || maxScore || 25;
        const initialRoster = (res.roster || []).map(item => ({
          studentId: item._id,
          name: item.name,
          usn: item.usn,
          division: item.division || 'A',
          branch: item.branch,
          semester: item.semester,
          profileImage: item.profileImage,
          score: item.mark !== null && item.mark !== undefined ? item.mark.score : '',
          status: item.mark ? item.mark.status : 'Present',
          remarks: item.mark ? item.mark.remarks || '' : '',
          hasExisting: item.mark !== null && item.mark !== undefined
        }));
        setRoster(initialRoster);
      }
    } catch (err) {
      console.error('Failed to load roster:', err);
      setBanner({ type: 'error', msg: 'Failed to load student roster: ' + err.message });
    } finally {
      setLoadingRoster(false);
    }
  };

  // Grade helper
  const computeGradeAndPct = (score, max) => {
    const s = parseFloat(score);
    const m = parseFloat(max) || 100;
    if (isNaN(s) || s < 0) return { pct: '-', grade: '-' };
    const pct = Math.max(0, Math.min(100, Math.round(((s / m) * 100) * 10) / 10));
    let grade = 'F';
    if (pct >= 90) grade = 'A+';
    else if (pct >= 80) grade = 'A';
    else if (pct >= 70) grade = 'B+';
    else if (pct >= 60) grade = 'B';
    else if (pct >= 50) grade = 'C';
    else if (pct >= 40) grade = 'P';
    return { pct, grade };
  };

  // Update a single student entry
  const handleScoreChange = (studentId, value) => {
    setRoster(prev => prev.map(s => {
      if (s.studentId !== studentId) return s;
      return { ...s, score: value };
    }));
  };

  const handleStatusChange = (studentId, status) => {
    setRoster(prev => prev.map(s => {
      if (s.studentId !== studentId) return s;
      return {
        ...s,
        status,
        score: status === 'Absent' ? 0 : s.score
      };
    }));
  };

  const handleRemarksChange = (studentId, remarks) => {
    setRoster(prev => prev.map(s => {
      if (s.studentId !== studentId) return s;
      return { ...s, remarks };
    }));
  };

  // Quick fill utilities
  const handleQuickFill = (type) => {
    const max = parseFloat(maxScore) || 25;
    setRoster(prev => prev.map(s => {
      if (type === 'max') {
        return { ...s, score: max, status: 'Present' };
      }
      if (type === 'pass') {
        const passScore = Math.ceil(max * 0.4);
        return { ...s, score: passScore, status: 'Present' };
      }
      if (type === 'clear') {
        return { ...s, score: '', status: 'Present', remarks: '' };
      }
      if (type === 'all-present') {
        return { ...s, status: 'Present' };
      }
      return s;
    }));
  };

  // Save marks
  const handleSaveMarks = async () => {
    if (!selectedCourseId) {
      setBanner({ type: 'error', msg: 'Please select a course.' });
      return;
    }
    if (!assessmentName || !assessmentName.trim()) {
      setBanner({ type: 'error', msg: 'Please specify an assessment name (e.g. Internal Assessment 1).' });
      return;
    }

    const cleanMax = parseFloat(maxScore);
    if (isNaN(cleanMax) || cleanMax <= 0) {
      setBanner({ type: 'error', msg: 'Maximum score must be greater than zero.' });
      return;
    }

    // Filter students with filled scores or explicit statuses
    const entriesToSave = roster.filter(s => s.score !== '' || s.status === 'Absent' || s.status === 'Exempted');
    if (entriesToSave.length === 0) {
      setBanner({ type: 'error', msg: 'Please enter marks for at least one student before saving.' });
      return;
    }

    // Validate that no student has score > maxScore
    const invalidEntry = entriesToSave.find(s => parseFloat(s.score) > cleanMax);
    if (invalidEntry) {
      setBanner({
        type: 'error',
        msg: `Invalid score for ${invalidEntry.name}: ${invalidEntry.score} exceeds maximum allowed (${cleanMax}).`
      });
      return;
    }

    setSaving(true);
    setBanner({ type: '', msg: '' });

    try {
      const payload = {
        courseId: selectedCourseId,
        assessmentName: assessmentName.trim(),
        assessmentType,
        maxScore: cleanMax,
        examDate,
        entries: entriesToSave.map(s => ({
          studentId: s.studentId,
          score: s.status === 'Absent' ? 0 : parseFloat(s.score) || 0,
          status: s.status,
          remarks: s.remarks
        }))
      };

      const res = await api.batchSaveMarks(payload);
      if (res.success) {
        setBanner({
          type: 'success',
          msg: `Successfully saved marks for ${res.savedCount} student(s) in "${assessmentName}".`
        });
        // Reload roster to reflect persisted state
        loadRoster();
        if (onMarksSaved) onMarksSaved();
      } else {
        setBanner({ type: 'error', msg: res.message || 'Failed to save marks.' });
      }
    } catch (err) {
      console.error('Batch save marks error:', err);
      setBanner({ type: 'error', msg: err.message || 'Server error saving marks.' });
    } finally {
      setSaving(false);
    }
  };

  // Filter roster for display
  const filteredRoster = roster.filter(s => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return s.name.toLowerCase().includes(term) || (s.usn && s.usn.toLowerCase().includes(term));
  });

  // Calculate current class stats
  const filledCount = roster.filter(s => s.score !== '' || s.status === 'Absent').length;
  const currentScores = roster
    .filter(s => s.status !== 'Absent' && s.score !== '' && !isNaN(parseFloat(s.score)))
    .map(s => parseFloat(s.score));
  const classAvgScore = currentScores.length > 0
    ? Math.round((currentScores.reduce((a, b) => a + b, 0) / currentScores.length) * 10) / 10
    : 0;
  const classAvgPct = maxScore > 0 ? Math.round((classAvgScore / maxScore) * 1000) / 10 : 0;

  return (
    <div className="space-y-6">
      {/* Analytics Modal if open */}
      {activeStudentForAnalytics && (
        <StudentMarksAnalyticsModal
          studentId={activeStudentForAnalytics.studentId}
          studentInfo={activeStudentForAnalytics}
          onClose={() => setActiveStudentForAnalytics(null)}
        />
      )}

      {/* Header card */}
      <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-[#0b2444] to-[#071b34] border border-[#133966] shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1 px-2.5 rounded-lg bg-[#00a896]/20 text-[#00C49F] text-xs font-mono font-bold border border-[#00a896]/30">
                EXAM MARKS PORTAL
              </span>
              <span className="text-xs text-slate-400">School &amp; College Examination Records</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white mt-1">School &amp; College Exam Marks Entry</h2>
            <p className="text-xs sm:text-sm text-cyan-200/70 mt-0.5">
              Enter internal test scores, midterms, unit tests, and semester exam marks. Online quiz marks are automatically uploaded and graded upon student submission.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleSaveMarks}
              disabled={saving || loadingRoster || roster.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] hover:from-[#009384] hover:to-[#00b08e] text-[#040d1a] font-extrabold text-xs sm:text-sm shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#040d1a] border-t-transparent rounded-full animate-spin" />
                  Saving Marks...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save & Publish Marks
                </>
              )}
            </button>
          </div>
        </div>

        {/* Banner Alert */}
        {banner.msg && (
          <div
            className={`mt-4 p-3.5 rounded-2xl border text-xs sm:text-sm flex items-center justify-between gap-3 shadow-md ${
              banner.type === 'error'
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                : 'bg-[#00a896]/15 border-[#00a896]/40 text-[#67e8f9]'
            }`}
          >
            <div className="flex items-center gap-2">
              {banner.type === 'error' ? (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-[#00C49F] shrink-0" />
              )}
              <span>{banner.msg}</span>
            </div>
            <button
              onClick={() => setBanner({ type: '', msg: '' })}
              className="text-xs opacity-70 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Control Panel: Course & Assessment Settings */}
      <div className="p-5 sm:p-6 rounded-3xl bg-[#071b34] border border-[#133966] shadow-md space-y-4">
        {/* Automatic Quiz Upload Informational Notice */}
        <div className="p-3.5 rounded-2xl bg-[#00a896]/10 border border-[#00a896]/30 text-xs text-cyan-200 flex items-center justify-between gap-3 shadow-inner">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#00C49F] shrink-0" />
            <span>
              <strong>Automated Quiz Integration:</strong> Interactive quiz marks are uploaded and graded <em>automatically</em> when students submit quizzes. This page is designated for School &amp; College examination marks (Internal Assessments, Midterm Exams, Unit Tests, Final Exams, and Lab Practicals).
            </span>
          </div>
        </div>

        <h3 className="text-xs font-bold uppercase tracking-wider text-[#00C49F] flex items-center gap-2">
          <BookOpen className="w-4 h-4" /> Examination Setup &amp; Cohort
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Select Course */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Select Course / Subject *</label>
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              disabled={loadingCourses}
              className="w-full px-3 py-2.5 rounded-xl bg-[#0b2444] border border-[#133966] text-xs text-white focus:outline-none focus:border-[#00C49F]"
            >
              {loadingCourses ? (
                <option>Loading your courses...</option>
              ) : courses.length === 0 ? (
                <option>No assigned courses found</option>
              ) : (
                courses.map(c => (
                  <option key={c._id} value={c._id}>
                    {c.code} - {c.title} ({c.enrolledCount || 0} students)
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Select Division */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Division</label>
            <select
              value={selectedDivision}
              onChange={(e) => setSelectedDivision(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-[#0b2444] border border-[#133966] text-xs text-white focus:outline-none focus:border-[#00C49F]"
            >
              <option value="ALL">All Divisions</option>
              {selectedCourse?.divisions?.map(d => (
                <option key={d} value={d}>Division {d}</option>
              ))}
            </select>
          </div>

          {/* Assessment Name with Datalist for Edit or New */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-300">Examination Name *</label>
              {selectedCourse?.pastAssessments?.length > 0 && (
                <span className="text-[10px] text-[#00C49F]">Previous exams available</span>
              )}
            </div>
            <input
              type="text"
              list="past-assessments-list"
              value={assessmentName}
              onChange={(e) => setAssessmentName(e.target.value)}
              placeholder="e.g. Internal Assessment 1"
              className="w-full px-3 py-2.5 rounded-xl bg-[#0b2444] border border-[#133966] text-xs text-white focus:outline-none focus:border-[#00C49F]"
            />
            <datalist id="past-assessments-list">
              <option value="Internal Assessment 1 (IA-1)" />
              <option value="Internal Assessment 2 (IA-2)" />
              <option value="Internal Assessment 3 (IA-3)" />
              <option value="Unit Test 1" />
              <option value="Unit Test 2" />
              <option value="Midterm Examination" />
              <option value="Quarterly Examination" />
              <option value="Half-Yearly Examination" />
              <option value="Pre-Board / Preparatory Exam" />
              <option value="Semester End Examination" />
              <option value="Annual Final Exam" />
              <option value="Lab Practical Exam" />
              {selectedCourse?.pastAssessments?.map(a => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>

          {/* Assessment Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Examination Category</label>
            <select
              value={assessmentType}
              onChange={(e) => setAssessmentType(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-[#0b2444] border border-[#133966] text-xs text-white focus:outline-none focus:border-[#00C49F]"
            >
              <option value="internal">Internal Assessment (IA) / Unit Test</option>
              <option value="midterm">Midterm / Term Examination</option>
              <option value="final">Final / Semester End Exam</option>
              <option value="lab">Lab / Practical Exam</option>
              <option value="assignment">Assignment / Project Evaluation</option>
              <option value="quiz">Interactive Quiz (Auto-uploaded)</option>
              <option value="other">Other School / College Exam</option>
            </select>
          </div>
        </div>

        {/* Row 2: Max Marks, Exam Date, Quick Tools */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-[#133966]/60">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Maximum Marks *</label>
            <input
              type="number"
              min="1"
              max="1000"
              value={maxScore}
              onChange={(e) => setMaxScore(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-[#0b2444] border border-[#133966] text-xs text-white focus:outline-none focus:border-[#00C49F]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Assessment Date</label>
            <input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-[#0b2444] border border-[#133966] text-xs text-white focus:outline-none focus:border-[#00C49F]"
            />
          </div>

          {/* Quick-fill buttons */}
          <div className="lg:col-span-2 flex flex-col justify-end">
            <span className="block text-[11px] font-semibold text-slate-400 mb-1.5">Quick Actions</span>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => handleQuickFill('max')}
                className="px-2.5 py-2 rounded-xl bg-[#0b2444] hover:bg-[#113a6e] border border-[#133966] text-[11px] font-bold text-slate-300 transition"
              >
                Fill Max Marks
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('pass')}
                className="px-2.5 py-2 rounded-xl bg-[#0b2444] hover:bg-[#113a6e] border border-[#133966] text-[11px] font-bold text-slate-300 transition"
              >
                Fill Pass (40%)
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('all-present')}
                className="px-2.5 py-2 rounded-xl bg-[#0b2444] hover:bg-[#113a6e] border border-[#133966] text-[11px] font-bold text-slate-300 transition"
              >
                All Present
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('clear')}
                className="px-2.5 py-2 rounded-xl bg-[#0b2444] hover:bg-rose-500/20 border border-[#133966] hover:border-rose-500/40 text-[11px] font-bold text-slate-400 hover:text-rose-300 transition"
              >
                Clear Scores
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Class Standing Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-[#071b34] border border-[#133966]">
          <span className="text-[11px] text-slate-400 font-semibold block">Total Students</span>
          <span className="text-xl font-extrabold text-white">{roster.length}</span>
        </div>
        <div className="p-3.5 rounded-2xl bg-[#071b34] border border-[#133966]">
          <span className="text-[11px] text-slate-400 font-semibold block">Marks Entered</span>
          <span className="text-xl font-extrabold text-[#00C49F]">
            {filledCount} / {roster.length}
          </span>
        </div>
        <div className="p-3.5 rounded-2xl bg-[#071b34] border border-[#133966]">
          <span className="text-[11px] text-slate-400 font-semibold block">Class Average</span>
          <span className="text-xl font-extrabold text-cyan-300">
            {classAvgScore} <span className="text-xs text-slate-400 font-normal">/ {maxScore} ({classAvgPct}%)</span>
          </span>
        </div>
        <div className="p-3.5 rounded-2xl bg-[#071b34] border border-[#133966]">
          <span className="text-[11px] text-slate-400 font-semibold block">Absent Students</span>
          <span className="text-xl font-extrabold text-rose-400">
            {roster.filter(s => s.status === 'Absent').length}
          </span>
        </div>
      </div>

      {/* Student Roster Table */}
      <div className="rounded-3xl bg-[#071b34] border border-[#133966] overflow-hidden shadow-xl">
        <div className="p-4 sm:p-5 border-b border-[#133966] bg-[#0b2444] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-[#00C49F]" />
              Student Marks Roster ({filteredRoster.length} students)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Click any student's name to view their complete performance trajectory & graphs.
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search student or USN..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-[#071b34] border border-[#133966] text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#00C49F]"
            />
          </div>
        </div>

        {loadingRoster ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 border-4 border-[#00C49F] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-400">Loading student roster and existing assessment marks...</p>
          </div>
        ) : filteredRoster.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            No students found matching current criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#05152a] text-slate-300 font-semibold border-b border-[#133966]">
                  <th className="p-3 w-12 text-center">#</th>
                  <th className="p-3">Student Name & USN</th>
                  <th className="p-3 w-20 text-center">Div</th>
                  <th className="p-3 w-36">Status</th>
                  <th className="p-3 w-36 text-center">Score (Max: {maxScore})</th>
                  <th className="p-3 w-28 text-center">% & Grade</th>
                  <th className="p-3">Teacher Remarks</th>
                  <th className="p-3 w-24 text-center">Analytics</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#133966]/60">
                {filteredRoster.map((student, idx) => {
                  const { pct, grade } = computeGradeAndPct(student.score, maxScore);
                  const isScoreOverMax = parseFloat(student.score) > parseFloat(maxScore);
                  const isAbsent = student.status === 'Absent';

                  return (
                    <tr
                      key={student.studentId}
                      className={`hover:bg-[#0c2b52]/50 transition ${
                        isScoreOverMax ? 'bg-rose-500/10' : ''
                      }`}
                    >
                      <td className="p-3 text-center text-slate-400 font-mono">
                        {idx + 1}
                      </td>

                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => setActiveStudentForAnalytics(student)}
                          className="text-left group flex items-center gap-2.5"
                          title="Click to view full marks history and graphs"
                        >
                          <div className="w-8 h-8 rounded-xl bg-[#00a896]/20 border border-[#00a896]/40 flex items-center justify-center text-[#00C49F] font-bold text-xs shrink-0 group-hover:bg-[#00C49F] group-hover:text-[#040d1a] transition">
                            {student.profileImage ? (
                              <img src={student.profileImage} alt="" className="w-full h-full object-cover rounded-xl" />
                            ) : (
                              (student.name || 'S').charAt(0).toUpperCase()
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-white group-hover:text-[#00C49F] transition underline-offset-2 group-hover:underline">
                              {student.name}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              {student.usn || 'No USN'}
                            </div>
                          </div>
                        </button>
                      </td>

                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 text-[11px] font-bold border border-cyan-500/30">
                          {student.division}
                        </span>
                      </td>

                      <td className="p-3">
                        <select
                          value={student.status}
                          onChange={(e) => handleStatusChange(student.studentId, e.target.value)}
                          className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-semibold focus:outline-none ${
                            isAbsent
                              ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                              : 'bg-[#0b2444] border-[#133966] text-white'
                          }`}
                        >
                          <option value="Present">Present</option>
                          <option value="Absent">Absent</option>
                          <option value="Exempted">Exempted</option>
                        </select>
                      </td>

                      <td className="p-3 text-center">
                        <div className="relative inline-block w-28">
                          <input
                            type="number"
                            min="0"
                            max={maxScore}
                            step="0.5"
                            disabled={isAbsent}
                            placeholder={isAbsent ? 'AB' : '0'}
                            value={isAbsent ? '' : student.score}
                            onChange={(e) => handleScoreChange(student.studentId, e.target.value)}
                            className={`w-full px-3 py-1.5 rounded-lg text-center font-mono font-bold text-xs focus:outline-none ${
                              isScoreOverMax
                                ? 'bg-rose-500/20 border-2 border-rose-500 text-rose-200'
                                : isAbsent
                                ? 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed'
                                : 'bg-[#0b2444] border border-[#133966] text-white focus:border-[#00C49F]'
                            }`}
                          />
                        </div>
                      </td>

                      <td className="p-3 text-center">
                        {isAbsent ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            AB
                          </span>
                        ) : student.score !== '' ? (
                          <div className="space-y-0.5">
                            <span className="font-extrabold text-white text-xs">{pct}%</span>
                            <div>
                              <span
                                className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                  grade === 'A+' || grade === 'A'
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : grade === 'B+' || grade === 'B'
                                    ? 'bg-cyan-500/20 text-cyan-300'
                                    : grade === 'C' || grade === 'P'
                                    ? 'bg-yellow-500/20 text-yellow-300'
                                    : 'bg-rose-500/20 text-rose-300'
                                }`}
                              >
                                {grade}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      <td className="p-3">
                        <input
                          type="text"
                          placeholder="Optional feedback..."
                          value={student.remarks}
                          onChange={(e) => handleRemarksChange(student.studentId, e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[#0b2444] border border-[#133966] text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-[#00C49F]"
                        />
                      </td>

                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => setActiveStudentForAnalytics(student)}
                          className="p-1.5 rounded-lg bg-[#0c2b52] hover:bg-[#113a6e] text-[#00C49F] hover:text-white transition"
                          title="View Student Analysis & Graphs"
                        >
                          <TrendingUp className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer save bar */}
        <div className="p-4 sm:p-5 border-t border-[#133966] bg-[#05152a] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            {filledCount} of {roster.length} student scores entered.
          </div>
          <button
            onClick={handleSaveMarks}
            disabled={saving || loadingRoster || roster.length === 0}
            className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] hover:from-[#009384] hover:to-[#00b08e] text-[#040d1a] font-extrabold text-xs sm:text-sm shadow-lg transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save & Publish Marks'}
          </button>
        </div>
      </div>
    </div>
  );
}
