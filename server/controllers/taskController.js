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
const RECURRENCES = Object.keys(RECURRENCE_STEPS);

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

const formatTask = (task, now = new Date()) => ({
  ...task,
  _id: task.id || task._id,
  state: deriveState(task, now),
});

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

// @desc    Mark a task complete. Recurring tasks spawn their next occurrence.
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

    const completedAt = new Date().toISOString();
    const completedBy = {
      userId: req.user?.id || req.user?._id || '',
      employeeId: req.user?.employeeId || '',
      name: req.user?.name || '',
    };
    const updates = { status: 'Completed', completedAt, completedBy, updatedAt: completedAt };

    let completed = null;
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('compliance_tasks')
          .update(updates)
          .eq('id', task.id)
          .select()
          .single();
        if (!error && data) completed = data;
      } catch (dbErr) {
        console.warn('[TaskController:completeTask] Supabase update failed, using in-memory store:', dbErr.message);
      }
    }
    if (!completed) completed = mockStore.updateTask(task.id, updates);

    // Rolling schedule: completing a recurring task books the next occurrence so
    // the inspection never silently stops happening.
    let nextTask = null;
    if (task.recurrence && task.recurrence !== 'NONE') {
      const nextDue = nextDueDate(task.dueDate, task.recurrence);
      if (nextDue) {
        const nextPayload = {
          title: task.title,
          department: task.department,
          description: task.description,
          assignedTo: task.assignedTo,
          dueDate: nextDue.toISOString(),
          status: 'Pending',
          recurrence: task.recurrence,
          priority: task.priority,
          completedAt: null,
          completedBy: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        if (isSupabaseConfigured && supabase) {
          try {
            const { data, error } = await supabase.from('compliance_tasks').insert([nextPayload]).select().single();
            if (!error && data) nextTask = data;
          } catch (dbErr) {
            console.warn('[TaskController:completeTask] Recurrence insert failed, using in-memory store:', dbErr.message);
          }
        }
        if (!nextTask) nextTask = mockStore.createTask(nextPayload);
      }
    }

    res.json({
      success: true,
      message: nextTask
        ? `Task completed. Next ${task.recurrence.toLowerCase()} occurrence scheduled.`
        : 'Task completed.',
      task: formatTask(completed),
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

const canManage = (user, task) =>
  isElevated(user) ||
  task.assignedTo?.employeeId === user?.employeeId ||
  task.assignedTo?.userId === (user?.id || user?._id);

const findTask = async (id) => {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.from('compliance_tasks').select('*').eq('id', id).maybeSingle();
      if (!error && data) return data;
    } catch (e) {
      console.warn('[TaskController] findTask fallback:', e.message);
    }
  }
  return mockStore.getTaskById(id) || null;
};

module.exports = {
  getTasks,
  createTask,
  updateTask,
  completeTask,
  deleteTask,
  // exported for tests
  deriveState,
  nextDueDate,
};
