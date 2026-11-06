import React, { useState } from 'react';
import { 
  ShieldCheck, 
  School as SchoolIcon, 
  GraduationCap, 
  Lock, 
  Mail, 
  User, 
  KeyRound, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  Building2, 
  RefreshCw, 
  X, 
  ChevronRight
} from 'lucide-react';
import { api, setToken } from '../services/api';

export default function AuthView({ onAuthSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [selectedRole, setSelectedRole] = useState('teacher'); // 'admin' | 'teacher' | 'student'
  const [institutionType, setInstitutionType] = useState('college'); // 'college' | 'school'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adminId, setAdminId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [usn, setUsn] = useState('');
  const [standard, setStandard] = useState('10th Std');
  const [parentsEmail, setParentsEmail] = useState('');
  const [department, setDepartment] = useState('Computer Science & Engineering');
  const [semester, setSemester] = useState(5);
  const [section, setSection] = useState('A');
  const [identifier, setIdentifier] = useState('');

  // Forgot Password Modal State
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState(1); // 1: Request OTP, 2: Verify & Reset
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [maskedRecipient, setMaskedRecipient] = useState('');

  // Role info helper
  const roleConfig = {
    admin: {
      title: 'Administrator',
      desc: 'Institutional analytics, timetable automation & department control',
      icon: ShieldCheck,
      color: 'from-rose-500 to-red-600',
      badgeColor: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
      idField: 'Admin ID',
      idPlaceholder: 'e.g. ADM-2026-001'
    },
    teacher: {
      title: institutionType === 'school' ? 'School Teacher' : 'Teacher / Lecturer',
      desc: 'Automated facial recognition attendance, daily logs & grade reports',
      icon: SchoolIcon,
      color: 'from-[#00a896] to-[#00C49F]',
      badgeColor: 'text-[#00C49F] bg-[#00a896]/20 border-[#00a896]/40',
      idField: 'Teacher ID',
      idPlaceholder: 'e.g. TCH-101'
    },
    student: {
      title: 'Student',
      desc: institutionType === 'school' 
        ? 'Real face registration, daily class metrics & parent notifications'
        : 'Real face registration, attendance percentages & KLS GIT scheme courses',
      icon: GraduationCap,
      color: 'from-[#028090] to-[#38bdf8]',
      badgeColor: 'text-[#38bdf8] bg-cyan-500/15 border-cyan-500/30',
      idField: institutionType === 'school' ? 'Student Roll No' : 'USN (University Seat No)',
      idPlaceholder: institutionType === 'school' ? 'e.g. SCH-10-042' : 'e.g. 1MS22CS001'
    }
  };

  const currentRole = roleConfig[selectedRole];

  // Quick Demo fill
  const handleQuickDemo = (role) => {
    setSelectedRole(role);
    setMode('login');
    setError('');
    if (role === 'admin') {
      setIdentifier('ADM-2026-001');
      setPassword('adminpassword123');
    } else if (role === 'teacher') {
      setIdentifier('TCH-101');
      setPassword('teacherpassword123');
    } else if (role === 'student') {
      setIdentifier('1MS22CS001');
      setPassword('studentpassword123');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const idToSubmit = identifier.trim() || email.trim();
        if (!idToSubmit || !password) {
          throw new Error('Please provide identifier and password');
        }

        const data = await api.login(idToSubmit, password, selectedRole);
        setToken(data.token);
        setSuccessMsg('Login successful! Redirecting to smart classroom...');
        setTimeout(() => {
          onAuthSuccess(data.user);
        }, 300);
      } else {
        // Register Mode
        if (!name || !email || !password) {
          throw new Error('Please fill all required profile fields');
        }

        const payload = {
          name,
          email,
          password,
          role: selectedRole,
          institutionType,
          department: institutionType === 'school' ? standard : department
        };

        if (selectedRole === 'admin') {
          if (!adminId) throw new Error('Admin ID is mandatory for Administrator registration');
          payload.adminId = adminId.trim();
        } else if (selectedRole === 'teacher') {
          if (!teacherId) throw new Error('Teacher ID is mandatory for Teacher registration');
          payload.teacherId = teacherId.trim();
        } else if (selectedRole === 'student') {
          if (!usn) {
            throw new Error(institutionType === 'school' ? 'Student Roll No is mandatory' : 'USN is mandatory for Student registration');
          }
          payload.usn = usn.trim().toUpperCase();
          payload.section = section.trim().toUpperCase();

          if (institutionType === 'school') {
            if (!parentsEmail || !parentsEmail.trim()) {
              throw new Error("Parent's Email ID is required for school student registration to send OTPs and attendance updates");
            }
            payload.parentsEmail = parentsEmail.trim();
            payload.standard = standard;
          } else {
            payload.semester = Number(semester);
            if (parentsEmail && parentsEmail.trim()) {
              payload.parentsEmail = parentsEmail.trim();
            }
          }
        }

        const data = await api.register(payload);
        setToken(data.token);
        setSuccessMsg('Account created successfully! Welcome to MetricsEdu.');
        setTimeout(() => {
          onAuthSuccess(data.user);
        }, 500);
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  // Forgot Password Step 1: Send OTP
  const handleRequestForgotOtp = async (e) => {
    e.preventDefault();
    setForgotError('');
    setForgotSuccess('');
    if (!forgotEmail || !forgotEmail.trim()) {
      setForgotError('Please enter your account email or registered parent email address.');
      return;
    }

    setForgotLoading(true);
    try {
      const res = await api.forgotPassword(forgotEmail.trim());
      setMaskedRecipient(res.targetEmail || forgotEmail);
      setForgotSuccess(res.message || 'Verification code dispatched to your email.');
      setForgotStep(2);
    } catch (err) {
      setForgotError(err.message || 'Failed to dispatch verification code. Please check email address.');
    } finally {
      setForgotLoading(false);
    }
  };

  // Forgot Password Step 2: Confirm OTP & Set New Password
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setForgotError('');
    setForgotSuccess('');

    if (!forgotOtp || !forgotOtp.trim()) {
      setForgotError('Please enter the 6-digit verification code.');
      return;
    }
    if (!forgotNewPassword || forgotNewPassword.length < 6) {
      setForgotError('New password must be at least 6 characters.');
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      setForgotError('Passwords do not match.');
      return;
    }

    setForgotLoading(true);
    try {
      const res = await api.resetPassword(forgotEmail.trim(), forgotOtp.trim(), forgotNewPassword);
      setForgotSuccess(res.message || 'Password reset successfully!');
      setTimeout(() => {
        setShowForgotModal(false);
        setForgotStep(1);
        setForgotOtp('');
        setForgotNewPassword('');
        setForgotConfirmPassword('');
        setMode('login');
        setSuccessMsg('Password updated successfully! Please sign in with your new password.');
      }, 1500);
    } catch (err) {
      setForgotError(err.message || 'Verification failed. Please check your code.');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-6 bg-[#071b34]/95 border border-[#133966] rounded-3xl shadow-2xl backdrop-blur-xl overflow-hidden">
        
        {/* Left Side: Brand Promo / Quick Demo Selector */}
        <div className="lg:col-span-5 bg-gradient-to-br from-[#040d1a] via-[#071b34] to-[#071b34] p-8 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-[#133966]">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-[#00a896]/20 border border-[#00a896]/40 p-1 flex items-center justify-center shadow-lg">
                <img src="/logo.jpg" alt="Logo" className="w-full h-full object-cover rounded-lg" />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tight text-white">MetricsEdu</h1>
                <p className="text-[11px] text-[#00C49F] font-bold tracking-wider">SMART CLASSROOM</p>
              </div>
            </div>

            <div className="mb-6">
              <h2 className="text-2xl font-black text-white leading-snug">
                One Connected Platform. <br />
                <span className="bg-gradient-to-r from-[#00C49F] via-[#00a896] to-[#38bdf8] bg-clip-text text-transparent">
                  One Smart Classroom.
                </span>
              </h2>
              <p className="text-xs text-slate-300 mt-2.5 leading-relaxed">
                Automated classroom attendance powered by multi-face facial recognition vision. Instant detection, zero roll-calls, powered by pure MERN stack and Passport.
              </p>
            </div>

            {/* Quick Demo Pre-fills */}
            <div className="bg-[#040d1a]/85 rounded-2xl p-4 border border-[#133966] mb-6 shadow-inner">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] uppercase tracking-wider font-bold text-slate-300">
                  ⚡ 1-Click Demo Accounts
                </span>
                <span className="text-[10px] text-[#00C49F] bg-[#00a896]/20 px-2 py-0.5 rounded-full border border-[#00a896]/40 font-bold">
                  Ready to test
                </span>
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => handleQuickDemo('admin')}
                  className="w-full text-left p-2.5 rounded-xl bg-[#071b34] hover:bg-rose-500/15 border border-[#133966] hover:border-rose-500/40 transition-all flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-rose-500/15 text-rose-400">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-100 group-hover:text-rose-300">Super Admin</div>
                      <div className="text-[10px] text-slate-400 font-mono">ADM-2026-001</div>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-rose-400 transition-transform group-hover:translate-x-1" />
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickDemo('teacher')}
                  className="w-full text-left p-2.5 rounded-xl bg-[#071b34] hover:bg-[#00a896]/15 border border-[#133966] hover:border-[#00a896] transition-all flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-[#00a896]/20 text-[#00C49F]">
                      <SchoolIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-100 group-hover:text-[#00C49F]">Prof. Nandini C.V (Lecturer)</div>
                      <div className="text-[10px] text-slate-400 font-mono">TCH-101</div>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#00C49F] transition-transform group-hover:translate-x-1" />
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickDemo('student')}
                  className="w-full text-left p-2.5 rounded-xl bg-[#071b34] hover:bg-cyan-500/15 border border-[#133966] hover:border-cyan-500/40 transition-all flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-cyan-500/15 text-[#38bdf8]">
                      <GraduationCap className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-100 group-hover:text-[#38bdf8]">Aarav Patel (Student)</div>
                      <div className="text-[10px] text-slate-400 font-mono">1MS22CS001</div>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#38bdf8] transition-transform group-hover:translate-x-1" />
                </button>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 border-t border-[#133966] pt-4 flex items-center justify-between">
            <span>Passport.js JWT Security</span>
            <span className="text-[#00C49F] flex items-center gap-1 font-mono font-semibold">
              <span className="w-2 h-2 rounded-full bg-[#00C49F] animate-pulse" />
              100% JS (Zero Python)
            </span>
          </div>
        </div>

        {/* Right Side: Auth Form */}
        <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-center">
          
          {/* Institution Type Selector (College vs School) */}
          <div className="mb-5 p-1.5 bg-[#040d1a] border border-[#133966] rounded-2xl flex items-center gap-1.5 shadow-inner">
            <button
              type="button"
              onClick={() => { setInstitutionType('college'); setError(''); }}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                institutionType === 'college'
                  ? 'bg-gradient-to-r from-[#071b34] to-[#133966] text-[#38bdf8] border border-cyan-500/30 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>College / University</span>
            </button>
            <button
              type="button"
              onClick={() => { setInstitutionType('school'); setError(''); }}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                institutionType === 'school'
                  ? 'bg-gradient-to-r from-[#071b34] to-[#133966] text-[#00C49F] border border-emerald-500/30 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <SchoolIcon className="w-3.5 h-3.5" />
              <span>School (K-12)</span>
            </button>
          </div>

          {/* Mode Switcher Header */}
          <div className="flex items-center justify-between mb-5 pb-4 border-b border-[#133966]">
            <div>
              <h3 className="text-xl font-black text-white">
                {mode === 'login' ? 'Sign In to MetricsEdu' : 'Create Your Account'}
              </h3>
              <p className="text-xs text-cyan-200/70 mt-0.5">
                {institutionType === 'school' ? '🏫 School Campus Portal' : '🏛️ College & University Portal'} &bull; {mode === 'login' ? 'Access your dashboard' : 'Join smart classroom'}
              </p>
            </div>

            <div className="flex bg-[#040d1a] p-1 rounded-xl border border-[#133966]">
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  mode === 'login'
                    ? 'bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => { setMode('register'); setError(''); }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  mode === 'register'
                    ? 'bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Register
              </button>
            </div>
          </div>

          {/* Actor Role Tabs */}
          <div className="mb-5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
              Select Your Role:
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { id: 'admin', label: 'Admin', icon: ShieldCheck, idName: 'Admin ID' },
                { id: 'teacher', label: institutionType === 'school' ? 'Teacher' : 'Lecturer', icon: SchoolIcon, idName: 'Teacher ID' },
                { id: 'student', label: 'Student', icon: GraduationCap, idName: institutionType === 'school' ? 'Roll No' : 'USN' }
              ].map((r) => {
                const Icon = r.icon;
                const isSelected = selectedRole === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setSelectedRole(r.id);
                      setError('');
                    }}
                    className={`p-2.5 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-[#0b2444] border-[#00C49F] shadow-md ring-1 ring-[#00C49F]/50'
                        : 'bg-[#040d1a]/80 border-[#133966] hover:border-slate-600 text-slate-400'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isSelected ? 'text-[#00C49F]' : 'text-slate-500'}`} />
                    <span className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                      {r.label}
                    </span>
                    <span className="text-[10px] font-mono text-cyan-200/70">{r.idName}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notification Alerts */}
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}
          {successMsg && (
            <div className="mb-4 p-3 rounded-xl bg-[#00a896]/20 border border-[#00a896]/40 text-[#67e8f9] text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[#00C49F]" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* If Register: Name */}
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Full Legal Name</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={selectedRole === 'student' ? 'e.g. Aarav Patel' : 'e.g. Prof. Pavan K.K'}
                    className="w-full bg-[#040d1a] border border-[#133966] rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00a896] transition-colors"
                  />
                </div>
              </div>
            )}

            {/* If Register: Role-Specific ID input */}
            {mode === 'register' && selectedRole === 'admin' && (
              <div>
                <label className="block text-xs font-semibold text-rose-300 mb-1">
                  Admin ID <span className="text-slate-400 font-normal">(Institution Assigned)</span>
                </label>
                <div className="relative">
                  <ShieldCheck className="absolute left-3.5 top-3 w-4 h-4 text-rose-400" />
                  <input
                    type="text"
                    required
                    value={adminId}
                    onChange={(e) => setAdminId(e.target.value)}
                    placeholder="e.g. ADM-2026-002"
                    className="w-full bg-[#040d1a] border border-[#133966] rounded-xl pl-10 pr-4 py-2.5 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>
            )}

            {mode === 'register' && selectedRole === 'teacher' && (
              <div>
                <label className="block text-xs font-semibold text-[#00C49F] mb-1">
                  Teacher ID / Faculty ID <span className="text-slate-400 font-normal">(Staff Code)</span>
                </label>
                <div className="relative">
                  <SchoolIcon className="absolute left-3.5 top-3 w-4 h-4 text-[#00C49F]" />
                  <input
                    type="text"
                    required
                    value={teacherId}
                    onChange={(e) => setTeacherId(e.target.value)}
                    placeholder="e.g. TCH-205"
                    className="w-full bg-[#040d1a] border border-[#133966] rounded-xl pl-10 pr-4 py-2.5 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-[#00a896]"
                  />
                </div>
              </div>
            )}

            {mode === 'register' && selectedRole === 'student' && (
              <div>
                <label className="block text-xs font-semibold text-[#38bdf8] mb-1">
                  {institutionType === 'school' ? 'Student Roll No / School ID' : 'Student USN'}{' '}
                  <span className="text-slate-400 font-normal">
                    {institutionType === 'school' ? '(e.g. SCH-10-042)' : '(University Seat Number)'}
                  </span>
                </label>
                <div className="relative">
                  <GraduationCap className="absolute left-3.5 top-3 w-4 h-4 text-[#38bdf8]" />
                  <input
                    type="text"
                    required
                    value={usn}
                    onChange={(e) => setUsn(e.target.value.toUpperCase())}
                    placeholder={institutionType === 'school' ? 'SCH-10-042' : '1MS22CS099'}
                    className="w-full bg-[#040d1a] border border-[#133966] rounded-xl pl-10 pr-4 py-2.5 text-xs font-mono uppercase text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            )}

            {/* Email Address */}
            {mode === 'register' ? (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Account Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@metricsedu.ac.in"
                    className="w-full bg-[#040d1a] border border-[#133966] rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00a896]"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Identifier <span className="text-cyan-200/70 font-normal">({currentRole.idField} or Email)</span>
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={`Enter your ${currentRole.idField} or registered email`}
                    className="w-full bg-[#040d1a] border border-[#133966] rounded-xl pl-10 pr-4 py-2.5 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-[#00a896]"
                  />
                </div>
              </div>
            )}

            {/* If Register & School Mode for Students: Parent's Email & Standard */}
            {mode === 'register' && selectedRole === 'student' && institutionType === 'school' && (
              <div className="p-3.5 bg-emerald-950/20 border border-emerald-500/30 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-[#00C49F]">
                  <SchoolIcon className="w-4 h-4" />
                  <span>School Student Specifics</span>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">Standard / Class</label>
                    <select
                      value={standard}
                      onChange={(e) => setStandard(e.target.value)}
                      className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-[#00C49F]"
                    >
                      {[
                        '1st Std', '2nd Std', '3rd Std', '4th Std', '5th Std', 
                        '6th Std', '7th Std', '8th Std', '9th Std', '10th Std', 
                        '11th Std (PUC-I)', '12th Std (PUC-II)'
                      ].map((std) => (
                        <option key={std} value={std}>{std}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">Section</label>
                    <input
                      type="text"
                      value={section}
                      onChange={(e) => setSection(e.target.value.toUpperCase())}
                      maxLength={2}
                      className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-2.5 py-2 text-xs text-center font-bold text-white focus:outline-none focus:border-[#00C49F]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-emerald-300 mb-1">
                    Parent's Email ID <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 w-3.5 h-3.5 text-emerald-400" />
                    <input
                      type="email"
                      required
                      value={parentsEmail}
                      onChange={(e) => setParentsEmail(e.target.value)}
                      placeholder="parent.guardian@gmail.com"
                      className="w-full bg-[#040d1a] border border-emerald-500/40 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00C49F]"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    All password reset OTPs and daily class attendance alerts will be automatically routed to this parent email.
                  </p>
                </div>
              </div>
            )}

            {/* If Register & College Mode: Department / Semester details */}
            {mode === 'register' && institutionType === 'college' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Department</label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#00a896]"
                  >
                    <option value="Computer Science & Engineering">Computer Science & Engg</option>
                    <option value="Information Science & Engineering">Information Science & Engg</option>
                    <option value="Electronics & Communication">Electronics & Comm</option>
                    <option value="Artificial Intelligence & Data Science">AI & Data Science</option>
                  </select>
                </div>

                {selectedRole === 'student' ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Semester</label>
                      <select
                        value={semester}
                        onChange={(e) => setSemester(Number(e.target.value))}
                        className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-2 py-2.5 text-xs text-white focus:outline-none focus:border-[#00a896]"
                      >
                        {[3, 4, 5, 6, 7, 8].map((s) => (
                          <option key={s} value={s}>Sem {s} (2022 Scheme)</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Section</label>
                      <input
                        type="text"
                        value={section}
                        onChange={(e) => setSection(e.target.value.toUpperCase())}
                        maxLength={2}
                        className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-2 py-2.5 text-xs text-center font-bold text-white focus:outline-none focus:border-[#00a896]"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center text-xs text-slate-400 pt-5">
                    Faculty / Staff Access
                  </div>
                )}
              </div>
            )}

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">Password</label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotModal(true);
                      setForgotStep(1);
                      setForgotError('');
                      setForgotSuccess('');
                      setForgotEmail(identifier.includes('@') ? identifier : '');
                    }}
                    className="text-xs text-[#38bdf8] hover:text-cyan-300 hover:underline transition-colors font-medium cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-[#040d1a] border border-[#133966] rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00a896]"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider bg-gradient-to-r from-[#00a896] via-[#028090] to-[#00C49F] hover:brightness-110 text-[#040d1a] shadow-lg shadow-teal-500/25 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-[#040d1a] border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>
                    {mode === 'login' 
                      ? `Sign In as ${selectedRole.toUpperCase()}` 
                      : `Create ${selectedRole.toUpperCase()} Account`}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Anchor Links for Navigation */}
          <div className="mt-6 pt-4 border-t border-[#133966] text-center">
            {mode === 'login' ? (
              <p className="text-xs text-slate-400">
                Don't have an account?{' '}
                <a
                  href="#register"
                  onClick={(e) => {
                    e.preventDefault();
                    setMode('register');
                    setError('');
                  }}
                  className="font-bold text-[#00C49F] hover:text-[#00a896] hover:underline transition-colors ml-1 inline-flex items-center gap-1 cursor-pointer"
                >
                  Register here
                  <ChevronRight className="w-3.5 h-3.5" />
                </a>
              </p>
            ) : (
              <p className="text-xs text-slate-400">
                Already have an account?{' '}
                <a
                  href="#login"
                  onClick={(e) => {
                    e.preventDefault();
                    setMode('login');
                    setError('');
                  }}
                  className="font-bold text-[#38bdf8] hover:text-cyan-300 hover:underline transition-colors ml-1 inline-flex items-center gap-1 cursor-pointer"
                >
                  Sign in here
                  <ChevronRight className="w-3.5 h-3.5" />
                </a>
              </p>
            )}
          </div>

        </div>

      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md bg-[#071b34] border border-[#133966] rounded-3xl shadow-2xl p-6 sm:p-8 relative">
            <button
              onClick={() => setShowForgotModal(false)}
              className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Brand Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#00a896]/20 border border-[#00a896]/40 p-1 flex items-center justify-center shadow-md">
                <img src="/logo.jpg" alt="Logo" className="w-full h-full object-cover rounded-lg" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white">Reset Password</h3>
                <p className="text-[10px] text-[#00C49F] font-semibold tracking-wider uppercase">
                  One Connected Platform. One Smart Classroom
                </p>
              </div>
            </div>

            {forgotError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{forgotError}</span>
              </div>
            )}
            {forgotSuccess && (
              <div className="mb-4 p-3 rounded-xl bg-[#00a896]/20 border border-[#00a896]/40 text-[#67e8f9] text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-[#00C49F]" />
                <span>{forgotSuccess}</span>
              </div>
            )}

            {/* Step 1: Request OTP */}
            {forgotStep === 1 && (
              <form onSubmit={handleRequestForgotOtp} className="space-y-4">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Enter your registered account email address. If you are a student in school, you may also enter your registered <strong>Parent's Email ID</strong> to receive the verification code.
                </p>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Registered Email / Parent Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="name@metricsedu.ac.in or parent@gmail.com"
                      className="w-full bg-[#040d1a] border border-[#133966] rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00a896]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] hover:brightness-110 shadow-lg shadow-teal-500/20 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {forgotLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>Send Verification Code</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* Step 2: Enter OTP & New Password */}
            {forgotStep === 2 && (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="p-3 rounded-xl bg-[#040d1a] border border-[#133966] text-xs text-slate-300">
                  <span>Code sent to: </span>
                  <span className="font-mono text-[#38bdf8] font-bold">{maskedRecipient}</span>
                  <button
                    type="button"
                    onClick={() => setForgotStep(1)}
                    className="ml-2 text-[11px] text-[#00C49F] hover:underline cursor-pointer"
                  >
                    Change
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    6-Digit Verification Code (OTP)
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={forgotOtp}
                    onChange={(e) => setForgotOtp(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="123456"
                    className="w-full bg-[#040d1a] border border-[#00a896] rounded-xl px-4 py-2.5 text-center text-lg font-mono font-bold tracking-widest text-[#38bdf8] focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-1 text-center">
                    Valid for 15 minutes. Check spam/junk folder if not found in inbox.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">New Password</label>
                  <input
                    type="password"
                    required
                    value={forgotNewPassword}
                    onChange={(e) => setForgotNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#00a896]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    required
                    value={forgotConfirmPassword}
                    onChange={(e) => setForgotConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full bg-[#040d1a] border border-[#133966] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#00a896]"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleRequestForgotOtp}
                    disabled={forgotLoading}
                    className="py-2.5 px-3 rounded-xl border border-[#133966] text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Resend Code
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="flex-1 py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] hover:brightness-110 shadow-lg shadow-teal-500/20 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {forgotLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <span>Reset Password</span>
                    )}
                  </button>
                </div>
              </form>
            )}

            <div className="mt-6 pt-4 border-t border-[#133966] text-center">
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                Back to Sign In
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
