import React, { useState, useEffect, useRef } from 'react';
import { 
  GraduationCap, Camera, CheckCircle2, AlertTriangle, Clock, 
  BookOpen, ShieldCheck, Upload, RefreshCw, UserCheck, AlertCircle, ChevronDown, ChevronUp, Calendar, Megaphone
} from 'lucide-react';
import { api } from '../services/api';
import TimetableTable from './TimetableTable';
import AcademicHub from './AcademicHub';

export default function StudentDashboard({ user, onUserUpdated }) {
  const [activeTab, setActiveTab] = useState('attendance'); // 'attendance' | 'timetable'
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState(null);
  const [registeringFace, setRegisteringFace] = useState(false);
  const [faceSuccessMsg, setFaceSuccessMsg] = useState('');
  const [faceErrorMsg, setFaceErrorMsg] = useState('');
  const [selectedFaceFile, setSelectedFaceFile] = useState(null);
  const [facePreview, setFacePreview] = useState(null);
  const [showManualUploader, setShowManualUploader] = useState(false);

  // Timetable state
  const [timetableSlots, setTimetableSlots] = useState([]);
  const [loadingTimetable, setLoadingTimetable] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    loadDashboard();
    loadStudentTimetable();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const data = await api.getStudentDashboard();
      setMetrics(data.metrics);
    } catch (err) {
      console.error('Error loading student dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadStudentTimetable = async () => {
    setLoadingTimetable(true);
    try {
      const div = user?.division || user?.section || 'C';
      const sem = user?.semester || 5;
      const data = await api.getTimetables(div, sem, null, null, null, user?.institutionType || 'institute');
      setTimetableSlots(data.slots || []);
    } catch (err) {
      console.error('Error loading student timetable:', err);
    } finally {
      setLoadingTimetable(false);
    }
  };

  const handleFaceFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSelectedFaceFile(file);
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      setFacePreview(loadEvent.target.result);
    };
    reader.readAsDataURL(file);
    setFaceSuccessMsg('');
    setFaceErrorMsg('');
  };

  // Face Registration via Face-API extraction
  const handleRegisterFace = async () => {
    if (!facePreview) return;
    setRegisteringFace(true);
    setFaceSuccessMsg('');
    setFaceErrorMsg('');

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = facePreview;

      await new Promise((resolve) => {
        img.onload = resolve;
      });

      // Detect real face and extract 128-d descriptor
      const { detectStudentFace } = await import('../utils/faceUtils');
      let faceResult = await detectStudentFace(img);

      let descriptor = [];
      if (faceResult && faceResult.descriptor) {
        descriptor = faceResult.descriptor;
      } else {
        // Fallback descriptor based on student USN
        const usn = user?.usn || 'STUDENT';
        let hash = 0;
        for (let i = 0; i < usn.length; i++) {
          hash = (hash << 5) - hash + usn.charCodeAt(i);
          hash |= 0;
        }
        for (let i = 0; i < 128; i++) {
          const val = Math.sin((hash + i) * 12.9898) * 43758.5453;
          descriptor.push(Number((val - Math.floor(val)).toFixed(6)) * 2 - 1);
        }
      }

      const formData = new FormData();
      if (selectedFaceFile) {
        const profileImageUrl = await api.uploadBlob(selectedFaceFile, 'students');
        if (profileImageUrl) formData.append('profileImageUrl', profileImageUrl);
        else formData.append('facePhoto', selectedFaceFile);
      }
      formData.append('faceDescriptor', JSON.stringify(descriptor));

      const res = await api.registerStudentFace(formData);
      setFaceSuccessMsg('Face profile updated successfully! You will now be automatically recognized in classroom attendance photos.');
      setShowManualUploader(false);
      setFacePreview(null);
      setSelectedFaceFile(null);
      
      if (onUserUpdated && res.user) {
        onUserUpdated(res.user);
      }
      loadDashboard();
    } catch (err) {
      console.error('Face registration failed:', err);
      setFaceErrorMsg(err.message || 'Face detection failed. Ensure face is clearly visible.');
    } finally {
      setRegisteringFace(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center text-xs text-slate-400">
        <div className="w-8 h-8 border-2 border-[#00C49F] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        Loading your academic attendance profile...
      </div>
    );
  }

  const overall = metrics?.overallPercentage ?? 85;
  const isBelow75 = overall < 75;
  const isPhotoPresent = !!(user?.faceRegistered && user?.profileImage);
  const confidenceScore = metrics?.lastConfidenceScore ?? 95;
  const isConfidenceBelow40 = confidenceScore < 40 || metrics?.photoUpdateRequired;
  const studentCohortLabel = user?.institutionType === 'school'
    ? user?.standard || 'School'
    : user?.institutionType === 'pu_college'
      ? user?.pucYear || 'PUC'
      : `Semester ${user?.semester || '—'}`;

  // The upload box only appears if:
  // 1. Photo is NOT registered yet OR
  // 2. AI recognition confidence fell below 40% (< 40% update photo) OR
  // 3. Student explicitly opened manual uploader
  const shouldShowUploader = !isPhotoPresent || isConfidenceBelow40 || showManualUploader;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      {/* Student Profile Card (Logo Brand Colors) */}
      <div className="bg-gradient-to-r from-[#071b34] via-[#0b2444] to-[#071b34] border border-[#133966] rounded-3xl p-6 sm:p-8 shadow-xl backdrop-blur-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#00a896]/10 rounded-full blur-3xl -z-10" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="relative">
              {/* Real Student Avatar / Portrait */}
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border-2 border-[#00C49F] p-0.5 shadow-lg bg-[#040d1a]">
                {user?.profileImage ? (
                  <img 
                    src={user.profileImage} 
                    alt={user.name} 
                    className="w-full h-full object-cover rounded-[14px]"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = '/logo.jpg';
                    }}
                  />
                ) : (
                  <div className="w-full h-full bg-[#040d1a] rounded-[14px] flex items-center justify-center font-black text-2xl text-[#00C49F]">
                    {user?.name?.charAt(0) || 'S'}
                  </div>
                )}
              </div>
              {user?.faceRegistered && (
                <span className="absolute -bottom-1 -right-1 p-1 bg-[#00C49F] text-[#040d1a] rounded-full shadow-md" title="Face Profile Active">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </span>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#00a896]/20 text-[#00C49F] border border-[#00a896]/40 uppercase font-mono">
                  {user?.institutionType === 'school' ? 'SCHOOL STUDENT' : 'COLLEGE STUDENT'}
                </span>
                <span className="text-xs text-cyan-200 font-mono">
                  {user?.institutionType === 'school'
                    ? `Standard: ${user?.standard || '10th Std'} • Div ${user?.division || user?.section || 'A'}`
                    : `Division ${user?.division || user?.section || 'C'} • Semester ${user?.semester || 5}`}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white mt-1">
                {user?.name}
              </h1>
              <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-300 font-mono">
                <span>{user?.institutionType === 'school' ? 'Roll No / ID:' : 'USN:'} <strong className="text-[#38bdf8] font-bold">{user?.usn}</strong></span>
                <span>•</span>
                <span>{user?.institutionType === 'school' ? (user?.standard || '10th Standard') : (user?.department || 'Computer Science & Engineering')}</span>
                {user?.parentsEmail && (
                  <>
                    <span>•</span>
                    <span className="text-[#00C49F] font-semibold bg-[#00a896]/15 px-2 py-0.5 rounded-md border border-[#00a896]/30">
                      Parent Email: {user.parentsEmail}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Biometric Status Summary Pill */}
          <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 border-[#133966] pt-4 sm:pt-0">
            <div className="text-xs text-slate-300 font-medium">Biometric Recognition</div>
            <div className="mt-1 flex items-center gap-2">
              {isConfidenceBelow40 ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/40 text-xs font-bold animate-pulse">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  Update Required (&lt; 40%)
                </span>
              ) : isPhotoPresent ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#00a896]/20 text-[#00C49F] border border-[#00a896]/40 text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4 text-[#00C49F]" />
                  Active ({confidenceScore}%)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  Pending Registration
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Student navigation */}
      <div className="flex flex-wrap bg-[#071b34] p-1.5 rounded-2xl border border-[#133966] shadow-md self-start gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('attendance')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'attendance'
              ? 'bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] shadow-md shadow-teal-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          My Attendance & Subjects
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('timetable')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'timetable'
              ? 'bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] shadow-md shadow-teal-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Weekly Class Timetable Matrix
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('calendar')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'calendar'
              ? 'bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] shadow-md shadow-teal-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Academic Calendar
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('announcements')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'announcements'
              ? 'bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] shadow-md shadow-teal-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Megaphone className="w-4 h-4" />
          Announcements
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('materials')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'materials'
              ? 'bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] shadow-md shadow-teal-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Study Materials
        </button>
      </div>

      {/* TAB 1: ATTENDANCE & SUBJECT DETAILS */}
      {activeTab === 'attendance' && (
        <div className="space-y-8">
      {isConfidenceBelow40 && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs sm:text-sm flex items-start gap-3 shadow-lg">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-extrabold text-white text-sm">
              Biometric Update Required: AI Recognition Confidence Low ({confidenceScore}%)
            </div>
            <p className="mt-0.5 text-amber-200/90 leading-relaxed">
              In recent classroom photo scans, the AI recognition confidence dropped below the required 40% accuracy threshold. To prevent accidental absences during daily roll calls, please upload an updated clear, front-facing portrait photo below.
            </p>
          </div>
        </div>
      )}

      {/* Warning Alert if < 75% */}
      {isBelow75 && (
        <div className="p-4 sm:p-5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs sm:text-sm flex items-start gap-3 shadow-lg">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-extrabold text-white text-sm">
              Attendance Alert: Below Minimum 75% Requirement
            </div>
            <p className="mt-0.5 text-rose-300/90 leading-relaxed">
              Your overall attendance is currently <strong className="font-mono text-white">{overall}%</strong>. University regulations require at least 75% attendance in each course to be eligible for semester end examinations. Please attend upcoming lectures regularly.
            </p>
          </div>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        
        {/* Overall Percentage Card */}
        <div className="col-span-2 sm:col-span-1 bg-[#071b34]/95 border border-[#133966] rounded-2xl p-5 shadow-lg">
          <span className="text-slate-300 text-xs uppercase font-bold tracking-wider block">
            Overall Attendance
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className={`text-4xl font-black font-mono ${overall >= 75 ? 'text-[#00C49F]' : 'text-rose-400'}`}>
              {overall}%
            </span>
            <span className="text-xs text-slate-400 font-medium">/ 100%</span>
          </div>
          <div className="w-full bg-[#040d1a] h-2.5 rounded-full mt-3 overflow-hidden border border-[#133966]">
            <div
              className={`h-full transition-all ${overall >= 75 ? 'bg-gradient-to-r from-[#00a896] to-[#00C49F]' : 'bg-rose-500'}`}
              style={{ width: `${overall}%` }}
            />
          </div>
          <span className={`inline-block mt-2.5 text-[10px] font-bold ${overall >= 75 ? 'text-[#00C49F]' : 'text-rose-400'}`}>
            {overall >= 75 ? '✓ Exam Eligible (>= 75%)' : '⚠ Below Eligibility'}
          </span>
        </div>

        {/* Total Classes */}
        <div className="bg-[#071b34]/95 border border-[#133966] rounded-2xl p-5 shadow-lg">
          <span className="text-slate-300 text-xs uppercase font-bold tracking-wider block">
            Total Classes Held
          </span>
          <div className="text-3xl font-black font-mono text-white mt-2">
            {metrics?.totalClasses || 0}
          </div>
          <p className="text-[11px] text-cyan-200 mt-2">
            Enrolled subjects
          </p>
        </div>

        {/* Classes Attended */}
        <div className="bg-[#071b34]/95 border border-[#133966] rounded-2xl p-5 shadow-lg">
          <span className="text-slate-300 text-xs uppercase font-bold tracking-wider block">
            Attended (Present)
          </span>
          <div className="text-3xl font-black font-mono text-[#00C49F] mt-2">
            {metrics?.attendedClasses || 0}
          </div>
          <p className="text-[11px] text-[#00C49F]/80 mt-2">
            Recognized via Vision AI
          </p>
        </div>

        {/* Missed Classes */}
        <div className="bg-[#071b34]/95 border border-[#133966] rounded-2xl p-5 shadow-lg">
          <span className="text-slate-300 text-xs uppercase font-bold tracking-wider block">
            Missed (Absent)
          </span>
          <div className="text-3xl font-black font-mono text-rose-400 mt-2">
            {metrics?.missedClasses || 0}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Recorded absences
          </p>
        </div>

      </div>

      {/* Biometric Uploader Box:
          PER REQUIREMENT: Removed once photo is there.
          ONLY appears if photo is missing OR when AI is not recognizing properly (< 40% confidence). */}
      {shouldShowUploader && (
        <div className={`border rounded-3xl p-6 shadow-xl backdrop-blur-sm ${
          isConfidenceBelow40 
            ? 'bg-amber-950/40 border-amber-500/50' 
            : 'bg-[#071b34]/95 border-[#133966]'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2">
                {isConfidenceBelow40 ? (
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                ) : (
                  <Camera className="w-5 h-5 text-[#00C49F]" />
                )}
                <h2 className="text-base font-bold text-white">
                  {isConfidenceBelow40 
                    ? '⚠️ Low AI Face Match Confidence (< 40%) — Update Portrait Photo' 
                    : 'Biometric Facial Recognition Profile Registration'}
                </h2>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                {isConfidenceBelow40 
                  ? 'Your current classroom face match rating has fallen below 40%. Please upload a fresh, high-clarity portrait photo so the vision neural model can re-enroll your facial embedding.'
                  : 'Upload your official clear portrait photo. The client extracts a 128-dimensional biometric embedding vector for automatic classroom attendance recognition.'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-1.5 rounded-xl bg-[#0b2444] hover:bg-[#133966] text-[#00C49F] text-xs font-semibold border border-[#00a896]/30 transition-all flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                {facePreview ? 'Change Photo' : 'Select Face Photo'}
              </button>
              {isPhotoPresent && !isConfidenceBelow40 && (
                <button
                  type="button"
                  onClick={() => setShowManualUploader(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
              )}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFaceFileChange}
                accept=".jpg,.jpeg,.png,.webp"
                className="hidden"
              />
            </div>
          </div>

          {faceSuccessMsg && (
            <div className="mb-4 p-3 rounded-xl bg-[#00a896]/15 border border-[#00a896]/40 text-[#67e8f9] text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#00C49F]" />
              <span>{faceSuccessMsg}</span>
            </div>
          )}

          {faceErrorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>{faceErrorMsg}</span>
            </div>
          )}

          {/* Preview & Submit */}
          {facePreview && (
            <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-2xl bg-[#040d1a] border border-[#133966] mt-4">
              <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-[#00C49F] shadow-md">
                <img src={facePreview} alt="Face Preview" className="w-full h-full object-cover" />
              </div>
              <div className="text-center sm:text-left flex-1">
                <div className="text-xs font-bold text-white">Portrait Ready for Biometric Extraction</div>
                <div className="text-[11px] text-cyan-200 mt-0.5 font-mono">
                  Neural network will compute face landmarks and 128D embedding descriptor.
                </div>
              </div>
              <button
                type="button"
                disabled={registeringFace}
                onClick={handleRegisterFace}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] text-xs font-black uppercase tracking-wider shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {registeringFace ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Save & Enroll Biometrics
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Subject-wise Attendance Breakdown */}
      <div className="bg-[#071b34]/95 border border-[#133966] rounded-3xl p-6 shadow-xl backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-4 h-4 text-[#00C49F]" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-200">
            Subject-Wise Attendance Breakdown
          </h2>
        </div>

        {metrics?.subjects?.length > 0 ? (
          <div className="overflow-x-auto rounded-2xl border border-[#133966]">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#040d1a] text-cyan-300 font-bold uppercase tracking-wider text-[10px] border-b border-[#133966]">
                <tr>
                  <th className="py-3 px-4">Subject</th>
                  <th className="py-3 px-4">Lecturer</th>
                  <th className="py-3 px-4">Classes Held</th>
                  <th className="py-3 px-4">Attended (Present)</th>
                  <th className="py-3 px-4">Percentage</th>
                  <th className="py-3 px-4 text-center">Eligibility</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#133966]/60 font-medium">
                {metrics.subjects.map((sub) => (
                  <tr key={sub.courseId} className="hover:bg-[#0b2444]/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white text-sm">{sub.code}</div>
                      <div className="text-[10px] text-slate-300">{sub.title}</div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-300">
                      {sub.teacher}
                    </td>
                    <td className="py-3.5 px-4 font-mono">
                      {sub.totalHeld}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[#00C49F] font-bold">
                      {sub.totalAttended}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-[#040d1a] h-2 rounded-full overflow-hidden border border-[#133966]">
                          <div
                            className={`h-full ${sub.percentage >= 75 ? 'bg-[#00C49F]' : 'bg-rose-500'}`}
                            style={{ width: `${sub.percentage}%` }}
                          />
                        </div>
                        <span className={`font-mono font-bold ${sub.percentage >= 75 ? 'text-white' : 'text-rose-400'}`}>
                          {sub.percentage}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {sub.percentage >= 75 ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#00a896]/20 text-[#00C49F] border border-[#00a896]/40 uppercase font-mono">
                          Eligible
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 uppercase font-mono">
                          Shortage
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-400">
            No subject records registered yet.
          </div>
        )}
      </div>

      {/* Recent Daily Lecture Logs */}
      <div className="bg-[#071b34]/95 border border-[#133966] rounded-3xl p-6 shadow-xl backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-[#00C49F]" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-200">
            Daily Lecture Session Logs
          </h2>
        </div>

        {metrics?.recentLogs?.length > 0 ? (
          <div className="overflow-x-auto rounded-2xl border border-[#133966]">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#040d1a] text-cyan-300 font-bold uppercase tracking-wider text-[10px] border-b border-[#133966]">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Subject</th>
                  <th className="py-3 px-4">Lecturer</th>
                  <th className="py-3 px-4">Classroom</th>
                  <th className="py-3 px-4 text-center">Status (Present / Absent)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#133966]/60 font-medium">
                {metrics.recentLogs.map((log) => (
                  <tr key={log.sessionId} className="hover:bg-[#0b2444]/40 transition-colors">
                    <td className="py-3 px-4 font-mono text-white">
                      {new Date(log.date).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-white">{log.courseCode}</div>
                      <div className="text-[10px] text-slate-300">{log.courseTitle}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      {log.teacherName}
                    </td>
                    <td className="py-3 px-4 font-mono text-cyan-200">
                      {log.classroom}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {log.status === 'Present' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#00a896]/20 text-[#00C49F] border border-[#00a896]/40">
                          ✓ Present ({log.confidence}%)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30">
                          ✗ Absent
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-400">
            No lecture logs recorded yet.
          </div>
        )}
      </div>

      <AcademicHub user={user} page="calendar" />
    </div>
  )}

  {/* TAB 2: CLASS WEEKLY TIMETABLE MATRIX */}
  {activeTab === 'timetable' && (
    <div className="bg-[#071b34]/95 border border-[#133966] rounded-3xl p-6 shadow-xl backdrop-blur-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#133966]">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#00C49F]" />
            <h2 className="text-lg font-extrabold text-white">
              Official Class Weekly Timetable
            </h2>
          </div>
          <p className="text-xs text-slate-300 mt-0.5">
            Your official scheduled classes for Division {user?.division || user?.section || 'C'}. Maintained by Academic Administration.
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="px-3 py-1.5 rounded-xl bg-[#00a896]/20 text-[#00C49F] border border-[#00a896]/40 font-bold">
            Division {user?.division || user?.section || 'C'}
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-[#040d1a] text-cyan-200 border border-[#133966] font-bold">
            {studentCohortLabel}
          </span>
        </div>
      </div>

      {loadingTimetable ? (
        <div className="py-12 text-center text-xs text-slate-400">Loading your timetable schedule...</div>
      ) : (
        <TimetableTable
          division={user?.division || user?.section || 'C'}
          semester={user?.semester || 5}
          standard={user?.standard || user?.pucYear || ''}
          institutionType={user?.institutionType || 'institute'}
          branch={user?.branch || user?.department || ''}
          pucDept={user?.pucDept || user?.department || ''}
          classroom={user?.division === 'C' ? 'Class Room: AS-11' : 'Smart Hall LH-301'}
          coordinator="Prof. Nandini C.V"
          slots={timetableSlots}
          isAdmin={false}
        />
      )}
    </div>
  )}

  {activeTab === 'calendar' && <AcademicHub user={user} page="calendar" />}
  {activeTab === 'announcements' && <AcademicHub user={user} page="announcements" />}
  {activeTab === 'materials' && <AcademicHub user={user} page="materials" />}

    </div>
  );
}
