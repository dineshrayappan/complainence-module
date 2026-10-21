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

  // ---- System Event Logger & Audit Trail ----
  getAuditLogs: (params = {}) => {
    let list = [...mockAuditLogs];

    // Search query
    if (params.search && params.search.trim()) {
      const q = params.search.trim().toLowerCase();
      list = list.filter((item) => {
        return (
          (item.action_label && item.action_label.toLowerCase().includes(q)) ||
          (item.action && item.action.toLowerCase().includes(q)) ||
          (item.user_name && item.user_name.toLowerCase().includes(q)) ||
          (item.user_id && item.user_id.toLowerCase().includes(q)) ||
          (item.details && item.details.toLowerCase().includes(q)) ||
          (item.entity_id && item.entity_id.toLowerCase().includes(q)) ||
          (item.entity_name && item.entity_name.toLowerCase().includes(q)) ||
          (item.category && item.category.toLowerCase().includes(q)) ||
          (item.severity && item.severity.toLowerCase().includes(q)) ||
          (item.ip_address && item.ip_address.toLowerCase().includes(q))
        );
      });
    }

    // Category filter
    if (params.category && params.category !== 'ALL') {
      const cat = params.category.toUpperCase();
      list = list.filter((item) => (item.category || '').toUpperCase() === cat);
    }

    // Severity filter
    if (params.severity && params.severity !== 'ALL') {
      const sev = params.severity.toUpperCase();
      list = list.filter((item) => (item.severity || '').toUpperCase() === sev);
    }

    // Timeframe filter
    if (params.timeframe && params.timeframe !== 'all') {
      const now = Date.now();
      let maxAgeMs = 0;
      if (params.timeframe === '1h') maxAgeMs = 3600 * 1000;
      else if (params.timeframe === '24h') maxAgeMs = 24 * 3600 * 1000;
      else if (params.timeframe === '7d') maxAgeMs = 7 * 24 * 3600 * 1000;

      if (maxAgeMs > 0) {
        list = list.filter((item) => {
          const itemTime = new Date(item.created_at).getTime();
          return now - itemTime <= maxAgeMs;
        });
      }
    }

    // Sort descending by time
    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const total = list.length;
    const page = Math.max(1, parseInt(params.page, 10) || 1);
    const limit = Math.max(1, Math.min(200, parseInt(params.limit, 10) || 50));
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const pagedLogs = list.slice(startIndex, startIndex + limit);

    return {
      logs: pagedLogs,
      total,
      page,
      limit,
      totalPages,
    };
  },
  addAuditLog: (log) => {
    mockAuditLogs.unshift(log);
    // Keep list bounded to last 600 items in memory
    if (mockAuditLogs.length > 600) {
      mockAuditLogs = mockAuditLogs.slice(0, 600);
    }
    return log;
  },
  clearAuditLogs: () => {
    mockAuditLogs = [];
    return true;
  },
  getAuditLogStats: () => {
    const total = mockAuditLogs.length;
    const now = Date.now();
    const oneDayAgo = now - 24 * 3600 * 1000;

    let todayCount = 0;
    let criticalCount = 0;
    let warningCount = 0;
    let successCount = 0;
    let infoCount = 0;

    const categoryCounts = {
      AUTH: 0,
      USER_MGMT: 0,
      NC_DEFECT: 0,
      WORK_TASK: 0,
      DEPARTMENT: 0,
      SECURITY: 0,
      SYSTEM: 0,
    };

    const userActivityMap = {};

    mockAuditLogs.forEach((l) => {
      const time = new Date(l.created_at).getTime();
      if (time >= oneDayAgo) todayCount++;

      const sev = (l.severity || '').toUpperCase();
      if (sev === 'CRITICAL') criticalCount++;
      else if (sev === 'WARNING') warningCount++;
      else if (sev === 'SUCCESS') successCount++;
      else infoCount++;

      const cat = (l.category || '').toUpperCase();
      if (categoryCounts[cat] !== undefined) {
        categoryCounts[cat]++;
      } else {
        categoryCounts[cat] = 1;
      }

      const actor = l.user_name || l.user_id || 'Unknown';
      userActivityMap[actor] = (userActivityMap[actor] || 0) + 1;
    });

    const activeUsers = Object.entries(userActivityMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      total,
      todayCount,
      criticalCount,
      warningCount,
      successCount,
      infoCount,
      categoryCounts,
      activeUsers,
      lastEventTimestamp: mockAuditLogs[0]?.created_at || null,
    };
  },
  getAudits: () => [...mockAudits],
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

let complianceThresholds = {
  highThreshold: 90,     // >= 90% is Green
  moderateThreshold: 75, // 75 - 89% is Amber, < 75% is Red
  updatedAt: new Date().toISOString(),
  updatedBy: 'Administrator',
};

let mockAuditLogs = [
  {
    id: 'evt-101',
    user_id: 'admin-001',
    user_name: 'Administrator',
    user_role: 'ADMIN',
    action: 'SYSTEM_BOOT',
    action_label: 'QMS Engine Initialized',
    category: 'SYSTEM',
    severity: 'INFO',
    entity_type: 'SYSTEM',
    entity_id: 'SYS-CORE',
    entity_name: 'Garment QMS Engine',
    details: 'System services started. In-memory resilient data store mounted with 7 factory departments.',
    payload: { version: '2.4.0', environment: 'production-ready', mongoStatus: 'resilient-mode' },
    ip_address: '127.0.0.1',
    is_immutable: true,
    tamper_hash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
  {
    id: 'evt-102',
    user_id: 'admin-001',
    user_name: 'Administrator',
    user_role: 'ADMIN',
    action: 'AUTH_LOGIN_SUCCESS',
    action_label: 'Admin Authenticated',
    category: 'AUTH',
    severity: 'SUCCESS',
    entity_type: 'USER',
    entity_id: 'ADMIN',
    entity_name: 'Administrator',
    details: 'Administrator logged into Executive Oversight Console with full administrative clearance.',
    payload: { employeeId: 'ADMIN', role: 'ADMIN', authMethod: 'JWT_BEARER' },
    ip_address: '192.168.1.10',
    is_immutable: true,
    tamper_hash: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
    created_at: new Date(Date.now() - 3600000 * 4.5).toISOString(),
  },
  {
    id: 'evt-103',
    user_id: 'admin-001',
    user_name: 'Administrator',
    user_role: 'ADMIN',
    action: 'USER_CREATED',
    action_label: 'Lead Auditor Onboarded',
    category: 'USER_MGMT',
    severity: 'SUCCESS',
    entity_type: 'USER',
    entity_id: 'QA-001',
    entity_name: 'Priya Sharma',
    details: 'Created Quality Auditor account for Priya Sharma (QA-001) in Quality Assurance department.',
    payload: { role: 'AUDITOR', department: 'Quality', designation: 'Senior Quality Auditor' },
    ip_address: '192.168.1.10',
    is_immutable: true,
    tamper_hash: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
    created_at: new Date(Date.now() - 3600000 * 3.8).toISOString(),
  },
  {
    id: 'evt-104',
    user_id: 'admin-001',
    user_name: 'Administrator',
    user_role: 'ADMIN',
    action: 'USER_CREATED',
    action_label: 'Line Supervisor Onboarded',
    category: 'USER_MGMT',
    severity: 'SUCCESS',
    entity_type: 'USER',
    entity_id: 'SUP-002',
    entity_name: 'Rajesh Kumar',
    details: 'Created Line Supervisor account for Rajesh Kumar (SUP-002) in Production line 2.',
    payload: { role: 'SUPERVISOR', department: 'Production', designation: 'Floor Incharge Line 2' },
    ip_address: '192.168.1.10',
    is_immutable: true,
    tamper_hash: 'ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d',
    created_at: new Date(Date.now() - 3600000 * 3.2).toISOString(),
  },
  {
    id: 'evt-105',
    user_id: 'auditor-001',
    user_name: 'Priya Sharma',
    user_role: 'AUDITOR',
    action: 'NC_CREATED',
    action_label: 'Critical NC Logged: Broken Needle',
    category: 'NC_DEFECT',
    severity: 'CRITICAL',
    entity_type: 'NC',
    entity_id: 'NC-2026-0001',
    entity_name: 'Broken Needle Fragment',
    related_nc_id: 'NC-2026-0001',
    details: 'High-severity safety defect registered on Sewing Line 2. Metal detector triggered on batch #LOT-992.',
    payload: { department: 'Production', line: 'Line 2', severity: 'Critical', defectType: 'Broken Needle' },
    ip_address: '192.168.1.45',
    is_immutable: true,
    tamper_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    created_at: new Date(Date.now() - 3600000 * 2.5).toISOString(),
  },
  {
    id: 'evt-106',
    user_id: 'sup-002',
    user_name: 'Rajesh Kumar',
    user_role: 'SUPERVISOR',
    action: 'TASK_STARTED',
    action_label: 'Needle Search & Isolation Initiated',
    category: 'WORK_TASK',
    severity: 'INFO',
    entity_type: 'TASK',
    entity_id: 'TSK-2026-0014',
    entity_name: 'Machine #14 Inspection',
    details: 'Supervisor initiated 9-point needle containment protocol and paused Line 2 sewing unit.',
    payload: { taskId: 'TSK-2026-0014', machineNo: 'M-14', line: 'Line 2' },
    ip_address: '192.168.1.52',
    is_immutable: true,
    tamper_hash: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
    created_at: new Date(Date.now() - 3600000 * 2.1).toISOString(),
  },
  {
    id: 'evt-107',
    user_id: 'sup-002',
    user_name: 'Rajesh Kumar',
    user_role: 'SUPERVISOR',
    action: 'NC_ACTION_SUBMITTED',
    action_label: 'Corrective Action (CAP) Submitted',
    category: 'NC_DEFECT',
    severity: 'SUCCESS',
    entity_type: 'NC',
    entity_id: 'NC-2026-0001',
    entity_name: 'Broken Needle Fragment',
    related_nc_id: 'NC-2026-0001',
    details: 'Needle log updated, broken tip retrieved (100% matched), proof photo uploaded. Submitted for verification.',
    payload: { rootCause: 'Operator forced dense seam without reducing feed speed', actionTaken: 'Replaced needle with Groz-Beckert Titanium #14, re-calibrated tension.' },
    ip_address: '192.168.1.52',
    is_immutable: true,
    tamper_hash: '3e23e8160039594a33894f6564e1b1348bbd7a0088d42c4acb73eeaed59c009d',
    created_at: new Date(Date.now() - 3600000 * 1.4).toISOString(),
  },
  {
    id: 'evt-108',
    user_id: 'auditor-001',
    user_name: 'Priya Sharma',
    user_role: 'AUDITOR',
    action: 'NC_VERIFIED',
    action_label: 'NC Verified & Approved',
    category: 'NC_DEFECT',
    severity: 'SUCCESS',
    entity_type: 'NC',
    entity_id: 'NC-2026-0001',
    entity_name: 'Broken Needle Fragment',
    related_nc_id: 'NC-2026-0001',
    details: 'Physical verification passed. Needle logbook signed. Batch passed secondary metal detection. NC closed.',
    payload: { verifiedBy: 'Priya Sharma', status: 'Closed', resolutionTimeHours: 1.8 },
    ip_address: '192.168.1.45',
    is_immutable: true,
    tamper_hash: '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae',
    created_at: new Date(Date.now() - 3600000 * 0.9).toISOString(),
  },
  {
    id: 'evt-109',
    user_id: 'unknown',
    user_name: 'Unknown Caller',
    user_role: 'GUEST',
    action: 'AUTH_LOGIN_FAILED',
    action_label: 'Failed Login Attempt: Bad Password',
    category: 'SECURITY',
    severity: 'WARNING',
    entity_type: 'AUTH',
    entity_id: 'SUP-002',
    entity_name: 'Failed Authentication',
    details: 'Repeated invalid password attempt for employee ID SUP-002 from remote terminal.',
    payload: { identifier: 'SUP-002', reason: 'INVALID_CREDENTIALS', attemptCount: 1 },
    ip_address: '192.168.1.88',
    is_immutable: true,
    tamper_hash: 'fcde2b2edba56bf408686f337b3b7332074f04ecf166f707519b4a534747480f',
    created_at: new Date(Date.now() - 1800000).toISOString(),
  },
  {
    id: 'evt-110',
    user_id: 'admin-001',
    user_name: 'Administrator',
    user_role: 'ADMIN',
    action: 'DEPT_CREATED',
    action_label: 'Plant Department Provisioned',
    category: 'DEPARTMENT',
    severity: 'SUCCESS',
    entity_type: 'DEPARTMENT',
    entity_id: 'FIN',
    entity_name: 'Finishing & Packing',
    details: 'Provisioned new plant division Finishing & Packing (FIN) with 45 assigned personnel.',
    payload: { code: 'FIN', manager: 'Anand Varma', headcount: 45 },
    ip_address: '192.168.1.10',
    is_immutable: true,
    tamper_hash: 'b10a8db164e0754105b7a99be72e3fe5',
    created_at: new Date(Date.now() - 900000).toISOString(),
  },
  {
    id: 'evt-111',
    user_id: 'admin-001',
    user_name: 'Administrator',
    user_role: 'ADMIN',
    action: 'COMPLIANCE_CONFIG_UPDATED',
    action_label: 'SLA & Compliance Thresholds Updated',
    category: 'SYSTEM',
    severity: 'INFO',
    entity_type: 'SYSTEM',
    entity_id: 'CFG-THRESHOLDS',
    entity_name: 'Compliance Config',
    details: 'Quality score thresholds set: Green >= 90%, Amber 75-89%, Red < 75%. Enforcing ISO 9001:2015 rules.',
    payload: { highThreshold: 90, moderateThreshold: 75, updatedBy: 'Administrator' },
    ip_address: '192.168.1.10',
    is_immutable: true,
    tamper_hash: 'a256956f87d57b3f9824',
    created_at: new Date(Date.now() - 300000).toISOString(),
  },
];
