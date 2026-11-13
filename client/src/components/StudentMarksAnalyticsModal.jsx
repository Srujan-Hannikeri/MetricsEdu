import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  TrendingUp,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  AlertCircle,
  BarChart2,
  FileText,
  User,
  Search,
  Filter,
  Download,
  Percent
} from 'lucide-react';
import { api } from '../services/api';

export default function StudentMarksAnalyticsModal({ studentId, studentInfo, onClose, isInline = false }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('analytics'); // 'analytics' | 'history'
  const [selectedHoverPoint, setSelectedHoverPoint] = useState(null);
  const [historySearch, setHistorySearch] = useState('');
  const [historySubjectFilter, setHistorySubjectFilter] = useState('ALL');

  useEffect(() => {
    if (!studentId) return;
    loadStudentHistory();
  }, [studentId]);

  const loadStudentHistory = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getStudentMarksHistory(studentId);
      if (res.success) {
        setData(res);
      } else {
        setError(res.message || 'Failed to load student marks data');
      }
    } catch (err) {
      console.error('Error loading student marks history:', err);
      setError(err.message || 'Error fetching student marks history');
    } finally {
      setLoading(false);
    }
  };

  const student = data?.student || studentInfo;
  const stats = data?.stats || {
    totalAssessments: 0,
    cumulativePercentage: 0,
    overallGrade: 'N/A',
    passedCount: 0,
    failedCount: 0,
    highestPercentage: 0,
    lowestPercentage: 0
  };

  const trajectory = data?.trajectory || [];
  const subjectBreakdown = data?.subjectBreakdown || [];
  const typeBreakdown = data?.typeBreakdown || [];
  const allMarks = data?.marks || [];

  // Filtered marks for the history table
  const filteredMarks = useMemo(() => {
    return allMarks.filter(m => {
      const matchesSearch = !historySearch ||
        m.assessmentName.toLowerCase().includes(historySearch.toLowerCase()) ||
        m.courseCode.toLowerCase().includes(historySearch.toLowerCase()) ||
        m.courseTitle.toLowerCase().includes(historySearch.toLowerCase());
      const matchesSubject = historySubjectFilter === 'ALL' || m.courseCode === historySubjectFilter;
      return matchesSearch && matchesSubject;
    });
  }, [allMarks, historySearch, historySubjectFilter]);

  // Unique subjects for filter dropdown
  const uniqueSubjects = useMemo(() => {
    const map = new Map();
    allMarks.forEach(m => {
      if (m.courseCode && !map.has(m.courseCode)) {
        map.set(m.courseCode, m.courseTitle);
      }
    });
    return Array.from(map.entries()).map(([code, title]) => ({ code, title }));
  }, [allMarks]);

  // SVG Line Chart coordinates calculation
  const chartConfig = useMemo(() => {
    if (trajectory.length === 0) return null;
    const width = 640;
    const height = 220;
    const padding = { top: 25, right: 30, bottom: 40, left: 45 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const points = trajectory.map((item, index) => {
      const x = trajectory.length === 1
        ? padding.left + chartW / 2
        : padding.left + (index / (trajectory.length - 1)) * chartW;
      const pct = Math.max(0, Math.min(100, item.percentage || 0));
      const y = padding.top + chartH - (pct / 100) * chartH;
      return { ...item, x, y };
    });

    // Create SVG Path
    let pathD = '';
    let areaD = '';
    if (points.length === 1) {
      pathD = `M ${points[0].x - 20} ${points[0].y} L ${points[0].x + 20} ${points[0].y}`;
      areaD = `M ${points[0].x - 20} ${padding.top + chartH} L ${points[0].x - 20} ${points[0].y} L ${points[0].x + 20} ${points[0].y} L ${points[0].x + 20} ${padding.top + chartH} Z`;
    } else {
      pathD = points.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`, '');
      areaD = `${pathD} L ${points[points.length - 1].x} ${padding.top + chartH} L ${points[0].x} ${padding.top + chartH} Z`;
    }

    return { width, height, padding, chartW, chartH, points, pathD, areaD };
  }, [trajectory]);

  // Export marks history to CSV
  const handleExportCSV = () => {
    if (filteredMarks.length === 0) return;
    const headers = ['Date', 'Course Code', 'Subject Title', 'Assessment Name', 'Type', 'Score', 'Max Score', 'Percentage', 'Grade', 'Status', 'Remarks'];
    const rows = filteredMarks.map(m => [
      m.examDate ? new Date(m.examDate).toLocaleDateString() : '',
      `"${m.courseCode || ''}"`,
      `"${m.courseTitle || ''}"`,
      `"${m.assessmentName || ''}"`,
      `"${m.assessmentType || ''}"`,
      m.score,
      m.maxScore,
      `${m.percentage}%`,
      m.grade,
      m.status,
      `"${(m.remarks || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${student?.name || 'student'}_marks_history.csv`);
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

  const content = (
    <div className={`relative w-full rounded-3xl border border-[#133966] bg-[#071b34] text-white shadow-2xl overflow-hidden flex flex-col ${
      isInline ? '' : 'max-w-5xl my-auto max-h-[92vh]'
    }`}>
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-[#133966] bg-gradient-to-r from-[#0b2444] to-[#071b34] flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#00a896] to-[#00C49F] flex items-center justify-center text-[#040d1a] font-extrabold text-lg shadow-md shrink-0">
            {student?.profileImage ? (
              <img src={student.profileImage} alt="" className="w-full h-full object-cover rounded-2xl" />
            ) : (
              (student?.name || 'S').charAt(0).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg sm:text-xl font-extrabold text-white truncate">{student?.name || 'Student Details'}</h2>
              {student?.usn && (
                <span className="px-2 py-0.5 rounded-md bg-[#00a896]/20 text-[#00C49F] text-xs font-mono font-bold border border-[#00a896]/30">
                  {student.usn}
                </span>
              )}
              {student?.division && (
                <span className="px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 text-xs font-bold border border-cyan-500/30">
                  Div {student.division}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5 truncate">
              {student?.branch || student?.standard || student?.pucYear || 'Department Student'}
              {student?.semester ? ` · Sem ${student.semester}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExportCSV}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-[#0c2b52] hover:bg-[#113a6e] text-xs font-semibold text-slate-200 transition"
            title="Download CSV"
          >
            <Download className="w-3.5 h-3.5 text-[#00C49F]" />
            Export
          </button>
          {!isInline && onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* View Toggle Tabs */}
        <div className="flex items-center gap-2 px-4 sm:px-6 py-2.5 bg-[#05152a] border-b border-[#133966] text-xs font-semibold shrink-0">
          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
              activeTab === 'analytics'
                ? 'bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] font-bold shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <BarChart2 className="w-4 h-4" />
            Performance & Graphs
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
              activeTab === 'history'
                ? 'bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] font-bold shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            Full Marks History ({allMarks.length})
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
          {loading ? (
            <div className="py-20 text-center space-y-3">
              <div className="w-10 h-10 border-4 border-[#00C49F] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-slate-400">Loading student analytics and marks history...</p>
            </div>
          ) : error ? (
            <div className="p-6 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-rose-400 shrink-0" />
              <div>
                <p className="font-bold">Error loading marks</p>
                <p className="text-xs text-rose-300/80 mt-0.5">{error}</p>
              </div>
            </div>
          ) : allMarks.length === 0 ? (
            <div className="py-16 text-center space-y-3 rounded-2xl border border-dashed border-[#133966] bg-[#0c2b52]/30">
              <Award className="w-12 h-12 text-slate-500 mx-auto" />
              <h3 className="text-base font-bold text-slate-300">No Assessment Marks Found</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No exam or assessment marks have been uploaded for {student?.name || 'this student'} yet.
              </p>
            </div>
          ) : (
            <>
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div className="p-4 rounded-2xl bg-gradient-to-br from-[#0c2b52] to-[#071b34] border border-[#133966] shadow-sm">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                    <span>Cumulative Avg</span>
                    <Percent className="w-4 h-4 text-[#00C49F]" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl sm:text-3xl font-extrabold text-white">
                      {stats.cumulativePercentage}%
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${getGradeBadgeColor(stats.overallGrade)}`}>
                      Grade {stats.overallGrade}
                    </span>
                  </div>
                  <p className="text-[11px] text-cyan-200/60 mt-1">Across all tests & subjects</p>
                </div>

                <div className="p-4 rounded-2xl bg-gradient-to-br from-[#0c2b52] to-[#071b34] border border-[#133966] shadow-sm">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                    <span>Total Exams</span>
                    <Award className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-white">
                    {stats.totalAssessments}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Recorded assessments</p>
                </div>

                <div className="p-4 rounded-2xl bg-gradient-to-br from-[#0c2b52] to-[#071b34] border border-[#133966] shadow-sm">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                    <span>Passed / Failed</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-xl sm:text-2xl font-extrabold text-emerald-400">{stats.passedCount}</span>
                    <span className="text-xs text-slate-400">passed</span>
                    {stats.failedCount > 0 && (
                      <span className="text-xs text-rose-400 font-bold">({stats.failedCount} fail)</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {stats.totalAssessments > 0 ? Math.round((stats.passedCount / stats.totalAssessments) * 100) : 0}% success rate
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-gradient-to-br from-[#0c2b52] to-[#071b34] border border-[#133966] shadow-sm">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                    <span>Peak Score</span>
                    <TrendingUp className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl sm:text-3xl font-extrabold text-amber-300">
                      {stats.highestPercentage}%
                    </span>
                    <span className="text-xs text-slate-400">high</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Lowest: {stats.lowestPercentage}%</p>
                </div>
              </div>

              {/* Tab 1: Analytics & Interactive Graphs */}
              {activeTab === 'analytics' && (
                <div className="space-y-6">
                  {/* Graph 1: Score Progression Curve */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-[#0b2444]/60 border border-[#133966]">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-5 h-5 text-[#00C49F]" />
                          <h3 className="text-sm sm:text-base font-bold text-white">Score Trajectory Progression</h3>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Chronological timeline of test percentages scored by {student?.name}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-0.5 bg-[#00C49F] inline-block" /> Score %
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-0.5 border-t border-dashed border-emerald-400 inline-block" /> 75% Distinction
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-0.5 border-t border-dashed border-rose-400 inline-block" /> 40% Pass
                        </span>
                      </div>
                    </div>

                    {chartConfig ? (
                      <div className="relative w-full overflow-x-auto">
                        <svg
                          viewBox={`0 0 ${chartConfig.width} ${chartConfig.height}`}
                          className="w-full h-auto min-w-[500px]"
                        >
                          <defs>
                            <linearGradient id="progressionGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#00C49F" stopOpacity="0.45" />
                              <stop offset="100%" stopColor="#00a896" stopOpacity="0.02" />
                            </linearGradient>
                          </defs>

                          {/* Horizontal Grid lines */}
                          {[100, 75, 50, 40, 0].map(pct => {
                            const y = chartConfig.padding.top + chartConfig.chartH - (pct / 100) * chartConfig.chartH;
                            const isThreshold75 = pct === 75;
                            const isThreshold40 = pct === 40;
                            return (
                              <g key={pct}>
                                <line
                                  x1={chartConfig.padding.left}
                                  y1={y}
                                  x2={chartConfig.width - chartConfig.padding.right}
                                  y2={y}
                                  stroke={isThreshold75 ? '#10b981' : isThreshold40 ? '#f43f5e' : '#1e3a5f'}
                                  strokeDasharray={isThreshold75 || isThreshold40 ? '4 4' : 'none'}
                                  strokeOpacity={isThreshold75 || isThreshold40 ? 0.7 : 0.4}
                                  strokeWidth="1"
                                />
                                <text
                                  x={chartConfig.padding.left - 8}
                                  y={y + 3}
                                  textAnchor="end"
                                  fill={isThreshold75 ? '#34d399' : isThreshold40 ? '#fb7185' : '#64748b'}
                                  fontSize="10"
                                  fontWeight={isThreshold75 || isThreshold40 ? 'bold' : 'normal'}
                                >
                                  {pct}%
                                </text>
                              </g>
                            );
                          })}

                          {/* Gradient Area Fill */}
                          <path d={chartConfig.areaD} fill="url(#progressionGradient)" />

                          {/* Trend Line */}
                          <path
                            d={chartConfig.pathD}
                            fill="none"
                            stroke="#00C49F"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />

                          {/* Data points */}
                          {chartConfig.points.map((pt, i) => {
                            const isHovered = selectedHoverPoint?.index === pt.index;
                            const isPass = pt.percentage >= 40;
                            return (
                              <g
                                key={i}
                                className="cursor-pointer transition-transform"
                                onMouseEnter={() => setSelectedHoverPoint(pt)}
                                onClick={() => setSelectedHoverPoint(pt)}
                              >
                                <circle
                                  cx={pt.x}
                                  cy={pt.y}
                                  r={isHovered ? 7 : 5}
                                  fill={isPass ? '#00C49F' : '#f43f5e'}
                                  stroke="#071b34"
                                  strokeWidth="2.5"
                                />
                                {/* Bottom label (Exam index or name) */}
                                <text
                                  x={pt.x}
                                  y={chartConfig.height - 10}
                                  textAnchor="middle"
                                  fill="#94a3b8"
                                  fontSize="9"
                                  fontWeight="600"
                                >
                                  {pt.courseCode || `T${i + 1}`}
                                </text>
                              </g>
                            );
                          })}
                        </svg>

                        {/* Interactive Tooltip Card */}
                        {selectedHoverPoint && (
                          <div className="mt-3 p-3 rounded-xl bg-[#061527] border border-[#00C49F]/40 shadow-lg text-xs flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <span className="text-[#00C49F] font-bold">{selectedHoverPoint.assessmentName}</span>
                              <span className="text-slate-400 ml-2">({selectedHoverPoint.courseTitle || selectedHoverPoint.courseCode})</span>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                Date: {selectedHoverPoint.date || 'Recent'} · Type: {selectedHoverPoint.assessmentType}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-white font-extrabold text-sm">
                                {selectedHoverPoint.score} / {selectedHoverPoint.maxScore}
                              </span>
                              <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getGradeBadgeColor(selectedHoverPoint.grade)}`}>
                                {selectedHoverPoint.percentage}% · Grade {selectedHoverPoint.grade}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 py-6 text-center">Not enough data to render trend chart.</p>
                    )}
                  </div>

                  {/* Graph 2: Subject Performance Comparison */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="p-4 sm:p-5 rounded-2xl bg-[#0b2444]/60 border border-[#133966]">
                      <div className="flex items-center gap-2 mb-3">
                        <BookOpen className="w-5 h-5 text-cyan-400" />
                        <h3 className="text-sm font-bold text-white">Subject-wise Average Standing</h3>
                      </div>
                      <p className="text-xs text-slate-400 mb-4">
                        Comparative performance across all enrolled courses and subjects
                      </p>

                      <div className="space-y-4">
                        {subjectBreakdown.map((sub) => {
                          const pct = sub.avgPercentage;
                          const barColor =
                            pct >= 75
                              ? 'from-emerald-500 to-[#00C49F]'
                              : pct >= 60
                              ? 'from-cyan-500 to-blue-500'
                              : pct >= 40
                              ? 'from-amber-500 to-yellow-500'
                              : 'from-rose-500 to-red-600';

                          return (
                            <div key={sub.courseCode} className="space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-bold text-white">{sub.courseCode}</span>
                                  <span className="text-slate-400 truncate max-w-[150px] sm:max-w-[200px]" title={sub.courseTitle}>
                                    {sub.courseTitle}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="font-extrabold text-white">{pct}%</span>
                                  <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${getGradeBadgeColor(sub.grade)}`}>
                                    {sub.grade}
                                  </span>
                                </div>
                              </div>

                              {/* Progress bar */}
                              <div className="w-full h-2.5 rounded-full bg-[#071b34] overflow-hidden border border-[#133966]/60">
                                <div
                                  className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-500`}
                                  style={{ width: `${Math.min(100, Math.max(3, pct))}%` }}
                                />
                              </div>

                              <div className="flex items-center justify-between text-[11px] text-slate-500">
                                <span>{sub.testsCount} assessment(s)</span>
                                <span>Range: {sub.lowestScore}% - {sub.highestScore}%</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Graph 3: Assessment Type Breakdown */}
                    <div className="p-4 sm:p-5 rounded-2xl bg-[#0b2444]/60 border border-[#133966] flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Award className="w-5 h-5 text-amber-400" />
                          <h3 className="text-sm font-bold text-white">Assessment Category Breakdown</h3>
                        </div>
                        <p className="text-xs text-slate-400 mb-4">
                          Average score by format: internal assessments, quizzes, assignments, and labs
                        </p>

                        <div className="grid grid-cols-2 gap-3">
                          {typeBreakdown.map((t) => (
                            <div key={t.type} className="p-3 rounded-xl bg-[#071b34] border border-[#133966]/80">
                              <span className="text-xs font-semibold capitalize text-slate-300 block">{t.type}</span>
                              <div className="text-xl font-black text-white mt-1">{t.avgPercentage}%</div>
                              <span className="text-[10px] text-slate-500 mt-0.5 block">{t.count} completed</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Diagnostic summary tip */}
                      <div className="mt-4 p-3.5 rounded-xl bg-[#00a896]/10 border border-[#00a896]/30 text-xs text-cyan-200">
                        <span className="font-bold text-[#00C49F]">Performance Summary: </span>
                        {stats.cumulativePercentage >= 75
                          ? `${student?.name} is consistently achieving First Class with Distinction standards.`
                          : stats.cumulativePercentage >= 60
                          ? `${student?.name} demonstrates solid comprehension with First Class standing.`
                          : stats.cumulativePercentage >= 40
                          ? `${student?.name} is passing across assessments, with room for improvement in weaker subjects.`
                          : `${student?.name} requires remedial attention and targeted practice in core assessments.`}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Full History Table */}
              {activeTab === 'history' && (
                <div className="space-y-4">
                  {/* Search and Filters */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search by assessment name or subject..."
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#0b2444] border border-[#133966] text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#00C49F]"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Filter className="w-4 h-4 text-slate-400 shrink-0" />
                      <select
                        value={historySubjectFilter}
                        onChange={(e) => setHistorySubjectFilter(e.target.value)}
                        className="px-3 py-2 rounded-xl bg-[#0b2444] border border-[#133966] text-xs text-white focus:outline-none focus:border-[#00C49F]"
                      >
                        <option value="ALL">All Subjects ({uniqueSubjects.length})</option>
                        {uniqueSubjects.map(s => (
                          <option key={s.code} value={s.code}>{s.code} - {s.title}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="w-full overflow-x-auto rounded-2xl border border-[#133966] bg-[#071b34]">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#0b2444] text-slate-300 font-semibold border-b border-[#133966]">
                          <th className="p-3">Date</th>
                          <th className="p-3">Subject / Course</th>
                          <th className="p-3">Assessment</th>
                          <th className="p-3">Type</th>
                          <th className="p-3 text-right">Score</th>
                          <th className="p-3 text-center">Percentage</th>
                          <th className="p-3 text-center">Grade</th>
                          <th className="p-3 text-center">Status</th>
                          <th className="p-3">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#133966]/60">
                        {filteredMarks.map((m, idx) => (
                          <tr key={m._id || idx} className="hover:bg-[#0c2b52]/50 transition">
                            <td className="p-3 text-slate-400 whitespace-nowrap">
                              {m.examDate ? new Date(m.examDate).toLocaleDateString() : '-'}
                            </td>
                            <td className="p-3">
                              <div className="font-bold text-white">{m.courseCode}</div>
                              <div className="text-[11px] text-slate-400 truncate max-w-[160px]">{m.courseTitle}</div>
                            </td>
                            <td className="p-3 font-semibold text-cyan-200">
                              {m.assessmentName}
                            </td>
                            <td className="p-3">
                              {m.assessmentType === 'quiz' ? (
                                <span className="px-2 py-0.5 rounded-md bg-[#00a896]/20 text-[#00C49F] border border-[#00a896]/30 font-semibold text-[10px]">
                                  ⚡ Auto Quiz
                                </span>
                              ) : (
                                <span className="capitalize text-slate-300">{m.assessmentType || 'Exam'}</span>
                              )}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-white">
                              {m.score} / {m.maxScore}
                            </td>
                            <td className="p-3 text-center">
                              <span className="font-extrabold text-white">
                                {m.percentage}%
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${getGradeBadgeColor(m.grade)}`}>
                                {m.grade}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                m.status === 'Absent' ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
                              }`}>
                                {m.status || 'Present'}
                              </span>
                            </td>
                            <td className="p-3 text-slate-400 max-w-[180px] truncate">
                              {m.remarks || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-[#133966] bg-[#071b34] flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span>MetricsEdu Student Academic Record · Real-time Analytics</span>
          {!isInline && onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition"
            >
              Close
            </button>
          )}
        </div>
      </div>
  );

  if (isInline) {
    return content;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md overflow-y-auto">
      {content}
    </div>
  );
}
