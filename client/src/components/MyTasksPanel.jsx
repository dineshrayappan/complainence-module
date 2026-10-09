import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ClipboardList,
  Plus,
  Check,
  Trash2,
  Pencil,
  X,
  ChevronRight,
  Repeat,
  User,
  Building2,
  Filter,
} from 'lucide-react';
import { taskService, userService } from '../services/api';
import { useAuth } from '../context/AuthContext';

const STATE_STYLE = {
  Overdue: { dot: 'bg-rose-500', label: 'OVERDUE', text: 'text-rose-600 dark:text-rose-400' },
  'Due Today': { dot: 'bg-amber-500', label: 'DUE TODAY', text: 'text-amber-600 dark:text-amber-400' },
  Upcoming: { dot: 'bg-indigo-500', label: 'UPCOMING', text: 'text-indigo-600 dark:text-indigo-400' },
  Completed: { dot: 'bg-emerald-500', label: 'COMPLETED', text: 'text-emerald-600 dark:text-emerald-400' },
};

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];
const RECURRENCES = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY'];

const FACTORY_DEPARTMENTS = [
  'Central Quality Audit',
  'Production',
  'Quality',
  'Maintenance',
  'Store',
  'EHS',
  'EDP',
  'HR',
  'Plant Operations & Executive Oversight',
];

const fmtDay = (iso) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}-${d.toLocaleString('en-GB', { month: 'short' })}`;
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const emptyForm = (defaultUserId = '') => ({
  title: '',
  department: 'Central Quality Audit',
  description: '',
  dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
  recurrence: 'NONE',
  priority: 'MEDIUM',
  assignedToUserId: defaultUserId || '',
});

export const MyTasksPanel = ({ compact = false }) => {
  const { user, isAdmin, isAuditor } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [counts, setCounts] = useState({ overdue: 0, dueToday: 0, completed: 0 });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [deptFilter, setDeptFilter] = useState('ALL');

  const canSchedule = Boolean(isAdmin || isAuditor);

  // Fetch users for Auditor and Department dropdown lists
  useEffect(() => {
    let isMounted = true;
    const loadUsers = async () => {
      setLoadingUsers(true);
      try {
        const res = await userService.getAllUsers();
        if (isMounted && res.data?.success && Array.isArray(res.data.users)) {
          setUsersList(res.data.users.filter((u) => u.isActive !== false));
        }
      } catch (err) {
        console.warn('[MyTasksPanel] Could not load users for task assignment:', err);
      } finally {
        if (isMounted) setLoadingUsers(false);
      }
    };
    loadUsers();
    return () => {
      isMounted = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await taskService.getTasks();
      if (res.data?.success) {
        setTasks(res.data.tasks || []);
        setCounts(res.data.counts || { overdue: 0, dueToday: 0, completed: 0 });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load tasks.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Dynamic set of available departments
  const availableDepartments = useMemo(() => {
    const depts = new Set(FACTORY_DEPARTMENTS);
    usersList.forEach((u) => {
      if (u.department) depts.add(u.department);
    });
    tasks.forEach((t) => {
      if (t.department) depts.add(t.department);
    });
    return Array.from(depts);
  }, [usersList, tasks]);

  // Grouped user categories for Assignee dropdown
  const auditors = useMemo(
    () => usersList.filter((u) => u.role === 'AUDITOR'),
    [usersList]
  );
  const supervisors = useMemo(
    () => usersList.filter((u) => u.role === 'ACTION_PERSON' || u.role === 'SUPERVISOR'),
    [usersList]
  );
  const administrators = useMemo(
    () => usersList.filter((u) => u.role === 'ADMIN'),
    [usersList]
  );
  const otherUsers = useMemo(
    () => usersList.filter((u) => !['AUDITOR', 'ACTION_PERSON', 'SUPERVISOR', 'ADMIN'].includes(u.role)),
    [usersList]
  );

  // Grouped tasks with optional department filter
  const groups = useMemo(() => {
    const today = startOfToday();
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const filteredByDept =
      deptFilter === 'ALL' ? tasks : tasks.filter((t) => t.department === deptFilter);

    const open = filteredByDept.filter((t) => t.state !== 'Completed');
    const done = filteredByDept.filter((t) => t.state === 'Completed');

    return [
      { key: 'today', label: 'Today', items: open.filter((t) => ['Overdue', 'Due Today'].includes(t.state)) },
      {
        key: 'week',
        label: 'This Week',
        items: open.filter((t) => {
          if (t.state !== 'Upcoming') return false;
          const d = new Date(t.dueDate);
          return d >= today && d < weekEnd;
        }),
      },
      {
        key: 'later',
        label: 'Later',
        items: open.filter((t) => t.state === 'Upcoming' && new Date(t.dueDate) >= weekEnd),
      },
      { key: 'done', label: 'Completed', items: done },
    ].filter((g) => g.items.length > 0);
  }, [tasks, deptFilter]);

  const handleComplete = async (task) => {
    setBusyId(task.id);
    try {
      const res = await taskService.completeTask(task.id);
      load();
      if (res.data?.nextTask) {
        // eslint-disable-next-line no-alert
        alert(res.data.message);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not complete task.');
    } finally {
      setBusyId(null);
    }
  };

  const openCreate = () => {
    setEditing(null);
    const myId = user?.id || user?._id || user?.employeeId || '';
    setForm(emptyForm(myId));
    setShowForm(true);
  };

  const openEdit = (task) => {
    setEditing(task);
    const matchedUser = usersList.find(
      (u) =>
        u.employeeId === task.assignedTo?.employeeId ||
        (u.id && u.id === task.assignedTo?.userId) ||
        (u._id && u._id === task.assignedTo?.userId)
    );
    const assignedId =
      matchedUser?.id ||
      matchedUser?._id ||
      task.assignedTo?.userId ||
      task.assignedTo?.employeeId ||
      '';

    setForm({
      title: task.title || '',
      department: task.department || 'Central Quality Audit',
      description: task.description || '',
      dueDate: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 16) : '',
      recurrence: task.recurrence || 'NONE',
      priority: task.priority || 'MEDIUM',
      assignedToUserId: assignedId,
    });
    setShowForm(true);
  };

  const handleAssigneeChange = (e) => {
    const selectedVal = e.target.value;
    const selectedUser = usersList.find(
      (u) =>
        (u.id && u.id === selectedVal) ||
        (u._id && u._id === selectedVal) ||
        u.employeeId === selectedVal
    );

    setForm((prev) => {
      const next = { ...prev, assignedToUserId: selectedVal };
      // If user belongs to a specific factory department, default the department dropdown accordingly
      if (
        selectedUser?.department &&
        selectedUser.department !== 'Plant Operations & Executive Oversight'
      ) {
        next.department = selectedUser.department;
      }
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        title: form.title.trim(),
        department: form.department,
        description: form.description.trim(),
        dueDate: new Date(form.dueDate).toISOString(),
        recurrence: form.recurrence,
        priority: form.priority,
        assignedToUserId: form.assignedToUserId || undefined,
      };

      if (editing) {
        await taskService.updateTask(editing.id, payload);
      } else {
        await taskService.createTask(payload);
      }
      setShowForm(false);
      setEditing(null);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save task.');
    }
  };

  const handleDelete = async (task) => {
    if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
    try {
      await taskService.deleteTask(task.id);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete task.');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-indigo-600 dark:text-cyan-400" />
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
            My Tasks
          </h2>
          {counts.overdue > 0 && (
            <span className="px-2 py-0.5 rounded-md bg-rose-500 text-white text-[10px] font-mono font-bold">
              {counts.overdue} OVERDUE
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Department Filter Dropdown */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px]">
            <Filter className="w-3 h-3 text-slate-400" />
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="bg-transparent text-[11px] font-semibold text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
            >
              <option value="ALL">All Departments</option>
              {availableDepartments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={load}
            className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            Refresh
          </button>
          {canSchedule && (
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold shadow-md shadow-indigo-600/30 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Schedule Task
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-[11px] font-semibold text-rose-700 dark:text-rose-300 flex items-start gap-2">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Schedule form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3.5 shadow-sm"
        >
          <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-indigo-600" />
              {editing ? 'Edit Scheduled Task' : 'Schedule New Task'}
            </h3>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
              }}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              Task Title
            </label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g., Weekly Needle Guard Safety Audit, PPE Verification, ISO Clause 8.5 Check"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              Inspection Details / Checklist Scope
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What must be checked? (Key clauses, inspection checkpoints, floor areas, or items to verify)"
              rows={2}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Row 1: Assignee Dropdown (Auditor / Department Staff) and Department Dropdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-indigo-500" />
                  Assign To (Auditor / Department Staff)
                </span>
                {loadingUsers && (
                  <span className="text-[9px] text-indigo-500 font-normal animate-pulse">Loading users...</span>
                )}
              </span>
              <select
                value={form.assignedToUserId}
                onChange={handleAssigneeChange}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white outline-none focus:border-indigo-500 cursor-pointer transition-colors"
              >
                <option value="">
                  {user ? `Assign to Myself (${user.name} - ${user.role})` : 'Select Assignee...'}
                </option>

                {auditors.length > 0 && (
                  <optgroup label="── Quality Auditors ──">
                    {auditors.map((u) => (
                      <option key={u.id || u._id || u.employeeId} value={u.id || u._id || u.employeeId}>
                        {u.name} — {u.designation || 'Auditor'} ({u.department || 'Central QA'}) [{u.employeeId}]
                      </option>
                    ))}
                  </optgroup>
                )}

                {supervisors.length > 0 && (
                  <optgroup label="── Department In-Charges & Supervisors ──">
                    {supervisors.map((u) => (
                      <option key={u.id || u._id || u.employeeId} value={u.id || u._id || u.employeeId}>
                        {u.name} — {u.designation || 'Supervisor'} ({u.department}) [{u.employeeId}]
                      </option>
                    ))}
                  </optgroup>
                )}

                {administrators.length > 0 && (
                  <optgroup label="── Plant Leadership & Admins ──">
                    {administrators.map((u) => (
                      <option key={u.id || u._id || u.employeeId} value={u.id || u._id || u.employeeId}>
                        {u.name} — {u.designation || 'Admin'} ({u.department || 'Operations'}) [{u.employeeId}]
                      </option>
                    ))}
                  </optgroup>
                )}

                {otherUsers.length > 0 && (
                  <optgroup label="── Other Plant Staff ──">
                    {otherUsers.map((u) => (
                      <option key={u.id || u._id || u.employeeId} value={u.id || u._id || u.employeeId}>
                        {u.name} — {u.designation || u.role} ({u.department}) [{u.employeeId}]
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                Target Department
              </span>
              <select
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white outline-none focus:border-indigo-500 cursor-pointer transition-colors"
              >
                {availableDepartments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Row 2: Due Date, Repeats, Priority */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Due Date & Time
              </span>
              <input
                type="datetime-local"
                required
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Repeats
              </span>
              <select
                value={form.recurrence}
                onChange={(e) => setForm({ ...form, recurrence: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500 cursor-pointer"
              >
                {RECURRENCES.map((r) => (
                  <option key={r} value={r}>
                    {r === 'NONE' ? 'One-off Task' : r[0] + r.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Priority
              </span>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500 cursor-pointer"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p[0] + p.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer shadow-sm shadow-indigo-600/30 transition-colors"
            >
              {editing ? 'Save Changes' : 'Schedule Task'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
              }}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold cursor-pointer transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Grouped list */}
      {loading ? (
        <div className="p-10 text-center text-slate-400 text-xs font-mono">Loading your tasks...</div>
      ) : groups.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center">
          <p className="text-xs font-bold text-slate-900 dark:text-white">No tasks scheduled</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {canSchedule ? 'Use Schedule Task to book a recurring inspection.' : 'Nothing assigned to you right now.'}
          </p>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.key}>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {group.label}
              </h3>
              <span className="text-[10px] font-mono font-bold text-slate-400">{group.items.length}</span>
              <div className="flex-1 border-t border-slate-200 dark:border-slate-800" />
            </div>

            <div className="space-y-1.5">
              {group.items.map((task) => {
                const style = STATE_STYLE[task.state] || STATE_STYLE.Upcoming;
                const isDone = task.state === 'Completed';
                return (
                  <div
                    key={task.id}
                    className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                      isDone
                        ? 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot} ${isDone ? '' : 'animate-pulse'}`} />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`text-xs font-bold truncate ${
                            isDone
                              ? 'text-slate-400 dark:text-slate-500 line-through'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {task.title}
                        </span>
                        {task.recurrence && task.recurrence !== 'NONE' && (
                          <span className="flex items-center gap-0.5 text-[9px] font-mono font-bold text-slate-400">
                            <Repeat className="w-2.5 h-2.5" />
                            {task.recurrence}
                          </span>
                        )}
                        {task.department && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800">
                            {task.department}
                          </span>
                        )}
                        {task.assignedTo?.name && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                            👤 {task.assignedTo.name}
                          </span>
                        )}
                      </div>
                      {!compact && task.description && (
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {task.description}
                        </p>
                      )}
                    </div>

                    <span className={`text-[10px] font-mono font-bold shrink-0 ${style.text}`}>
                      {style.label}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0 w-14 text-right">
                      {fmtDay(task.dueDate)}
                    </span>

                    <div className="flex items-center gap-1 shrink-0">
                      {!isDone && (
                        <button
                          onClick={() => handleComplete(task)}
                          disabled={busyId === task.id}
                          title="Mark complete"
                          className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 disabled:opacity-40 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canSchedule && (
                        <>
                          <button
                            onClick={() => openEdit(task)}
                            title="Edit"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(task)}
                            title="Delete"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      <p className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
        <ChevronRight className="w-3 h-3" />
        Recurring inspections re-schedule themselves when completed.
      </p>
    </div>
  );
};

export default MyTasksPanel;
