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

// Resolve the active company slug from URL path, sessionStorage, or default to 'esstee'
export const getActiveCompanySlug = () => {
  if (typeof window !== 'undefined') {
    const segments = window.location.pathname.split('/').filter(Boolean);
    if (segments.length > 0 && segments[0] !== 'compliance' && segments[0] !== 'api') {
      return segments[0].toLowerCase();
    }
    const saved =
      window.sessionStorage?.getItem('garment_qms_company_slug') ||
      window.localStorage?.getItem('garment_qms_company_slug');
    if (saved) return saved.toLowerCase();
  }
  return 'esstee';
};

// Attach Company Slug and JWT token automatically to every outgoing request
api.interceptors.request.use(
  (config) => {
    const companySlug = getActiveCompanySlug();
    config.headers['X-Company-Slug'] = companySlug;

    const token =
      (typeof window !== 'undefined' && window.sessionStorage?.getItem(`garment_qms_token_${companySlug}`)) ||
      (typeof window !== 'undefined' && window.sessionStorage?.getItem('garment_qms_token')) ||
      (typeof window !== 'undefined' && window.localStorage?.getItem(`garment_qms_token_${companySlug}`)) ||
      (typeof window !== 'undefined' && window.localStorage?.getItem('garment_qms_token'));
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    const activeUnit =
      (typeof window !== 'undefined' && window.sessionStorage?.getItem('garment_qms_active_unit')) ||
      (typeof window !== 'undefined' && window.localStorage?.getItem('garment_qms_active_unit'));
    if (activeUnit) {
      config.headers['X-Unit-Id'] = activeUnit;
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
  createComplaint: (data) => api.post('/complaints', data),
  reassignComplaint: (id, assignedToUserId, notes) =>
    api.patch(`/complaints/${id}/reassign`, { assignedToUserId, notes }),
  markInProgress: (id, notes) =>
    api.patch(`/complaints/${id}/in-progress`, { notes }),
  stopWork: (id, reason) =>
    api.patch(`/complaints/${id}/stop-work`, { reason }),
  submitAction: (id, data) => api.post(`/complaints/${id}/submit-action`, data),
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

export const unitService = {
  getUnits: () => api.get('/units'),
  createUnit: (data) => api.post('/units', data),
  updateUnit: (id, data) => api.put(`/units/${id}`, data),
  getUnassignedRecords: () => api.get('/units/unassigned'),
  assignRecords: (data) => api.post('/units/assign-records', data),
};

export const companyService = {
  getCompanies: () => api.get('/companies'),
  getCompany: (slug) => api.get(`/companies/${slug}`),
};

export const publicComplaintService = {
  getDepartments: () => api.get('/departments/public'),
  getUnits: () => api.get('/units/public'),
  raisePublicComplaint: (formData) => api.post('/complaints/public-raise', formData),
};

export default api;

