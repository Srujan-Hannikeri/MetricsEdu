const API_BASE = '/api';

export const getToken = () => localStorage.getItem('metricsedu_token');
export const setToken = (token) => localStorage.setItem('metricsedu_token', token);
export const removeToken = () => localStorage.removeItem('metricsedu_token');

export async function request(endpoint, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // If body is not FormData, default to JSON
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Request failed with status ${response.status}`);
  }

  return data;
}

export const api = {
  // Auth
  register: (payload) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  login: (identifier, password, role) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password, role })
    }),

  forgotPassword: (email) =>
    request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    }),

  verifyResetOTP: (email, otp) =>
    request('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp })
    }),

  resetPassword: (email, otp, newPassword) =>
    request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, otp, newPassword })
    }),

  getMe: () => request('/auth/me'),

  // Teacher Endpoints
  getTeacherCourses: () => request('/attendance/courses'),
  getCourseStudents: (courseId) => request(`/attendance/course/${courseId}/students`),
  submitClassroomAttendance: (formData) =>
    request('/attendance/process-photo', {
      method: 'POST',
      body: formData // multipart/form-data
    }),
  getTeacherSessions: (courseId) =>
    request(`/attendance/sessions${courseId ? `?courseId=${courseId}` : ''}`),
  getSessionById: (sessionId) => request(`/attendance/session/${sessionId}`),
  updateStudentRecord: (sessionId, studentId, status) =>
    request(`/attendance/session/${sessionId}/student/${studentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    }),
  getExportCsvUrl: (sessionId) => `${API_BASE}/attendance/session/${sessionId}/export-csv`,

  // Student Endpoints
  getStudentDashboard: () => request('/student/dashboard'),
  registerStudentFace: (formData) =>
    request('/student/register-face', {
      method: 'POST',
      body: formData // multipart/form-data
    }),

  // Admin Endpoints
  getAdminStats: () => request('/admin/stats'),
  getUsers: (role, paramsObj = {}) => {
    const params = new URLSearchParams();
    if (role) params.append('role', role);
    if (paramsObj.semester) params.append('semester', paramsObj.semester);
    if (paramsObj.standard) params.append('standard', paramsObj.standard);
    if (paramsObj.institutionType) params.append('institutionType', paramsObj.institutionType);
    return request(`/admin/users?${params.toString()}`);
  },
  toggleUserStatus: (userId) =>
    request(`/admin/users/${userId}/toggle-status`, { method: 'PATCH' }),
  getCourses: () => request('/admin/courses'),
  createCourse: (data) =>
    request('/admin/courses', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  assignTeacherToCourse: (courseId, teacherId) =>
    request('/admin/courses/assign-teacher', {
      method: 'POST',
      body: JSON.stringify({ courseId, teacherId })
    }),

  // Timetables
  getTimetables: (division, semester, day) => {
    const params = new URLSearchParams();
    if (division) params.append('division', division);
    if (semester) params.append('semester', semester);
    if (day) params.append('day', day);
    return request(`/admin/timetables?${params.toString()}`);
  },
  createTimetableEntry: (data) =>
    request('/admin/timetables', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  updateTimetableEntry: (id, data) =>
    request(`/admin/timetables/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  deleteTimetableEntry: (id) =>
    request(`/admin/timetables/${id}`, {
      method: 'DELETE'
    }),
  autoGenerateTimetable: (data) =>
    request('/admin/timetables/auto-generate', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  // Division Allocator
  allocateDivisions: (data) =>
    request('/admin/divisions/allocate', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  seedDemoData: () => request('/admin/seed', { method: 'POST' })
};
