import { supabase } from './supabase';
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 60000, // 60s timeout for mobile camera photo uploads
});

// Attach JWT token automatically to every outgoing request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('garment_qms_token');
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
  getMe: () => api.get('/auth/me'),
};

export const userService = {
  getLineSupervisors: async () => {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, name, employeeId, department, designation, mobileNumber, email, role, isActive')
          .or('role.eq.ACTION_PERSON,role.eq.SUPERVISOR,employeeId.eq.ALL-001')
          .eq('isActive', true)
          .order('department', { ascending: true })
          .order('name', { ascending: true });
        if (!error && data && data.length > 0) {
          const supervisors = data.map((u) => ({
            _id: u.id,
            id: u.id,
            employeeId: u.employeeId,
            name: u.name,
            email: u.email,
            role: u.role === 'SUPERVISOR' ? 'ACTION_PERSON' : u.role,
            department: u.department,
            designation: u.designation,
            mobileNumber: u.mobileNumber,
            isActive: u.isActive,
          }));
          return { data: { success: true, count: supervisors.length, supervisors } };
        }
      } catch (err) {
        console.warn('[userService.getLineSupervisors] Supabase fallback to API:', err.message);
      }
    }
    return api.get('/users/line-supervisors');
  },

  getAllUsers: async (params) => {
    if (supabase) {
      try {
        let query = supabase.from('users').select('*');
        if (params?.role && params.role !== 'ALL') {
          if (params.role === 'SUPERVISOR') {
            query = query.in('role', ['ACTION_PERSON', 'SUPERVISOR']);
          } else {
            query = query.eq('role', params.role);
          }
        }
        if (params?.department) {
          query = query.eq('department', params.department);
        }
        const { data, error } = await query.order('role', { ascending: true }).order('name', { ascending: true });
        if (!error && data) {
          const users = data.map((u) => ({
            _id: u.id,
            id: u.id,
            employeeId: u.employeeId,
            name: u.name,
            email: u.email,
            role: u.role === 'SUPERVISOR' ? 'ACTION_PERSON' : u.role,
            department: u.department,
            designation: u.designation,
            mobileNumber: u.mobileNumber,
            isActive: typeof u.isActive !== 'undefined' ? u.isActive : true,
            createdAt: u.createdAt,
            updatedAt: u.updatedAt,
          }));
          return { data: { success: true, count: users.length, users } };
        }
      } catch (err) {
        console.warn('[userService.getAllUsers] Supabase direct error, using API:', err.message);
      }
    }
    return api.get('/users', { params });
  },

  createUser: async (userData) => {
    let createdSupabaseUser = null;
    if (supabase) {
      try {
        const normalizedRole = userData.role === 'SUPERVISOR' ? 'ACTION_PERSON' : userData.role;
        const { data, error } = await supabase
          .from('users')
          .insert([
            {
              employeeId: userData.employeeId.trim().toUpperCase(),
              name: userData.name.trim(),
              email: userData.email.trim().toLowerCase(),
              password: userData.password,
              role: normalizedRole,
              department: userData.department.trim(),
              designation: userData.designation.trim(),
              mobileNumber: (userData.mobileNumber || '').trim(),
              isActive: true,
            },
          ])
          .select()
          .single();

        if (error) {
          if (error.code === '23505') {
            throw new Error(`Employee ID '${userData.employeeId.toUpperCase()}' or Email '${userData.email.toLowerCase()}' is already registered in the database.`);
          }
          throw new Error(error.message);
        }
        createdSupabaseUser = data;
      } catch (sbErr) {
        console.warn('[userService.createUser] Supabase insert notice:', sbErr.message);
        throw sbErr;
      }
    }

    try {
      await api.post('/users', userData);
    } catch (apiErr) {
      console.warn('[userService.createUser] Backend sync notice:', apiErr.message);
    }

    return {
      data: {
        success: true,
        message: `User '${userData.name}' (${userData.employeeId.toUpperCase()}) created successfully.`,
        user: createdSupabaseUser || userData,
      },
    };
  },

  updateUser: async (id, userData) => {
    if (supabase) {
      try {
        await supabase
          .from('users')
          .update({
            name: userData.name,
            email: userData.email,
            department: userData.department,
            designation: userData.designation,
            mobileNumber: userData.mobileNumber,
            role: userData.role === 'SUPERVISOR' ? 'ACTION_PERSON' : userData.role,
            updatedAt: new Date().toISOString(),
          })
          .eq('id', id);
      } catch (e) {
        console.warn('[userService.updateUser] Direct Supabase notice:', e.message);
      }
    }
    return api.put(`/users/${id}`, userData);
  },

  resetPassword: async (id, newPassword) => {
    if (supabase) {
      try {
        await supabase
          .from('users')
          .update({
            password: newPassword,
            updatedAt: new Date().toISOString(),
          })
          .eq('id', id);
      } catch (e) {
        console.warn('[userService.resetPassword] Direct Supabase notice:', e.message);
      }
    }
    return api.patch(`/users/${id}/reset-password`, { newPassword });
  },

  toggleUserStatus: async (id) => {
    if (supabase) {
      try {
        const { data: curr } = await supabase.from('users').select('isActive').eq('id', id).maybeSingle();
        if (curr) {
          await supabase.from('users').update({ isActive: !curr.isActive, updatedAt: new Date().toISOString() }).eq('id', id);
        }
      } catch (e) {
        console.warn('[userService.toggleUserStatus] Direct Supabase notice:', e.message);
      }
    }
    return api.patch(`/users/${id}/toggle-status`);
  },

  checkUserDependencies: async (id) => {
    return api.get(`/users/${id}/dependencies`);
  },

  deleteUser: async (id) => {
    // Call backend API first for full dependency check and data integrity validation
    const response = await api.delete(`/users/${id}`);
    if (supabase) {
      try {
        await supabase.from('users').delete().eq('id', id);
      } catch (e) {
        console.warn('[userService.deleteUser] Direct Supabase notice:', e.message);
      }
    }
    return response;
  },
};

export const departmentService = {
  getDepartments: async () => {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('departments')
          .select('*')
          .order('name', { ascending: true });
        if (!error && Array.isArray(data) && data.length > 0) {
          return api.get('/departments').catch(() => ({
            data: { success: true, count: data.length, departments: data },
          }));
        }
      } catch (e) {
        console.warn('[departmentService.getDepartments] Supabase direct notice:', e.message);
      }
    }
    return api.get('/departments');
  },

  checkDepartmentDependencies: async (id) => {
    return api.get(`/departments/${id}/dependencies`);
  },

  createDepartment: async (deptData) => {
    return api.post('/departments', deptData);
  },

  deleteDepartment: async (id) => {
    const response = await api.delete(`/departments/${id}`);
    if (supabase) {
      try {
        await supabase.from('departments').delete().or(`id.eq.${id},name.eq.${id}`);
      } catch (e) {
        console.warn('[departmentService.deleteDepartment] Direct Supabase notice:', e.message);
      }
    }
    return response;
  },
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
};

export default api;
