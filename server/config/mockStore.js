// In-Memory state for offline development, serverless cold-starts, or cloud deployment fallback
const bcrypt = require('bcryptjs');
const { toBase64DataUrl } = require('../utils/base64Helper');

const initialUsers = [];
const initialComplaints = [];

let mockUsers = [];
let mockComplaints = [];


module.exports = {
  getUsers: (includeDeleted = false) =>
    includeDeleted ? [...mockUsers] : mockUsers.filter((u) => !u.isDeleted),
  findUserById: (id) => mockUsers.find((u) => u._id === id || u.id === id || u.employeeId === id),
  findUserByIdentifier: (identifier) => {
    const term = (identifier || '').trim().toLowerCase();
    if (!term) return null;
    return mockUsers.find((u) => {
      const uEmail = (u.email || '').toLowerCase();
      const uEmp = (u.employeeId || '').toLowerCase();
      const uRole = (u.role || '').toLowerCase();

      if (uEmail === term || uEmp === term) return true;
      if (term === 'admin' && (uEmp === 'admin' || uEmp === 'adm-001' || uRole === 'admin' || uEmail.startsWith('admin@'))) return true;
      return false;
    });
  },
  createUser: (userData) => {
    let safePassword = userData.password;
    if (safePassword && typeof safePassword === 'string' && !safePassword.startsWith('$2a$') && !safePassword.startsWith('$2b$')) {
      safePassword = bcrypt.hashSync(safePassword, 10);
    }
    const newUser = {
      _id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      ...userData,
      password: safePassword,
      isActive: true,
      isDeleted: false,
    };
    mockUsers.unshift(newUser);
    return newUser;
  },
  updateUser: (id, updates) => {
    const idx = mockUsers.findIndex((u) => u._id === id || u.id === id || u.employeeId === id);
    if (idx !== -1) {
      const safeUpdates = { ...updates };
      if (safeUpdates.password && typeof safeUpdates.password === 'string' && !safeUpdates.password.startsWith('$2a$') && !safeUpdates.password.startsWith('$2b$')) {
        safeUpdates.password = bcrypt.hashSync(safeUpdates.password, 10);
      }
      mockUsers[idx] = { ...mockUsers[idx], ...safeUpdates };
      return mockUsers[idx];
    }
    return null;
  },
  deleteUser: (id, extra = {}) => {
    const idx = mockUsers.findIndex((u) => u._id === id || u.id === id || u.employeeId === id);
    if (idx !== -1) {
      if (mockUsers[idx].role === 'OWNER' || mockUsers[idx].isOwner) {
        return null; // Protected Owner account
      }
      mockUsers[idx] = {
        ...mockUsers[idx],
        isDeleted: true,
        isActive: false,
        isPresent: false,
        deletedAt: extra.deletedAt || new Date(),
        deletedBy: extra.deletedBy || null,
      };
      return mockUsers[idx];
    }
    return null;
  },
  restoreUser: (id) => {
    const idx = mockUsers.findIndex((u) => u._id === id || u.id === id || u.employeeId === id);
    if (idx !== -1) {
      mockUsers[idx] = {
        ...mockUsers[idx],
        isDeleted: false,
        isActive: true,
        deletedAt: null,
        deletedBy: null,
      };
      return mockUsers[idx];
    }
    return null;
  },
  getComplaints: (params = {}, user = null) => {
    let result = [...mockComplaints];

    // Record Status filter: 'all' | 'active' | 'deleted' (Preserves deleted records in reports)
    if (params.recordStatus === 'deleted') {
      result = result.filter((c) => Boolean(c.isDeleted));
    } else if (params.recordStatus === 'active') {
      result = result.filter((c) => !c.isDeleted);
    } else if (params.recordStatus === 'all' || params.includeDeleted === 'true' || params.includeDeleted === true) {
      // Keep all records including deleted for reports
    } else if (params.tab && params.tab !== 'all') {
      // Specific workflow queue tabs exclude deleted records by default
      result = result.filter((c) => !c.isDeleted);
    }

    // Role-based filtering for Supervisor / Action Person (Strict Personal Assignment Isolation across ALL tabs)
    if (user && (user.role === 'ACTION_PERSON' || user.role === 'SUPERVISOR')) {
      const uEmp = (user.employeeId || '').toUpperCase();
      const uId = String(user._id || user.id || '');

      result = result.filter((c) => {
        const cAssignedId = String(c.assignedTo?.userId || '');
        const cAssignedEmp = (c.assignedTo?.employeeId || '').toUpperCase();

        return (
          (uEmp && cAssignedEmp === uEmp) ||
          (uId && cAssignedId === uId)
        );
      });
    }

    if (params.tab === 'draft') {
      result = result.filter((c) => c.status === 'Draft');
    } else if (params.tab === 'open') {
      result = result.filter((c) => ['Open', 'Assigned', 'In Progress'].includes(c.status));
    } else if (params.tab === 'cap-submitted') {
      result = result.filter((c) => ['CAP Submitted', 'Under Verification'].includes(c.status));
    } else if (params.tab === 'under-review') {
      result = result.filter((c) => c.status === 'Under Review');
    } else if (params.tab === 'rejected-rework') {
      result = result.filter((c) => ['Rejected / Rework', 'Rejected / Sent Back'].includes(c.status));
    } else if (params.tab === 'verified') {
      result = result.filter((c) => c.status === 'Verified');
    } else if (params.tab === 'closed') {
      result = result.filter((c) => ['Closed', 'Verified'].includes(c.status));
    } else if (params.tab === 'action-pending' || params.tab === 'pending') {
      result = result.filter((c) => ['Open', 'Assigned', 'In Progress', 'Rejected / Rework', 'Rejected / Sent Back'].includes(c.status));
    } else if (params.tab === 'under-verification' || params.tab === 'under_verification') {
      result = result.filter((c) => ['CAP Submitted', 'Under Review', 'Under Verification'].includes(c.status));
    } else if (params.tab === 'overdue') {
      result = result.filter((c) => !['Closed', 'Verified'].includes(c.status) && new Date(c.deadlineTimestamp) < new Date());
    } else if (params.status && params.status !== 'all' && params.status !== 'All Statuses') {
      result = result.filter((c) => c.status === params.status);
    }

    // Separate Deadline Condition filter: Open | Overdue | Due Soon | Closed
    const dCond = params.deadlineCondition || params.deadline;
    if (dCond && dCond !== 'All Deadlines') {
      const now = new Date();
      if (dCond === 'Overdue') {
        result = result.filter((c) => !['Closed', 'Verified'].includes(c.status) && new Date(c.deadlineTimestamp) < now);
      } else if (dCond === 'Due Soon') {
        result = result.filter((c) => {
          if (['Closed', 'Verified'].includes(c.status)) return false;
          const diff = new Date(c.deadlineTimestamp) - now;
          return diff >= 0 && diff <= 4 * 3600 * 1000;
        });
      } else if (dCond === 'Open') {
        result = result.filter((c) => {
          if (['Closed', 'Verified'].includes(c.status)) return false;
          const diff = new Date(c.deadlineTimestamp) - now;
          return diff > 4 * 3600 * 1000;
        });
      } else if (dCond === 'Closed') {
        result = result.filter((c) => ['Closed', 'Verified'].includes(c.status));
      }
    }

    if (params.category) {
      result = result.filter((c) => c.category === params.category);
    }
    if (params.priority) {
      result = result.filter((c) => c.priority === params.priority);
    }
    return result;
  },
  getComplaintById: (id) => {
    const s = String(id);
    return mockComplaints.find(
      (c) => String(c._id) === s || String(c.id) === s || String(c.complaintId) === s
    );
  },
  createComplaint: (data) => {
    const safeData = { ...data };
    if (safeData.beforePhoto) safeData.beforePhoto = toBase64DataUrl(safeData.beforePhoto);
    if (safeData.afterPhoto) safeData.afterPhoto = toBase64DataUrl(safeData.afterPhoto);
    if (safeData.cap && safeData.cap.evidence) safeData.cap.evidence = toBase64DataUrl(safeData.cap.evidence);

    const newTicket = {
      _id: safeData._id || safeData.id || `cmp-${Date.now()}`,
      complaintId: safeData.complaintId || `CMP-${Math.floor(10000 + Math.random() * 90000)}`,
      ...safeData,
      status: safeData.status || 'Assigned',
      timeline: safeData.timeline || [
        {
          action: 'CREATED',
          performedBy: safeData.createdBy,
          notes: '',
          timestamp: new Date(),
        },
      ],
      createdAt: safeData.createdAt || new Date(),
    };
    const existingIdx = mockComplaints.findIndex(
      (c) =>
        String(c._id) === String(newTicket._id) ||
        String(c.id) === String(newTicket._id) ||
        c.complaintId === newTicket.complaintId
    );
    if (existingIdx !== -1) {
      mockComplaints[existingIdx] = { ...mockComplaints[existingIdx], ...newTicket };
    } else {
      mockComplaints.unshift(newTicket);
    }
    return newTicket;
  },
  updateComplaint: (id, updates) => {
    const s = String(id);
    const safeUpdates = { ...updates };
    if (safeUpdates.beforePhoto) safeUpdates.beforePhoto = toBase64DataUrl(safeUpdates.beforePhoto);
    if (safeUpdates.afterPhoto) safeUpdates.afterPhoto = toBase64DataUrl(safeUpdates.afterPhoto);
    if (safeUpdates.cap && safeUpdates.cap.evidence) safeUpdates.cap.evidence = toBase64DataUrl(safeUpdates.cap.evidence);

    const idx = mockComplaints.findIndex(
      (c) => String(c._id) === s || String(c.id) === s || String(c.complaintId) === s
    );
    if (idx !== -1) {
      mockComplaints[idx] = { ...mockComplaints[idx], ...safeUpdates };
      return mockComplaints[idx];
    }
    return null;
  },
  deleteComplaint: (id, deletedBy = null, reason = '') => {
    const paramStr = String(id);
    const idx = mockComplaints.findIndex(
      (c) =>
        String(c._id) === paramStr ||
        String(c.id) === paramStr ||
        c.complaintId === paramStr
    );
    if (idx !== -1) {
      const now = new Date();
      const current = mockComplaints[idx];
      const defaultDeletedBy = deletedBy || { name: 'Administrator', employeeId: 'ADMIN', role: 'ADMIN' };
      const updatedTimeline = Array.isArray(current.timeline) ? [...current.timeline] : [];
      updatedTimeline.push({
        action: 'DELETED',
        performedBy: defaultDeletedBy,
        notes: `Record archived / soft-deleted. ${reason || ''}`.trim(),
        timestamp: now,
      });

      mockComplaints[idx] = {
        ...current,
        isDeleted: true,
        deletedAt: now.toISOString(),
        deletedBy: defaultDeletedBy,
        deletedReason: reason || 'Deleted by authorized user',
        timeline: updatedTimeline,
      };
      return mockComplaints[idx];
    }
    return null;
  },
  syncWithDB: (tickets) => {
    if (Array.isArray(tickets)) {
      mockComplaints = tickets.map((t) => ({
        ...t,
        _id: t.id || t._id,
        complaintId: t.complaintId,
        isDeleted: Boolean(t.isDeleted),
        deletedAt: t.deletedAt || null,
        deletedBy: t.deletedBy || null,
        deletedReason: t.deletedReason || '',
        beforePhoto: toBase64DataUrl(t.beforePhoto),
        afterPhoto: toBase64DataUrl(t.afterPhoto),
      }));
    }
    return mockComplaints;
  },
  
  getComplianceThresholds: () => ({ ...complianceThresholds }),
  updateComplianceThresholds: (updates = {}) => {
    const high = updates.highThreshold != null ? Number(updates.highThreshold) : complianceThresholds.highThreshold;
    const mod = updates.moderateThreshold != null ? Number(updates.moderateThreshold) : complianceThresholds.moderateThreshold;
    complianceThresholds = {
      ...complianceThresholds,
      highThreshold: high,
      moderateThreshold: mod,
      updatedAt: new Date().toISOString(),
      updatedBy: updates.updatedBy || complianceThresholds.updatedBy,
    };
    return complianceThresholds;
  },
  getAudits: () => [...mockAudits],
  getAuditById: (id) => mockAudits.find((a) => a.id === id),
  updateAuditChecklist: (auditId, dept, itemId, newStatus, notes) => {
    const audit = mockAudits.find((a) => a.id === auditId);
    if (!audit) return null;
    if (audit.checklist && audit.checklist[dept]) {
      const item = audit.checklist[dept].find((i) => i.id === itemId);
      if (item) {
        if (newStatus !== undefined) item.status = newStatus;
        if (notes !== undefined) item.notes = notes;
      }
    }
    return audit;
  },
  createAudit: (auditData) => {
    const newAudit = {
      id: `aud-${Date.now()}`,
      status: 'Scheduled',
      departments: ['HR', 'Production', 'EHS'],
      checklist: {
        HR: [
          { id: 'hr-1', label: 'Employee files', status: 'PENDING', notes: '' },
          { id: 'hr-2', label: 'Attendance', status: 'PENDING', notes: '' },
          { id: 'hr-3', label: 'Payroll', status: 'PENDING', notes: '' },
          { id: 'hr-4', label: 'Overtime records', status: 'PENDING', notes: '' },
        ],
        Production: [
          { id: 'prd-1', label: 'Working hours', status: 'PENDING', notes: '' },
          { id: 'prd-2', label: 'Machine safety', status: 'PENDING', notes: '' },
          { id: 'prd-3', label: 'PPE', status: 'PENDING', notes: '' },
        ],
        EHS: [
          { id: 'ehs-1', label: 'Fire safety', status: 'PENDING', notes: '' },
          { id: 'ehs-2', label: 'Emergency exits', status: 'PENDING', notes: '' },
          { id: 'ehs-3', label: 'Chemical management', status: 'PENDING', notes: '' },
        ],
      },
      ...auditData,
    };
    mockAudits.unshift(newAudit);
    return newAudit;
  },

  // ---- Compliance Tasks (scheduled per-user inspections) ----
  getTasks: () => [...mockTasks],
  getTaskById: (id) => {
    const s = String(id);
    return mockTasks.find((t) => String(t.id) === s);
  },
  createTask: (data) => {
    const newTask = {
      id: data.id || `tsk-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      status: 'Pending',
      recurrence: 'NONE',
      priority: 'MEDIUM',
      description: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...data,
    };
    mockTasks.unshift(newTask);
    return newTask;
  },
  updateTask: (id, updates) => {
    const task = mockTasks.find((t) => String(t.id) === String(id));
    if (!task) return null;
    Object.assign(task, updates, { updatedAt: new Date().toISOString() });
    return task;
  },
  deleteTask: (id) => {
    const idx = mockTasks.findIndex((t) => String(t.id) === String(id));
    if (idx === -1) return false;
    mockTasks.splice(idx, 1);
    return true;
  },

  // ---- Departments Management ----
  getDepartments: () => [...mockDepartments],
  findDepartmentById: (id) => {
    const s = (id || '').trim().toLowerCase();
    return mockDepartments.find((d) => d.id?.toLowerCase() === s || d.name?.toLowerCase() === s || d.code?.toLowerCase() === s);
  },
  createDepartment: (deptData) => {
    const newDept = {
      id: deptData.id || `dept-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      headcount: 20,
      createdAt: new Date().toISOString(),
      ...deptData,
    };
    mockDepartments.push(newDept);
    return newDept;
  },
  deleteDepartment: (idOrName) => {
    const s = (idOrName || '').trim().toLowerCase();
    const idx = mockDepartments.findIndex(
      (d) => d.id?.toLowerCase() === s || d.name?.toLowerCase() === s
    );
    if (idx === -1) return null;
    const removed = mockDepartments.splice(idx, 1)[0];
    return removed;
  },
  recordAttendance: (userData, dateString, timestamp = new Date()) => {
    const empId = (userData.employeeId || '').toUpperCase().trim();
    const existing = mockAttendance.find(
      (a) => a.employeeId === empId && a.date === dateString
    );
    if (!existing) {
      const rec = {
        id: `att-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        userId: userData.userId || userData._id || userData.id,
        employeeId: empId,
        name: userData.name || '',
        department: userData.department || '',
        role: userData.role || 'ACTION_PERSON',
        date: dateString,
        status: 'Present',
        loginTimestamp: timestamp,
        lastLoginAt: timestamp,
      };
      mockAttendance.push(rec);
      return rec;
    } else {
      existing.status = 'Present';
      existing.lastLoginAt = timestamp;
      return existing;
    }
  },
  getAttendanceByDate: (dateString) => {
    return mockAttendance.filter((a) => a.date === dateString);
  },
  getAllAttendance: () => [...mockAttendance],
  addAuditLog: (log) => {
    mockAuditLogs.unshift(log);
    if (mockAuditLogs.length > 2000) {
      mockAuditLogs.pop();
    }
    return log;
  },
  getAuditLogs: (params = {}) => {
    const {
      search = '',
      category = 'ALL',
      severity = 'ALL',
      timeframe = 'all',
      userId = '',
      page = 1,
      limit = 50,
    } = params;

    let filtered = [...mockAuditLogs];

    if (category && category !== 'ALL') {
      if (category === 'DELETIONS') {
        filtered = filtered.filter(
          (l) =>
            (l.action && l.action.toLowerCase().includes('delet')) ||
            (l.action_label && l.action_label.toLowerCase().includes('delet')) ||
            (l.details && l.details.toLowerCase().includes('delet'))
        );
      } else {
        filtered = filtered.filter((l) => (l.category || '').toUpperCase() === category.toUpperCase());
      }
    }

    if (severity && severity !== 'ALL') {
      filtered = filtered.filter((l) => (l.severity || '').toUpperCase() === severity.toUpperCase());
    }

    if (userId) {
      const uId = userId.trim().toLowerCase();
      filtered = filtered.filter((l) => (l.user_id || '').toLowerCase() === uId);
    }

    if (timeframe && timeframe !== 'all') {
      const now = Date.now();
      let cutoff = 0;
      if (timeframe === 'today') {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        cutoff = d.getTime();
      } else if (timeframe === '7days') {
        cutoff = now - 7 * 24 * 3600 * 1000;
      } else if (timeframe === '30days') {
        cutoff = now - 30 * 24 * 3600 * 1000;
      }
      if (cutoff > 0) {
        filtered = filtered.filter((l) => new Date(l.created_at).getTime() >= cutoff);
      }
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(
        (l) =>
          (l.user_name || '').toLowerCase().includes(q) ||
          (l.user_id || '').toLowerCase().includes(q) ||
          (l.action_label || '').toLowerCase().includes(q) ||
          (l.action || '').toLowerCase().includes(q) ||
          (l.details || '').toLowerCase().includes(q) ||
          (l.entity_name || '').toLowerCase().includes(q) ||
          (l.related_nc_id || '').toLowerCase().includes(q)
      );
    }

    const total = filtered.length;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const totalPages = Math.ceil(total / limitNum) || 1;
    const startIndex = (pageNum - 1) * limitNum;
    const paginated = filtered.slice(startIndex, startIndex + limitNum);

    return {
      logs: paginated,
      total,
      page: pageNum,
      totalPages,
    };
  },
  getLoginHistory: (params = {}) => {
    const { userId, employeeId, timeframe = 'all', limit = 100 } = params;
    let list = mockAuditLogs.filter(
      (l) => l.category === 'AUTH' || (l.action && l.action.startsWith('AUTH_'))
    );

    if (userId || employeeId) {
      const target = (userId || employeeId || '').toLowerCase().trim();
      list = list.filter((l) => (l.user_id || '').toLowerCase() === target);
    }

    if (timeframe && timeframe !== 'all') {
      const now = Date.now();
      let cutoff = 0;
      if (timeframe === 'today') {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        cutoff = d.getTime();
      } else if (timeframe === '7days') {
        cutoff = now - 7 * 24 * 3600 * 1000;
      } else if (timeframe === '30days') {
        cutoff = now - 30 * 24 * 3600 * 1000;
      }
      if (cutoff > 0) {
        list = list.filter((l) => new Date(l.created_at).getTime() >= cutoff);
      }
    }

    return list.slice(0, parseInt(limit, 10) || 100);
  },
  getAuditLogStats: () => {
    const now = Date.now();
    const oneDayAgo = now - 24 * 3600 * 1000;
    const total = mockAuditLogs.length;
    const todayCount = mockAuditLogs.filter(
      (l) => new Date(l.created_at).getTime() >= oneDayAgo
    ).length;
    const criticalCount = mockAuditLogs.filter((l) => l.severity === 'CRITICAL').length;
    const warningCount = mockAuditLogs.filter((l) => l.severity === 'WARNING').length;
    const successCount = mockAuditLogs.filter((l) => l.severity === 'SUCCESS').length;
    const infoCount = mockAuditLogs.filter((l) => l.severity === 'INFO').length;
    const authCount = mockAuditLogs.filter((l) => l.category === 'AUTH').length;

    return {
      total,
      todayCount,
      criticalCount,
      warningCount,
      successCount,
      infoCount,
      authCount,
    };
  },
  clearAuditLogs: () => {
    mockAuditLogs = [];
    return true;
  },
};

let mockDepartments = [];

let mockAttendance = [];

let mockTasks = [];

let mockAudits = [];

let mockAuditLogs = [];

let complianceThresholds = {
  highThreshold: 90,     // >= 90% is Green
  moderateThreshold: 75, // 75 - 89% is Amber, < 75% is Red
  updatedAt: new Date().toISOString(),
  updatedBy: 'Administrator',
};
