import React, { useState, useEffect } from 'react';
import {
  Shield, Key, Building2, Users, UserCheck, GraduationCap,
  Sparkles, Copy, Check, Download, AlertTriangle, Bug,
  MessageSquare, RefreshCw, LogOut, ChevronRight, Search,
  ExternalLink, Layers, Clock, CheckCircle2, XCircle, Plus, X, KeyRound, Eye, EyeOff, UserPlus
} from 'lucide-react';
import { api } from '../services/api';

export default function DeveloperPortal({ onExit }) {
  const [devToken, setDevToken] = useState(() => localStorage.getItem('metricsedu_dev_token') || '');
  const [accessKeyInput, setAccessKeyInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Active portal tab: 'metrics' | 'generator' | 'bugs'
  const [activeTab, setActiveTab] = useState('metrics');

  // Metrics state
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsData, setMetricsData] = useState({ totals: null, institutions: [] });
  const [institutionSearch, setInstitutionSearch] = useState('');

  // ID Generator state
  const [genIdType, setGenIdType] = useState('student');
  const [genInstCode, setGenInstCode] = useState('MS');
  const [genDeptCode, setGenDeptCode] = useState('CS');
  const [genYear, setGenYear] = useState('25');
  const [genStartNum, setGenStartNum] = useState(1);
  const [genCount, setGenCount] = useState(30);
  const [generatedList, setGeneratedList] = useState([]);
  const [genLoading, setGenLoading] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  // Bugs & Feedback state
  const [bugsLoading, setBugsLoading] = useState(false);
  const [bugsData, setBugsData] = useState({ counts: {}, bugs: [] });
  const [bugFilterStatus, setBugFilterStatus] = useState('all');
  const [bugFilterType, setBugFilterType] = useState('all');
  const [editingNotes, setEditingNotes] = useState({});

  // Team Master Keys state
  const [keysList, setKeysList] = useState([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [masterSysKey, setMasterSysKey] = useState('metrics-dev-2026');
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [keyForm, setKeyForm] = useState({ label: '', role: 'developer', customKey: '' });
  const [creatingKey, setCreatingKey] = useState(false);
  const [createKeyError, setCreateKeyError] = useState('');
  const [createKeySuccess, setCreateKeySuccess] = useState('');
  const [visibleKeyMap, setVisibleKeyMap] = useState({});
  const [copiedKeyId, setCopiedKeyId] = useState(null);

  const loadKeys = async () => {
    if (!devToken) return;
    setKeysLoading(true);
    try {
      const res = await api.getDevKeys(devToken);
      setKeysList(res.keys || []);
      if (res.masterKey) setMasterSysKey(res.masterKey);
    } catch (err) {
      console.error('Failed to load dev keys:', err);
    } finally {
      setKeysLoading(false);
    }
  };

  const handleCreateDevKey = async (e) => {
    e.preventDefault();
    setCreateKeyError('');
    setCreateKeySuccess('');
    if (!keyForm.label.trim()) {
      setCreateKeyError('Team member name or label is required.');
      return;
    }
    setCreatingKey(true);
    try {
      const res = await api.createDevKey(devToken, {
        label: keyForm.label.trim(),
        role: keyForm.role,
        customKey: keyForm.customKey?.trim() || undefined
      });
      setCreateKeySuccess(res.message || 'Key generated successfully!');
      await loadKeys();
      setTimeout(() => {
        setShowCreateKeyModal(false);
        setCreateKeySuccess('');
        setKeyForm({ label: '', role: 'developer', customKey: '' });
      }, 1500);
    } catch (err) {
      setCreateKeyError(err.message || 'Failed to generate key.');
    } finally {
      setCreatingKey(false);
    }
  };

  const handleToggleKey = async (keyId) => {
    try {
      await api.toggleDevKey(devToken, keyId);
      loadKeys();
    } catch (err) {
      alert(err.message || 'Failed to update key status.');
    }
  };

  const handleDeleteKey = async (keyId) => {
    if (!window.confirm('Delete this developer key? The team member will immediately lose access.')) return;
    try {
      await api.deleteDevKey(devToken, keyId);
      loadKeys();
    } catch (err) {
      alert(err.message || 'Failed to delete key.');
    }
  };

  const copyKeyText = (keyId, text) => {
    navigator.clipboard.writeText(text);
    setCopiedKeyId(keyId);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  // Add Institution Modal state
  const [showAddInstModal, setShowAddInstModal] = useState(false);
  const [instForm, setInstForm] = useState({
    institutionName: '',
    institutionType: 'institute',
    instituteCode: '',
    adminName: '',
    adminEmail: '',
    adminPassword: 'Admin@123'
  });
  const [addingInst, setAddingInst] = useState(false);
  const [addInstError, setAddInstError] = useState('');
  const [addInstSuccess, setAddInstSuccess] = useState('');

  const handleAutoCode = (name) => {
    if (!name) return '';
    const clean = name.replace(/[^a-zA-Z\s]/g, '').trim();
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase();
  };

  const handleCreateInstitution = async (e) => {
    e.preventDefault();
    setAddInstError('');
    setAddInstSuccess('');

    if (!instForm.institutionName.trim()) {
      setAddInstError('Institution name is required.');
      return;
    }
    if (!instForm.adminEmail.trim() || !instForm.adminPassword.trim()) {
      setAddInstError('Admin email and password are required.');
      return;
    }

    const code = (instForm.instituteCode || handleAutoCode(instForm.institutionName)).toUpperCase().slice(0, 2);
    if (code.length < 2) {
      setAddInstError('Institute 2-character code is required.');
      return;
    }

    setAddingInst(true);
    try {
      const res = await api.createDevInstitution(devToken, {
        institutionName: instForm.institutionName.trim(),
        institutionType: instForm.institutionType,
        instituteCode: code,
        adminName: instForm.adminName.trim() || `${instForm.institutionName.trim()} Administration`,
        adminEmail: instForm.adminEmail.trim(),
        adminPassword: instForm.adminPassword.trim()
      });

      setAddInstSuccess(res.message || 'Institution registered successfully!');
      setGenInstCode(code);
      await loadMetrics();

      setTimeout(() => {
        setShowAddInstModal(false);
        setAddInstSuccess('');
        setInstForm({
          institutionName: '',
          institutionType: 'institute',
          instituteCode: '',
          adminName: '',
          adminEmail: '',
          adminPassword: 'Admin@123'
        });
      }, 1500);
    } catch (err) {
      setAddInstError(err.message || 'Failed to register institution.');
    } finally {
      setAddingInst(false);
    }
  };

  // ─── Authentication ──────────────────────────────────────────────────────────
  const handleDevLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const res = await api.devLogin(accessKeyInput);
      if (res.token) {
        localStorage.setItem('metricsedu_dev_token', res.token);
        setDevToken(res.token);
      }
    } catch (err) {
      setLoginError(err.message || 'Invalid developer credentials.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleDevLogout = () => {
    localStorage.removeItem('metricsedu_dev_token');
    setDevToken('');
  };

  // ─── Load Metrics ────────────────────────────────────────────────────────────
  const loadMetrics = async () => {
    if (!devToken) return;
    setMetricsLoading(true);
    try {
      const res = await api.getDevMetrics(devToken);
      setMetricsData({ totals: res.totals, institutions: res.institutions || [] });
    } catch (err) {
      console.error('Failed to load dev metrics:', err);
      if (err.message?.includes('session') || err.message?.includes('clearance')) {
        handleDevLogout();
      }
    } finally {
      setMetricsLoading(false);
    }
  };

  // ─── Load Bugs ───────────────────────────────────────────────────────────────
  const loadBugs = async () => {
    if (!devToken) return;
    setBugsLoading(true);
    try {
      const res = await api.getDevBugs(devToken, {
        status: bugFilterStatus !== 'all' ? bugFilterStatus : undefined,
        type: bugFilterType !== 'all' ? bugFilterType : undefined
      });
      setBugsData({ counts: res.counts || {}, bugs: res.bugs || [] });
    } catch (err) {
      console.error('Failed to load bugs:', err);
    } finally {
      setBugsLoading(false);
    }
  };

  useEffect(() => {
    if (devToken) {
      if (activeTab === 'metrics') loadMetrics();
      else if (activeTab === 'bugs') loadBugs();
      else if (activeTab === 'keys') loadKeys();
    }
  }, [devToken, activeTab, bugFilterStatus, bugFilterType]);

  // ─── Generate IDs ────────────────────────────────────────────────────────────
  const handleGenerate = async (e) => {
    if (e) e.preventDefault();
    setGenLoading(true);
    setCopiedAll(false);
    try {
      const res = await api.generateDevIds(devToken, {
        idType: genIdType,
        instituteCode: genInstCode,
        deptCode: genDeptCode,
        year: genYear,
        startNumber: genStartNum,
        count: genCount
      });
      setGeneratedList(res.results || []);
    } catch (err) {
      alert(err.message || 'ID generation failed.');
    } finally {
      setGenLoading(false);
    }
  };

  const copyAllIds = () => {
    if (!generatedList.length) return;
    const text = generatedList.map(item => item.id).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const downloadCsv = () => {
    if (!generatedList.length) return;
    const rows = ['ID,Status,AssignedTo'];
    generatedList.forEach(item => {
      rows.push(`"${item.id}","${item.available ? 'Available' : 'Assigned'}","${item.assignedTo || ''}"`);
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MetricsEdu_${genIdType.toUpperCase()}_IDs.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Bug Status Updates ──────────────────────────────────────────────────────
  const handleUpdateBugStatus = async (bugId, newStatus) => {
    try {
      await api.updateDevBugStatus(devToken, bugId, { status: newStatus });
      loadBugs();
    } catch (err) {
      alert(err.message || 'Failed to update bug status.');
    }
  };

  const handleSaveDevNotes = async (bugId) => {
    try {
      await api.updateDevBugStatus(devToken, bugId, { devNotes: editingNotes[bugId] });
      alert('Developer notes saved.');
      loadBugs();
    } catch (err) {
      alert(err.message || 'Failed to save notes.');
    }
  };

  const handleDeleteBug = async (bugId) => {
    if (!window.confirm('Delete this report permanently?')) return;
    try {
      await api.deleteDevBug(devToken, bugId);
      loadBugs();
    } catch (err) {
      alert(err.message || 'Failed to delete report.');
    }
  };

  // ─── Filtered Institutions ───────────────────────────────────────────────────
  const filteredInstitutions = metricsData.institutions.filter(inst => {
    if (!institutionSearch.trim()) return true;
    const q = institutionSearch.toLowerCase();
    return (
      inst.institutionName?.toLowerCase().includes(q) ||
      inst.adminName?.toLowerCase().includes(q) ||
      inst.adminEmail?.toLowerCase().includes(q) ||
      inst.adminId?.toLowerCase().includes(q)
    );
  });

  // ─── Render: Login Screen ────────────────────────────────────────────────────
  if (!devToken) {
    return (
      <div className="min-h-screen bg-[#020813] text-white flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-[#133966] bg-[#040d1a] p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-500 via-cyan-500 to-indigo-500" />
          
          <div className="flex flex-col items-center text-center">
            <div className="rounded-2xl bg-[#00a896]/15 p-3 text-[#00C49F] mb-3">
              <Shield className="h-8 w-8" />
            </div>
            <h1 className="text-xl font-black text-white tracking-wide">MetricsEdu Core Console</h1>
            <p className="mt-1 text-xs text-slate-400">Web Developer & Platform Administration Portal</p>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[10px] font-bold text-rose-400 border border-rose-500/20">
              Restricted Area • Core Team Access Only
            </div>
          </div>

          <form onSubmit={handleDevLogin} className="mt-6 space-y-4">
            {loginError && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                {loginError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Developer Master Passcode</label>
              <div className="relative">
                <input
                  type="password"
                  value={accessKeyInput}
                  onChange={e => setAccessKeyInput(e.target.value)}
                  placeholder="Enter developer access key"
                  className="w-full rounded-xl border border-[#133966] bg-[#071b34] px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-[#00a896] focus:outline-none"
                  autoFocus
                />
                <Key className="absolute right-3.5 top-2.5 h-4 w-4 text-slate-500" />
              </div>
              <p className="mt-1.5 text-[10px] text-slate-500">Default key: <span className="font-mono text-slate-400">metrics-dev-2026</span></p>
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] py-2.5 text-xs font-black text-[#040d1a] hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loginLoading ? 'Authenticating...' : 'Enter Core Console'}
            </button>

            {onExit && (
              <button
                type="button"
                onClick={onExit}
                className="w-full text-center text-xs text-slate-400 hover:text-white pt-2"
              >
                Return to Campus Portal
              </button>
            )}
          </form>
        </div>
      </div>
    );
  }

  // ─── Render: Developer Dashboard ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#020813] text-white">
      {/* Top Console Navigation Bar */}
      <header className="border-b border-[#133966] bg-[#040d1a]/95 sticky top-0 z-40 backdrop-blur-md px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-[#00a896]/15 p-2 text-[#00C49F]">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-white">MetricsEdu Core Console</span>
              <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">LIVE</span>
            </div>
            <p className="text-[10px] text-slate-400">Web Developer & Tenant Operations</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {onExit && (
            <button
              onClick={onExit}
              className="text-xs font-semibold text-slate-300 hover:text-white rounded-lg border border-[#133966] px-3 py-1.5"
            >
              Exit to Main App
            </button>
          )}
          <button
            onClick={handleDevLogout}
            className="flex items-center gap-1.5 text-xs font-bold text-rose-400 hover:text-rose-300 rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-1.5"
          >
            <LogOut className="h-3.5 w-3.5" /> Log Out
          </button>
        </div>
      </header>

      {/* Main Tab Navigation */}
      <div className="border-b border-[#133966] bg-[#071b34]/60 px-4 sm:px-6">
        <div className="flex gap-2 overflow-x-auto no-scrollbar py-2">
          <button
            onClick={() => setActiveTab('metrics')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all shrink-0 ${
              activeTab === 'metrics'
                ? 'bg-[#00a896] text-[#040d1a] shadow-md shadow-[#00a896]/20'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Building2 className="h-4 w-4" /> Platform Analytics & Institutions
          </button>
          <button
            onClick={() => setActiveTab('keys')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all shrink-0 ${
              activeTab === 'keys'
                ? 'bg-[#00a896] text-[#040d1a] shadow-md shadow-[#00a896]/20'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <KeyRound className="h-4 w-4" /> Team Master Keys
            {keysList.filter(k => k.isActive).length > 0 && (
              <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.2 text-[9px] font-black text-emerald-400 border border-emerald-500/30">
                {keysList.filter(k => k.isActive).length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('generator')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all shrink-0 ${
              activeTab === 'generator'
                ? 'bg-[#00a896] text-[#040d1a] shadow-md shadow-[#00a896]/20'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Sparkles className="h-4 w-4" /> ID & USN Generator Tool
          </button>
          <button
            onClick={() => setActiveTab('bugs')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all shrink-0 ${
              activeTab === 'bugs'
                ? 'bg-[#00a896] text-[#040d1a] shadow-md shadow-[#00a896]/20'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Bug className="h-4 w-4" /> Bug Fixing & User Feedback
            {bugsData.counts?.open > 0 && (
              <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[9px] font-black text-white">
                {bugsData.counts.open}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
        {/* ────────────────────────────────────────────────────────────────────
            TAB 1: PLATFORM METRICS & INSTITUTIONS
        ──────────────────────────────────────────────────────────────────── */}
        {activeTab === 'metrics' && (
          <div className="space-y-6">
            {/* Top Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="rounded-2xl border border-[#133966] bg-[#040d1a] p-4">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-semibold">Institutions</span>
                  <Building2 className="h-4 w-4 text-[#00C49F]" />
                </div>
                <p className="mt-2 text-2xl font-black text-white">{metricsData.totals?.institutions ?? '—'}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">Active campuses registered</p>
              </div>

              <div className="rounded-2xl border border-[#133966] bg-[#040d1a] p-4">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-semibold">Students</span>
                  <GraduationCap className="h-4 w-4 text-blue-400" />
                </div>
                <p className="mt-2 text-2xl font-black text-white">{metricsData.totals?.students ?? '—'}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">Total student learners</p>
              </div>

              <div className="rounded-2xl border border-[#133966] bg-[#040d1a] p-4">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-semibold">Teachers</span>
                  <Users className="h-4 w-4 text-purple-400" />
                </div>
                <p className="mt-2 text-2xl font-black text-white">{metricsData.totals?.teachers ?? '—'}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">Faculty & Lecturers</p>
              </div>

              <div className="rounded-2xl border border-[#133966] bg-[#040d1a] p-4">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-semibold">Total Accounts</span>
                  <Layers className="h-4 w-4 text-amber-400" />
                </div>
                <p className="mt-2 text-2xl font-black text-white">{metricsData.totals?.totalUsers ?? '—'}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">Platform database users</p>
              </div>

              <div className="col-span-2 lg:col-span-1 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4">
                <div className="flex items-center justify-between text-emerald-400">
                  <span className="text-xs font-semibold">Active Users</span>
                  <UserCheck className="h-4 w-4 text-emerald-400" />
                </div>
                <p className="mt-2 text-2xl font-black text-white">{metricsData.totals?.activeUsers ?? '—'}</p>
                <p className="mt-0.5 text-[10px] text-emerald-400/70">Users in active status</p>
              </div>
            </div>

            {/* Institutions Table */}
            <div className="rounded-2xl border border-[#133966] bg-[#040d1a] p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-[#133966]">
                <div>
                  <h3 className="text-sm font-bold text-white">Registered Institutions & Campus Directory</h3>
                  <p className="text-xs text-slate-400">Campuses deployed on this MetricsEdu installation</p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-64">
                    <input
                      type="text"
                      value={institutionSearch}
                      onChange={e => setInstitutionSearch(e.target.value)}
                      placeholder="Search institutions or admin..."
                      className="w-full rounded-xl border border-[#133966] bg-[#071b34] px-3.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-[#00a896] focus:outline-none"
                    />
                    <Search className="absolute right-3 top-2 h-3.5 w-3.5 text-slate-500" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddInstModal(true)}
                    className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] px-3.5 py-1.5 text-xs font-black text-[#040d1a] hover:opacity-90 transition-opacity shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Institution
                  </button>
                  <button
                    onClick={loadMetrics}
                    className="p-2 rounded-xl border border-[#133966] text-slate-400 hover:text-white"
                  >
                    <RefreshCw className={`h-4 w-4 ${metricsLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                {metricsLoading ? (
                  <p className="py-8 text-center text-xs text-slate-400">Loading campus directory...</p>
                ) : filteredInstitutions.length ? (
                  <table className="w-full text-left text-xs text-slate-300 min-w-[700px]">
                    <thead className="border-b border-[#133966] text-[10px] uppercase text-slate-400">
                      <tr>
                        <th className="py-2.5 px-3">Institution Name</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Admin Info</th>
                        <th className="py-2.5 px-3 text-center">Students</th>
                        <th className="py-2.5 px-3 text-center">Teachers</th>
                        <th className="py-2.5 px-3 text-center">Active</th>
                        <th className="py-2.5 px-3 text-right">Registered</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#133966]/40">
                      {filteredInstitutions.map(inst => (
                        <tr key={inst.id} className="hover:bg-white/5 transition-colors">
                          <td className="py-3 px-3">
                            <p className="font-bold text-white">{inst.institutionName}</p>
                            <span className="font-mono text-[10px] text-slate-500">Admin ID: {inst.adminId}</span>
                          </td>
                          <td className="py-3 px-3">
                            <span className="rounded-lg bg-[#071b34] px-2 py-1 text-[10px] font-semibold uppercase text-slate-300 border border-[#133966]">
                              {inst.institutionType}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <p className="font-medium text-slate-200">{inst.adminName}</p>
                            <p className="text-[10px] text-slate-400">{inst.adminEmail}</p>
                          </td>
                          <td className="py-3 px-3 text-center font-bold text-blue-400">
                            {inst.studentCount}
                          </td>
                          <td className="py-3 px-3 text-center font-bold text-purple-400">
                            {inst.teacherCount}
                          </td>
                          <td className="py-3 px-3 text-center font-bold text-emerald-400">
                            {inst.activeCount}
                          </td>
                          <td className="py-3 px-3 text-right text-slate-400">
                            {new Date(inst.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="py-8 text-center text-xs text-slate-500">No institutions matched your query.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────────────────
            TAB 2: ID & USN GENERATOR TOOL
        ──────────────────────────────────────────────────────────────────── */}
        {activeTab === 'generator' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Control Panel */}
            <div className="lg:col-span-5 rounded-2xl border border-[#133966] bg-[#040d1a] p-5 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white">ID & USN Allocation Tool</h3>
                <p className="text-xs text-slate-400">Strictly formats official IDs per institutional naming rules</p>
              </div>

              {/* ID Type Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Target Identity</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setGenIdType('student')}
                    className={`py-2 rounded-xl text-xs font-bold transition-all ${
                      genIdType === 'student'
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                        : 'bg-[#071b34] text-slate-400 border border-[#133966] hover:text-white'
                    }`}
                  >
                    Student USN
                  </button>
                  <button
                    type="button"
                    onClick={() => setGenIdType('teacher')}
                    className={`py-2 rounded-xl text-xs font-bold transition-all ${
                      genIdType === 'teacher'
                        ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20'
                        : 'bg-[#071b34] text-slate-400 border border-[#133966] hover:text-white'
                    }`}
                  >
                    Teacher ID
                  </button>
                  <button
                    type="button"
                    onClick={() => setGenIdType('admin')}
                    className={`py-2 rounded-xl text-xs font-bold transition-all ${
                      genIdType === 'admin'
                        ? 'bg-[#00a896] text-[#040d1a] shadow-md shadow-[#00a896]/20'
                        : 'bg-[#071b34] text-slate-400 border border-[#133966] hover:text-white'
                    }`}
                  >
                    Admin ID
                  </button>
                </div>
              </div>

              {/* Formula Blueprint Card */}
              <div className="rounded-xl border border-[#133966]/60 bg-[#071b34]/40 p-3">
                <p className="text-[11px] font-bold text-[#00C49F]">Formula Specification:</p>
                <p className="text-xs font-mono text-slate-300 mt-1">
                  {genIdType === 'admin' && '"ad" + 2 char of institute name + 3 digit number (e.g. ADMS001)'}
                  {genIdType === 'teacher' && '"th" + 2 char of institute name + 2 char of dept name + 3 digit number (e.g. THMSCS101)'}
                  {genIdType === 'student' && '2 char of institute name + year(24,25,26) + 2 char dept + 3 digit number (e.g. MS25CS001)'}
                </p>
              </div>

              {/* Institute 2-char code */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-300">
                    Institute 2-Character Code <span className="text-rose-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAddInstModal(true)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#00C49F] hover:text-[#67e8f9] transition-colors"
                  >
                    <Plus className="h-3 w-3" /> Add New Institution
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={genInstCode}
                    onChange={e => setGenInstCode(e.target.value.toUpperCase().slice(0, 2))}
                    placeholder="e.g. MS"
                    maxLength={2}
                    className="w-24 font-mono font-bold uppercase rounded-xl border border-[#133966] bg-[#071b34] px-3 py-2 text-xs text-white text-center focus:border-[#00a896] focus:outline-none"
                  />
                  <select
                    value={genInstCode}
                    onChange={e => {
                      if (e.target.value === '__ADD_NEW__') {
                        setShowAddInstModal(true);
                        return;
                      }
                      setGenInstCode(e.target.value);
                    }}
                    className="flex-1 rounded-xl border border-[#133966] bg-[#071b34] px-3 py-2 text-xs text-slate-300 focus:outline-none"
                  >
                    <option value="">Quick select from registered campus...</option>
                    {metricsData.institutions?.map(inst => {
                      const code = (inst.adminId?.slice(2, 4) || handleAutoCode(inst.institutionName)).toUpperCase();
                      return (
                        <option key={inst.id} value={code}>
                          {inst.institutionName} ({code})
                        </option>
                      );
                    })}
                    <option value="__ADD_NEW__" className="text-[#00C49F] font-bold">
                      + Add New Institution...
                    </option>
                  </select>
                </div>
              </div>

              {/* Department Code (for teacher & student) */}
              {(genIdType === 'teacher' || genIdType === 'student') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Department 2-Char Code (CS, IS, EC, ME, AI...)</label>
                  <input
                    type="text"
                    value={genDeptCode}
                    onChange={e => setGenDeptCode(e.target.value.toUpperCase().slice(0, 2))}
                    placeholder="CS"
                    maxLength={2}
                    className="w-full font-mono font-bold uppercase rounded-xl border border-[#133966] bg-[#071b34] px-3.5 py-2 text-xs text-white focus:border-[#00a896] focus:outline-none"
                  />
                </div>
              )}

              {/* Registration Year (for student) */}
              {genIdType === 'student' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Registered Year (2 digits: 24, 25, 26...)</label>
                  <input
                    type="text"
                    value={genYear}
                    onChange={e => setGenYear(e.target.value.slice(-2))}
                    placeholder="25"
                    maxLength={2}
                    className="w-full font-mono font-bold rounded-xl border border-[#133966] bg-[#071b34] px-3.5 py-2 text-xs text-white focus:border-[#00a896] focus:outline-none"
                  />
                </div>
              )}

              {/* Starting Number and Range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Starting Number</label>
                  <input
                    type="number"
                    value={genStartNum}
                    min={1}
                    max={999}
                    onChange={e => setGenStartNum(parseInt(e.target.value, 10) || 1)}
                    className="w-full rounded-xl border border-[#133966] bg-[#071b34] px-3.5 py-2 text-xs text-white focus:border-[#00a896] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Total Quantity</label>
                  <input
                    type="number"
                    value={genCount}
                    min={1}
                    max={300}
                    onChange={e => setGenCount(parseInt(e.target.value, 10) || 1)}
                    className="w-full rounded-xl border border-[#133966] bg-[#071b34] px-3.5 py-2 text-xs text-white focus:border-[#00a896] focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleGenerate}
                disabled={genLoading || !genInstCode || genInstCode.length < 2}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] py-2.5 text-xs font-black text-[#040d1a] disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                <Sparkles className="h-4 w-4" />
                {genLoading ? 'Checking Database & Generating...' : 'Generate Verified IDs'}
              </button>
            </div>

            {/* Results Panel */}
            <div className="lg:col-span-7 rounded-2xl border border-[#133966] bg-[#040d1a] p-5 flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-[#133966]">
                <div>
                  <h3 className="text-sm font-bold text-white">Generated ID Pool</h3>
                  <p className="text-xs text-slate-400">
                    {generatedList.length
                      ? `${generatedList.length} IDs generated (${generatedList.filter(i => i.available).length} available)`
                      : 'Configure generator parameters to create IDs'}
                  </p>
                </div>
                {generatedList.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={copyAllIds}
                      className="flex items-center gap-1.5 rounded-xl border border-[#133966] bg-[#071b34] px-3 py-1.5 text-xs font-bold text-slate-300 hover:text-white"
                    >
                      {copiedAll ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedAll ? 'Copied!' : 'Copy All'}
                    </button>
                    <button
                      onClick={downloadCsv}
                      className="flex items-center gap-1.5 rounded-xl border border-[#00a896]/40 bg-[#00a896]/15 px-3 py-1.5 text-xs font-bold text-[#67e8f9] hover:bg-[#00a896]/25"
                    >
                      <Download className="h-3.5 w-3.5" /> CSV
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-4 flex-1 overflow-y-auto max-h-[500px] space-y-1.5 pr-1">
                {generatedList.length ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {generatedList.map((item, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center justify-between p-2.5 rounded-xl border ${
                          item.available
                            ? 'border-emerald-500/20 bg-emerald-950/10'
                            : 'border-rose-500/30 bg-rose-950/20'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500 font-mono">#{idx + 1}</span>
                          <span className="font-mono text-xs font-bold text-white">{item.id}</span>
                        </div>
                        <div>
                          {item.available ? (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" /> Available
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-rose-400" title={`Assigned to: ${item.assignedTo}`}>
                              <XCircle className="h-3 w-3" /> Assigned
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-64 flex flex-col items-center justify-center text-center text-slate-500">
                    <Sparkles className="h-10 w-10 text-slate-600 mb-2" />
                    <p className="text-xs">Select your parameters and click Generate Verified IDs</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────────────────
            TAB: TEAM MASTER KEYS & DEVELOPER ACCESS
        ──────────────────────────────────────────────────────────────────── */}
        {activeTab === 'keys' && (
          <div className="space-y-6">
            {/* Top Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-2xl border border-teal-500/30 bg-teal-950/20 p-4">
                <div className="flex items-center justify-between text-teal-400">
                  <span className="text-xs font-semibold">Primary System Key</span>
                  <Shield className="h-4 w-4 text-[#00C49F]" />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <p className="font-mono text-xs font-bold text-white truncate max-w-[170px]">{masterSysKey}</p>
                  <button
                    onClick={() => copyKeyText('master', masterSysKey)}
                    className="p-1 rounded text-teal-400 hover:text-white"
                    title="Copy Master Key"
                  >
                    {copiedKeyId === 'master' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-teal-400/70">Master environment override key</p>
              </div>

              <div className="rounded-2xl border border-[#133966] bg-[#040d1a] p-4">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-semibold">Team Keys</span>
                  <KeyRound className="h-4 w-4 text-cyan-400" />
                </div>
                <p className="mt-2 text-2xl font-black text-white">{keysList.length}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">Generated for developers</p>
              </div>

              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4">
                <div className="flex items-center justify-between text-emerald-400">
                  <span className="text-xs font-semibold">Active Keys</span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                </div>
                <p className="mt-2 text-2xl font-black text-white">{keysList.filter(k => k.isActive).length}</p>
                <p className="mt-0.5 text-[10px] text-emerald-400/70">Keys with live console access</p>
              </div>

              <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4">
                <div className="flex items-center justify-between text-amber-400">
                  <span className="text-xs font-semibold">Revoked Keys</span>
                  <XCircle className="h-4 w-4 text-amber-400" />
                </div>
                <p className="mt-2 text-2xl font-black text-white">{keysList.filter(k => !k.isActive).length}</p>
                <p className="mt-0.5 text-[10px] text-amber-400/70">Access blocked</p>
              </div>
            </div>

            {/* Keys Table & Generator Header */}
            <div className="rounded-2xl border border-[#133966] bg-[#040d1a] p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-[#133966]">
                <div>
                  <h3 className="text-sm font-bold text-white">Team Member Access Keys</h3>
                  <p className="text-xs text-slate-400">Grant dedicated developer master passcodes to your web development teammates</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateKeyModal(true)}
                    className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] px-4 py-2 text-xs font-black text-[#040d1a] hover:opacity-90 transition-opacity"
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Generate Master Key
                  </button>
                  <button
                    onClick={loadKeys}
                    className="p-2 rounded-xl border border-[#133966] text-slate-400 hover:text-white"
                  >
                    <RefreshCw className={`h-4 w-4 ${keysLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                {keysLoading ? (
                  <p className="py-8 text-center text-xs text-slate-400">Loading team keys...</p>
                ) : keysList.length ? (
                  <table className="w-full text-left text-xs text-slate-300 min-w-[700px]">
                    <thead className="border-b border-[#133966] text-[10px] uppercase text-slate-400">
                      <tr>
                        <th className="py-2.5 px-3">Team Member</th>
                        <th className="py-2.5 px-3">Role</th>
                        <th className="py-2.5 px-3">Master Key Passcode</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                        <th className="py-2.5 px-3">Last Active</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#133966]/40">
                      {keysList.map(keyItem => (
                        <tr key={keyItem._id} className="hover:bg-white/5 transition-colors">
                          <td className="py-3 px-3">
                            <p className="font-bold text-white">{keyItem.label}</p>
                            <span className="text-[10px] text-slate-500">Created: {new Date(keyItem.createdAt).toLocaleDateString()}</span>
                          </td>
                          <td className="py-3 px-3">
                            <span className="rounded-lg bg-[#071b34] px-2 py-0.5 text-[10px] font-semibold uppercase text-cyan-300 border border-[#133966]">
                              {keyItem.role.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2 font-mono">
                              <span className="font-bold text-slate-200">
                                {visibleKeyMap[keyItem._id] ? keyItem.key : '••••••••••••••••••••'}
                              </span>
                              <button
                                type="button"
                                onClick={() => setVisibleKeyMap(prev => ({ ...prev, [keyItem._id]: !prev[keyItem._id] }))}
                                className="text-slate-400 hover:text-white"
                                title={visibleKeyMap[keyItem._id] ? "Hide Key" : "Reveal Key"}
                              >
                                {visibleKeyMap[keyItem._id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => copyKeyText(keyItem._id, keyItem.key)}
                                className="text-slate-400 hover:text-emerald-400"
                                title="Copy Key"
                              >
                                {copiedKeyId === keyItem._id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleKey(keyItem._id)}
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase transition-colors ${
                                keyItem.isActive
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25'
                                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25'
                              }`}
                            >
                              {keyItem.isActive ? 'Active' : 'Revoked'}
                            </button>
                          </td>
                          <td className="py-3 px-3 text-slate-400 text-[11px]">
                            {keyItem.lastUsedAt ? new Date(keyItem.lastUsedAt).toLocaleString() : 'Never logged in'}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteKey(keyItem._id)}
                              className="text-xs text-rose-400 hover:text-rose-300 font-semibold"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="py-10 flex flex-col items-center justify-center text-center text-slate-500">
                    <KeyRound className="h-10 w-10 text-slate-600 mb-2" />
                    <p className="text-xs">No team keys generated yet. Click "Generate Master Key" to add your developers.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────────────────
            TAB 3: BUG FIXING & USER FEEDBACK
        ──────────────────────────────────────────────────────────────────── */}
        {activeTab === 'bugs' && (
          <div className="space-y-6">
            {/* Bug Stats Header */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-2xl border border-[#133966] bg-[#040d1a] p-3.5">
                <span className="text-xs text-slate-400">Total Reports</span>
                <p className="mt-1 text-2xl font-black text-white">{bugsData.counts?.total ?? 0}</p>
              </div>
              <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-3.5">
                <span className="text-xs text-rose-300">Open Issues</span>
                <p className="mt-1 text-2xl font-black text-white">{bugsData.counts?.open ?? 0}</p>
              </div>
              <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-3.5">
                <span className="text-xs text-amber-300">Investigating</span>
                <p className="mt-1 text-2xl font-black text-white">{bugsData.counts?.investigating ?? 0}</p>
              </div>
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-3.5">
                <span className="text-xs text-emerald-300">Resolved</span>
                <p className="mt-1 text-2xl font-black text-white">{bugsData.counts?.resolved ?? 0}</p>
              </div>
            </div>

            {/* Filter controls */}
            <div className="rounded-2xl border border-[#133966] bg-[#040d1a] p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-400">Status:</span>
                {['all', 'open', 'investigating', 'resolved', 'closed'].map(s => (
                  <button
                    key={s}
                    onClick={() => setBugFilterStatus(s)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold uppercase transition-all ${
                      bugFilterStatus === s
                        ? 'bg-[#00a896] text-[#040d1a]'
                        : 'bg-[#071b34] text-slate-400 border border-[#133966] hover:text-white'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-400">Type:</span>
                {['all', 'bug', 'feedback', 'feature'].map(t => (
                  <button
                    key={t}
                    onClick={() => setBugFilterType(t)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold capitalize transition-all ${
                      bugFilterType === t
                        ? 'bg-blue-600 text-white'
                        : 'bg-[#071b34] text-slate-400 border border-[#133966] hover:text-white'
                    }`}
                  >
                    {t}
                  </button>
                ))}
                <button
                  onClick={loadBugs}
                  className="p-1.5 rounded-lg border border-[#133966] text-slate-400 hover:text-white ml-2"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${bugsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Bugs List */}
            <div className="space-y-4">
              {bugsLoading ? (
                <p className="py-8 text-center text-xs text-slate-400">Loading reports...</p>
              ) : bugsData.bugs?.length ? (
                bugsData.bugs.map(bug => (
                  <div key={bug._id} className="rounded-2xl border border-[#133966] bg-[#040d1a] p-4 sm:p-5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#133966]/60 pb-3">
                      <div className="flex items-center gap-2">
                        <span className={`p-1.5 rounded-lg ${
                          bug.type === 'bug' ? 'bg-rose-500/15 text-rose-400' : 'bg-blue-500/15 text-blue-400'
                        }`}>
                          {bug.type === 'bug' ? <Bug className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                        </span>
                        <div>
                          <h4 className="text-sm font-bold text-white">{bug.title}</h4>
                          <p className="text-[10px] text-slate-400">
                            By <span className="text-white font-medium">{bug.userName}</span> ({bug.userRole}) · {bug.userEmail || 'No email'} · {bug.institutionName} · {new Date(bug.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          bug.severity === 'critical' ? 'bg-rose-600 text-white' : bug.severity === 'high' ? 'bg-amber-600 text-white' : 'bg-[#133966] text-slate-300'
                        }`}>
                          {bug.severity}
                        </span>

                        <select
                          value={bug.status}
                          onChange={e => handleUpdateBugStatus(bug._id, e.target.value)}
                          className="rounded-lg border border-[#133966] bg-[#071b34] px-2.5 py-1 text-xs font-bold text-white focus:outline-none"
                        >
                          <option value="open">Open</option>
                          <option value="investigating">Investigating</option>
                          <option value="resolved">Resolved</option>
                          <option value="closed">Closed</option>
                        </select>

                        <button
                          onClick={() => handleDeleteBug(bug._id)}
                          className="text-slate-500 hover:text-rose-400 text-xs px-2 py-1"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap bg-[#071b34]/30 p-3 rounded-xl border border-[#133966]/40">
                      {bug.description}
                    </p>

                    {/* Developer notes section */}
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        placeholder="Developer investigation notes / fix commit..."
                        value={editingNotes[bug._id] !== undefined ? editingNotes[bug._id] : bug.devNotes || ''}
                        onChange={e => setEditingNotes({ ...editingNotes, [bug._id]: e.target.value })}
                        className="flex-1 rounded-xl border border-[#133966] bg-[#071b34] px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-[#00a896] focus:outline-none"
                      />
                      <button
                        onClick={() => handleSaveDevNotes(bug._id)}
                        className="rounded-xl border border-[#00a896]/40 bg-[#00a896]/15 px-3 py-1.5 text-xs font-bold text-[#67e8f9] hover:bg-[#00a896]/25"
                      >
                        Save Note
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-8 text-center text-xs text-slate-500">No bugs or feedback found matching criteria.</p>
              )}
            </div>
          </div>
        )}

      
      {/* ─── Generate Team Key Modal ─────────────────────────────────────── */}
      {showCreateKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[#133966] bg-[#040d1a] p-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-[#133966] pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="rounded-xl bg-[#00a896]/15 p-2 text-[#00C49F]">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Generate Developer Key</h3>
                  <p className="text-[11px] text-slate-400">Creates a secret master key for a team member</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateKeyModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {createKeyError && (
              <div className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                {createKeyError}
              </div>
            )}

            {createKeySuccess && (
              <div className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                {createKeySuccess}
              </div>
            )}

            <form onSubmit={handleCreateDevKey} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Team Member Name & Role <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={keyForm.label}
                  onChange={e => setKeyForm({ ...keyForm, label: e.target.value })}
                  placeholder="e.g. Rahul - Frontend Lead"
                  className="w-full rounded-xl border border-[#133966] bg-[#071b34] px-3.5 py-2 text-xs text-white focus:border-[#00a896] focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Role Permission</label>
                <select
                  value={keyForm.role}
                  onChange={e => setKeyForm({ ...keyForm, role: e.target.value })}
                  className="w-full rounded-xl border border-[#133966] bg-[#071b34] px-3 py-2 text-xs text-white focus:outline-none"
                >
                  <option value="developer">Developer (Full Access)</option>
                  <option value="lead_developer">Lead Developer</option>
                  <option value="qa_engineer">QA / Testing Engineer</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Custom Key (Leave blank to auto-generate)
                </label>
                <input
                  type="text"
                  value={keyForm.customKey}
                  onChange={e => setKeyForm({ ...keyForm, customKey: e.target.value })}
                  placeholder="Leave empty for auto-generated secure key"
                  className="w-full font-mono rounded-xl border border-[#133966] bg-[#071b34] px-3.5 py-2 text-xs text-white focus:border-[#00a896] focus:outline-none"
                />
                <p className="mt-1 text-[10px] text-slate-500">Auto-key shape: <span className="font-mono text-slate-400">metrics-dev-xxxx-xxxx</span></p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#133966]">
                <button
                  type="button"
                  onClick={() => setShowCreateKeyModal(false)}
                  className="rounded-xl border border-[#133966] px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingKey}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] px-5 py-2 text-xs font-black text-[#040d1a] disabled:opacity-50 hover:opacity-90"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  {creatingKey ? 'Generating...' : 'Generate & Grant Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Add Institution Modal ────────────────────────────────────────── */}
      {showAddInstModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-[#133966] bg-[#040d1a] p-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-[#133966] pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="rounded-xl bg-[#00a896]/15 p-2 text-[#00C49F]">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Register New Institution</h3>
                  <p className="text-[11px] text-slate-400">Sets up campus tenancy and primary administrator</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddInstModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {addInstError && (
              <div className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                {addInstError}
              </div>
            )}

            {addInstSuccess && (
              <div className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                {addInstSuccess}
              </div>
            )}

            <form onSubmit={handleCreateInstitution} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Institution Full Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={instForm.institutionName}
                  onChange={e => {
                    const val = e.target.value;
                    const suggested = handleAutoCode(val);
                    setInstForm({
                      ...instForm,
                      institutionName: val,
                      instituteCode: instForm.instituteCode || suggested
                    });
                  }}
                  placeholder="e.g. M.S. Ramaiah Institute of Technology"
                  className="w-full rounded-xl border border-[#133966] bg-[#071b34] px-3.5 py-2 text-xs text-white focus:border-[#00a896] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Institution Type</label>
                  <select
                    value={instForm.institutionType}
                    onChange={e => setInstForm({ ...instForm, institutionType: e.target.value })}
                    className="w-full rounded-xl border border-[#133966] bg-[#071b34] px-3 py-2 text-xs text-white focus:outline-none"
                  >
                    <option value="institute">Institute (Degree / Engg)</option>
                    <option value="pu_college">PU College (11th & 12th)</option>
                    <option value="school">School (K-12)</option>
                    <option value="diploma">Diploma Polytechnic</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    2-Character Code <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={2}
                    value={instForm.instituteCode}
                    onChange={e => setInstForm({ ...instForm, instituteCode: e.target.value.toUpperCase().slice(0, 2) })}
                    placeholder="e.g. MS"
                    className="w-full font-mono font-bold uppercase rounded-xl border border-[#133966] bg-[#071b34] px-3 py-2 text-xs text-white text-center focus:border-[#00a896] focus:outline-none"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-[#133966]/60 bg-[#071b34]/40 p-2.5 flex items-center justify-between text-xs">
                <span className="text-slate-400">Formula Admin ID:</span>
                <span className="font-mono font-bold text-[#00C49F]">
                  AD{(instForm.instituteCode || 'XX').toUpperCase()}001
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Admin Contact Name</label>
                  <input
                    type="text"
                    value={instForm.adminName}
                    onChange={e => setInstForm({ ...instForm, adminName: e.target.value })}
                    placeholder="Campus Principal / Admin"
                    className="w-full rounded-xl border border-[#133966] bg-[#071b34] px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Admin Email <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={instForm.adminEmail}
                    onChange={e => setInstForm({ ...instForm, adminEmail: e.target.value })}
                    placeholder="admin@college.edu"
                    className="w-full rounded-xl border border-[#133966] bg-[#071b34] px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Admin Initial Password <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={instForm.adminPassword}
                  onChange={e => setInstForm({ ...instForm, adminPassword: e.target.value })}
                  placeholder="Admin@123"
                  className="w-full font-mono rounded-xl border border-[#133966] bg-[#071b34] px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#133966]">
                <button
                  type="button"
                  onClick={() => setShowAddInstModal(false)}
                  className="rounded-xl border border-[#133966] px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingInst}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] px-5 py-2 text-xs font-black text-[#040d1a] disabled:opacity-50 hover:opacity-90"
                >
                  <Building2 className="h-3.5 w-3.5" />
                  {addingInst ? 'Registering...' : 'Register Institution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
