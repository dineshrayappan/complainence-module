import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 60000, // 60s timeout for mobile camera photo uploads
  headers: {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  },
});

// Attach JWT token automatically to every outgoing request
api.interceptors.request.use(
  (config) => {
    const token =
      (typeof window !== 'undefined' && window.sessionStorage?.getItem('garment_qms_token')) ||
      (typeof window !== 'undefined' && window.localStorage?.getItem('garment_qms_token'));
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // CRITICAL: When data is FormData, remove Content-Type so browser / axios
    // automatically populates multipart/form-data with the required boundary string
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      if (config.headers) {
        if (typeof config.headers.delete === 'function') {
          config.headers.delete('Content-Type');
          config.headers.delete('content-type');
        } else {
          delete config.headers['Content-Type'];
          delete config.headers['content-type'];
        }
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for token expiry handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    return Promise.reject(error);
  }
);

export const authService = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  logout: (data) => api.post('/auth/logout', data),
  getMe: () => api.get('/auth/me'),
  updateOwnerPassword: (data) => api.patch('/auth/owner/password', data),
};

export const userService = {
  getLineSupervisors: () => api.get('/users/line-supervisors'),
  getAllUsers: (params) => api.get('/users', { params }),
  getArchivedUsers: () => api.get('/users/archived'),
  getUserNcHistory: (id) => api.get(`/users/${id}/nc-history`),
  restoreUser: (id) => api.patch(`/users/${id}/restore`),
  createUser: (userData) => api.post('/users', userData),
  updateUser: (id, userData) => api.put(`/users/${id}`, userData),
  resetPassword: (id, newPassword) => api.patch(`/users/${id}/reset-password`, { newPassword }),
  toggleUserStatus: (id) => api.patch(`/users/${id}/toggle-status`),
  checkUserDependencies: (id) => api.get(`/users/${id}/dependencies`),
  deleteUser: (id) => api.delete(`/users/${id}`),
};

export const departmentService = {
  getDepartments: () => api.get('/departments'),
  checkDepartmentDependencies: (id) => api.get(`/departments/${id}/dependencies`),
  createDepartment: (deptData) => api.post('/departments', deptData),
  deleteDepartment: (id) => api.delete(`/departments/${id}`),
};

export const complaintService = {
  getComplaints: (params) => api.get('/complaints', { params }),
  getComplaintById: (id) => api.get(`/complaints/${id}`),
  getKpiStats: () => api.get('/complaints/stats/kpi'),
  createComplaint: (data) => {
    if (typeof FormData !== 'undefined' && data instanceof FormData) {
      return api.post('/complaints', data, {
        headers: { 'Content-Type': undefined },
      });
    }
    return api.post('/complaints', data);
  },
  reassignComplaint: (id, assignedToUserId, notes) =>
    api.patch(`/complaints/${id}/reassign`, { assignedToUserId, notes }),
  markInProgress: (id, notes) =>
    api.patch(`/complaints/${id}/in-progress`, { notes }),
  stopWork: (id, reason) =>
    api.patch(`/complaints/${id}/stop-work`, { reason }),
  submitAction: (id, data) => {
    if (typeof FormData !== 'undefined' && data instanceof FormData) {
      return api.post(`/complaints/${id}/submit-action`, data, {
        headers: { 'Content-Type': undefined },
      });
    }
    return api.post(`/complaints/${id}/submit-action`, data);
  },
  verifyComplaint: (id, payload) =>
    api.post(`/complaints/${id}/verify`, payload),
  addTimelineComment: (id, comment) =>
    api.post(`/complaints/${id}/timeline`, { comment }),
  deleteComplaint: (id) => api.delete(`/complaints/${id}`),
  getAdminOversight: () => api.get('/complaints/admin/oversight'),
  getDepartmentCompliance: () => api.get('/complaints/admin/department-compliance'),
  updateComplianceThresholds: (thresholds) => api.put('/complaints/admin/compliance-thresholds', thresholds),
  getAudits: () => api.get('/complaints/admin/audits'),
  updateAuditChecklist: (id, payload) => api.put(`/complaints/admin/audits/${id}/checklist`, payload),
  createAudit: (data) => api.post('/complaints/admin/audits', data),
};

export const taskService = {
  getTasks: (params) => api.get('/tasks', { params }),
  createTask: (data) => api.post('/tasks', data),
  updateTask: (id, data) => api.put(`/tasks/${id}`, data),
  startTask: (id) => api.post(`/tasks/${id}/start`),
  completeTask: (id, proofData = {}) => api.post(`/tasks/${id}/complete`, proofData),
  deleteTask: (id) => api.delete(`/tasks/${id}`),
  getLiveStatus: (params) => api.get('/tasks/live-status', { params }),
  getLiveFloorStatus: (params) => api.get('/tasks/live-status', { params }),
};

export const auditLogService = {
  getAuditLogs: (params) => api.get('/audit-logs', { params }),
  getUserLoginTimes: (params) => api.get('/audit-logs/logins', { params }),
  exportAuditLogs: (format = 'csv') =>
    api.get('/audit-logs/export', { params: { format }, responseType: 'blob' }),
  clearAuditLogs: () => api.delete('/audit-logs'),
};

export default api;
