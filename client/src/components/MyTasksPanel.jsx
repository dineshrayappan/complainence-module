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
  Play,
  CheckCircle2,
  Camera,
  Upload,
  AlertCircle,
  Clock,
  Eye,
} from 'lucide-react';
import { taskService, userService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { compressImage } from '../utils/imageCompressor';

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

const formatTimeAgo = (iso) => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  return fmtDay(iso);
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const emptyForm = (defaultDept = 'Production', defaultUserId = '') => ({
  title: '',
  department: defaultDept,
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
  const [form, setForm] = useState(() => emptyForm('Production', ''));
  const [error, setError] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [deptFilter, setDeptFilter] = useState('ALL');

  // Proof of completion modal state
  const [proofModalTask, setProofModalTask] = useState(null);
  const [proofPhoto, setProofPhoto] = useState('');
  const [proofPhotoPreview, setProofPhotoPreview] = useState(null);
  const [proofNotes, setProofNotes] = useState('');
  const [proofError, setProofError] = useState(null);
  const [submittingProof, setSubmittingProof] = useState(false);
  const [viewProofTask, setViewProofTask] = useState(null);

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

  // Filter workers strictly matching the currently selected department
  const departmentWorkers = useMemo(() => {
    if (!form.department) return [];
    const targetDept = form.department.trim().toLowerCase();
    return usersList.filter(
      (u) => (u.department || '').trim().toLowerCase() === targetDept
    );
  }, [usersList, form.department]);

  // Quality auditors who can audit all departments
  const auditors = useMemo(
    () => usersList.filter((u) => u.role === 'AUDITOR'),
    [usersList]
  );

  // Other plant workers outside the currently selected department
  const otherWorkers = useMemo(() => {
    if (!form.department) return [];
    const targetDept = form.department.trim().toLowerCase();
    return usersList.filter(
      (u) =>
        (u.department || '').trim().toLowerCase() !== targetDept &&
        u.role !== 'AUDITOR'
    );
  }, [usersList, form.department]);

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

  // Handle Start Work button click
  const handleStartWork = async (task) => {
    setBusyId(task.id);
    setError(null);
    try {
      const res = await taskService.startTask(task.id);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not start work on task.');
    } finally {
      setBusyId(null);
    }
  };

  // Open the mandatory Proof of Completion Modal
  const openProofModal = (task) => {
    setProofModalTask(task);
    setProofPhoto('');
    setProofPhotoPreview(null);
    setProofNotes('');
    setProofError(null);
  };

  // Handle image upload and compression for proof
  const handleProofImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await compressImage(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.8 });
      setProofPhoto(compressed.dataUrl || compressed.previewUrl);
      setProofPhotoPreview(compressed.previewUrl || compressed.dataUrl);
      setProofError(null);
    } catch (err) {
      console.error('Image compression error:', err);
      // Fallback to FileReader
      const reader = new FileReader();
      reader.onload = (event) => {
        setProofPhoto(event.target.result);
        setProofPhotoPreview(event.target.result);
        setProofError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  // Submit completion with mandatory proof validation
  const handleSubmitProof = async (e) => {
    e.preventDefault();
    if (!proofModalTask) return;

    if (!proofPhoto || !proofPhoto.trim()) {
      setProofError('Completion photo proof is required! Please attach or capture a photo before stopping/completing work.');
      return;
    }

    if (!proofNotes || !proofNotes.trim()) {
      setProofError('Completion notes/details are required to document proof.');
      return;
    }

    setSubmittingProof(true);
    setProofError(null);

    try {
      const res = await taskService.completeTask(proofModalTask.id, {
        proofPhoto,
        proofNotes: proofNotes.trim(),
      });

      setProofModalTask(null);
      load();

      if (res.data?.nextTask) {
        // eslint-disable-next-line no-alert
        alert(res.data.message);
      }
    } catch (err) {
      setProofError(err.response?.data?.message || 'Failed to submit completion proof.');
    } finally {
      setSubmittingProof(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    const initialDept =
      user?.department && user.department !== 'Plant Operations & Executive Oversight'
        ? user.department
        : 'Production';

    const matchingWorkers = usersList.filter(
      (u) => (u.department || '').trim().toLowerCase() === initialDept.trim().toLowerCase()
    );

    const defaultUserId =
      matchingWorkers.length > 0
        ? matchingWorkers[0].id || matchingWorkers[0]._id || matchingWorkers[0].employeeId
        : user?.id || user?._id || user?.employeeId || '';

    setForm({
      title: '',
      department: initialDept,
      description: '',
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
      recurrence: 'NONE',
      priority: 'MEDIUM',
      assignedToUserId: defaultUserId,
    });
    setShowForm(true);
  };

  const openEdit = (task) => {
    setEditing(task);
    const targetDept = task.department || 'Production';
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
      department: targetDept,
      description: task.description || '',
      dueDate: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 16) : '',
      recurrence: task.recurrence || 'NONE',
      priority: task.priority || 'MEDIUM',
      assignedToUserId: assignedId,
    });
    setShowForm(true);
  };

  // When Department is changed, dynamically update and pre-select that department's workers
  const handleDepartmentChange = (e) => {
    const selectedDept = e.target.value;
    const matchingWorkers = usersList.filter(
      (u) => (u.department || '').trim().toLowerCase() === selectedDept.trim().toLowerCase()
    );

    setForm((prev) => {
      let nextAssigneeId = '';
      if (matchingWorkers.length > 0) {
        // Pre-select the first worker of this selected department
        nextAssigneeId = matchingWorkers[0].id || matchingWorkers[0]._id || matchingWorkers[0].employeeId;
      } else {
        // Fallback to self or blank if no dedicated worker
        nextAssigneeId = user?.id || user?._id || user?.employeeId || '';
      }

      return {
        ...prev,
        department: selectedDept,
        assignedToUserId: nextAssigneeId,
      };
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

      {/* Visual Work Action Guidance Banner */}
      <div className="p-3 sm:p-4 rounded-2xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-emerald-500/10 border border-indigo-500/20 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
            <Play className="w-4 h-4 fill-current ml-0.5" />
          </div>
          <div>
            <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Work Tracking Buttons</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-cyan-300">
                Start & Stop / Complete
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Click <strong className="text-indigo-600 dark:text-indigo-400">▶ Start Work</strong> on any task below when beginning work. When finished, click <strong className="text-emerald-600 dark:text-emerald-400">✓ Stop / Complete</strong> to upload mandatory photo proof.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-bold text-[11px] shadow-xs">
            <Play className="w-3 h-3 fill-current" />
            <span>Start Work</span>
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold text-[11px] shadow-xs">
            <CheckCircle2 className="w-3 h-3" />
            <span>Stop / Complete</span>
          </span>
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

          {/* Linked Department & Worker Selection: Step 1 Department -> Step 2 That Department's Workers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800">
            {/* 1. Department Dropdown */}
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>1. Select Department</span>
                </span>
                <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                  Step 1
                </span>
              </span>
              <select
                value={form.department}
                onChange={handleDepartmentChange}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-sm transition-colors"
              >
                {availableDepartments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-slate-500 font-medium">
                Select department to dynamically show its workers
              </span>
            </label>

            {/* 2. Worker / Staff Dropdown: Shows that department's workers */}
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-indigo-600" />
                  <span>2. Department Workers ({form.department})</span>
                </span>
                {loadingUsers ? (
                  <span className="text-[9px] text-indigo-500 font-normal animate-pulse">Loading workers...</span>
                ) : (
                  <span className="text-[9px] font-mono font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                    {departmentWorkers.length} {departmentWorkers.length === 1 ? 'Worker' : 'Workers'} Found
                  </span>
                )}
              </span>
              <select
                value={form.assignedToUserId}
                onChange={(e) => setForm({ ...form, assignedToUserId: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-sm transition-colors"
              >
                {departmentWorkers.length > 0 ? (
                  <optgroup label={`── Workers in ${form.department} (${departmentWorkers.length}) ──`}>
                    {departmentWorkers.map((u) => (
                      <option key={u.id || u._id || u.employeeId} value={u.id || u._id || u.employeeId}>
                        {u.name} — {u.designation || u.role} [{u.employeeId}]
                      </option>
                    ))}
                  </optgroup>
                ) : (
                  <option value="">No dedicated worker registered in {form.department}</option>
                )}

                {/* Quality Auditors option group */}
                <optgroup label="── Quality Auditors (Central Audit Team) ──">
                  {user && (
                    <option value={user.id || user._id || user.employeeId}>
                      Assign to Myself ({user.name} - {user.role})
                    </option>
                  )}
                  {auditors
                    .filter((a) => (a.id || a._id) !== (user?.id || user?._id))
                    .map((u) => (
                      <option key={u.id || u._id || u.employeeId} value={u.id || u._id || u.employeeId}>
                        {u.name} — {u.designation || 'Auditor'} [{u.employeeId}]
                      </option>
                    ))}
                </optgroup>

                {/* Other plant staff */}
                {otherWorkers.length > 0 && (
                  <optgroup label="── Other Plant Workers ──">
                    {otherWorkers.map((u) => (
                      <option key={u.id || u._id || u.employeeId} value={u.id || u._id || u.employeeId}>
                        {u.name} — {u.designation || u.role} ({u.department}) [{u.employeeId}]
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <span className="text-[10px] text-slate-500 font-medium">
                {departmentWorkers.length > 0
                  ? `Showing workers belonging to ${form.department}`
                  : `Assign to a Quality Auditor or Myself for this audit`}
              </span>
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

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Live Work Tracking Buttons */}
                      {!isDone && (
                        <>
                          {task.workStatus === 'IN_PROGRESS' || task.status === 'In Progress' ? (
                            <div className="flex items-center gap-1.5">
                              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse">
                                <Clock className="w-2.5 h-2.5" />
                                <span>In Progress / Busy</span>
                                {task.startedAt && (
                                  <span className="font-mono text-[9px] opacity-80">
                                    ({formatTimeAgo(task.startedAt)})
                                  </span>
                                )}
                              </span>

                              {/* Stop / Complete Work Button: Opens Proof Requirement Modal */}
                              <button
                                onClick={() => openProofModal(task)}
                                disabled={busyId === task.id}
                                title="Stop & Complete Work (Proof Upload Required)"
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Stop / Complete</span>
                              </button>
                            </div>
                          ) : (
                            /* Start Work Button */
                            <button
                              onClick={() => handleStartWork(task)}
                              disabled={busyId === task.id}
                              title="Start Work on this task (sets status to In Progress / Busy)"
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span>Start Work</span>
                            </button>
                          )}
                        </>
                      )}

                      {/* View Proof Button for Completed Tasks */}
                      {isDone && (task.proofPhoto || task.proofNotes) && (
                        <button
                          onClick={() => setViewProofTask(task)}
                          title="View Completion Proof & Photos"
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-bold cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Proof</span>
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

      {/* MODAL 1: Mandatory Proof of Completion Modal */}
      {proofModalTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Submit Work Completion Proof
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-xs">
                    {proofModalTask.title}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProofModalTask(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-bold">Required Proof Policy:</span>
                <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
                  You cannot mark this task as completed without uploading verified completion photos and corrective details.
                </p>
              </div>
            </div>

            {proofError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{proofError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitProof} className="space-y-4">
              {/* Photo Upload Area */}
              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-emerald-600" />
                    <span>1. Upload Completion Photo *</span>
                  </span>
                  <span className="text-[10px] text-rose-500 font-mono font-bold">Mandatory</span>
                </label>

                {proofPhotoPreview ? (
                  <div className="relative rounded-xl overflow-hidden border-2 border-emerald-500/50 bg-slate-950 flex flex-col items-center group">
                    <img
                      src={proofPhotoPreview}
                      alt="Completion proof"
                      className="w-full max-h-56 object-contain bg-slate-900"
                    />
                    <div className="absolute top-2 right-2 flex gap-1">
                      <label
                        htmlFor="proof-photo-replace"
                        className="px-2.5 py-1 rounded-lg bg-black/70 hover:bg-black text-white text-[10px] font-bold cursor-pointer backdrop-blur-xs flex items-center gap-1"
                      >
                        <Camera className="w-3 h-3" />
                        <span>Retake / Change</span>
                      </label>
                      <input
                        id="proof-photo-replace"
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleProofImageChange}
                        className="hidden"
                      />
                    </div>
                  </div>
                ) : (
                  <label
                    htmlFor="proof-photo-upload"
                    className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-2xl bg-slate-50 dark:bg-slate-800/50 hover:bg-emerald-50/20 cursor-pointer transition-colors"
                  >
                    <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2">
                      <Upload className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Take Photo or Browse Device
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5">
                      JPEG, PNG, WebP (camera auto-compressed)
                    </span>
                    <input
                      id="proof-photo-upload"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleProofImageChange}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {/* Completion Notes */}
              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>2. Completion Details / Action Notes *</span>
                  <span className="text-[10px] text-rose-500 font-mono font-bold">Mandatory</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={proofNotes}
                  onChange={(e) => setProofNotes(e.target.value)}
                  placeholder="Detail the work completed, inspection result, measurements taken, or maintenance performed..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setProofModalTask(null)}
                  disabled={submittingProof}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingProof || !proofPhoto}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/30 disabled:opacity-40 cursor-pointer transition-all active:scale-95"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{submittingProof ? 'Verifying & Saving...' : 'Verify Proof & Stop Work'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: View Completion Proof Modal */}
      {viewProofTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl space-y-3.5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  Completed Task Proof
                </h3>
              </div>
              <button
                onClick={() => setViewProofTask(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                {viewProofTask.title}
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Department: {viewProofTask.department} • Completed by: {viewProofTask.completedBy?.name || 'Assigned Worker'}
              </p>
            </div>

            {viewProofTask.proofPhoto && (
              <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black flex items-center justify-center">
                <img
                  src={viewProofTask.proofPhoto}
                  alt="Proof preview"
                  className="w-full max-h-72 object-contain"
                />
              </div>
            )}

            {viewProofTask.proofNotes && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs">
                <span className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Worker Action Details
                </span>
                <p className="text-slate-800 dark:text-slate-200 leading-relaxed">
                  {viewProofTask.proofNotes}
                </p>
              </div>
            )}

            <div className="text-[10px] font-mono text-slate-400 pt-1 flex justify-between">
              <span>Completed: {fmtDay(viewProofTask.completedAt)}</span>
              <span>Status: Verified & Done</span>
            </div>
          </div>
        </div>
      )}

      <p className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
        <ChevronRight className="w-3 h-3" />
        Recurring inspections re-schedule themselves when completed.
      </p>
    </div>
  );
};

export default MyTasksPanel;
