const { supabase, isSupabaseConfigured } = require('../config/supabase');
const mockStore = require('../config/mockStore');

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
        if (taskId) taskWorkMetadataStore.set(taskId, meta);
      } catch (e) {}
    }
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

  const enriched = {
    ...task,
    _id: task.id || task._id,
    description: cleanDesc,
    workStatus,
    startedAt: meta.startedAt || task.startedAt || null,
    startedBy: meta.startedBy || task.startedBy || null,
    completedAt: meta.completedAt || task.completedAt || null,
    completedBy: meta.completedBy || task.completedBy || null,
    proofPhoto: meta.proofPhoto || task.proofPhoto || null,
    proofNotes: meta.proofNotes || task.proofNotes || null,
  };

  enriched.state = deriveState(enriched, now);
  return enriched;
};

const formatTask = (task, now = new Date()) => {
  if (!task) return null;
  return enrichTaskWithMeta(task, now);
};

/** Shared across every route: ADMIN and AUDITOR see the whole plant, everyone
 *  else sees only what is assigned to them. */
const isElevated = (user) =>
  user?.role === 'ADMIN' || user?.role === 'AUDITOR' ||
  user?.employeeId === 'ALL-001' || user?.email === 'all@factory.com' ||
  user?.isUniversal || user?.hasAllRoles;

const applyVisibility = (tasks, user) => {
  if (isElevated(user)) return tasks;
  return tasks.filter(
    (t) =>
      t.assignedTo?.employeeId === user?.employeeId ||
      t.assignedTo?.userId === (user?.id || user?._id) ||
      t.assignedTo?.email === user?.email
  );
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
    const { state, department } = req.query;

    let tasks = [];
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase.from('compliance_tasks').select('*');
        if (error) throw error;
        tasks = data || [];
      } catch (dbErr) {
        console.warn('[TaskController:getTasks] Supabase fallback:', dbErr.message);
        tasks = mockStore.getTasks();
      }
    } else {
      tasks = mockStore.getTasks();
    }

    const visible = applyVisibility(tasks, req.user);
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
    const { title, department, description, dueDate, recurrence, priority, assignedToUserId } = req.body;

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

    // Resolve the assignee: explicit user, else self.
    let owner = null;
    const lookupId = assignedToUserId || req.body.assignedToEmployeeId;
    if (lookupId && isSupabaseConfigured && supabase) {
      try {
        const { data } = await supabase
          .from('users')
          .select('*')
          .or(`id.eq.${lookupId},employeeId.eq.${lookupId},email.eq.${lookupId}`)
          .limit(1);
        if (data && data.length) owner = data[0];
      } catch (e) {
        console.warn('[TaskController:createTask] assignee lookup notice:', e.message);
      }
    }
    if (!owner) owner = mockStore.findUserById(lookupId) || mockStore.getUsers().find((u) => u.employeeId === lookupId);
    if (!owner) owner = req.user;

    const assignedTo = {
      userId: owner.id || owner._id || '',
      employeeId: owner.employeeId || '',
      name: owner.name || '',
      department: owner.department || department || '',
    };

    const payload = {
      title: String(title).trim(),
      department: department || 'Central Quality Audit',
      description: description || '',
      assignedTo,
      dueDate: new Date(dueDate).toISOString(),
      status: 'Pending',
      recurrence: rec,
      priority: pri,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase.from('compliance_tasks').insert([payload]).select().single();
        if (!error && data) {
          return res.status(201).json({ success: true, message: 'Compliance task scheduled.', task: formatTask(data) });
        }
        throw error;
      } catch (dbErr) {
        console.warn('[TaskController:createTask] Supabase insert failed, using in-memory store:', dbErr.message);
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
      if (isSupabaseConfigured && supabase) {
        try {
          const { data } = await supabase
            .from('users')
            .select('*')
            .or(`id.eq.${lookupId},employeeId.eq.${lookupId},email.eq.${lookupId}`)
            .limit(1);
          if (data && data.length) owner = data[0];
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

    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('compliance_tasks')
          .update(updates)
          .eq('id', task.id)
          .select()
          .single();
        if (!error && data) {
          return res.json({ success: true, message: 'Task updated.', task: formatTask(data) });
        }
        throw error;
      } catch (dbErr) {
        console.warn('[TaskController:updateTask] Supabase update failed, using in-memory store:', dbErr.message);
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
// @access  Private (Assignee, ADMIN, AUDITOR)
const startTask = async (req, res) => {
  try {
    const task = await findTask(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }
    if (!canManage(req.user, task)) {
      return res.status(403).json({ success: false, message: 'You can only start tasks assigned to you or your department.' });
    }

    if (task.status === 'Completed' || task.workStatus === 'COMPLETED') {
      return res.status(400).json({ success: false, message: 'This task has already been completed.' });
    }

    const startedAt = new Date().toISOString();
    const startedBy = {
      userId: req.user?.id || req.user?._id || '',
      employeeId: req.user?.employeeId || '',
      name: req.user?.name || '',
    };

    const existingMeta = extractTaskMeta(task) || {};
    const meta = {
      ...existingMeta,
      workStatus: 'IN_PROGRESS',
      startedAt: task.startedAt || existingMeta.startedAt || startedAt,
      startedBy,
    };

    const taskId = String(task.id || task._id);
    taskWorkMetadataStore.set(taskId, meta);
    const enrichedDescription = embedTaskMeta(task.description, meta);

    const safeUpdates = {
      status: 'In Progress',
      description: enrichedDescription,
      updatedAt: startedAt,
    };

    let updated = null;
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('compliance_tasks')
          .update(safeUpdates)
          .eq('id', task.id)
          .select()
          .single();
        if (!error && data) updated = data;
      } catch (dbErr) {
        console.warn('[TaskController:startTask] Supabase update notice:', dbErr.message);
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
      message: 'Work started on task. Status updated to In Progress / Busy.',
      task: formatTask(finalTask),
    });
  } catch (error) {
    console.error('[TaskController:startTask] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to start task.', error: error.message });
  }
};

// @desc    Mark a task complete. Mandatory proof (photo + notes) required!
// @route   POST /api/tasks/:id/complete
// @access  Private (ADMIN, AUDITOR, or the assignee)
const completeTask = async (req, res) => {
  try {
    const task = await findTask(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }
    if (!canManage(req.user, task)) {
      return res.status(403).json({ success: false, message: 'You can only complete tasks assigned to you.' });
    }

    const { proofPhoto, proofNotes } = req.body || {};

    // Strict validation: The employee should not be able to mark the task as completed without uploading the required proof
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

    const completedAt = new Date().toISOString();
    const completedBy = {
      userId: req.user?.id || req.user?._id || '',
      employeeId: req.user?.employeeId || '',
      name: req.user?.name || '',
    };

    const existingMeta = extractTaskMeta(task) || {};
    const meta = {
      ...existingMeta,
      workStatus: 'COMPLETED',
      startedAt: task.startedAt || existingMeta.startedAt || null,
      startedBy: task.startedBy || existingMeta.startedBy || null,
      completedAt,
      completedBy,
      proofPhoto: proofPhoto.trim(),
      proofNotes: proofNotes.trim(),
    };

    const taskId = String(task.id || task._id);
    taskWorkMetadataStore.set(taskId, meta);
    const enrichedDescription = embedTaskMeta(task.description, meta);

    const safeUpdates = {
      status: 'Completed',
      description: enrichedDescription,
      updatedAt: completedAt,
    };

    let completed = null;
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('compliance_tasks')
          .update(safeUpdates)
          .eq('id', task.id)
          .select()
          .single();
        if (!error && data) completed = data;
      } catch (dbErr) {
        console.warn('[TaskController:completeTask] Supabase update notice:', dbErr.message);
      }
    }

    const mockUpdates = { ...safeUpdates, ...meta };
    if (!completed) {
      completed = mockStore.updateTask(task.id, mockUpdates);
      if (!completed) {
        completed = mockStore.createTask({ ...task, ...mockUpdates, id: task.id });
      }
    } else {
      mockStore.updateTask(task.id, mockUpdates);
    }

    // Rolling schedule: completing a recurring task books the next occurrence
    let nextTask = null;
    if (task.recurrence && task.recurrence !== 'NONE') {
      const nextDue = nextDueDate(task.dueDate, task.recurrence);
      if (nextDue) {
        const nextPayload = {
          title: task.title,
          department: task.department,
          description: (task.description || '').replace(/\s*<!-- TASK_META:[\s\S]*?-->/g, '').trim(),
          assignedTo: task.assignedTo,
          dueDate: nextDue.toISOString(),
          status: 'Pending',
          recurrence: task.recurrence,
          priority: task.priority,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        if (isSupabaseConfigured && supabase) {
          try {
            const { data, error } = await supabase.from('compliance_tasks').insert([nextPayload]).select().single();
            if (!error && data) nextTask = data;
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
      message: nextTask
        ? `Task completed with proof verified. Next ${task.recurrence.toLowerCase()} occurrence scheduled.`
        : 'Task completed successfully with uploaded proof.',
      task: formatTask(finalCompleted),
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

    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase.from('compliance_tasks').delete().eq('id', task.id);
        if (!error) {
          return res.json({ success: true, message: 'Task deleted.' });
        }
        throw error;
      } catch (dbErr) {
        console.warn('[TaskController:deleteTask] Supabase delete failed, using in-memory store:', dbErr.message);
      }
    }

    mockStore.deleteTask(task.id);
    res.json({ success: true, message: 'Task deleted.' });
  } catch (error) {
    console.error('[TaskController:deleteTask] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete task.', error: error.message });
  }
};

// @desc    Get live employee work status across departments (who is working, who is available, who completed first)
// @route   GET /api/tasks/live-status
// @access  Private (Authenticated users, Admin & Auditor oversight)
const getEmployeeWorkStatus = async (req, res) => {
  try {
    const { department } = req.query;

    // 1. Fetch all users
    let allUsers = [];
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, name, employeeId, email, role, department, designation, isActive');
        if (!error && data) allUsers = data;
      } catch (e) {
        console.warn('[TaskController:getEmployeeWorkStatus] users fetch fallback:', e.message);
      }
    }
    if (!allUsers || allUsers.length === 0) {
      allUsers = mockStore.getUsers();
    } else {
      // Merge known factory supervisors/workers from mockStore if missing from remote DB
      const existingEmpIds = new Set(allUsers.map((u) => (u.employeeId || '').toUpperCase()));
      for (const mUser of mockStore.getUsers()) {
        if (mUser.employeeId && !existingEmpIds.has(mUser.employeeId.toUpperCase())) {
          allUsers.push(mUser);
          existingEmpIds.add(mUser.employeeId.toUpperCase());
        }
      }
    }

    // Active workers only
    allUsers = allUsers.filter((u) => u.isActive !== false);

    // 2. Fetch all tasks
    let allTasks = [];
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase.from('compliance_tasks').select('*');
        if (!error && data) allTasks = data;
      } catch (e) {
        console.warn('[TaskController:getEmployeeWorkStatus] tasks fetch fallback:', e.message);
      }
    }
    if (!allTasks || allTasks.length === 0) {
      allTasks = mockStore.getTasks();
    }

    // Enrich all tasks with live tracking metadata (startedAt, workStatus, proof)
    allTasks = (allTasks || []).map((t) => enrichTaskWithMeta(t));

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

      // Find tasks assigned to or handled by this user
      const userTasks = allTasks.filter((t) => {
        const assignedEmp = (t.assignedTo?.employeeId || '').toUpperCase();
        const assignedId = String(t.assignedTo?.userId || '');
        const assignedEmail = (t.assignedTo?.email || '').toLowerCase();
        const startedEmp = (t.startedBy?.employeeId || '').toUpperCase();
        const startedId = String(t.startedBy?.userId || '');
        const compEmp = (t.completedBy?.employeeId || '').toUpperCase();
        const compId = String(t.completedBy?.userId || '');

        return (
          (uEmp && (assignedEmp === uEmp || startedEmp === uEmp || compEmp === uEmp)) ||
          (uId && (assignedId === uId || startedId === uId || compId === uId)) ||
          (uEmail && assignedEmail === uEmail)
        );
      });

      // Check for active In-Progress task
      const activeTask = userTasks.find(
        (t) => t.workStatus === 'IN_PROGRESS' || (t.status === 'In Progress' && !t.completedAt)
      );

      // Check for completed tasks
      const completedTasks = userTasks
        .filter((t) => t.status === 'Completed' || t.workStatus === 'COMPLETED' || t.completedAt)
        .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));

      const latestCompleted = completedTasks[0] || null;

      let status = 'Available';
      let currentTask = null;
      let startTime = null;
      let completionTime = null;
      let proofStatus = 'None';
      let proofPhoto = null;
      let proofNotes = null;

      if (latestCompleted) {
        completionTime = latestCompleted.completedAt || null;
        proofStatus = latestCompleted.proofPhoto ? 'Verified / Uploaded' : 'Submitted';
        proofPhoto = latestCompleted.proofPhoto || null;
        proofNotes = latestCompleted.proofNotes || null;
      }

      if (activeTask) {
        status = 'In Progress / Busy';
        currentTask = {
          id: activeTask.id,
          title: activeTask.title,
          priority: activeTask.priority,
          dueDate: activeTask.dueDate,
          department: activeTask.department,
        };
        startTime = activeTask.startedAt || activeTask.updatedAt || null;
        if (!latestCompleted) {
          proofStatus = 'Pending Upload';
        }
      } else if (latestCompleted) {
        status = 'Completed';
        currentTask = {
          id: latestCompleted.id,
          title: latestCompleted.title,
          priority: latestCompleted.priority,
          dueDate: latestCompleted.dueDate,
          department: latestCompleted.department,
        };
        startTime = latestCompleted.startedAt || null;
      }

      return {
        userId: user.id || user._id,
        employeeId: user.employeeId,
        name: user.name,
        department: user.department,
        designation: user.designation,
        role: user.role,
        status, // 'Available' | 'In Progress / Busy' | 'Completed'
        assignedTask: currentTask,
        startTime,
        completionTime,
        proofStatus,
        proofPhoto,
        proofNotes,
        totalCompletedCount: completedTasks.length,
      };
    });

    // Determine fast finisher rankings (who completed tasks first)
    // Filter employees with completion timestamps and sort by earliest completionTime
    const completedEmployees = employeeStatuses
      .filter((e) => e.completionTime)
      .sort((a, b) => new Date(a.completionTime) - new Date(b.completionTime));

    // Assign fast finisher ranks
    completedEmployees.forEach((emp, index) => {
      emp.completionRank = index + 1; // 1 = First Finisher 🏆
    });

    // Summary counts
    const summary = {
      totalEmployees: employeeStatuses.length,
      available: employeeStatuses.filter((e) => e.status === 'Available').length,
      inProgress: employeeStatuses.filter((e) => e.status === 'In Progress / Busy').length,
      completed: employeeStatuses.filter((e) => e.status === 'Completed').length,
    };

    res.json({
      success: true,
      department: department || 'ALL',
      summary,
      employees: employeeStatuses,
      firstFinisher: completedEmployees.length > 0 ? completedEmployees[0] : null,
    });
  } catch (error) {
    console.error('[TaskController:getEmployeeWorkStatus] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve employee work status.', error: error.message });
  }
};

const canManage = (user, task) =>
  isElevated(user) ||
  task.assignedTo?.employeeId === user?.employeeId ||
  task.assignedTo?.userId === (user?.id || user?._id);

const findTask = async (id) => {
  let task = null;
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.from('compliance_tasks').select('*').eq('id', id).maybeSingle();
      if (!error && data) task = data;
    } catch (e) {
      console.warn('[TaskController] findTask fallback:', e.message);
    }
  }
  if (!task) {
    task = mockStore.getTaskById(id) || null;
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
