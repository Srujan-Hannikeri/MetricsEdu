import React, { useState } from 'react';
import {
  ShieldCheck, School as SchoolIcon, GraduationCap, Lock,
  Mail, User, KeyRound, ArrowRight, CheckCircle2, AlertCircle,
  Building2, RefreshCw, X, ChevronRight, BookOpen, Layers
} from 'lucide-react';
import { api, setToken } from '../services/api';

// ─── Institution type definitions ────────────────────────────────────────────
const INSTITUTION_TYPES = [
  {
    id: 'institute',
    label: 'Engineering Institute',
    shortLabel: 'Institute',
    emoji: '🏛️',
    color: 'text-[#38bdf8] border-cyan-500/40 bg-cyan-500/10',
    activeColor: 'bg-cyan-500/20 border-cyan-500/60',
    desc: 'B.E / B.Tech — 8 semester degree programmes'
  },
  {
    id: 'diploma',
    label: 'Diploma (Polytechnic)',
    shortLabel: 'Diploma',
    emoji: '📐',
    color: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
    activeColor: 'bg-amber-500/20 border-amber-500/60',
    desc: 'Polytechnic diploma — 6 semester programmes'
  },
  {
    id: 'pu_college',
    label: 'PU College',
    shortLabel: 'PU College',
    emoji: '📚',
    color: 'text-purple-300 border-purple-500/40 bg-purple-500/10',
    activeColor: 'bg-purple-500/20 border-purple-500/60',
    desc: '1st & 2nd PUC — Science / Arts / Commerce'
  },
  {
    id: 'school',
    label: 'School (1st–10th Std)',
    shortLabel: 'School',
    emoji: '🏫',
    color: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
    activeColor: 'bg-emerald-500/20 border-emerald-500/60',
    desc: 'Primary & secondary school up to 10th standard'
  }
];

// ─── Demo credentials per institution ────────────────────────────────────────
const DEMO_ACCOUNTS = {
  institute: [
    { role: 'admin',   id: 'ADM-INST-001',  pw: 'adminpassword123',   label: 'Institute Admin',            desc: 'Timetable, faculty, users, and attendance' },
    { role: 'teacher', id: 'TCH-101',        pw: 'teacherpassword123', label: 'Prof. Asha Sharma',          desc: 'My classes, attendance, session history' },
    { role: 'student', id: '1MS22CS001',     pw: 'studentpassword123', label: 'Aarav Patel (CSE Sem 5)',    desc: 'Attendance %, timetable, face registration' }
  ],
  diploma: [
    { role: 'admin',   id: 'ADM-DIP-001',   pw: 'adminpassword123',   label: 'Diploma Admin',   desc: 'Timetable, faculty, users, and attendance' },
    { role: 'teacher', id: 'TCH-DIP-DCS-01', pw: 'teacherpassword123', label: 'Diploma Lecturer', desc: 'Assigned department classes and attendance' },
    { role: 'student', id: 'DIP-DCS-001',    pw: 'studentpassword123', label: 'Diploma Student',  desc: 'Attendance, timetable, and profile' }
  ],
  pu_college: [
    { role: 'admin',   id: 'ADM-PUC-001',      pw: 'adminpassword123',   label: 'PU College Admin',    desc: 'Run Seed Demo Data first' },
    { role: 'teacher', id: 'TCH-PUC-SCI-01',   pw: 'teacherpassword123', label: 'PUC Science Lecturer', desc: 'Assigned department classes and attendance' },
    { role: 'student', id: 'PUC-1PUC-S-001',   pw: 'studentpassword123', label: 'PUC Science Student',  desc: 'Attendance, timetable, and profile' }
  ],
  school: [
    { role: 'admin',   id: 'ADM-SCH-001', pw: 'adminpassword123',   label: 'School Principal',  desc: 'Timetable, faculty, users, and attendance' },
    { role: 'teacher', id: 'TCH-SCH-01',  pw: 'teacherpassword123', label: 'Class Teacher',     desc: 'Assigned classes and attendance' },
    { role: 'student', id: 'SCH-10-001',  pw: 'studentpassword123', label: '10th Std Student',  desc: 'Attendance, timetable, and profile' }
  ]
};

const SCHOOL_STANDARDS = ['1st Std','2nd Std','3rd Std','4th Std','5th Std',
                          '6th Std','7th Std','8th Std','9th Std','10th Std'];
const PUC_YEARS = ['1st PUC', '2nd PUC'];
const PUC_DEPTS = ['Science', 'Arts', 'Commerce'];
const INST_BRANCHES = [
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
const DIPLOMA_BRANCHES = [
  'Computer Science & Engineering',
  'Information Science & Engineering',
  'Electronics & Communication Engineering',
  'Electrical & Electronics Engineering',
  'Mechanical Engineering',
  'Civil Engineering'
];

export default function AuthView({ onAuthSuccess }) {
  const [mode, setMode] = useState('login');
  const [selectedRole, setSelectedRole] = useState('teacher');
  const [institutionType, setInstitutionType] = useState('institute');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adminId, setAdminId] = useState('');
  const [adminRegistrationCode, setAdminRegistrationCode] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [usn, setUsn] = useState('');
  const [parentsEmail, setParentsEmail] = useState('');
  const [department, setDepartment] = useState('Computer Science & Engineering');
  const [semester, setSemester] = useState(1);
  const [section, setSection] = useState('A');
  const [identifier, setIdentifier] = useState('');
  const [standard, setStandard] = useState('10th Std');
  const [pucYear, setPucYear] = useState('1st PUC');
  const [pucDept, setPucDept] = useState('Science');

  // Forgot password
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  const instCfg = INSTITUTION_TYPES.find(t => t.id === institutionType);

  const handleQuickDemo = (acc) => {
    setSelectedRole(acc.role);
    setMode('login');
    setError('');
    setIdentifier(acc.id);
    setPassword(acc.pw);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccessMsg(''); setLoading(true);
    try {
      if (mode === 'login') {
        const idToSubmit = identifier.trim() || email.trim();
        if (!idToSubmit || !password) throw new Error('Please provide identifier and password');
        const data = await api.login(idToSubmit, password, selectedRole);
        setToken(data.token);
        setSuccessMsg('Login successful! Loading your dashboard...');
        setTimeout(() => onAuthSuccess(data.user), 300);
      } else {
        if (!name || !email || !password) throw new Error('Name, email and password are required');
        const payload = { name, email, password, role: selectedRole, institutionType };

        if (selectedRole === 'admin') {
          if (!adminId) throw new Error('Admin ID is required');
          if (!adminRegistrationCode) throw new Error('Admin invitation code is required');
          payload.adminId = adminId.trim();
          payload.adminRegistrationCode = adminRegistrationCode;
        } else if (selectedRole === 'teacher') {
          if (!teacherId) throw new Error('Teacher ID is required');
          payload.teacherId = teacherId.trim();
          if (institutionType === 'institute' || institutionType === 'diploma') {
            payload.department = department;
            payload.branch = department;
          }
          if (institutionType === 'pu_college') { payload.pucYear = pucYear; payload.pucDept = pucDept; }
        } else if (selectedRole === 'student') {
          if (!usn) throw new Error('Student ID / USN / Roll No is required');
          payload.usn = usn.trim().toUpperCase();
          payload.section = section.trim().toUpperCase();

          if (institutionType === 'school') {
            if (!parentsEmail) throw new Error("Parent's email is required for school students");
            payload.parentsEmail = parentsEmail.trim();
            payload.standard = standard;
          } else if (institutionType === 'pu_college') {
            payload.pucYear = pucYear;
            payload.pucDept = pucDept;
            if (parentsEmail) payload.parentsEmail = parentsEmail.trim();
          } else {
            payload.semester = Number(semester);
            payload.department = department;
            if (parentsEmail) payload.parentsEmail = parentsEmail.trim();
          }
        }

        const data = await api.register(payload);
        setToken(data.token);
        setSuccessMsg('Account created! Welcome to MetricsEdu.');
        setTimeout(() => onAuthSuccess(data.user), 500);
      }
    } catch (err) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestForgotOtp = async (e) => {
    e.preventDefault();
    setForgotError(''); setForgotLoading(true);
    try {
      await api.forgotPassword(forgotEmail.trim());
      setForgotSuccess('OTP sent to your email.');
      setForgotStep(2);
    } catch (err) { setForgotError(err.message); }
    finally { setForgotLoading(false); }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setForgotError('');
    if (forgotNewPassword !== forgotConfirmPassword) { setForgotError('Passwords do not match.'); return; }
    setForgotLoading(true);
    try {
      await api.resetPassword(forgotEmail.trim(), forgotOtp.trim(), forgotNewPassword);
      setForgotSuccess('Password reset! Please sign in.');
      setTimeout(() => { setShowForgotModal(false); setForgotStep(1); setMode('login'); }, 1500);
    } catch (err) { setForgotError(err.message); }
    finally { setForgotLoading(false); }
  };

  const demoAccounts = DEMO_ACCOUNTS[institutionType] || DEMO_ACCOUNTS.institute;
  const roleIcons = { admin: ShieldCheck, teacher: SchoolIcon, student: GraduationCap };

  return (
    <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-0 bg-[#071b34]/95 border border-[#133966] rounded-3xl shadow-2xl overflow-hidden">

        {/* ── LEFT: demo accounts ───────────────────────────────────────────── */}
        <div className="lg:col-span-5 bg-gradient-to-br from-[#040d1a] to-[#071b34] p-6 sm:p-8 flex flex-col gap-5 border-b lg:border-b-0 lg:border-r border-[#133966]">

          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#00a896]/20 border border-[#00a896]/40 p-1 flex items-center justify-center">
              <img src="/logo.jpg" alt="Logo" className="w-full h-full object-cover rounded-lg" />
            </div>
            <div>
              <h1 className="text-lg font-black text-white">MetricsEdu</h1>
              <p className="text-[10px] text-[#00C49F] font-bold tracking-wider">SMART CLASSROOM</p>
            </div>
          </div>

          {/* Demo accounts for selected institution */}
          <div className="bg-[#040d1a]/85 rounded-2xl p-4 border border-[#133966] flex-1">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] uppercase tracking-wider font-bold text-slate-300">⚡ Demo Accounts</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${instCfg?.color || ''}`}>{instCfg?.shortLabel}</span>
            </div>
            <div className="space-y-2">
              {demoAccounts.map((acc, i) => {
                const Icon = roleIcons[acc.role];
                const colors = { admin: 'text-rose-400 bg-rose-500/15 border-rose-500/30 hover:border-rose-500/60',
                  teacher: 'text-[#00C49F] bg-[#00a896]/15 border-[#00a896]/30 hover:border-[#00a896]',
                  student: 'text-[#38bdf8] bg-cyan-500/10 border-cyan-500/30 hover:border-cyan-500/60' };
                return (
                  <button key={i} onClick={() => handleQuickDemo(acc)}
                    className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between group bg-[#071b34] ${colors[acc.role]}`}>
                    <div className="flex items-center gap-2.5">
                      <div className={`p-1.5 rounded-lg border ${colors[acc.role]}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-100">{acc.label}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{acc.id}</div>
                        <div className="text-[9px] text-slate-500 mt-0.5">{acc.desc}</div>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:translate-x-1 transition-transform shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="text-[11px] text-slate-500 border-t border-[#133966] pt-3 flex items-center justify-between">
            <span className="text-[#00C49F] flex items-center gap-1 font-mono"><span className="w-1.5 h-1.5 rounded-full bg-[#00C49F] animate-pulse" /> 100% JS Vision</span>
          </div>
        </div>

        {/* ── RIGHT: Auth form ─────────────────────────────────────────────────── */}
        <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-center gap-5">

          {/* Institution type selector */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Select Institution Type:</p>
            <div className="grid grid-cols-2 gap-2">
              {INSTITUTION_TYPES.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setInstitutionType(t.id);
                    if (t.id === 'institute' || t.id === 'diploma') setDepartment((t.id === 'diploma' ? DIPLOMA_BRANCHES : INST_BRANCHES)[0]);
                    setError('');
                    setIdentifier('');
                    setPassword('');
                  }}
                  className={`p-3 rounded-2xl border text-left transition-all ${
                    institutionType === t.id
                      ? `${t.activeColor} ring-1 ring-offset-0 ring-current`
                      : 'border-[#133966] hover:border-slate-600 bg-[#040d1a]/60'
                  }`}
                >
                  <div className="text-base mb-0.5">{t.emoji}</div>
                  <div className={`text-xs font-bold ${institutionType === t.id ? t.color.split(' ')[0] : 'text-slate-300'}`}>{t.shortLabel}</div>
                  <div className="text-[10px] text-slate-500 leading-tight mt-0.5">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Mode switcher */}
          <div className="flex items-center justify-between pb-4 border-b border-[#133966]">
            <div>
              <h3 className="text-xl font-black text-white">{mode === 'login' ? 'Sign In' : 'Create Account'}</h3>
              <p className="text-xs text-cyan-200/70 mt-0.5">{instCfg?.emoji} {instCfg?.label} Portal</p>
            </div>
            <div className="flex bg-[#040d1a] p-1 rounded-xl border border-[#133966]">
                  {['login','register'].map(m => (
                    <button key={m} onClick={() => {
                      setMode(m);
                      setError('');
                    }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${mode === m
                    ? 'bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] shadow-md'
                    : 'text-slate-400 hover:text-white'}`}>
                  {m === 'login' ? 'Login' : 'Register'}
                </button>
              ))}
            </div>
          </div>

          {/* Role selector */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'admin', label: 'Admin', sub: 'Admin ID' },
              { id: 'teacher', label: institutionType === 'school' ? 'Teacher' : 'Lecturer', sub: 'Teacher ID' },
              { id: 'student', label: 'Student', sub: institutionType === 'school' ? 'Roll No' : institutionType === 'pu_college' ? 'Roll No' : 'USN' }
            ].map(r => {
              const Icon = roleIcons[r.id];
              return (
                <button key={r.id} onClick={() => { setSelectedRole(r.id); setError(''); }}
                  className={`p-2.5 rounded-2xl border text-center transition-all flex flex-col items-center gap-1 ${selectedRole === r.id
                    ? 'bg-[#0b2444] border-[#00C49F] ring-1 ring-[#00C49F]/50'
                    : 'bg-[#040d1a]/80 border-[#133966] hover:border-slate-600 text-slate-400'}`}>
                  <Icon className={`w-5 h-5 ${selectedRole === r.id ? 'text-[#00C49F]' : 'text-slate-500'}`} />
                  <span className={`text-xs font-bold ${selectedRole === r.id ? 'text-white' : 'text-slate-300'}`}>{r.label}</span>
                  <span className="text-[10px] font-mono text-cyan-200/60">{r.sub}</span>
                </button>
              );
            })}
          </div>

          {/* Error / success */}
          {error && (
            <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}
          {successMsg && (
            <div className="p-3 rounded-xl bg-[#00a896]/15 border border-[#00a896]/30 text-[#67e8f9] text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />{successMsg}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'register' && (
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">Full Name *</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Prof. Nandini C.V" required
                  className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#00a896]" />
              </div>
            )}

            {/* Identifier (login) or ID field (register) */}
            {mode === 'login' ? (
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">
                  {selectedRole === 'admin' ? 'Admin ID' : selectedRole === 'teacher' ? 'Teacher ID' : 'Student USN / Roll No'}
                </label>
                <input value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="Enter your ID"
                  className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-[#00a896]" />
              </div>
            ) : (
              <>
                {selectedRole === 'admin' && (
                  <>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1 block">Admin ID *</label>
                      <input value={adminId} onChange={e => setAdminId(e.target.value)} placeholder="e.g. ADM-INST-002" required
                        className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-[#00a896]" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1 block">Admin invitation code *</label>
                      <input type="password" value={adminRegistrationCode} onChange={e => setAdminRegistrationCode(e.target.value)} required autoComplete="new-password"
                        className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#00a896]" />
                    </div>
                  </>
                )}
                {selectedRole === 'teacher' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-300 mb-1 block">Teacher ID *</label>
                    <input value={teacherId} onChange={e => setTeacherId(e.target.value)} placeholder="e.g. TCH-INST-001" required
                      className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-[#00a896]" />
                  </div>
                )}
                {selectedRole === 'student' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-300 mb-1 block">
                      {institutionType === 'school' ? 'Roll No *' : institutionType === 'pu_college' ? 'Roll No *' : 'USN *'}
                    </label>
                    <input value={usn} onChange={e => setUsn(e.target.value)} required
                      placeholder={institutionType === 'school' ? 'e.g. SCH-10-001' : institutionType === 'pu_college' ? 'e.g. PUC-1PUC-S-001' : 'e.g. 1MS22CS001'}
                      className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-[#00a896]" />
                  </div>
                )}
              </>
            )}

            {/* Email */}
            {mode === 'register' && (
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">Email *</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="your@email.com"
                  className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#00a896]" />
              </div>
            )}

            {/* Password */}
            <div>
              <label className="text-xs font-semibold text-slate-300 mb-1 block">Password *</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
                className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#00a896]" />
              {mode === 'login' && (
                <button type="button" onClick={() => setShowForgotModal(true)} className="text-[10px] text-[#00C49F] hover:underline mt-1">Forgot password?</button>
              )}
            </div>

            {/* Institution-specific extra fields for register */}
            {mode === 'register' && (
              <>
                {/* School student */}
                {institutionType === 'school' && selectedRole === 'student' && (
                  <>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1 block">Standard / Class *</label>
                      <select value={standard} onChange={e => setStandard(e.target.value)}
                        className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#00a896]">
                        {SCHOOL_STANDARDS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1 block">Parent's Email *</label>
                      <input type="email" value={parentsEmail} onChange={e => setParentsEmail(e.target.value)} required placeholder="parent@gmail.com"
                        className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#00a896]" />
                    </div>
                  </>
                )}

                {/* PU College student/teacher */}
                {institutionType === 'pu_college' && (selectedRole === 'student' || selectedRole === 'teacher') && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1 block">PUC Year *</label>
                      <select value={pucYear} onChange={e => setPucYear(e.target.value)}
                        className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#00a896]">
                        {PUC_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1 block">Department *</label>
                      <select value={pucDept} onChange={e => setPucDept(e.target.value)}
                        className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#00a896]">
                        {PUC_DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {/* Institute / Diploma teacher and student */}
                {(institutionType === 'institute' || institutionType === 'diploma') &&
                  (selectedRole === 'teacher' || selectedRole === 'student') && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1 block">Department / Branch *</label>
                      <select value={department} onChange={e => setDepartment(e.target.value)} required
                        className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#00a896]">
                        {(institutionType === 'diploma' ? DIPLOMA_BRANCHES : INST_BRANCHES).map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    {selectedRole === 'student' && <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1 block">Semester *</label>
                      <select value={semester} onChange={e => setSemester(Number(e.target.value))}
                        className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#00a896]">
                        {(institutionType === 'diploma' ? [1,2,3,4,5,6] : [1,2,3,4,5,6,7,8]).map(s => (
                          <option key={s} value={s}>Semester {s}</option>
                        ))}
                      </select>
                    </div>}
                  </div>
                )}
              </>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 transition-all hover:opacity-95 mt-1">
              {loading
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> {mode === 'login' ? 'Signing in...' : 'Creating account...'}</>
                : <>{mode === 'login' ? 'Sign In' : 'Create Account'} <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>
        </div>
      </div>

      {/* ── Forgot Password Modal ─────────────────────────────────────────────── */}
      {showForgotModal && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4" onClick={() => setShowForgotModal(false)}>
          <div className="bg-[#071b34] border border-[#133966] rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">Reset Password</h3>
              <button onClick={() => setShowForgotModal(false)} className="p-1.5 rounded-xl text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            {forgotError && <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs mb-3">{forgotError}</div>}
            {forgotSuccess && <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs mb-3">{forgotSuccess}</div>}
            {forgotStep === 1 ? (
              <form onSubmit={handleRequestForgotOtp} className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1 block">Account Email</label>
                  <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required placeholder="your@email.com"
                    className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none" />
                </div>
                <button type="submit" disabled={forgotLoading} className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] text-xs font-black disabled:opacity-50">
                  {forgotLoading ? 'Sending...' : 'Send OTP'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1 block">6-Digit OTP</label>
                  <input value={forgotOtp} onChange={e => setForgotOtp(e.target.value)} required placeholder="123456" maxLength={6}
                    className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1 block">New Password</label>
                  <input type="password" value={forgotNewPassword} onChange={e => setForgotNewPassword(e.target.value)} required placeholder="Min 6 characters"
                    className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1 block">Confirm Password</label>
                  <input type="password" value={forgotConfirmPassword} onChange={e => setForgotConfirmPassword(e.target.value)} required
                    className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none" />
                </div>
                <button type="submit" disabled={forgotLoading} className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] text-xs font-black disabled:opacity-50">
                  {forgotLoading ? 'Resetting...' : 'Reset Password'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
