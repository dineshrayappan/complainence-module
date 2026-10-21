// In-Memory state for offline development, serverless cold-starts, or cloud deployment fallback
const { toBase64DataUrl } = require('../utils/base64Helper');
const initialUsers = [
  {
    _id: 'admin-001',
    id: 'admin-001',
    employeeId: 'ADMIN',
    name: 'Administrator',
    email: 'admin@factory.com',
    password: 'admin123',
    role: 'ADMIN',
    department: 'Plant Operations & Executive Oversight',
    designation: 'General Operations Director',
    mobileNumber: '+91 98000 11223',
    isActive: true,
  },
];
const initialComplaints = [];

let mockUsers = [...initialUsers];
let mockComplaints = [...initialComplaints];


module.exports = {
  getUsers: () => [...mockUsers],
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
    const newUser = {
      _id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      ...userData,
      isActive: true,
    };
    mockUsers.unshift(newUser);
    return newUser;
  },
  updateUser: (id, updates) => {
    const idx = mockUsers.findIndex((u) => u._id === id || u.employeeId === id);
    if (idx !== -1) {
      mockUsers[idx] = { ...mockUsers[idx], ...updates };
      return mockUsers[idx];
    }
    return null;
  },
  deleteUser: (id) => {
    const idx = mockUsers.findIndex((u) => u._id === id || u.id === id || u.employeeId === id);
    if (idx !== -1) {
      const removed = mockUsers.splice(idx, 1)[0];
      return removed;
    }
    return null;
  },
  getComplaints: (params = {}, user = null) => {
    let result = [...mockComplaints];

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
  deleteComplaint: (id) => {
    const paramStr = String(id);
    const idx = mockComplaints.findIndex(
      (c) =>
        String(c._id) === paramStr ||
        String(c.id) === paramStr ||
        c.complaintId === paramStr
    );
    if (idx !== -1) {
      const removed = mockComplaints.splice(idx, 1)[0];
      return removed;
    }
    return null;
  },
  syncWithDB: (tickets) => {
    if (Array.isArray(tickets)) {
      mockComplaints = tickets.map((t) => ({
        ...t,
        _id: t.id || t._id,
        complaintId: t.complaintId,
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

let mockDepartments = [
  { id: 'dept-01', name: 'Production', code: 'PROD', manager: 'Rajesh Kumar', headcount: 280 },
  { id: 'dept-02', name: 'Quality', code: 'QA', manager: 'Kavita Nair', headcount: 35 },
  { id: 'dept-03', name: 'Maintenance', code: 'MAINT', manager: 'Vikram Singh', headcount: 22 },
  { id: 'dept-04', name: 'Store', code: 'STORE', manager: 'Ramesh Patel', headcount: 18 },
  { id: 'dept-05', name: 'EHS', code: 'EHS', manager: 'Sunil Verma', headcount: 12 },
  { id: 'dept-06', name: 'EDP', code: 'EDP', manager: 'Deepak Joshi', headcount: 8 },
  { id: 'dept-07', name: 'HR', code: 'HR', manager: 'Meera Swaminathan', headcount: 15 },
];

let mockAttendance = [];

let mockTasks = [];

let mockAudits = [];

const seedTime = Date.now();
let mockAuditLogs = [
  {
    id: 'evt-seed-01',
    user_id: 'ADMIN',
    user_name: 'Administrator',
    user_role: 'ADMIN',
    action: 'AUTH_LOGIN_SUCCESS',
    action_label: 'User Sign In',
    category: 'AUTH',
    severity: 'SUCCESS',
    entity_type: 'USER',
    entity_id: 'ADMIN',
    entity_name: 'Administrator',
    details: 'Administrator (ADMIN - Operations Director) authenticated successfully via Web Console.',
    ip_address: '192.168.1.100',
    is_immutable: true,
    created_at: new Date(seedTime - 12 * 60 * 1000),
  },
  {
    id: 'evt-seed-02',
    user_id: 'AUD-001',
    user_name: 'Kavita Nair',
    user_role: 'AUDITOR',
    action: 'AUTH_LOGIN_SUCCESS',
    action_label: 'User Sign In',
    category: 'AUTH',
    severity: 'SUCCESS',
    entity_type: 'USER',
    entity_id: 'AUD-001',
    entity_name: 'Kavita Nair',
    details: 'QA Lead Auditor Kavita Nair signed in to conduct daily floor audits.',
    ip_address: '192.168.1.104',
    is_immutable: true,
    created_at: new Date(seedTime - 45 * 60 * 1000),
  },
  {
    id: 'evt-seed-03',
    user_id: 'AUD-001',
    user_name: 'Kavita Nair',
    user_role: 'AUDITOR',
    action: 'NC_CREATED',
    action_label: 'Non-Conformance Raised',
    category: 'NC_DEFECT',
    severity: 'WARNING',
    entity_type: 'NC',
    entity_id: 'NC-2026-001',
    entity_name: 'Skipped Stitches on Hemline',
    related_nc_id: 'NC-2026-001',
    details: 'Critical seam slippage detected at Line 2 Sewing section during pre-final audit inspection.',
    ip_address: '192.168.1.104',
    is_immutable: true,
    created_at: new Date(seedTime - 38 * 60 * 1000),
  },
  {
    id: 'evt-seed-04',
    user_id: 'SUP-101',
    user_name: 'Rajesh Kumar',
    user_role: 'ACTION_PERSON',
    action: 'AUTH_LOGIN_SUCCESS',
    action_label: 'User Sign In',
    category: 'AUTH',
    severity: 'SUCCESS',
    entity_type: 'USER',
    entity_id: 'SUP-101',
    entity_name: 'Rajesh Kumar',
    details: 'Line Supervisor Rajesh Kumar logged in from Sewing floor terminal.',
    ip_address: '192.168.1.112',
    is_immutable: true,
    created_at: new Date(seedTime - 35 * 60 * 1000),
  },
  {
    id: 'evt-seed-05',
    user_id: 'SUP-101',
    user_name: 'Rajesh Kumar',
    user_role: 'ACTION_PERSON',
    action: 'NC_IN_PROGRESS',
    action_label: 'Rework Started',
    category: 'NC_DEFECT',
    severity: 'INFO',
    entity_type: 'NC',
    entity_id: 'NC-2026-001',
    related_nc_id: 'NC-2026-001',
    details: 'Rework initiated: Needle replacement and tension gauge calibration started on machine SN-402.',
    ip_address: '192.168.1.112',
    is_immutable: true,
    created_at: new Date(seedTime - 25 * 60 * 1000),
  },
  {
    id: 'evt-seed-06',
    user_id: 'ADMIN',
    user_name: 'Administrator',
    user_role: 'ADMIN',
    action: 'USER_CREATED',
    action_label: 'Personnel Onboarded',
    category: 'USER_MGMT',
    severity: 'SUCCESS',
    entity_type: 'USER',
    entity_id: 'SUP-102',
    entity_name: 'Anand Verma',
    details: 'New Line Supervisor Anand Verma onboarded for Cutting department.',
    ip_address: '192.168.1.100',
    is_immutable: true,
    created_at: new Date(seedTime - 180 * 60 * 1000),
  },
  {
    id: 'evt-seed-07',
    user_id: 'SYSTEM',
    user_name: 'QMS Engine',
    user_role: 'SYSTEM',
    action: 'SYSTEM_STARTUP',
    action_label: 'System Initialized',
    category: 'SYSTEM',
    severity: 'INFO',
    entity_type: 'SYSTEM',
    details: 'Textile QMS Engine online. SLA deadline monitors and audit ledger active.',
    ip_address: '127.0.0.1',
    is_immutable: true,
    created_at: new Date(seedTime - 360 * 60 * 1000),
  },
  {
    id: 'evt-seed-08',
    user_id: 'ADMIN',
    user_name: 'Administrator',
    user_role: 'ADMIN',
    action: 'NC_DELETED',
    action_label: 'Defect Record Deleted',
    category: 'COMPLAINT',
    severity: 'CRITICAL',
    entity_type: 'COMPLAINT',
    entity_id: 'NC-2026-0042',
    entity_name: 'Broken Needle In Hemline',
    related_nc_id: 'NC-2026-0042',
    details: 'Record NC-2026-0042 ("Broken Needle In Hemline") was permanently deleted by Administrator (ADMIN • General Operations Director). Department: Sewing, Buyer: Zara. Reason: Duplicate log submitted during shift handover.',
    ip_address: '192.168.1.100',
    is_immutable: true,
    created_at: new Date(seedTime - 95 * 60 * 1000),
    payload: {
      deletedBy: { name: 'Administrator', employeeId: 'ADMIN', role: 'ADMIN' },
      deletedRecord: {
        complaintId: 'NC-2026-0042',
        title: 'Broken Needle In Hemline',
        department: 'Sewing',
        buyer: 'Zara',
        severity: 'Major',
        stage: 'Sewing Line 3',
      },
      reason: 'Duplicate log submitted during shift handover',
    },
  },
  {
    id: 'evt-seed-09',
    user_id: 'ADMIN',
    user_name: 'Administrator',
    user_role: 'ADMIN',
    action: 'USER_DELETED',
    action_label: 'User Account Deleted',
    category: 'USER_MGMT',
    severity: 'CRITICAL',
    entity_type: 'USER',
    entity_id: 'SUP-099',
    entity_name: 'Vikram Joshi',
    details: 'User account \'Vikram Joshi\' (SUP-099 • Line Supervisor • Finishing) was permanently deleted by Administrator (ADMIN • Operations Director). Notice: Employee resigned, pending responsibilities handed over to Rajesh Kumar.',
    ip_address: '192.168.1.100',
    is_immutable: true,
    created_at: new Date(seedTime - 140 * 60 * 1000),
    payload: {
      deletedBy: { name: 'Administrator', employeeId: 'ADMIN', role: 'ADMIN' },
      deletedUser: {
        name: 'Vikram Joshi',
        employeeId: 'SUP-099',
        role: 'ACTION_PERSON',
        department: 'Finishing',
        designation: 'Finishing Line Supervisor',
      },
      reason: 'Resignation & Department Handover',
    },
  },
  {
    id: 'evt-seed-10',
    user_id: 'AUD-001',
    user_name: 'Kavita Nair',
    user_role: 'AUDITOR',
    action: 'AUTH_LOGOUT',
    action_label: 'User Sign Out',
    category: 'AUTH',
    severity: 'INFO',
    entity_type: 'USER',
    entity_id: 'AUD-001',
    entity_name: 'Kavita Nair',
    details: 'User Kavita Nair (AUD-001) signed out at 01:30 PM. (Login Time: 09:15 AM • Logout Time: 01:30 PM • Session Duration: 4h 15m). Morning shift quality audit complete.',
    ip_address: '192.168.1.104',
    is_immutable: true,
    created_at: new Date(seedTime - 18 * 60 * 1000),
    payload: {
      loginTimestamp: new Date(seedTime - 273 * 60 * 1000).toISOString(),
      logoutTimestamp: new Date(seedTime - 18 * 60 * 1000).toISOString(),
      loginTimeIST: '09:15 AM',
      logoutTimeIST: '01:30 PM',
      sessionDuration: '4h 15m',
      department: 'Quality',
      designation: 'QA Lead Auditor',
    },
  },
];

let complianceThresholds = {
  highThreshold: 90,     // >= 90% is Green
  moderateThreshold: 75, // 75 - 89% is Amber, < 75% is Red
  updatedAt: new Date().toISOString(),
  updatedBy: 'Administrator',
};
