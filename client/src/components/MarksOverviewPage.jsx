import React, { useState, useEffect, useMemo } from 'react';
import {
  Award,
  Search,
  Filter,
  BarChart3,
  TrendingUp,
  BookOpen,
  Users,
  CheckCircle2,
  AlertTriangle,
  Download,
  Calendar,
  Layers,
  GraduationCap
} from 'lucide-react';
import { api } from '../services/api';
import StudentMarksAnalyticsModal from './StudentMarksAnalyticsModal';

export default function MarksOverviewPage({ user, isAdmin = false }) {
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedDivision, setSelectedDivision] = useState('ALL');
  const [selectedSemester, setSelectedSemester] = useState('ALL');
  const [selectedBranch, setSelectedBranch] = useState('ALL');
  const [selectedAssessment, setSelectedAssessment] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const [overviewData, setOverviewData] = useState({
    summary: { totalMarksRecords: 0, uniqueStudents: 0, averagePercentage: 0, passRate: 0 },
    students: [],
    rawMarks: []
  });

  const [activeStudentForAnalytics, setActiveStudentForAnalytics] = useState(null);

  // Institution config for admins (branches, standards, etc.)
  const [branches, setBranches] = useState([]);
  const [semestersList, setSemestersList] = useState([1, 2, 3, 4, 5, 6, 7, 8]);

  // Load initial courses / filters
  useEffect(() => {
    loadFiltersAndCourses();
  }, []);

  const loadFiltersAndCourses = async () => {
    try {
      const coursesRes = await api.getMarksCourses();
      if (coursesRes.success && coursesRes.courses) {
        setCourses(coursesRes.courses);
      }

      if (isAdmin) {
        try {
          const configRes = await api.getInstitutionConfig();
          if (configRes.success && configRes.config) {
            setBranches(configRes.config.branches || []);
          }
        } catch (e) {
          console.warn('Could not load institution config for branches', e);
        }
      }
    } catch (err) {
      console.error('Failed to load courses for marks overview:', err);
    }
  };

  // Load overview marks whenever filter changes
  useEffect(() => {
    loadMarksOverview();
  }, [selectedCourseId, selectedDivision, selectedSemester, selectedBranch, selectedAssessment]);

  const loadMarksOverview = async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedCourseId) params.courseId = selectedCourseId;
      if (selectedDivision !== 'ALL') params.division = selectedDivision;
      if (selectedSemester !== 'ALL') params.semester = selectedSemester;
      if (selectedBranch !== 'ALL') params.branch = selectedBranch;
      if (selectedAssessment !== 'ALL') params.assessmentName = selectedAssessment;

      const res = await api.getMarksOverview(params);
      if (res.success) {
        setOverviewData(res);
      }
    } catch (err) {
      console.error('Failed to load marks overview:', err);
    } finally {
      setLoading(false);
    }
  };

  // Unique assessment names for filter dropdown
  const uniqueAssessments = useMemo(() => {
    const set = new Set();
    (overviewData.rawMarks || []).forEach(m => {
      if (m.assessmentName) set.add(m.assessmentName);
    });
    return Array.from(set).sort();
  }, [overviewData.rawMarks]);

  // Client-side search filter
  const filteredStudents = useMemo(() => {
    if (!searchTerm.trim()) return overviewData.students || [];
    const term = searchTerm.toLowerCase();
    return (overviewData.students || []).filter(s =>
      s.studentName.toLowerCase().includes(term) ||
      (s.studentUsn && s.studentUsn.toLowerCase().includes(term)) ||
      (s.branch && s.branch.toLowerCase().includes(term))
    );
  }, [overviewData.students, searchTerm]);

  // Export summary table to CSV
  const handleExportSummaryCSV = () => {
    if (filteredStudents.length === 0) return;
    const headers = ['Student Name', 'USN', 'Division', 'Branch / Cohort', 'Semester', 'Assessments Count', 'Average Percentage', 'Overall Grade'];
    const rows = filteredStudents.map(s => [
      `"${s.studentName}"`,
      `"${s.studentUsn || ''}"`,
      `"${s.division || 'A'}"`,
      `"${s.branch || s.standard || s.pucYear || ''}"`,
      s.semester || '',
      s.assessmentsCount,
      `${s.avgPercentage}%`,
      s.overallGrade
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `students_marks_overview_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getGradeBadgeColor = (grade) => {
    switch (grade) {
      case 'A+': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'A': return 'bg-teal-500/20 text-teal-300 border-teal-500/40';
      case 'B+': return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
      case 'B': return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      case 'C': return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'P': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
      case 'F':
      case 'AB': return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      default: return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
    }
  };

  return (
    <div className="space-y-6">
      {/* Student deep-dive analytics modal */}
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
                {isAdmin ? 'ADMINISTRATIVE AUDIT' : 'FACULTY MARKS OVERVIEW'}
              </span>
              <span className="text-xs text-slate-400">
                {isAdmin ? 'Institution-wide Student Academic Standings' : 'Enrolled Students & Performance Trends'}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white mt-1">
              Student Marks & Academic Analytics
            </h2>
            <p className="text-xs sm:text-sm text-cyan-200/70 mt-0.5">
              Click any student's name to open their interactive score trajectory graph, subject breakdown, and complete exam history.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportSummaryCSV}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-700 bg-[#0c2b52] hover:bg-[#113a6e] text-xs font-semibold text-slate-200 transition shadow"
            >
              <Download className="w-3.5 h-3.5 text-[#00C49F]" />
              Export Summary CSV
            </button>
          </div>
        </div>

        {/* Top KPIs Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-6">
          <div className="p-4 rounded-2xl bg-[#071b34]/90 border border-[#133966]">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span>Class Standing Avg</span>
              <Award className="w-4 h-4 text-[#00C49F]" />
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-white">
              {overviewData.summary?.averagePercentage || 0}%
            </div>
            <p className="text-[11px] text-cyan-200/60 mt-1">Average across assessments</p>
          </div>

          <div className="p-4 rounded-2xl bg-[#071b34]/90 border border-[#133966]">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span>Overall Pass Rate</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-emerald-400">
              {overviewData.summary?.passRate || 0}%
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Passing grades (≥ 40%)</p>
          </div>

          <div className="p-4 rounded-2xl bg-[#071b34]/90 border border-[#133966]">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span>Evaluated Students</span>
              <Users className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-white">
              {overviewData.summary?.uniqueStudents || 0}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Students with records</p>
          </div>

          <div className="p-4 rounded-2xl bg-[#071b34]/90 border border-[#133966]">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span>Marks Submissions</span>
              <Layers className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-amber-300">
              {overviewData.summary?.totalMarksRecords || 0}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Exam records stored</p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 sm:p-5 rounded-3xl bg-[#071b34] border border-[#133966] shadow-md space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-bold uppercase tracking-wider text-[#00C49F] flex items-center gap-1.5">
            <Filter className="w-4 h-4" /> Filters & Cohort Selectors
          </span>
          <button
            onClick={() => {
              setSelectedCourseId('');
              setSelectedDivision('ALL');
              setSelectedSemester('ALL');
              setSelectedBranch('ALL');
              setSelectedAssessment('ALL');
              setSearchTerm('');
            }}
            className="text-xs text-slate-400 hover:text-white underline"
          >
            Reset Filters
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Course filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Subject / Course</label>
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#0b2444] border border-[#133966] text-xs text-white focus:outline-none focus:border-[#00C49F]"
            >
              <option value="">All Courses ({courses.length})</option>
              {courses.map(c => (
                <option key={c._id} value={c._id}>
                  {c.code} - {c.title}
                </option>
              ))}
            </select>
          </div>

          {/* Division filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Division</label>
            <select
              value={selectedDivision}
              onChange={(e) => setSelectedDivision(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#0b2444] border border-[#133966] text-xs text-white focus:outline-none focus:border-[#00C49F]"
            >
              <option value="ALL">All Divisions</option>
              <option value="A">Division A</option>
              <option value="B">Division B</option>
              <option value="C">Division C</option>
              <option value="D">Division D</option>
            </select>
          </div>

          {/* Semester filter (Admin or general) */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Semester</label>
            <select
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#0b2444] border border-[#133966] text-xs text-white focus:outline-none focus:border-[#00C49F]"
            >
              <option value="ALL">All Semesters</option>
              {semestersList.map(s => (
                <option key={s} value={s}>Semester {s}</option>
              ))}
            </select>
          </div>

          {/* Assessment Name filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Assessment</label>
            <select
              value={selectedAssessment}
              onChange={(e) => setSelectedAssessment(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#0b2444] border border-[#133966] text-xs text-white focus:outline-none focus:border-[#00C49F]"
            >
              <option value="ALL">All Assessments</option>
              {uniqueAssessments.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* Search student name / USN */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Search Student</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Name or USN..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#0b2444] border border-[#133966] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00C49F]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Student Table */}
      <div className="rounded-3xl bg-[#071b34] border border-[#133966] overflow-hidden shadow-xl">
        <div className="p-4 sm:p-5 border-b border-[#133966] bg-[#0b2444] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-[#00C49F]" />
              Student Academic Standings ({filteredStudents.length})
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Click on any student name to open comprehensive visual analytics and score trajectory graph.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 border-4 border-[#00C49F] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-400">Loading student academic standings...</p>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <Award className="w-12 h-12 text-slate-600 mx-auto" />
            <p className="text-sm font-bold text-slate-300">No student records found</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              No assessment marks match the selected filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#05152a] text-slate-300 font-semibold border-b border-[#133966]">
                  <th className="p-3 w-12 text-center">#</th>
                  <th className="p-3">Student Name & USN</th>
                  <th className="p-3">Branch / Standard</th>
                  <th className="p-3 w-16 text-center">Div</th>
                  <th className="p-3 w-24 text-center">Tests Taken</th>
                  <th className="p-3 w-32 text-center">Average %</th>
                  <th className="p-3 w-24 text-center">Grade</th>
                  <th className="p-3">Recent Assessments</th>
                  <th className="p-3 w-32 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#133966]/60">
                {filteredStudents.map((s, idx) => (
                  <tr key={s.studentId || idx} className="hover:bg-[#0c2b52]/50 transition">
                    <td className="p-3 text-center text-slate-400 font-mono">
                      {idx + 1}
                    </td>

                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => setActiveStudentForAnalytics(s)}
                        className="text-left group flex items-center gap-2.5"
                        title="Click to view full marks history and graphs"
                      >
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#00a896]/20 to-[#00C49F]/30 border border-[#00a896]/40 flex items-center justify-center text-[#00C49F] font-bold text-xs shrink-0 group-hover:bg-[#00C49F] group-hover:text-[#040d1a] transition">
                          {(s.studentName || 'S').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-white group-hover:text-[#00C49F] transition underline-offset-2 group-hover:underline">
                            {s.studentName}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {s.studentUsn || 'No USN'}
                          </div>
                        </div>
                      </button>
                    </td>

                    <td className="p-3 text-slate-300">
                      <div>{s.branch || s.standard || s.pucYear || 'General'}</div>
                      {s.semester && <div className="text-[11px] text-slate-500">Sem {s.semester}</div>}
                    </td>

                    <td className="p-3 text-center">
                      <span className="px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 text-[11px] font-bold border border-cyan-500/30">
                        {s.division || 'A'}
                      </span>
                    </td>

                    <td className="p-3 text-center font-mono font-bold text-white">
                      {s.assessmentsCount}
                    </td>

                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="font-extrabold text-white text-sm">
                          {s.avgPercentage}%
                        </span>
                      </div>
                      <div className="w-20 mx-auto h-1.5 rounded-full bg-[#071b34] overflow-hidden mt-1">
                        <div
                          className={`h-full rounded-full ${
                            s.avgPercentage >= 75
                              ? 'bg-emerald-400'
                              : s.avgPercentage >= 60
                              ? 'bg-cyan-400'
                              : s.avgPercentage >= 40
                              ? 'bg-yellow-400'
                              : 'bg-rose-400'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(5, s.avgPercentage))}%` }}
                        />
                      </div>
                    </td>

                    <td className="p-3 text-center">
                      <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold border ${getGradeBadgeColor(s.overallGrade)}`}>
                        {s.overallGrade}
                      </span>
                    </td>

                    <td className="p-3">
                      <div className="flex items-center gap-1.5 flex-wrap max-w-xs">
                        {(s.recentMarks || []).slice(0, 3).map((m, mIdx) => (
                          <span
                            key={mIdx}
                            className={`px-2 py-0.5 rounded border text-[10px] whitespace-nowrap ${
                              m.assessmentType === 'quiz'
                                ? 'bg-[#00a896]/15 border-[#00a896]/40 text-cyan-200'
                                : 'bg-[#0b2444] border-[#133966] text-slate-300'
                            }`}
                            title={`${m.assessmentName} (${m.courseCode}): ${m.score}/${m.maxScore} (${m.percentage}%) - ${
                              m.assessmentType === 'quiz' ? 'Auto-graded Online Quiz' : 'School/College Exam'
                            }`}
                          >
                            <span className="font-semibold text-cyan-200">
                              {m.assessmentType === 'quiz' ? '⚡ Quiz' : m.courseCode || 'EXAM'}
                            </span>: {m.score}/{m.maxScore}
                          </span>
                        ))}
                        {(s.recentMarks || []).length > 3 && (
                          <span className="text-[10px] text-slate-500">
                            +{s.recentMarks.length - 3} more
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => setActiveStudentForAnalytics(s)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#00a896]/20 to-[#00C49F]/20 hover:from-[#00a896] hover:to-[#00C49F] text-[#00C49F] hover:text-[#040d1a] border border-[#00a896]/40 text-xs font-bold transition shadow-sm"
                      >
                        <TrendingUp className="w-3.5 h-3.5" />
                        Analyze
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="p-4 border-t border-[#133966] bg-[#05152a] text-xs text-slate-400 flex items-center justify-between">
          <span>Showing {filteredStudents.length} student academic standing records.</span>
        </div>
      </div>
    </div>
  );
}
