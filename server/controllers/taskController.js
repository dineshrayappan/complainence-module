const { isMongoConnected } = require('../config/db');
const ComplianceTask = require('../models/ComplianceTask');
const Complaint = require('../models/Complaint');
const User = require('../models/User');
const Audit = require('../models/Audit');
const mockStore = require('../config/mockStore');
const {
  getDailyAttendanceMap,
  evaluateUserDailyAttendance,
  getTodayISTString,
} = require('../utils/attendanceHelper');
const { toBase64DataUrl } = require('../utils/base64Helper');

/**
 * Compliance Tasks
 * ----------------
 * Recurring, per-user scheduled work (fire safety, PPE, payroll review).
 * Distinct from NC complaints: a task is work to PERFORM, an NC is a defect
 * FOUND. Same due-date concern that drives the complaint register, so the
 * same derived-condition pattern is reused here rather than storing it.
 *
 * Task state is derived on read, never persisted:
 *   Completed | Overdue | Due Today | Upcoming
 */

const RECURRENCE_STEPS = {
  DAILY: (d) => d.setDate(d.getDate() + 1),
  WEEKLY: (d) => d.setDate(d.getDate() + 7),
  MONTHLY: (d) => d.setMonth(d.getMonth() + 1),
  QUARTERLY: (d) => d.setMonth(d.getMonth() + 3),
};

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];
const RECURRENCES = ['NONE', ...Object.keys(RECURRENCE_STEPS)];

// Midnight today, local time — "Due Today" means the calendar day, not 24h.
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const deriveState = (task, now = new Date()) => {
  if (task.status === 'Completed') return 'Completed';
  const due = new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return 'Upcoming';
  const todayStart = startOfToday();
  if (due < todayStart) return 'Overdue';
  const tomorrow = new Date(todayStart);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (due < tomorrow) return 'Due Today';
  return 'Upcoming';
};

/** Advance a due date by one recurrence step. Month overflow (31 Jan + 1mo) is
 *  handled by setMonth rolling into the next month, which is the expected
 *  behaviour for a monthly inspection. */
const nextDueDate = (from, recurrence) => {
  const step = RECURRENCE_STEPS[recurrence];
  if (!step) return null;
  const d = new Date(from);
  step(d);
  return d;
};

// Cache for live work tracking metadata (start times, who started, completion proofs)
const taskWorkMetadataStore = new Map();

const embedTaskMeta = (description, meta) => {
  const cleanDesc = (description || '').replace(/\s*<!-- TASK_META:[\s\S]*?-->/g, '').trim();
  return `${cleanDesc}\n\n<!-- TASK_META:${JSON.stringify(meta)} -->`.trim();
};

const extractTaskMeta = (task) => {
  if (!task) return {};
  const taskId = String(task.id || task._id || '');
  const cached = taskId ? taskWorkMetadataStore.get(taskId) : null;
  if (cached) return cached;

  let meta = {};
  if (task.description && typeof task.description === 'string') {
    const match = task.description.match(/<!-- TASK_META:([\s\S]*?)-->/);
    if (match) {
      try {
        meta = JSON.parse(match[1]);
      } catch (e) {}
    }
  }

  // Also read from assignedTo JSONB column (persisted directly in MongoDB)
  if (task.assignedTo && typeof task.assignedTo === 'object') {
    if (task.assignedTo.firstCompleter && !meta.firstCompleter) meta.firstCompleter = task.assignedTo.firstCompleter;
    if (task.assignedTo.completedAt && !meta.completedAt) meta.completedAt = task.assignedTo.completedAt;
    if (task.assignedTo.completedBy && !meta.completedBy) meta.completedBy = task.assignedTo.completedBy;
    if (task.assignedTo.startedAt && !meta.startedAt) meta.startedAt = task.assignedTo.startedAt;
    if (task.assignedTo.startedBy && !meta.startedBy) meta.startedBy = task.assignedTo.startedBy;
    if (Array.isArray(task.assignedTo.activeWorkers) && (!meta.activeWorkers || meta.activeWorkers.length === 0)) {
      meta.activeWorkers = task.assignedTo.activeWorkers;
    }
    if (task.assignedTo.proofPhoto && !meta.proofPhoto) meta.proofPhoto = task.assignedTo.proofPhoto;
    if (task.assignedTo.proofNotes && !meta.proofNotes) meta.proofNotes = task.assignedTo.proofNotes;
    if (task.assignedTo.workStatus && !meta.workStatus) meta.workStatus = task.assignedTo.workStatus;
  }

  if (taskId && Object.keys(meta).length > 0) {
    taskWorkMetadataStore.set(taskId, meta);
  }
  return meta;
};

const enrichTaskWithMeta = (task, now = new Date()) => {
  if (!task) return null;
  const meta = extractTaskMeta(task);
  const cleanDesc = (task.description || '').replace(/\s*<!-- TASK_META:[\s\S]*?-->/g, '').trim();

  const status = task.status || 'Pending';
  const workStatus =
    meta.workStatus ||
    task.workStatus ||
    (status === 'Completed' ? 'COMPLETED' : status === 'In Progress' ? 'IN_PROGRESS' : 'PENDING');

  const assignedToObj = task.assignedTo && typeof task.assignedTo === 'object' ? task.assignedTo : {};

  const activeWorkers = meta.activeWorkers || task.activeWorkers || assignedToObj.activeWorkers || [];
  const firstCompleter = meta.firstCompleter || task.firstCompleter || assignedToObj.firstCompleter || null;
  const completedAt = meta.completedAt || task.completedAt || assignedToObj.completedAt || null;
  const completedBy = meta.completedBy || task.completedBy || assignedToObj.completedBy || null;

  let workNotice = '';
  if (status === 'Completed' || workStatus === 'COMPLETED' || completedAt) {
    const winner = firstCompleter || completedBy || assignedToObj;
    const timeStr = completedAt ? new Date(completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    workNotice = `✓ Completed by 🏆 ${winner?.name || 'Assigned Worker'} (${winner?.employeeId || ''})${timeStr ? ` at ${timeStr}` : ''}`;
  } else if (Array.isArray(activeWorkers) && activeWorkers.length > 0) {
    const workerNames = activeWorkers.map((w) => `${w.name} (${w.employeeId})`).join(', ');
    workNotice = `⚡ Active: ${workerNames} currently working. First to submit valid proof wins!`;
  } else if (assignedToObj.employeeId === 'DEPT-POOL') {
    workNotice = '🌟 Open to Department Pool: Any eligible department employee can start work.';
  } else if (assignedToObj.name) {
    workNotice = `Assigned to ${assignedToObj.name} (${assignedToObj.employeeId || ''})`;
  }

  const enriched = {
    ...task,
    _id: task.id || task._id,
    description: cleanDesc,
    workStatus,
    startedAt: meta.startedAt || task.startedAt || assignedToObj.startedAt || null,
    startedBy: meta.startedBy || task.startedBy || assignedToObj.startedBy || null,
    activeWorkers,
    firstCompleter,
    completedAt,
    completedBy,
    proofPhoto: meta.proofPhoto || task.proofPhoto || assignedToObj.proofPhoto || null,
    proofNotes: meta.proofNotes || task.proofNotes || assignedToObj.proofNotes || null,
    workNotice,
  };

  enriched.state = deriveState(enriched, now);
  return enriched;
};

const formatTask = (task, now = new Date()) => {
  if (!task) return null;
  return enrichTaskWithMeta(task, now);
};

/** Shared across every route: ADMIN and AUDITOR see the whole plant, everyone
 *  else sees only what is assigned to them or their department. */
const isElevated = (user) =>
  user?.role === 'ADMIN' || user?.role === 'AUDITOR' ||
  user?.employeeId === 'ALL-001' || user?.email === 'all@factory.com' ||
  user?.isUniversal || user?.hasAllRoles;

const applyVisibility = (tasks, user) => {
  if (isElevated(user)) return tasks;
  const userDept = (user?.department || '').trim().toLowerCase();
  const uEmp = (user?.employeeId || '').toUpperCase();
  const uId = String(user?.id || user?._id || '');

  return tasks.filter((t) => {
    // 1. Directly assigned
    if (
      t.assignedTo?.employeeId === user?.employeeId ||
      t.assignedTo?.userId === (user?.id || user?._id) ||
      t.assignedTo?.email === user?.email
    ) {
      return true;
    }
    // 2. Department task: any employee in the same department is eligible to view & work on it
    if (userDept && (t.department || '').trim().toLowerCase() === userDept) {
      return true;
    }
    // 3. User is an active worker who started working on this task
    if (
      Array.isArray(t.activeWorkers) &&
      t.activeWorkers.some(
        (w) => (w.employeeId && w.employeeId.toUpperCase() === uEmp) || (w.userId && String(w.userId) === uId)
      )
    ) {
      return true;
    }
    return false;
  });
};

const matchesFilter = (task, state, department) => {
  if (state && state !== 'all') {
    if (state === 'pending') {
      if (deriveState(task) === 'Completed') return false;
    } else if (deriveState(task) !== state) {
      return false;
    }
  }
  if (department && task.department !== department) return false;
  return true;
};

// @desc    List compliance tasks visible to the caller
// @route   GET /api/tasks
// @access  Private
const getTasks = async (req, res) => {
  try {
    const { state, department, unitId } = req.query;
    const targetUnit = (unitId || (req.isCompanyAdmin ? req.activeUnitId : req.user?.unitId) || '').toString().trim().toUpperCase();

    let taskFilter = {};
    let complaintFilter = { isDeleted: { $ne: true } };

    if (targetUnit && targetUnit !== 'ALL') {
      if (targetUnit === 'UNASSIGNED') {
        const unassignedOr = {
          $or: [{ unitId: null }, { unitId: '' }, { unitId: 'UNASSIGNED' }, { unitId: { $exists: false } }],
        };
        taskFilter = { ...unassignedOr };
        complaintFilter = { isDeleted: { $ne: true }, ...unassignedOr };
      } else {
        taskFilter = { unitId: targetUnit };
        complaintFilter = { isDeleted: { $ne: true }, unitId: targetUnit };
      }
    }

    let tasks = [];
    if (isMongoConnected()) {
      try {
        const data = await ComplianceTask.find(taskFilter).sort({ createdAt: -1 }).lean();
        tasks = (data || []).map((t) => ({ ...t, id: t._id ? t._id.toString() : t.id }));
      } catch (dbErr) {
        console.warn('[TaskController:getTasks] MongoDB fallback:', dbErr.message);
        tasks = mockStore.getTasks();
      }
    } else {
      tasks = mockStore.getTasks();
    }

    // Also include active / open department NCs so supervisors can view & manage them in Department Work Operations
    let complaints = [];
    if (isMongoConnected()) {
      try {
        const cData = await Complaint.find(complaintFilter).sort({ createdAt: -1 }).lean();
        if (cData) complaints = cData.map((c) => ({ ...c, id: c._id ? c._id.toString() : c.id }));
      } catch (e) {}
    } else {
      complaints = mockStore.getComplaints().filter((c) => !c.isDeleted);
    }

    const ncTasks = complaints.map((c) => {
      const isDone = ['CAP Submitted', 'Under Review', 'Verified', 'Closed', 'Under Verification'].includes(c.status);
      const isBusy = c.status === 'In Progress';
      return {
        id: c.complaintId || c._id?.toString() || c.id,
        _id: c._id?.toString() || c.id || c.complaintId,
        complaintId: c.complaintId,
        title: `NC: ${c.complaintId} — ${c.category || 'Floor Defect'}`,
        department: c.department,
        description: c.findingDescription || c.description || 'Non-conformance rectification',
        priority: c.priority || c.riskSeverity || 'HIGH',
        dueDate: c.deadlineTimestamp || c.targetDate || c.createdAt,
        status: isDone ? 'Completed' : isBusy ? 'In Progress' : 'Pending',
        workStatus: isDone ? 'COMPLETED' : isBusy ? 'IN_PROGRESS' : 'PENDING',
        startedAt: c.startedAt || null,
        startedBy: c.startedBy || null,
        completedAt: c.actualCompletedAt || null,
        completedBy: c.completedBy || c.assignedTo || null,
        proofPhoto: c.afterPhoto || null,
        proofNotes: c.actionNotes || null,
        assignedTo: c.assignedTo || {},
        isNC: true,
      };
    });

    const combined = [...tasks, ...ncTasks];
    const visible = applyVisibility(combined, req.user);
    const now = new Date();
    const filtered = visible
      .filter((t) => matchesFilter(t, state, department))
      .map((t) => formatTask(t, now))
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    res.json({
      success: true,
      tasks: filtered,
      counts: {
        total: filtered.length,
        overdue: filtered.filter((t) => t.state === 'Overdue').length,
        dueToday: filtered.filter((t) => t.state === 'Due Today').length,
        completed: filtered.filter((t) => t.state === 'Completed').length,
      },
    });
  } catch (error) {
    console.error('[TaskController:getTasks] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to load tasks.', error: error.message });
  }
};

// @desc    Create a scheduled compliance task
// @route   POST /api/tasks
// @access  Private (ADMIN, AUDITOR)
const createTask = async (req, res) => {
  try {
    const { title, department, description, dueDate, recurrence, priority, assignedToUserId, unitId, unitName } = req.body;

    if (!title || !dueDate) {
      return res.status(400).json({
        success: false,
        message: 'Task title and due date are required.',
      });
    }
    if (isNaN(new Date(dueDate).getTime())) {
      return res.status(400).json({ success: false, message: 'Due date is not a valid date.' });
    }

    const rec = (recurrence || 'NONE').toUpperCase();
    if (!RECURRENCES.includes(rec)) {
      return res.status(400).json({ success: false, message: `Recurrence must be one of: ${RECURRENCES.join(', ')}` });
    }
    const pri = (priority || 'MEDIUM').toUpperCase();
    if (!PRIORITIES.includes(pri)) {
      return res.status(400).json({ success: false, message: `Priority must be one of: ${PRIORITIES.join(', ')}` });
    }

    // Resolve target unit for this task
    const resolvedUnitId = (unitId || (req.activeUnitId !== 'ALL' ? req.activeUnitId : null) || req.user?.unitId || '').toString().trim().toUpperCase();
    const resolvedUnitName = unitName || (resolvedUnitId === 'UNIT-1' ? 'Unit 1' : resolvedUnitId === 'UNIT-2' ? 'Unit 2' : resolvedUnitId || '');

    // Resolve the assignee: explicit user, department pool, else self.
    let assignedTo = null;
    const lookupId = assignedToUserId || req.body.assignedToEmployeeId;

    if (lookupId === 'DEPT_POOL' || lookupId === 'ALL_WORKERS') {
      assignedTo = {
        userId: '',
        employeeId: 'DEPT-POOL',
        name: `${department || 'Department'} (Open to All Department Workers)`,
        department: department || 'Central Quality Audit',
        unitId: resolvedUnitId && resolvedUnitId !== 'ALL' ? resolvedUnitId : null,
        isDepartmentPool: true,
      };
    } else {
      let owner = null;
      if (lookupId && isMongoConnected()) {
        try {
          const query = {
            $or: [{ employeeId: lookupId }, { email: lookupId }],
          };
          if (lookupId && typeof lookupId === 'string' && lookupId.match(/^[0-9a-fA-F]{24}$/)) {
            query.$or.unshift({ _id: lookupId });
          }
          const found = await User.findOne(query).lean();
          if (found) owner = { ...found, id: found._id ? found._id.toString() : found.id };
        } catch (e) {
          console.warn('[TaskController:createTask] assignee lookup notice:', e.message);
        }
      }
      if (!owner) owner = mockStore.findUserById(lookupId) || mockStore.getUsers().find((u) => u.employeeId === lookupId);
      if (!owner) owner = req.user;

      // Strict Cross-Unit Assignment Guard:
      // Unit 1 tasks must not be assigned to Unit 2 members and vice versa.
      if (owner && resolvedUnitId && resolvedUnitId !== 'ALL') {
        const ownerUnit = (owner.unitId || '').toString().trim().toUpperCase();
        if (ownerUnit && ownerUnit !== resolvedUnitId) {
          return res.status(400).json({
            success: false,
            message: `Cross-Unit Assignment Blocked: Member '${owner.name}' belongs to ${owner.unitName || ownerUnit} and cannot be assigned to a ${resolvedUnitName || resolvedUnitId} task. Unit 1 tasks must not be assigned to Unit 2 members and vice versa.`,
          });
        }
      }

      assignedTo = {
        userId: owner.id || owner._id || '',
        employeeId: owner.employeeId || '',
        name: owner.name || '',
        department: owner.department || department || '',
        unitId: owner.unitId || resolvedUnitId || null,
        unitName: owner.unitName || resolvedUnitName || '',
      };
    }

    const payload = {
      title: String(title).trim(),
      department: department || 'Central Quality Audit',
      description: description || '',
      assignedTo,
      unitId: resolvedUnitId && resolvedUnitId !== 'ALL' ? resolvedUnitId : null,
      unitName: resolvedUnitName,
      dueDate: new Date(dueDate).toISOString(),
      status: 'Pending',
      recurrence: rec,
      priority: pri,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (isMongoConnected()) {
      try {
        const created = await ComplianceTask.create(payload);
        if (created) {
          const taskObj = { ...created.toObject(), id: created._id.toString() };
          mockStore.createTask(taskObj);
          return res.status(201).json({ success: true, message: 'Compliance task scheduled.', task: formatTask(taskObj) });
        }
      } catch (dbErr) {
        console.warn('[TaskController:createTask] MongoDB insert failed, using in-memory store:', dbErr.message);
      }
    }

    const fallback = mockStore.createTask(payload);
    res.status(201).json({ success: true, message: 'Compliance task scheduled.', task: formatTask(fallback) });
  } catch (error) {
    console.error('[TaskController:createTask] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to create task.', error: error.message });
  }
};

// @desc    Update a task's fields (title, dates, recurrence, assignment)
// @route   PUT /api/tasks/:id
// @access  Private (ADMIN, AUDITOR, or the assignee)
const updateTask = async (req, res) => {
  try {
    const task = await findTask(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }
    if (!canManage(req.user, task)) {
      return res.status(403).json({ success: false, message: 'You can only edit tasks assigned to you.' });
    }

    const { title, description, dueDate, recurrence, priority, department, assignedToUserId, assignedToEmployeeId } = req.body;
    const updates = { updatedAt: new Date().toISOString() };

    if (title !== undefined) updates.title = String(title).trim();
    if (description !== undefined) updates.description = description;
    if (department !== undefined) updates.department = department;
    if (dueDate !== undefined) {
      if (isNaN(new Date(dueDate).getTime())) {
        return res.status(400).json({ success: false, message: 'Due date is not a valid date.' });
      }
      updates.dueDate = new Date(dueDate).toISOString();
    }
    if (recurrence !== undefined) {
      const rec = String(recurrence).toUpperCase();
      if (!RECURRENCES.includes(rec)) {
        return res.status(400).json({ success: false, message: `Recurrence must be one of: ${RECURRENCES.join(', ')}` });
      }
      updates.recurrence = rec;
    }
    if (priority !== undefined) {
      const pri = String(priority).toUpperCase();
      if (!PRIORITIES.includes(pri)) {
        return res.status(400).json({ success: false, message: `Priority must be one of: ${PRIORITIES.join(', ')}` });
      }
      updates.priority = pri;
    }

    const lookupId = assignedToUserId || assignedToEmployeeId;
    if (lookupId !== undefined && lookupId !== '') {
      let owner = null;
      if (isMongoConnected()) {
        try {
          const query = {
            $or: [{ employeeId: lookupId }, { email: lookupId }],
          };
          if (lookupId && typeof lookupId === 'string' && lookupId.match(/^[0-9a-fA-F]{24}$/)) {
            query.$or.unshift({ _id: lookupId });
          }
          const found = await User.findOne(query).lean();
          if (found) owner = { ...found, id: found._id ? found._id.toString() : found.id };
        } catch (e) {
          console.warn('[TaskController:updateTask] assignee lookup notice:', e.message);
        }
      }
      if (!owner) owner = mockStore.findUserById(lookupId) || mockStore.getUsers().find((u) => u.employeeId === lookupId || u.id === lookupId || u._id === lookupId);
      if (owner) {
        updates.assignedTo = {
          userId: owner.id || owner._id || '',
          employeeId: owner.employeeId || '',
          name: owner.name || '',
          department: owner.department || updates.department || task.department || '',
        };
      }
    }

    // If task is completed, lock assignedTo, status, firstCompleter, completedBy, completedAt
    if (task.status === 'Completed' || task.workStatus === 'COMPLETED' || task.completedAt) {
      delete updates.assignedTo;
      delete updates.status;
    }

    if (isMongoConnected()) {
      try {
        const query = { $or: [{ id: task.id }] };
        if (task.id && typeof task.id === 'string' && task.id.match(/^[0-9a-fA-F]{24}$/)) {
          query.$or.unshift({ _id: task.id });
        }
        const updated = await ComplianceTask.findOneAndUpdate(query, updates, { new: true }).lean();
        if (updated) {
          const taskObj = { ...updated, id: updated._id ? updated._id.toString() : updated.id };
          mockStore.updateTask(task.id, updates);
          return res.json({ success: true, message: 'Task updated.', task: formatTask(taskObj) });
        }
      } catch (dbErr) {
        console.warn('[TaskController:updateTask] MongoDB update failed, using in-memory store:', dbErr.message);
      }
    }

    res.json({ success: true, message: 'Task updated.', task: formatTask(mockStore.updateTask(task.id, updates)) });
  } catch (error) {
    console.error('[TaskController:updateTask] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to update task.', error: error.message });
  }
};

// @desc    Start work on a task (employee begins working)
// @route   POST /api/tasks/:id/start
// @access  Private (Assignee, ADMIN, AUDITOR, or any authorized department employee)
const startTask = async (req, res) => {
  try {
    const task = await findTask(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }

    // 1. Strict Department Authorization Check:
    // Only authorized employees belonging to the task's department (or elevated) can start work.
    const userDept = (req.user?.department || '').trim().toLowerCase();
    const taskDept = (task.department || '').trim().toLowerCase();
    const uEmp = (req.user?.employeeId || '').toUpperCase();
    const uId = String(req.user?.id || req.user?._id || '');
    const uEmail = (req.user?.email || '').toLowerCase();

    const isDirectlyAssigned =
      (uEmp && (task.assignedTo?.employeeId || '').toUpperCase() === uEmp) ||
      (uId && String(task.assignedTo?.userId || '') === uId) ||
      (uEmail && (task.assignedTo?.email || '').toLowerCase() === uEmail);

    const isDeptWorker = userDept && taskDept && userDept === taskDept;

    if (!isElevated(req.user) && !isDirectlyAssigned && !isDeptWorker) {
      return res.status(403).json({
        success: false,
        code: 'UNAUTHORIZED_DEPARTMENT',
        message: `Unauthorized Action: You belong to the "${req.user?.department || 'Unassigned'}" department. Only authorized employees of the "${task.department}" department can start work on this task.`,
      });
    }

    // Unit Isolation Check: non-company-admin cannot work on another unit's task
    if (!req.isCompanyAdmin && task.unitId && req.user?.unitId && task.unitId.toUpperCase() !== req.user.unitId.toUpperCase()) {
      return res.status(403).json({
        success: false,
        code: 'UNAUTHORIZED_UNIT',
        message: `Cross-Unit Violation: This task belongs to ${task.unitName || task.unitId}, but your account is assigned to ${req.user.unitName || req.user.unitId}. You cannot access or work on another unit's tasks.`,
      });
    }

    // 2. Already completed guard:
    if (task.status === 'Completed' || task.workStatus === 'COMPLETED' || task.completedAt) {
      const winner = task.firstCompleter || task.completedBy;
      return res.status(400).json({
        success: false,
        code: 'ALREADY_COMPLETED',
        message: `This task was already completed by ${winner?.name || 'another employee'} (${winner?.employeeId || ''}).`,
        firstCompleter: winner,
      });
    }

    // 3. Prevent already busy employees from taking on duplicate active tasks:
    // Check if this employee is ALREADY actively working on another incomplete task
    let allTasks = [];
    if (isMongoConnected()) {
      try {
        const data = await ComplianceTask.find().lean();
        if (data) allTasks = data.map((t) => ({ ...t, id: t._id ? t._id.toString() : t.id }));
      } catch (e) {}
    }
    if (!allTasks || allTasks.length === 0) allTasks = mockStore.getTasks();
    allTasks = (allTasks || []).map((t) => enrichTaskWithMeta(t));

    const existingBusyTask = allTasks.find((t) => {
      if (String(t.id) === String(task.id)) return false;
      if (t.status === 'Completed' || t.workStatus === 'COMPLETED' || t.completedAt) return false;
      const isWorker = Array.isArray(t.activeWorkers) && t.activeWorkers.some(
        (w) => (w.employeeId && (w.employeeId || '').toUpperCase() === uEmp) || (w.userId && String(w.userId) === uId)
      );
      const startedEmp = (t.startedBy?.employeeId || '').toUpperCase();
      const startedId = String(t.startedBy?.userId || '');
      const isStarter = (uEmp && startedEmp === uEmp) || (uId && startedId === uId);
      return isWorker || isStarter;
    });

    if (existingBusyTask) {
      return res.status(400).json({
        success: false,
        code: 'EMPLOYEE_ALREADY_BUSY',
        message: `Cannot start work: You are already busy working on task "${existingBusyTask.title}". Please finish or complete your active task before starting another.`,
        activeTask: { id: existingBusyTask.id, title: existingBusyTask.title },
      });
    }

    const startedAt = new Date().toISOString();
    const currentWorker = {
      userId: req.user?.id || req.user?._id || '',
      employeeId: req.user?.employeeId || '',
      name: req.user?.name || '',
      department: req.user?.department || task.department || '',
      startedAt,
    };

    if (task.isNC) {
      const now = new Date();
      if (isMongoConnected()) {
        try {
          const query = { $or: [{ complaintId: task.complaintId || task.id }] };
          const cur = await Complaint.findOne(query);
          if (cur) {
            cur.status = 'In Progress';
            cur.startedAt = now;
            cur.startedBy = currentWorker;
            if (!cur.assignedTo?.name) cur.assignedTo = currentWorker;
            await cur.save();
            mockStore.updateComplaint(cur._id.toString(), cur.toObject());
          }
        } catch (e) {}
      }
      mockStore.updateComplaint(task.complaintId || task.id, {
        status: 'In Progress',
        startedAt: now.toISOString(),
        startedBy: currentWorker,
      });
      return res.json({
        success: true,
        message: `Work started on NC defect by ${currentWorker.name}. Status updated to In Progress / Busy.`,
        task: { ...task, status: 'In Progress', workStatus: 'IN_PROGRESS', startedAt: now.toISOString(), startedBy: currentWorker },
      });
    }

    const existingMeta = extractTaskMeta(task) || {};
    const existingWorkers = Array.isArray(existingMeta.activeWorkers) ? existingMeta.activeWorkers : [];
    
    // Track all eligible workers currently working on this task
    const isAlreadyWorking = existingWorkers.some((w) => (w.employeeId || '').toUpperCase() === uEmp);
    const updatedWorkers = isAlreadyWorking
      ? existingWorkers
      : [...existingWorkers, currentWorker];

    const meta = {
      ...existingMeta,
      workStatus: 'IN_PROGRESS',
      startedAt: task.startedAt || existingMeta.startedAt || startedAt,
      startedBy: task.startedBy || existingMeta.startedBy || currentWorker,
      activeWorkers: updatedWorkers,
    };

    const taskId = String(task.id || task._id);
    taskWorkMetadataStore.set(taskId, meta);
    const enrichedDescription = embedTaskMeta(task.description, meta);

    // Keep assignedTo JSONB in sync with active workers and startedAt for database persistence
    const updatedAssignedTo = {
      ...(task.assignedTo && typeof task.assignedTo === 'object' ? task.assignedTo : {}),
      startedAt: meta.startedAt,
      activeWorkers: updatedWorkers,
    };

    const safeUpdates = {
      status: 'In Progress',
      assignedTo: updatedAssignedTo,
      description: enrichedDescription,
      updatedAt: startedAt,
    };

    let updated = null;
    if (isMongoConnected()) {
      try {
        const query = { $or: [{ id: task.id }] };
        if (task.id && typeof task.id === 'string' && task.id.match(/^[0-9a-fA-F]{24}$/)) {
          query.$or.unshift({ _id: task.id });
        }
        const dbUpdated = await ComplianceTask.findOneAndUpdate(query, safeUpdates, { new: true }).lean();
        if (dbUpdated) updated = { ...dbUpdated, id: dbUpdated._id ? dbUpdated._id.toString() : dbUpdated.id };
      } catch (dbErr) {
        console.warn('[TaskController:startTask] MongoDB update notice:', dbErr.message);
      }
    }

    const mockUpdates = { ...safeUpdates, ...meta };
    if (!updated) {
      updated = mockStore.updateTask(task.id, mockUpdates);
      if (!updated) {
        updated = mockStore.createTask({ ...task, ...mockUpdates, id: task.id });
      }
    } else {
      mockStore.updateTask(task.id, mockUpdates);
    }

    const finalTask = enrichTaskWithMeta(updated || { ...task, ...mockUpdates });

    res.json({
      success: true,
      message: `Work started on task by ${currentWorker.name}. Status updated to In Progress / Busy.`,
      task: formatTask(finalTask),
    });
  } catch (error) {
    console.error('[TaskController:startTask] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to start task.', error: error.message });
  }
};

// @desc    Mark a task complete. First eligible employee to submit valid proof is awarded the completed task!
// @route   POST /api/tasks/:id/complete
// @access  Private (Assignee, ADMIN, AUDITOR, or any authorized department employee)
const completeTask = async (req, res) => {
  try {
    const task = await findTask(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }

    // 1. Strict Department Authorization Check:
    // Only authorized employees of the assigned department can submit proof and complete work.
    const userDept = (req.user?.department || '').trim().toLowerCase();
    const taskDept = (task.department || '').trim().toLowerCase();
    const uEmp = (req.user?.employeeId || '').toUpperCase();
    const uId = String(req.user?.id || req.user?._id || '');
    const uEmail = (req.user?.email || '').toLowerCase();

    const isDirectlyAssigned =
      (uEmp && (task.assignedTo?.employeeId || '').toUpperCase() === uEmp) ||
      (uId && String(task.assignedTo?.userId || '') === uId) ||
      (uEmail && (task.assignedTo?.email || '').toLowerCase() === uEmail);

    const isDeptWorker = userDept && taskDept && userDept === taskDept;

    if (!isElevated(req.user) && !isDirectlyAssigned && !isDeptWorker) {
      return res.status(403).json({
        success: false,
        code: 'UNAUTHORIZED_DEPARTMENT',
        message: `Unauthorized Action: You belong to the "${req.user?.department || 'Unassigned'}" department. Only authorized employees of the "${task.department}" department can submit proof or complete this task.`,
      });
    }

    // Unit Isolation Check: non-company-admin cannot submit proof for another unit's task
    if (!req.isCompanyAdmin && task.unitId && req.user?.unitId && task.unitId.toUpperCase() !== req.user.unitId.toUpperCase()) {
      return res.status(403).json({
        success: false,
        code: 'UNAUTHORIZED_UNIT',
        message: `Cross-Unit Violation: This task belongs to ${task.unitName || task.unitId}, but your account is assigned to ${req.user.unitName || req.user.unitId}. You cannot submit proof or complete another unit's tasks.`,
      });
    }

    // 2. Mandatory proof validation
    const { proofPhoto, proofNotes } = req.body || {};
    if (!proofPhoto || typeof proofPhoto !== 'string' || !proofPhoto.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Upload Required: Completion photo proof is mandatory before completing the task.',
      });
    }

    if (!proofNotes || typeof proofNotes !== 'string' || !proofNotes.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Completion details/notes are required before completing the task.',
      });
    }

    if (task.isNC) {
      const now = new Date();
      const currentWorker = {
        userId: req.user?.id || req.user?._id || '',
        employeeId: req.user?.employeeId || '',
        name: req.user?.name || '',
        department: req.user?.department || task.department || '',
      };
      const base64ProofPhoto = toBase64DataUrl(proofPhoto);
      if (isMongoConnected()) {
        try {
          const query = { $or: [{ complaintId: task.complaintId || task.id }] };
          const cur = await Complaint.findOne(query);
          if (cur) {
            cur.status = 'CAP Submitted';
            cur.actualCompletedAt = now;
            cur.afterPhoto = base64ProofPhoto;
            cur.actionNotes = proofNotes;
            cur.completedBy = currentWorker;
            await cur.save();
            mockStore.updateComplaint(cur._id.toString(), cur.toObject());
          }
        } catch (e) {}
      }
      mockStore.updateComplaint(task.complaintId || task.id, {
        status: 'CAP Submitted',
        actualCompletedAt: now.toISOString(),
        afterPhoto: base64ProofPhoto,
        actionNotes: proofNotes,
        completedBy: currentWorker,
      });
      return res.json({
        success: true,
        message: `NC defect resolution completed with verified proof by ${currentWorker.name}! Reflected to Live Work Operations.`,
        task: { ...task, status: 'Completed', workStatus: 'COMPLETED', completedAt: now.toISOString(), proofPhoto, proofNotes },
      });
    }

    const taskId = String(task.id || task._id);
    const existingMeta = extractTaskMeta(task) || {};

    // 3. Race-condition & Duplicate Completion Guard:
    // Prevent duplicate completion submissions from changing the first completer!
    if (
      task.status === 'Completed' ||
      task.workStatus === 'COMPLETED' ||
      task.completedAt ||
      existingMeta.workStatus === 'COMPLETED' ||
      existingMeta.completedAt ||
      existingMeta.firstCompleter ||
      task.assignedTo?.firstCompleter
    ) {
      const winner =
        task.firstCompleter ||
        existingMeta.firstCompleter ||
        task.assignedTo?.firstCompleter ||
        task.completedBy ||
        existingMeta.completedBy;

      const winnerName = winner?.name || 'Another employee';
      const winnerEmp = winner?.employeeId || '';
      const finishTime = winner?.completedAt || task.completedAt || existingMeta.completedAt;
      const formattedTime = finishTime ? new Date(finishTime).toLocaleTimeString() : 'earlier';

      return res.status(409).json({
        success: false,
        code: 'ALREADY_COMPLETED',
        message: `Task has already been completed by ${winnerName} ${winnerEmp ? `(${winnerEmp})` : ''} at ${formattedTime}. Only the first eligible employee to submit valid proof is awarded the completed task. The first completer is permanently recorded and cannot be overwritten.`,
        firstCompleter: winner,
        completedAt: finishTime,
      });
    }

    const completedAt = new Date().toISOString();
    const winningEmployee = {
      userId: req.user?.id || req.user?._id || '',
      employeeId: req.user?.employeeId || '',
      name: req.user?.name || '',
      department: req.user?.department || task.department || '',
      email: req.user?.email || '',
    };

    // 4. Automatically assign the task to that employee as the completed task owner & first completer
    const meta = {
      ...existingMeta,
      workStatus: 'COMPLETED',
      startedAt: task.startedAt || existingMeta.startedAt || completedAt,
      startedBy: task.startedBy || existingMeta.startedBy || winningEmployee,
      completedAt,
      completedBy: winningEmployee,
      firstCompleter: {
        ...winningEmployee,
        completedAt,
        isFirstCompleter: true,
      },
      proofPhoto: toBase64DataUrl(proofPhoto.trim()),
      proofNotes: proofNotes.trim(),
      activeWorkers: [], // Clear active workers once task is claimed & completed
    };

    taskWorkMetadataStore.set(taskId, meta);
    const enrichedDescription = embedTaskMeta(task.description, meta);

    // 5. Persist winning employee and all completion details persistently in database JSONB
    const persistentAssignedTo = {
      ...winningEmployee,
      startedAt: meta.startedAt,
      completedAt,
      completedBy: winningEmployee,
      firstCompleter: meta.firstCompleter,
      proofPhoto: proofPhoto.trim(),
      proofNotes: proofNotes.trim(),
      proofStatus: 'Verified / Uploaded',
    };

    const safeUpdates = {
      status: 'Completed',
      assignedTo: persistentAssignedTo, // AUTO-ASSIGN TO WINNING FIRST COMPLETER!
      description: enrichedDescription,
      updatedAt: completedAt,
    };

    let completed = null;
    if (isMongoConnected()) {
      try {
        const query = {
          status: { $ne: 'Completed' },
          $or: [{ id: task.id }],
        };
        if (task.id && typeof task.id === 'string' && task.id.match(/^[0-9a-fA-F]{24}$/)) {
          query.$or.unshift({ _id: task.id });
        }
        const dbUpdated = await ComplianceTask.findOneAndUpdate(query, safeUpdates, { new: true }).lean();
        if (dbUpdated) {
          completed = { ...dbUpdated, id: dbUpdated._id ? dbUpdated._id.toString() : dbUpdated.id };
        } else {
          const refreshedTask = await findTask(task.id);
          const winner = refreshedTask?.firstCompleter || refreshedTask?.completedBy;
          return res.status(409).json({
            success: false,
            code: 'ALREADY_COMPLETED',
            message: `Another employee (${winner?.name || 'Worker'} ${winner?.employeeId ? `[${winner.employeeId}]` : ''}) submitted completion proof moments before you! Only the first completer can claim this task.`,
            firstCompleter: winner,
          });
        }
      } catch (dbErr) {
        console.warn('[TaskController:completeTask] MongoDB update notice:', dbErr.message);
      }
    }

    const mockUpdates = { ...safeUpdates, ...meta };
    if (!completed) {
      // Check mockStore concurrency
      const currentInMock = mockStore.getTaskById(task.id);
      if (currentInMock && (currentInMock.status === 'Completed' || currentInMock.completedAt)) {
        return res.status(409).json({
          success: false,
          code: 'ALREADY_COMPLETED',
          message: `Task was just completed by ${currentInMock.completedBy?.name || 'another employee'}. The first completer is permanently recorded.`,
          firstCompleter: currentInMock.firstCompleter || currentInMock.completedBy,
        });
      }
      completed = mockStore.updateTask(task.id, mockUpdates);
      if (!completed) {
        completed = mockStore.createTask({ ...task, ...mockUpdates, id: task.id });
      }
    } else {
      mockStore.updateTask(task.id, mockUpdates);
    }

    // Rolling schedule: completing a recurring task books the next occurrence for the department pool
    let nextTask = null;
    if (task.recurrence && task.recurrence !== 'NONE') {
      const nextDue = nextDueDate(task.dueDate, task.recurrence);
      if (nextDue) {
        const nextPayload = {
          title: task.title,
          department: task.department,
          description: (task.description || '').replace(/\s*<!-- TASK_META:[\s\S]*?-->/g, '').trim(),
          assignedTo: {
            userId: '',
            employeeId: 'DEPT-POOL',
            name: `${task.department} (Open to All Department Workers)`,
            department: task.department,
            isDepartmentPool: true,
          },
          dueDate: nextDue.toISOString(),
          status: 'Pending',
          recurrence: task.recurrence,
          priority: task.priority,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        if (isMongoConnected()) {
          try {
            const nextDb = await ComplianceTask.create(nextPayload);
            if (nextDb) nextTask = { ...nextDb.toObject(), id: nextDb._id.toString() };
          } catch (dbErr) {
            console.warn('[TaskController:completeTask] Recurrence insert notice:', dbErr.message);
          }
        }
        if (!nextTask) nextTask = mockStore.createTask(nextPayload);
      }
    }

    const finalCompleted = enrichTaskWithMeta(completed || { ...task, ...mockUpdates });

    res.json({
      success: true,
      message: `🎉 Task successfully completed by ${winningEmployee.name}! Automatically assigned as the completed task owner and first completer.`,
      task: formatTask(finalCompleted),
      firstCompleter: winningEmployee,
      nextTask: nextTask ? formatTask(nextTask) : null,
    });
  } catch (error) {
    console.error('[TaskController:completeTask] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to complete task.', error: error.message });
  }
};

// @desc    Delete a task
// @route   DELETE /api/tasks/:id
// @access  Private (ADMIN, AUDITOR)
const deleteTask = async (req, res) => {
  try {
    const task = await findTask(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }
    if (!isElevated(req.user)) {
      return res.status(403).json({ success: false, message: 'Only administrators can delete tasks.' });
    }

    if (isMongoConnected()) {
      try {
        const query = { $or: [{ id: task.id }] };
        if (task.id && typeof task.id === 'string' && task.id.match(/^[0-9a-fA-F]{24}$/)) {
          query.$or.unshift({ _id: task.id });
        }
        await ComplianceTask.findOneAndDelete(query);
        mockStore.deleteTask(task.id);
        return res.json({ success: true, message: 'Task deleted.' });
      } catch (dbErr) {
        console.warn('[TaskController:deleteTask] MongoDB delete failed, using in-memory store:', dbErr.message);
      }
    }

    mockStore.deleteTask(task.id);
    res.json({ success: true, message: 'Task deleted.' });
  } catch (error) {
    console.error('[TaskController:deleteTask] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete task.', error: error.message });
  }
};

const formatWorkDuration = (start, end) => {
  if (!start) return '-';
  const startTime = new Date(start).getTime();
  if (isNaN(startTime) || startTime === 0) return '-';
  const endTime = end ? new Date(end).getTime() : Date.now();
  const diffMs = Math.max(0, endTime - startTime);
  const totalMins = Math.floor(diffMs / 60000);
  if (totalMins < 1) return '< 1m';
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
};

// @desc    Get live employee work status across departments (who is working, who is available, who completed first)
// @route   GET /api/tasks/live-status
// @access  Private (Authenticated users, Admin & Auditor oversight)
const getEmployeeWorkStatus = async (req, res) => {
  try {
    const { department, date } = req.query;
    const todayDate = date || getTodayISTString();
    const attendanceMap = await getDailyAttendanceMap(todayDate);
    const nowTime = new Date();

    // 1. Fetch all users
    let allUsers = [];
    if (isMongoConnected()) {
      try {
        const dbUsers = await User.find({ isActive: true }).select('name employeeId email role department designation isActive isPresent lastLoginAt lastLogoutAt unitId unitName assignedUnits').lean();
        if (dbUsers) allUsers = dbUsers.map((u) => ({ ...u, id: u._id.toString() }));
      } catch (e) {
        console.warn('[TaskController:getEmployeeWorkStatus] users fetch fallback:', e.message);
      }
    }
    if (!allUsers || allUsers.length === 0) {
      allUsers = mockStore.getUsers();
    }

    // Active workers only
    allUsers = allUsers.filter((u) => u.isActive !== false);

    // 2. Fetch all tasks
    let allTasks = [];
    if (isMongoConnected()) {
      try {
        const dbTasks = await ComplianceTask.find().lean();
        if (dbTasks) allTasks = dbTasks.map((t) => ({ ...t, id: t._id ? t._id.toString() : t.id }));
      } catch (e) {
        console.warn('[TaskController:getEmployeeWorkStatus] tasks fetch fallback:', e.message);
      }
    }
    if (!allTasks || allTasks.length === 0) {
      allTasks = mockStore.getTasks();
    }

    // Enrich all tasks with live tracking metadata (startedAt, workStatus, proof)
    allTasks = (allTasks || []).map((t) => enrichTaskWithMeta(t));

    // 2b. Fetch all Non-Conformance complaints so NC work reflects on Live Operations
    let allComplaints = [];
    if (isMongoConnected()) {
      try {
        const dbComplaints = await Complaint.find({ isDeleted: { $ne: true } }).lean();
        if (dbComplaints) allComplaints = dbComplaints.map((c) => ({ ...c, id: c._id ? c._id.toString() : c.id }));
      } catch (e) {
        console.warn('[TaskController:getEmployeeWorkStatus] complaints fetch fallback:', e.message);
      }
    }
    if (!allComplaints || allComplaints.length === 0) {
      allComplaints = mockStore.getComplaints().filter((c) => !c.isDeleted);
    }

    // Filter by unit if specified or active
    const activeUnit = (req.query?.unitId || (req.isCompanyAdmin ? req.activeUnitId : req.user?.unitId) || '').toString().trim().toUpperCase();

    if (activeUnit && activeUnit !== 'ALL') {
      if (activeUnit === 'UNASSIGNED') {
        allTasks = allTasks.filter((t) => !t.unitId || t.unitId === 'UNASSIGNED');
        allComplaints = allComplaints.filter((c) => !c.unitId || c.unitId === 'UNASSIGNED');
        allUsers = allUsers.filter((u) => !u.unitId || u.unitId === 'UNASSIGNED');
      } else {
        allTasks = allTasks.filter((t) => t.unitId && t.unitId.toUpperCase() === activeUnit);
        allComplaints = allComplaints.filter((c) => c.unitId && c.unitId.toUpperCase() === activeUnit);
        allUsers = allUsers.filter((u) => (u.unitId && u.unitId.toUpperCase() === activeUnit) || (Array.isArray(u.assignedUnits) && u.assignedUnits.includes(activeUnit)));
      }
    }

    // Filter by department if specified
    const targetDept = department && department !== 'ALL' ? department.trim().toLowerCase() : null;

    let targetUsers = allUsers;
    if (targetDept) {
      targetUsers = allUsers.filter((u) => (u.department || '').trim().toLowerCase() === targetDept);
    }

    // Map each user to their live status
    const employeeStatuses = targetUsers.map((user) => {
      const uEmp = (user.employeeId || '').toUpperCase();
      const uId = String(user.id || user._id || '');
      const uEmail = (user.email || '').toLowerCase();
      const uName = (user.name || '').toLowerCase();
      const userDept = (user.department || '').trim().toLowerCase();

      // Check if employee is actively working on a Non-Conformance (NC)
      const activeNC = allComplaints.find((c) => {
        if (c.status !== 'In Progress') return false;
        const startedEmp = (c.startedBy?.employeeId || '').toUpperCase();
        const startedId = String(c.startedBy?.userId || '');
        const assignedEmp = (c.assignedTo?.employeeId || '').toUpperCase();
        const assignedId = String(c.assignedTo?.userId || '');
        const assignedName = (c.assignedTo?.name || '').toLowerCase();

        const isStarter = (uEmp && startedEmp === uEmp) || (uId && startedId === uId);
        const isAssigned = (uEmp && assignedEmp === uEmp) || (uId && assignedId === uId) || (uName && assignedName === uName);
        return isStarter || isAssigned;
      });

      // 1. Is this employee actively working on any in-progress task?
      const activeTask = allTasks.find((t) => {
        if (t.status === 'Completed' || t.workStatus === 'COMPLETED' || t.completedAt) return false;
        // Check if user is in activeWorkers list
        const isWorker = Array.isArray(t.activeWorkers) && t.activeWorkers.some(
          (w) => (w.employeeId && (w.employeeId || '').toUpperCase() === uEmp) || (w.userId && String(w.userId) === uId)
        );
        const startedEmp = (t.startedBy?.employeeId || '').toUpperCase();
        const startedId = String(t.startedBy?.userId || '');
        const isStarter = (uEmp && startedEmp === uEmp) || (uId && startedId === uId);

        // Check if task is in progress and directly assigned to this employee
        const assignedEmp = (t.assignedTo?.employeeId || '').toUpperCase();
        const assignedId = String(t.assignedTo?.userId || '');
        const isInProgressAssigned =
          (t.status === 'In Progress' || t.workStatus === 'IN_PROGRESS') &&
          ((uEmp && assignedEmp === uEmp) || (uId && assignedId === uId));

        return isWorker || isStarter || isInProgressAssigned;
      });

      // 2. Check for tasks completed by this user
      const completedTasks = allTasks
        .filter((t) => {
          if (t.status !== 'Completed' && t.workStatus !== 'COMPLETED' && !t.completedAt) return false;
          const compEmp = (t.completedBy?.employeeId || '').toUpperCase();
          const compId = String(t.completedBy?.userId || '');
          const assignedEmp = (t.assignedTo?.employeeId || '').toUpperCase();
          const assignedId = String(t.assignedTo?.userId || '');
          return (uEmp && (compEmp === uEmp || assignedEmp === uEmp)) || (uId && (compId === uId || assignedId === uId));
        })
        .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));

      const completedNCs = allComplaints
        .filter((c) => {
          if (!['CAP Submitted', 'Under Review', 'Verified', 'Closed', 'Under Verification'].includes(c.status)) return false;
          const compEmp = (c.completedBy?.employeeId || c.startedBy?.employeeId || c.assignedTo?.employeeId || '').toUpperCase();
          const compId = String(c.completedBy?.userId || c.startedBy?.userId || c.assignedTo?.userId || '');
          const compName = (c.completedBy?.name || c.assignedTo?.name || '').toLowerCase();
          return (uEmp && compEmp === uEmp) || (uId && compId === uId) || (uName && compName === uName);
        })
        .sort((a, b) => new Date(b.actualCompletedAt || b.updatedAt || 0) - new Date(a.actualCompletedAt || a.updatedAt || 0));

      const latestCompletedTask = completedTasks[0] || null;
      const latestCompletedNC = completedNCs[0] || null;

      // 3. Open pending task eligible for this employee to start
      const openDeptTask = allTasks.find((t) => {
        if (t.status === 'Completed' || t.workStatus === 'COMPLETED' || t.completedAt) return false;
        const assignedEmp = (t.assignedTo?.employeeId || '').toUpperCase();
        const assignedId = String(t.assignedTo?.userId || '');
        const tDept = (t.department || '').trim().toLowerCase();

        // Directly assigned to this user
        if ((uEmp && assignedEmp === uEmp) || (uId && assignedId === uId)) return true;
        // Or department pool task open to all department workers
        if (userDept && (tDept === userDept || assignedEmp === 'DEPT-POOL')) return true;
        return false;
      });

      // Daily attendance status is evaluated strictly from the persistent Attendance database for today's date in IST
      const att = evaluateUserDailyAttendance(user, attendanceMap, todayDate);
      const isPresent = Boolean(att.isPresent);
      const attendanceStatus = att.attendanceStatus || (isPresent ? 'Present' : 'Absent');

      // Individual Assigned Tasks Breakdown
      const userAssignedTasks = allTasks.filter((t) => {
        const aEmp = (t.assignedTo?.employeeId || '').toUpperCase();
        const aId = String(t.assignedTo?.userId || '');
        return (uEmp && aEmp === uEmp) || (uId && aId === uId);
      });
      const userAssignedNCs = allComplaints.filter((c) => {
        const aEmp = (c.assignedTo?.employeeId || '').toUpperCase();
        const aId = String(c.assignedTo?.userId || '');
        const aName = (c.assignedTo?.name || '').toLowerCase();
        return (uEmp && aEmp === uEmp) || (uId && aId === uId) || (uName && aName === uName);
      });

      const tasksAssigned = userAssignedTasks.length + userAssignedNCs.length;
      const tasksCompleted = completedTasks.length + completedNCs.length;

      const pendingTasksCount =
        userAssignedTasks.filter(
          (t) =>
            t.status !== 'Completed' &&
            t.workStatus !== 'COMPLETED' &&
            t.status !== 'In Progress' &&
            t.workStatus !== 'IN_PROGRESS'
        ).length +
        userAssignedNCs.filter(
          (c) =>
            !['Closed', 'Verified', 'CAP Submitted', 'Under Review', 'Under Verification', 'In Progress'].includes(c.status)
        ).length;

      const overdueTasksCount =
        userAssignedTasks.filter(
          (t) =>
            t.status !== 'Completed' &&
            t.workStatus !== 'COMPLETED' &&
            t.dueDate &&
            new Date(t.dueDate) < nowTime
        ).length +
        userAssignedNCs.filter(
          (c) =>
            !['Closed', 'Verified'].includes(c.status) &&
            (c.deadlineTimestamp || c.dueDate) &&
            new Date(c.deadlineTimestamp || c.dueDate) < nowTime
        ).length;

      const isBusy = Boolean(activeNC || activeTask);
      const isCurrentlyWorking = isBusy;

      let workAvailability = 'Offline';
      if (isBusy) {
        workAvailability = 'Busy';
      } else if (isPresent) {
        workAvailability = 'Available';
      } else {
        workAvailability = 'Offline';
      }

      let status = isPresent ? 'Available' : 'Absent';
      let currentTask = null;
      let startTime = null;
      let completionTime = null;
      let proofStatus = 'None';
      let proofPhoto = null;
      let proofNotes = null;
      let taskStatus = '-';
      let workDuration = '-';

      if (activeNC) {
        status = 'In Progress / Busy';
        taskStatus = 'In Progress';
        currentTask = {
          id: activeNC.complaintId || activeNC.id,
          title: `NC: ${activeNC.complaintId} - ${activeNC.category || 'Floor Non-Conformance'}`,
          priority: activeNC.priority || activeNC.riskSeverity || 'HIGH',
          dueDate: activeNC.deadlineTimestamp || activeNC.createdAt,
          department: activeNC.department,
          isNC: true,
          complaintId: activeNC.complaintId,
        };
        startTime = activeNC.startedAt || activeNC.updatedAt || null;
        workDuration = formatWorkDuration(startTime, null);
        proofStatus = 'Pending Upload (Stop Work to Submit)';
      } else if (activeTask) {
        status = 'In Progress / Busy';
        taskStatus = 'In Progress';
        currentTask = {
          id: activeTask.id,
          title: activeTask.title,
          priority: activeTask.priority,
          dueDate: activeTask.dueDate,
          department: activeTask.department,
          isNC: false,
        };
        const workerEntry = Array.isArray(activeTask.activeWorkers)
          ? activeTask.activeWorkers.find(
              (w) =>
                (w.employeeId && (w.employeeId || '').toUpperCase() === uEmp) ||
                (w.userId && String(w.userId) === uId)
            )
          : null;
        startTime = workerEntry?.startedAt || activeTask.startedAt || activeTask.updatedAt || null;
        workDuration = formatWorkDuration(startTime, null);
        proofStatus = 'Pending Upload';
      } else if (!isPresent) {
        status = 'Absent';
        if (openDeptTask) {
          const isTaskOverdue = openDeptTask.dueDate && new Date(openDeptTask.dueDate) < nowTime;
          taskStatus = isTaskOverdue ? 'Overdue' : 'Pending';
          currentTask = {
            id: openDeptTask.id,
            title: openDeptTask.title,
            priority: openDeptTask.priority,
            dueDate: openDeptTask.dueDate,
            department: openDeptTask.department,
          };
        }
      } else {
        // Pick newest completed work between tasks and NCs
        const candidates = [];
        if (latestCompletedTask) {
          candidates.push({
            id: latestCompletedTask.id,
            title: latestCompletedTask.title,
            priority: latestCompletedTask.priority,
            dueDate: latestCompletedTask.dueDate,
            department: latestCompletedTask.department,
            startedAt: latestCompletedTask.startedAt || null,
            completedAt: latestCompletedTask.completedAt || null,
            proofPhoto: latestCompletedTask.proofPhoto || null,
            proofNotes: latestCompletedTask.proofNotes || null,
            isNC: false,
            timestamp: new Date(latestCompletedTask.completedAt || 0).getTime(),
          });
        }
        if (latestCompletedNC) {
          candidates.push({
            id: latestCompletedNC.complaintId || latestCompletedNC.id,
            title: `NC: ${latestCompletedNC.complaintId} - ${latestCompletedNC.category || 'Floor Rectification'}`,
            priority: latestCompletedNC.priority || 'HIGH',
            dueDate: latestCompletedNC.deadlineTimestamp,
            department: latestCompletedNC.department,
            startedAt: latestCompletedNC.startedAt || null,
            completedAt: latestCompletedNC.actualCompletedAt || latestCompletedNC.updatedAt || null,
            proofPhoto: latestCompletedNC.afterPhoto || null,
            proofNotes: latestCompletedNC.actionNotes || latestCompletedNC.cap?.immediateCorrection || 'Rectification verified',
            isNC: true,
            complaintId: latestCompletedNC.complaintId,
            timestamp: new Date(latestCompletedNC.actualCompletedAt || latestCompletedNC.updatedAt || 0).getTime(),
          });
        }
        candidates.sort((a, b) => b.timestamp - a.timestamp);
        const bestCompleted = candidates[0];

        if (bestCompleted) {
          status = 'Completed';
          taskStatus = 'Completed';
          currentTask = {
            id: bestCompleted.id,
            title: bestCompleted.title,
            priority: bestCompleted.priority,
            dueDate: bestCompleted.dueDate,
            department: bestCompleted.department,
            isNC: bestCompleted.isNC,
            complaintId: bestCompleted.complaintId,
          };
          startTime = bestCompleted.startedAt;
          completionTime = bestCompleted.completedAt;
          workDuration = formatWorkDuration(bestCompleted.startedAt, bestCompleted.completedAt);
          proofStatus = bestCompleted.proofPhoto ? 'Verified / Uploaded' : 'Submitted';
          proofPhoto = bestCompleted.proofPhoto;
          proofNotes = bestCompleted.proofNotes;
        } else if (openDeptTask) {
          status = 'Available';
          const isTaskOverdue = openDeptTask.dueDate && new Date(openDeptTask.dueDate) < nowTime;
          taskStatus = isTaskOverdue ? 'Overdue' : 'Pending';
          currentTask = {
            id: openDeptTask.id,
            title: openDeptTask.title,
            priority: openDeptTask.priority,
            dueDate: openDeptTask.dueDate,
            department: openDeptTask.department,
          };
        }
      }

      const taskCompletionDetails = completionTime || proofPhoto || proofNotes
        ? {
            completedAt: completionTime,
            proofPhoto: proofPhoto || null,
            proofNotes: proofNotes || null,
            proofStatus: proofPhoto ? 'Photo Verified' : 'Submitted',
            taskTitle: currentTask?.title || 'Completed Task',
            taskId: currentTask?.id || null,
            completedBy: user.name,
          }
        : null;

      return {
        userId: user.id || user._id,
        employeeId: user.employeeId,
        name: user.name,
        department: user.department,
        designation: user.designation,
        role: user.role,
        isPresent,
        attendance: attendanceStatus,
        attendanceStatus,
        attendanceDate: att.date,
        loginTimestamp: att.loginTimestamp || (isPresent ? user.lastLoginAt : null),
        status, // Legacy status ('Available' | 'In Progress / Busy' | 'Completed' | 'Absent')
        workAvailability, // 'Available' | 'Busy' | 'Offline'
        isBusy,
        isCurrentlyWorking,
        assignedTask: currentTask,
        currentAssignedTask: currentTask?.title || '-',
        currentTaskTitle: currentTask?.title || '-',
        openTask: openDeptTask ? { id: openDeptTask.id, title: openDeptTask.title } : null,
        startTime,
        taskStartTime: startTime,
        workDuration,
        completionTime,
        taskStatus,
        tasksAssigned,
        tasksCompleted,
        pendingTasks: pendingTasksCount,
        overdueTasks: overdueTasksCount,
        taskCompletionDetails,
        proofStatus,
        proofPhoto,
        proofNotes,
        lastLoginAt: user.lastLoginAt || null,
        lastLogoutAt: user.lastLogoutAt || null,
        totalCompletedCount: tasksCompleted,
      };
    });

    // Determine fast finisher rankings (who completed tasks first)
    const completedEmployees = employeeStatuses
      .filter((e) => e.completionTime)
      .sort((a, b) => new Date(a.completionTime) - new Date(b.completionTime));

    completedEmployees.forEach((emp, index) => {
      emp.completionRank = index + 1; // 1 = First Finisher 🏆
    });

    // Summary counts calculated dynamically from database records
    const deptTasks = targetDept
      ? allTasks.filter((t) => (t.department || '').trim().toLowerCase() === targetDept)
      : allTasks;
    const deptComplaints = targetDept
      ? allComplaints.filter((c) => (c.department || '').trim().toLowerCase() === targetDept)
      : allComplaints;

    const tasksInProgressCount =
      deptTasks.filter(
        (t) =>
          (t.status === 'In Progress' || t.workStatus === 'IN_PROGRESS') &&
          t.status !== 'Completed' &&
          t.workStatus !== 'COMPLETED'
      ).length + deptComplaints.filter((c) => c.status === 'In Progress').length;

    const completedTasksCount =
      deptTasks.filter((t) => t.status === 'Completed' || t.workStatus === 'COMPLETED' || t.completedAt).length +
      deptComplaints.filter((c) =>
        ['CAP Submitted', 'Under Review', 'Verified', 'Closed', 'Under Verification'].includes(c.status)
      ).length;

    const pendingTasksCount =
      deptTasks.filter(
        (t) =>
          t.status !== 'Completed' &&
          t.workStatus !== 'COMPLETED' &&
          t.workStatus !== 'IN_PROGRESS' &&
          t.status !== 'In Progress'
      ).length +
      deptComplaints.filter((c) =>
        !['Closed', 'Verified', 'CAP Submitted', 'Under Review', 'Under Verification', 'In Progress'].includes(c.status)
      ).length;

    const overdueTasksCount =
      deptTasks.filter(
        (t) =>
          t.status !== 'Completed' &&
          t.workStatus !== 'COMPLETED' &&
          t.dueDate &&
          new Date(t.dueDate) < nowTime
      ).length +
      deptComplaints.filter(
        (c) =>
          !['Closed', 'Verified'].includes(c.status) &&
          (c.deadlineTimestamp || c.dueDate) &&
          new Date(c.deadlineTimestamp || c.dueDate) < nowTime
      ).length;

    const presentEmployeesCount = employeeStatuses.filter((e) => e.isPresent).length;
    const absentEmployeesCount = employeeStatuses.filter((e) => !e.isPresent).length;
    const busyEmployeesCount = employeeStatuses.filter((e) => e.isBusy).length;
    const availableEmployeesCount = employeeStatuses.filter((e) => e.isPresent && !e.isBusy).length;
    const workingEmployeesCount = employeeStatuses.filter((e) => e.isBusy).length;

    const summary = {
      totalEmployees: employeeStatuses.length,
      presentEmployees: presentEmployeesCount,
      absentEmployees: absentEmployeesCount,
      busyEmployees: busyEmployeesCount,
      availableEmployees: availableEmployeesCount,
      workingEmployees: workingEmployeesCount,
      tasksInProgress: tasksInProgressCount,
      completedTasks: completedTasksCount,
      pendingTasks: pendingTasksCount,
      overdueTasks: overdueTasksCount,

      // Legacy aliases for backward compatibility
      present: presentEmployeesCount,
      absent: absentEmployeesCount,
      busy: busyEmployeesCount,
      available: availableEmployeesCount,
      working: workingEmployeesCount,
      inProgress: tasksInProgressCount,
      completed: completedTasksCount,
      pending: pendingTasksCount,
      overdue: overdueTasksCount,
    };

    res.json({
      success: true,
      department: department || 'ALL',
      date: todayDate,
      summary,
      employees: employeeStatuses,
      firstFinisher: completedEmployees.length > 0 ? completedEmployees[0] : null,
    });
  } catch (error) {
    console.error('[TaskController:getEmployeeWorkStatus] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve employee work status.', error: error.message });
  }
};

const canManage = (user, task) => {
  if (isElevated(user)) return true;
  // Directly assigned
  if (
    task.assignedTo?.employeeId === user?.employeeId ||
    task.assignedTo?.userId === (user?.id || user?._id) ||
    task.assignedTo?.email === user?.email
  ) {
    return true;
  }
  // Eligible department employee (all workers in the department are eligible to perform the task)
  const userDept = (user?.department || '').trim().toLowerCase();
  const taskDept = (task.department || '').trim().toLowerCase();
  if (userDept && taskDept && userDept === taskDept) {
    return true;
  }
  // User is an active worker on this task
  if (
    Array.isArray(task.activeWorkers) &&
    task.activeWorkers.some(
      (w) =>
        (w.employeeId && w.employeeId.toUpperCase() === (user?.employeeId || '').toUpperCase()) ||
        (w.userId && String(w.userId) === String(user?.id || user?._id))
    )
  ) {
    return true;
  }
  return false;
};

const findTask = async (id) => {
  let task = null;
  if (isMongoConnected()) {
    try {
      const query = { $or: [{ id }] };
      if (id && typeof id === 'string' && id.match(/^[0-9a-fA-F]{24}$/)) {
        query.$or.unshift({ _id: id });
      }
      const data = await ComplianceTask.findOne(query).lean();
      if (data) task = { ...data, id: data._id ? data._id.toString() : data.id };
    } catch (e) {
      console.warn('[TaskController] findTask fallback:', e.message);
    }
  }
  if (!task) {
    task = mockStore.getTaskById(id) || null;
  }
  // Check Complaint if not a regular task
  if (!task) {
    if (isMongoConnected()) {
      try {
        const query = { $or: [{ complaintId: id }] };
        if (id && typeof id === 'string' && id.match(/^[0-9a-fA-F]{24}$/)) {
          query.$or.unshift({ _id: id });
        }
        const c = await Complaint.findOne(query).lean();
        if (c) {
          const isDone = ['CAP Submitted', 'Under Review', 'Verified', 'Closed', 'Under Verification'].includes(c.status);
          const isBusy = c.status === 'In Progress';
          task = {
            id: c.complaintId || c._id.toString(),
            _id: c._id.toString(),
            complaintId: c.complaintId,
            title: `NC: ${c.complaintId} — ${c.category || 'Floor Defect'}`,
            department: c.department,
            description: c.findingDescription || c.description,
            priority: c.priority || c.riskSeverity || 'HIGH',
            dueDate: c.deadlineTimestamp,
            status: isDone ? 'Completed' : isBusy ? 'In Progress' : 'Pending',
            workStatus: isDone ? 'COMPLETED' : isBusy ? 'IN_PROGRESS' : 'PENDING',
            startedAt: c.startedAt || null,
            startedBy: c.startedBy || null,
            completedAt: c.actualCompletedAt || null,
            proofPhoto: c.afterPhoto || null,
            proofNotes: c.actionNotes || null,
            assignedTo: c.assignedTo || {},
            isNC: true,
          };
        }
      } catch (e) {}
    }
    if (!task) {
      const c = mockStore.findComplaintById(id);
      if (c) {
        const isDone = ['CAP Submitted', 'Under Review', 'Verified', 'Closed', 'Under Verification'].includes(c.status);
        const isBusy = c.status === 'In Progress';
        task = {
          id: c.complaintId || c.id,
          complaintId: c.complaintId,
          title: `NC: ${c.complaintId} — ${c.category || 'Floor Defect'}`,
          department: c.department,
          description: c.findingDescription || c.description,
          priority: c.priority || c.riskSeverity || 'HIGH',
          dueDate: c.deadlineTimestamp,
          status: isDone ? 'Completed' : isBusy ? 'In Progress' : 'Pending',
          workStatus: isDone ? 'COMPLETED' : isBusy ? 'IN_PROGRESS' : 'PENDING',
          startedAt: c.startedAt || null,
          startedBy: c.startedBy || null,
          completedAt: c.actualCompletedAt || null,
          proofPhoto: c.afterPhoto || null,
          proofNotes: c.actionNotes || null,
          assignedTo: c.assignedTo || {},
          isNC: true,
        };
      }
    }
  }
  return task ? enrichTaskWithMeta(task) : null;
};

module.exports = {
  getTasks,
  createTask,
  updateTask,
  startTask,
  completeTask,
  deleteTask,
  getEmployeeWorkStatus,
  // exported for tests
  deriveState,
  nextDueDate,
};
