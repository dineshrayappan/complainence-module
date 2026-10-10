// In-Memory state for offline development, serverless cold-starts, or cloud deployment fallback
const initialUsers = [
  {
    _id: '6ab26b3053ceb237bcda4f74',
    id: '6ab26b3053ceb237bcda4f74',
    employeeId: 'ADM-001',
    name: 'Anil Mehta',
    email: 'admin@factory.com',
    password: 'admin123',
    role: 'ADMIN',
    department: 'Plant Operations & Executive Oversight',
    designation: 'General Operations Director',
    mobileNumber: '+91 98000 11223',
    isActive: true,
  },
  {
    _id: '6ab21322cd50706ee2a84632',
    id: '6ab21322cd50706ee2a84632',
    employeeId: 'AUD-001',
    name: 'Pooja Sharma',
    email: 'auditor@factory.com',
    password: 'auditor123',
    role: 'AUDITOR',
    department: 'Central Quality Audit',
    designation: 'Senior QA Auditor',
    mobileNumber: '+91 98765 43210',
    isActive: true,
  },
  {
    _id: '6ab270104aa078bdcc354bab',
    id: '6ab270104aa078bdcc354bab',
    employeeId: 'AUD-002',
    name: 'Dinesh Rayappan',
    email: 'dineshrayappan.r@gmail.com',
    password: 'auditor123',
    role: 'AUDITOR',
    department: 'Quality Assurance',
    designation: 'Lead Quality Auditor',
    mobileNumber: '+91 98765 43211',
    isActive: true,
  },
  {
    _id: '6aca062dc48db203d719a558',
    id: '6aca062dc48db203d719a558',
    employeeId: 'ALL-001',
    name: 'Master QA Director',
    email: 'all@factory.com',
    password: 'master123',
    role: 'ADMIN',
    department: 'Executive Operations',
    designation: 'Universal Multi-Role Director',
    mobileNumber: '+91 99999 00000',
    isActive: true,
    isUniversal: true,
    hasAllRoles: true,
  },
  {
    _id: '6ac9ece4c48db203d719a557',
    id: '6ac9ece4c48db203d719a557',
    employeeId: 'SUP-001',
    name: 'Ramesh Patel',
    email: 'supervisor@factory.com',
    password: 'supervisor123',
    role: 'ACTION_PERSON',
    department: 'Production',
    designation: 'Floor Supervisor',
    mobileNumber: '+91 98111 22334',
    isActive: true,
  },
  {
    _id: '6ab21322cd50706ee2a84637',
    id: '6ab21322cd50706ee2a84637',
    employeeId: 'SUP-101',
    name: 'Mohammad Arif',
    email: 'arif@factory.com',
    password: 'supervisor123',
    role: 'ACTION_PERSON',
    department: 'Production',
    designation: 'Sewing Line 1 In-Charge',
    mobileNumber: '+91 98111 22335',
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
      const uName = (u.name || '').toLowerCase();

      if (uEmail === term || uEmp === term) return true;
      if (term === 'admin' && (uEmp === 'adm-001' || uRole === 'admin' || uEmail.startsWith('admin@'))) return true;
      if (term === 'auditor' && (uEmp === 'aud-001' || uRole === 'auditor' || uEmail.startsWith('auditor@'))) return true;
      if (term === 'dinesh' && (uEmp === 'aud-002' || uEmail.includes('dinesh') || uName.includes('dinesh'))) return true;
      if (term === 'supervisor' && (uEmp === 'sup-001' || uRole === 'action_person' || uEmail.startsWith('supervisor@'))) return true;
      if ((term === 'master' || term === 'all') && (uEmp === 'all-001' || uEmail.startsWith('all@'))) return true;
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
    const newTicket = {
      _id: data._id || data.id || `cmp-${Date.now()}`,
      complaintId: data.complaintId || `CMP-${Math.floor(10000 + Math.random() * 90000)}`,
      ...data,
      status: data.status || 'Assigned',
      timeline: data.timeline || [
        {
          action: 'CREATED',
          performedBy: data.createdBy,
          notes: '',
          timestamp: new Date(),
        },
      ],
      createdAt: data.createdAt || new Date(),
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
    const idx = mockComplaints.findIndex(
      (c) => String(c._id) === s || String(c.id) === s || String(c.complaintId) === s
    );
    if (idx !== -1) {
      mockComplaints[idx] = { ...mockComplaints[idx], ...updates };
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

let mockTasks = [];

let mockAudits = [];


let complianceThresholds = {
  highThreshold: 90,     // >= 90% is Green
  moderateThreshold: 75, // 75 - 89% is Amber, < 75% is Red
  updatedAt: new Date().toISOString(),
  updatedBy: 'Administrator',
};
