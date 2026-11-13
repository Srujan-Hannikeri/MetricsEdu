import { upload } from '@vercel/blob/client';

const API_BASE = '/api';

export const getToken = () => localStorage.getItem('metricsedu_token');
export const setToken = (token) => localStorage.setItem('metricsedu_token', token);
export const removeToken = () => localStorage.removeItem('metricsedu_token');

export async function uploadBlob(file, category) {
  if (import.meta.env.VITE_USE_VERCEL_BLOB !== 'true') return null;
  try {
    const token = getToken();
    if (!token) return null;
    const blob = await upload(`${category}/${file.name}`, file, {
      access: 'public',
      handleUploadUrl: '/api/campus/blob-upload',
      clientPayload: category,
      headers: { Authorization: `Bearer ${token}` },
      multipart: file.size > 5 * 1024 * 1024
    });
    return blob?.url || null;
  } catch (blobErr) {
    console.warn('Vercel Blob upload skipped or unavailable, falling back to direct server upload:', blobErr?.message);
    return null;
  }
}

export async function request(endpoint, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };

  if (!headers['Authorization'] && token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.message || (response.status === 404
      ? 'API route not found. Restart the backend server to load the latest routes.'
      : `Request failed with status ${response.status}`);
    throw new Error(message);
  }
  return data;
}

export const api = {
  uploadBlob,
  // ─── Auth ──────────────────────────────────────────────────────────────────
  register: (payload) => request('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (identifier, password, role) => request('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password, role }) }),
  forgotPassword: (email) => request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  verifyResetOTP: (email, otp) => request('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email, otp }) }),
  resetPassword: (email, otp, newPassword) => request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ email, otp, newPassword }) }),
  getMe: () => request('/auth/me'),

  // ─── Teacher / Attendance ──────────────────────────────────────────────────
  getTeacherCourses: () => request('/attendance/courses'),
  getCourseStudents: (courseId, division) => {
    const query = division ? `?division=${encodeURIComponent(division)}` : '';
    return request(`/attendance/course/${courseId}/students${query}`);
  },
  submitClassroomAttendance: (formData) => request('/attendance/process-photo', { method: 'POST', body: formData }),
  getTeacherSessions: (courseId) => request(`/attendance/sessions${courseId ? `?courseId=${courseId}` : ''}`),
  getSessionById: (sessionId) => request(`/attendance/session/${sessionId}`),
  updateStudentRecord: (sessionId, studentId, status) =>
    request(`/attendance/session/${sessionId}/student/${studentId}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  getExportCsvUrl: (sessionId) => `${API_BASE}/attendance/session/${sessionId}/export-csv`,
  checkAttendanceWindow: (courseId) => request(`/attendance/window-check/${courseId}`),

  // ─── Teacher timetable ─────────────────────────────────────────────────────
  getTeacherTimetable: (teacherId) => request(`/admin/timetables/teacher/${teacherId}`),
  getTeacherActiveSlot: (teacherId) => request(`/admin/timetables/teacher/${teacherId}/active-slot`),

  // ─── Student ───────────────────────────────────────────────────────────────
  getStudentDashboard: () => request('/student/dashboard'),
  registerStudentFace: (formData) => request('/student/register-face', { method: 'POST', body: formData }),

  // ─── Admin: stats & users ─────────────────────────────────────────────────
  getAdminStats: () => request('/admin/stats'),
  getUsers: (role, paramsObj = {}) => {
    const params = new URLSearchParams();
    if (role) params.append('role', role);
    if (paramsObj.semester) params.append('semester', paramsObj.semester);
    if (paramsObj.standard) params.append('standard', paramsObj.standard);
    if (paramsObj.branch)   params.append('branch', paramsObj.branch);
    if (paramsObj.division) params.append('division', paramsObj.division);
    if (paramsObj.pucYear) params.append('pucYear', paramsObj.pucYear);
    if (paramsObj.pucDept) params.append('pucDept', paramsObj.pucDept);
    if (paramsObj.page !== undefined) params.append('page', paramsObj.page);
    if (paramsObj.limit !== undefined) params.append('limit', paramsObj.limit);
    if (paramsObj.search) params.append('search', paramsObj.search);
    // Note: institutionType is now always injected server-side from admin's JWT
    return request(`/admin/users?${params.toString()}`);
  },
  toggleUserStatus: (userId) => request(`/admin/users/${userId}/toggle-status`, { method: 'PATCH' }),

  // ─── Admin: courses ────────────────────────────────────────────────────────
  getCourses: (paramsObj = {}) => {
    const params = new URLSearchParams();
    if (paramsObj.branch) params.append('branch', paramsObj.branch);
    if (paramsObj.semester) params.append('semester', paramsObj.semester);
    if (paramsObj.institutionType) params.append('institutionType', paramsObj.institutionType);
    if (paramsObj.standard) params.append('standard', paramsObj.standard);
    if (paramsObj.pucYear) params.append('pucYear', paramsObj.pucYear);
    if (paramsObj.pucDept) params.append('pucDept', paramsObj.pucDept);
    if (paramsObj.section) params.append('section', paramsObj.section);
    return request(`/admin/courses?${params.toString()}`);
  },
  createCourse: (data) => request('/admin/courses', { method: 'POST', body: JSON.stringify(data) }),
  assignTeacherToCourse: (courseId, teacherId) =>
    request('/admin/courses/assign-teacher', { method: 'POST', body: JSON.stringify({ courseId, teacherId }) }),

  // ─── Admin: timetable ─────────────────────────────────────────────────────
  getTimetables: (division, semester, day, branch, standard, institutionType, pucYear, pucDept) => {
    const params = new URLSearchParams();
    if (division) params.append('division', division);
    if (semester) params.append('semester', semester);
    if (day) params.append('day', day);
    if (branch) params.append('branch', branch);
    if (standard) params.append('standard', standard);
    if (institutionType) params.append('institutionType', institutionType);
    if (pucYear) params.append('pucYear', pucYear);
    if (pucDept) params.append('pucDept', pucDept);
    return request(`/admin/timetables?${params.toString()}`);
  },
  createTimetableEntry: (data) => request('/admin/timetables', { method: 'POST', body: JSON.stringify(data) }),
  updateTimetableEntry: (id, data) => request(`/admin/timetables/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTimetableEntry: (id) => request(`/admin/timetables/${id}`, { method: 'DELETE' }),
  autoGenerateTimetable: (data) => request('/admin/timetables/auto-generate', { method: 'POST', body: JSON.stringify(data) }),

  // ─── Admin: division allocator ────────────────────────────────────────────
  allocateDivisions: (data) => request('/admin/divisions/allocate', { method: 'POST', body: JSON.stringify(data) }),

  // ─── Faculty tracker ──────────────────────────────────────────────────────
  getFacultyTracker: () => request('/admin/faculty-tracker'),

  // ─── Semester management ──────────────────────────────────────────────────
  getInstitutionConfig: () => request('/semesters/config'),
  getBranchesMeta: () => request('/semesters/config'),
  getSemesters: (paramsObj = {}) => {
    const params = new URLSearchParams();
    if (paramsObj.branch) params.append('branch', paramsObj.branch);
    if (paramsObj.semesterNumber) params.append('semesterNumber', paramsObj.semesterNumber);
    if (paramsObj.standard) params.append('standard', paramsObj.standard);
    if (paramsObj.pucYear) params.append('pucYear', paramsObj.pucYear);
    if (paramsObj.pucDept) params.append('pucDept', paramsObj.pucDept);
    if (paramsObj.light) params.append('light', 'true');
    return request(`/semesters?${params.toString()}`);
  },
  createSemester: (data) => request('/semesters', { method: 'POST', body: JSON.stringify(data) }),
  updateSemester: (id, data) => request(`/semesters/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  lockSemester: (id) => request(`/semesters/${id}/lock`, { method: 'POST' }),
  unlockSemester: (id) => request(`/semesters/${id}/unlock`, { method: 'POST' }),
  deleteSemester: (id) => request(`/semesters/${id}`, { method: 'DELETE' }),
  addSubjectsToSemester: (id, subjects) =>
    request(`/semesters/${id}/subjects`, { method: 'POST', body: JSON.stringify({ subjects }) }),
  removeSubjectFromSemester: (id, subjectCode, division) =>
    request(`/semesters/${id}/subjects/${subjectCode}?division=${encodeURIComponent(division || '')}`, { method: 'DELETE' }),

  // ─── Academic calendar and learning posts ────────────────────────────────
  getAcademicEvents: () => request('/campus/events'),
  createAcademicEvent: (data) => request('/campus/events', { method: 'POST', body: JSON.stringify(data) }),
  deleteAcademicEvent: (eventId) => request(`/campus/events/${eventId}`, { method: 'DELETE' }),
  getLearningPosts: () => request('/campus/posts'),
  createLearningPost: (formData) => request('/campus/posts', { method: 'POST', body: formData }),
  deleteLearningPost: (postId) => request(`/campus/posts/${postId}`, { method: 'DELETE' }),
  submitQuiz: (postId, answers) => request(`/campus/posts/${postId}/quiz-submit`, { method: 'POST', body: JSON.stringify({ answers }) }),
  getQuizResults: (postId) => request(`/campus/posts/${postId}/quiz-results`),
  submitFeedback: (payload) => request('/campus/feedback', { method: 'POST', body: JSON.stringify(payload) }),

  // ─── Developer Portal ─────────────────────────────────────────────────────
  devLogin: (accessKey) => request('/dev/auth', { method: 'POST', body: JSON.stringify({ accessKey }) }),
  getDevMetrics: (token) => request('/dev/metrics', { headers: { Authorization: `Bearer ${token}`, 'x-dev-key': token } }),
  createDevInstitution: (token, payload) => request('/dev/institutions', { method: 'POST', body: JSON.stringify(payload), headers: { Authorization: `Bearer ${token}`, 'x-dev-key': token } }),
  generateDevIds: (token, payload) => request('/dev/generate-ids', { method: 'POST', body: JSON.stringify(payload), headers: { Authorization: `Bearer ${token}`, 'x-dev-key': token } }),
  getDevBugs: (token, params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/dev/bugs${q ? '?' + q : ''}`, { headers: { Authorization: `Bearer ${token}`, 'x-dev-key': token } });
  },
  updateDevBugStatus: (token, bugId, payload) => request(`/dev/bugs/${bugId}`, { method: 'PATCH', body: JSON.stringify(payload), headers: { Authorization: `Bearer ${token}`, 'x-dev-key': token } }),
  deleteDevBug: (token, bugId) => request(`/dev/bugs/${bugId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'x-dev-key': token } }),
  getDevKeys: (token) => request('/dev/keys', { headers: { Authorization: `Bearer ${token}`, 'x-dev-key': token } }),
  createDevKey: (token, payload) => request('/dev/keys', { method: 'POST', body: JSON.stringify(payload), headers: { Authorization: `Bearer ${token}`, 'x-dev-key': token } }),
  toggleDevKey: (token, keyId) => request(`/dev/keys/${keyId}/toggle`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'x-dev-key': token } }),
  deleteDevKey: (token, keyId) => request(`/dev/keys/${keyId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'x-dev-key': token } }),

  // ─── Student Marks & Analytics ────────────────────────────────────────────
  getMarksCourses: () => request('/marks/teacher-courses'),
  getMarksRoster: (paramsObj = {}) => {
    const params = new URLSearchParams();
    if (paramsObj.courseId) params.append('courseId', paramsObj.courseId);
    if (paramsObj.division) params.append('division', paramsObj.division);
    if (paramsObj.assessmentName) params.append('assessmentName', paramsObj.assessmentName);
    return request(`/marks/roster?${params.toString()}`);
  },
  batchSaveMarks: (data) => request('/marks/batch-save', { method: 'POST', body: JSON.stringify(data) }),
  getMarksOverview: (paramsObj = {}) => {
    const params = new URLSearchParams();
    if (paramsObj.courseId) params.append('courseId', paramsObj.courseId);
    if (paramsObj.division) params.append('division', paramsObj.division);
    if (paramsObj.semester) params.append('semester', paramsObj.semester);
    if (paramsObj.branch) params.append('branch', paramsObj.branch);
    if (paramsObj.standard) params.append('standard', paramsObj.standard);
    if (paramsObj.pucYear) params.append('pucYear', paramsObj.pucYear);
    if (paramsObj.pucDept) params.append('pucDept', paramsObj.pucDept);
    if (paramsObj.assessmentName) params.append('assessmentName', paramsObj.assessmentName);
    if (paramsObj.search) params.append('search', paramsObj.search);
    return request(`/marks/overview?${params.toString()}`);
  },
  getStudentMarksHistory: (studentId) => request(`/marks/student/${studentId}`)
};
