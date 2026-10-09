import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Flame,
  PlusCircle,
  ChevronRight,
  ArrowLeft,
  Search,
  Filter,
  Eye,
  Check,
  X,
  MinusCircle,
  HelpCircle,
  Building2,
  Users,
  Layers,
  Sparkles,
  RefreshCw,
  FileCheck2,
  Camera,
  Trophy,
  Play,
  UserCheck,
  ClipboardList,
} from 'lucide-react';
import { complaintService, taskService } from '../services/api';
import { useAuth } from '../context/AuthContext';

export const AuditManagementDashboard = ({ onOpenNewComplaint, onSelectNCFilter }) => {
  const { user, isAuditor, isAdmin } = useAuth();

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [audits, setAudits] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [activeAuditTab, setActiveAuditTab] = useState('rounds'); // 'rounds' | 'department-tasks'
  const [taskDeptFilter, setTaskDeptFilter] = useState('ALL');
  const [liveStatusData, setLiveStatusData] = useState(null);
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState('ALL');
  const [taskStatusFilter, setTaskStatusFilter] = useState('ALL');
  const [tasksSearchQuery, setTasksSearchQuery] = useState('');
  const [viewProofTask, setViewProofTask] = useState(null);
  const [stats, setStats] = useState({
    completedAudits: 0,
    openAudits: 0,
    ncsFound: 0,
    ncClosureRate: 100,
  });

  // Selected audit for checklist view (defaults to 'Internal Compliance Audit' if clicked)
  const [selectedAudit, setSelectedAudit] = useState(null);

  // Active status selection modal for checklist item
  const [activeChecklistItem, setActiveChecklistItem] = useState(null); // { dept, item }
  const [itemNotes, setItemNotes] = useState('');
  const [filterDept, setFilterDept] = useState('ALL');

  // New Audit Round Modal State
  const [isNewAuditModalOpen, setIsNewAuditModalOpen] = useState(false);
  const [newAuditTitle, setNewAuditTitle] = useState('');
  const [newAuditDate, setNewAuditDate] = useState('');
  const [newAuditType, setNewAuditType] = useState('Social & Labor');

  // Auditor Department Task Scheduling Modal State
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [newTaskForm, setNewTaskForm] = useState({
    title: '',
    department: 'Production',
    description: '',
    dueDate: '',
    priority: 'MEDIUM',
    assignedToUserId: 'DEPT_POOL',
  });
  const [savingNewTask, setSavingNewTask] = useState(false);
  const [newTaskError, setNewTaskError] = useState(null);

  const loadAudits = async (showSpinner = false) => {
    try {
      if (showSpinner) setLoading(true);
      else setIsRefreshing(true);

      const [auditRes, taskRes, liveRes] = await Promise.allSettled([
        complaintService.getAudits(),
        taskService.getTasks(),
        taskService.getLiveStatus({ department: taskDeptFilter }),
      ]);

      if (auditRes.status === 'fulfilled' && auditRes.value.data?.success) {
        setAudits(auditRes.value.data.audits || []);
        if (auditRes.value.data.stats) {
          setStats(auditRes.value.data.stats);
        }
      }

      if (taskRes.status === 'fulfilled' && taskRes.value.data?.success) {
        setTasks(taskRes.value.data.tasks || []);
      }

      if (liveRes.status === 'fulfilled' && liveRes.value.data?.success) {
        setLiveStatusData(liveRes.value.data);
      }
    } catch (err) {
      console.warn('Failed to fetch audits/tasks/live status from server:', err);
    } finally {
      if (showSpinner) setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadAudits(true);
    const interval = setInterval(() => {
      loadAudits(false);
    }, 10000);
    return () => clearInterval(interval);
  }, [taskDeptFilter]);

  const handleAuditorCreateTask = async (e) => {
    e.preventDefault();
    if (!newTaskForm.title.trim()) return;
    setSavingNewTask(true);
    setNewTaskError(null);
    try {
      const res = await taskService.createTask({
        title: newTaskForm.title.trim(),
        department: newTaskForm.department,
        description: newTaskForm.description.trim(),
        dueDate: newTaskForm.dueDate || new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        priority: newTaskForm.priority || 'MEDIUM',
        assignedToUserId: newTaskForm.assignedToUserId === 'DEPT_POOL' ? undefined : newTaskForm.assignedToUserId,
      });
      if (res.data?.success) {
        setIsNewTaskModalOpen(false);
        setNewTaskForm({
          title: '',
          department: taskDeptFilter !== 'ALL' ? taskDeptFilter : 'Production',
          description: '',
          dueDate: '',
          priority: 'MEDIUM',
          assignedToUserId: 'DEPT_POOL',
        });
        loadAudits(false);
      }
    } catch (err) {
      setNewTaskError(err.response?.data?.message || 'Failed to assign task.');
    } finally {
      setSavingNewTask(false);
    }
  };

  // Update item status in active audit
  const handleSetItemStatus = async (status) => {
    if (!activeChecklistItem || !selectedAudit) return;

    const { dept, item } = activeChecklistItem;

    // Optimistic UI update
    setSelectedAudit((prev) => {
      if (!prev) return prev;
      const updatedChecklist = { ...prev.checklist };
      if (updatedChecklist[dept]) {
        updatedChecklist[dept] = updatedChecklist[dept].map((i) =>
          i.id === item.id ? { ...i, status, notes: itemNotes } : i
        );
      }
      return { ...prev, checklist: updatedChecklist };
    });

    // Also update parent audits array
    setAudits((prev) =>
      prev.map((a) => {
        if (a.id !== selectedAudit.id) return a;
        const updatedChecklist = { ...a.checklist };
        if (updatedChecklist[dept]) {
          updatedChecklist[dept] = updatedChecklist[dept].map((i) =>
            i.id === item.id ? { ...i, status, notes: itemNotes } : i
          );
        }
        return { ...a, checklist: updatedChecklist };
      })
    );

    // Call server API
    try {
      await complaintService.updateAuditChecklist(selectedAudit.id, {
        department: dept,
        itemId: item.id,
        status,
        notes: itemNotes,
      });
    } catch (err) {
      console.warn('Could not persist checklist status to server:', err);
    }

    setActiveChecklistItem(null);
    setItemNotes('');
  };

  // Open modal to update checklist item
  const handleOpenItemModal = (dept, item) => {
    setActiveChecklistItem({ dept, item });
    setItemNotes(item.notes || '');
  };

  // Handle raise NC directly from Non-Compliant item
  const handleRaiseNC = (dept, item) => {
    setActiveChecklistItem(null);
    if (onOpenNewComplaint) {
      onOpenNewComplaint({
        department: dept,
        description: `Audit Finding [${selectedAudit?.title || 'Internal Audit'}]: ${item.label} non-compliance detected. ${itemNotes || item.notes || ''}`,
        requirement:
          dept === 'HR'
            ? 'Social & Statutory Compliance Standard'
            : dept === 'Production'
            ? 'AQL 1.5 Workmanship Standard'
            : 'Safety & Factory Floor Compliance',
      });
    }
  };

  // Create new audit round
  const handleCreateAudit = async (e) => {
    e.preventDefault();
    if (!newAuditTitle || !newAuditDate) return;

    try {
      const res = await complaintService.createAudit({
        title: newAuditTitle,
        date: newAuditDate,
        type: newAuditType,
        leadAuditor: user?.name || 'Auditor',
      });
      if (res.data?.success && res.data.audit) {
        setAudits((prev) => [res.data.audit, ...prev]);
        setSelectedAudit(res.data.audit);
      }
    } catch (err) {
      console.warn('Could not create audit on server:', err);
    } finally {
      setIsNewAuditModalOpen(false);
      setNewAuditTitle('');
      setNewAuditDate('');
    }
  };

  // Checklist completion statistics
  const checklistStats = useMemo(() => {
    if (!selectedAudit || !selectedAudit.checklist) {
      return { total: 0, compliant: 0, nonCompliant: 0, observation: 0, notApplicable: 0, pending: 0, percent: 0 };
    }
    const allItems = Object.values(selectedAudit.checklist).flat();
    const total = allItems.length;
    const compliant = allItems.filter((i) => i.status === 'COMPLIANT').length;
    const nonCompliant = allItems.filter((i) => i.status === 'NON_COMPLIANT').length;
    const observation = allItems.filter((i) => i.status === 'OBSERVATION').length;
    const notApplicable = allItems.filter((i) => i.status === 'NOT_APPLICABLE').length;
    const pending = allItems.filter((i) => !i.status || i.status === 'PENDING').length;
    const checked = total - pending;
    const percent = total > 0 ? Math.round((checked / total) * 100) : 0;

    return { total, compliant, nonCompliant, observation, notApplicable, pending, percent, checked };
  }, [selectedAudit]);

  // Status visual badge helper
  const getItemStatusBadge = (status) => {
    switch (status) {
      case 'COMPLIANT':
        return {
          icon: '☑',
          label: 'Compliant',
          badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20',
          boxClass: 'bg-emerald-600 text-white border-emerald-600',
        };
      case 'NON_COMPLIANT':
        return {
          icon: '☒',
          label: 'Non-Compliant',
          badgeClass: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20',
          boxClass: 'bg-rose-600 text-white border-rose-600',
        };
      case 'OBSERVATION':
        return {
          icon: '👁️',
          label: 'Observation',
          badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20',
          boxClass: 'bg-amber-500 text-white border-amber-500',
        };
      case 'NOT_APPLICABLE':
        return {
          icon: '⊘',
          label: 'Not Applicable',
          badgeClass: 'bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700',
          boxClass: 'bg-slate-400 text-white border-slate-400',
        };
      default:
        return {
          icon: '☐',
          label: 'Pending Audit',
          badgeClass: 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700',
          boxClass: 'bg-transparent text-transparent border-slate-400 dark:border-slate-500',
        };
    }
  };

  // Filtered employees from live telemetry
  const allEmployees = liveStatusData?.employees || [];
  const filteredEmployees = allEmployees
    .filter((emp) => {
      if (employeeStatusFilter === 'AVAILABLE') return emp.status === 'Available';
      if (employeeStatusFilter === 'BUSY') return emp.status === 'In Progress / Busy';
      if (employeeStatusFilter === 'COMPLETED') return emp.status === 'Completed';
      return true;
    })
    .filter((emp) => {
      if (!tasksSearchQuery.trim()) return true;
      const q = tasksSearchQuery.toLowerCase();
      return (
        emp.name?.toLowerCase().includes(q) ||
        emp.employeeId?.toLowerCase().includes(q) ||
        emp.department?.toLowerCase().includes(q) ||
        emp.assignedTask?.title?.toLowerCase().includes(q)
      );
    });

  // Filtered compliance tasks
  const filteredTasks = tasks
    .filter((t) => {
      if (taskDeptFilter !== 'ALL' && t.department !== taskDeptFilter) return false;
      const isDone = t.status === 'Completed' || t.workStatus === 'COMPLETED';
      const isBusy = t.workStatus === 'IN_PROGRESS' || (t.status === 'In Progress' && !isDone);
      if (taskStatusFilter === 'IN_PROGRESS') return isBusy;
      if (taskStatusFilter === 'COMPLETED') return isDone;
      if (taskStatusFilter === 'PENDING') return !isDone && !isBusy;
      return true;
    })
    .filter((t) => {
      if (!tasksSearchQuery.trim()) return true;
      const q = tasksSearchQuery.toLowerCase();
      const winnerName = t.completedBy?.name || t.firstCompleter?.name || '';
      const winnerId = t.completedBy?.employeeId || t.firstCompleter?.employeeId || '';
      const assigneeName = t.assignedTo?.name || '';
      return (
        t.title?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.department?.toLowerCase().includes(q) ||
        winnerName.toLowerCase().includes(q) ||
        winnerId.toLowerCase().includes(q) ||
        assigneeName.toLowerCase().includes(q)
      );
    });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ============================================================ */}
      {/* 1. TOP HEADER BANNER: AUDIT MANAGEMENT                       */}
      {/* ============================================================ */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 border border-purple-500/20 p-5 sm:p-7 shadow-xl shadow-purple-950/20 text-white">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 rounded-full bg-purple-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30">
                <ShieldCheck className="w-3.5 h-3.5" />
                Auditor Operations Center
              </span>
              <span className="text-xs text-slate-400 font-mono hidden sm:inline">
                Apparel Unit #4 • Continuous Inspection Rounds
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight font-sans uppercase">
              AUDIT MANAGEMENT
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
              Conduct scheduled audit rounds, execute department checklists, log non-conformances,
              and track verification closures.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsNewAuditModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md shadow-purple-600/30 transition-all cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>+ Schedule Audit</span>
            </button>

            {isAuditor && (
              <button
                type="button"
                onClick={() => onOpenNewComplaint && onOpenNewComplaint()}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>+ Log NC Defect</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => loadAudits(false)}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 text-xs font-semibold cursor-pointer"
              title="Refresh audits"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. TOP METRICS: COMPLETED, OPEN, NCS FOUND, NC CLOSURE       */}
      {/* ============================================================ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Completed Audits: 24 */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
            <span>Completed Audits</span>
            <span className="p-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="my-2">
            <span className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white font-sans">
              {stats.completedAudits}
            </span>
            <span className="text-xs text-slate-400 ml-1.5">Inspections</span>
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
            100% Verified Documentation
          </div>
        </div>

        {/* Open Audits: 3 */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
            <span>Open Audits</span>
            <span className="p-1 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
              <Clock className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="my-2">
            <span className="text-3xl sm:text-4xl font-extrabold text-purple-600 dark:text-purple-400 font-sans">
              {stats.openAudits}
            </span>
            <span className="text-xs text-slate-400 ml-1.5">Active Rounds</span>
          </div>
          <div className="text-[11px] text-purple-600 dark:text-purple-400 font-medium">
            Floor Inspections in Progress
          </div>
        </div>

        {/* NCs Found: 87 */}
        <div
          onClick={() => onSelectNCFilter && onSelectNCFilter('all')}
          className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 shadow-xs flex flex-col justify-between cursor-pointer group hover:border-amber-400 transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
            <span>NCs Found</span>
            <span className="p-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="my-2 flex items-baseline justify-between">
            <span className="text-3xl sm:text-4xl font-extrabold text-amber-600 dark:text-amber-400 font-sans">
              {stats.ncsFound}
            </span>
            <span className="text-xs text-indigo-600 dark:text-cyan-400 group-hover:translate-x-0.5 transition-transform flex items-center">
              Register →
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Across 7 Factory Departments
          </div>
        </div>

        {/* NC Closure: 91% */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
            <span>NC Closure</span>
            <span className="p-1 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400">
              <FileCheck2 className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="my-2">
            <span className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white font-sans">
              {stats.ncClosureRate}%
            </span>
            
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Closed-Loop CAP Effectiveness
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 3. CONDITIONAL VIEW: UPCOMING AUDITS LIST OR AUDIT CHECKLIST */}
      {/* ============================================================ */}

      {!selectedAudit ? (
        <div className="space-y-4">
          {/* View Mode Toggle: Audit Rounds vs Department Tasks & Verified Proofs */}
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <button
              type="button"
              onClick={() => setActiveAuditTab('rounds')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                activeAuditTab === 'rounds'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Audit Inspection Rounds ({audits.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveAuditTab('department-tasks')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                activeAuditTab === 'department-tasks'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
              }`}
            >
              <ClipboardList className="w-4 h-4" />
              <span>Department Tasks & Live Employee Work</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                  activeAuditTab === 'department-tasks'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {tasks.length}
              </span>
              {liveStatusData?.summary?.inProgress > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold bg-amber-400 text-slate-950 animate-pulse">
                  {liveStatusData.summary.inProgress} BUSY
                </span>
              )}
            </button>
          </div>

          {activeAuditTab === 'rounds' ? (
            /* UPCOMING AUDITS TABLE / CARD VIEW */
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Upcoming Audits</span>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  {audits.length} Rounds
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Click on any audit to open the department checklists and conduct the inspection.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsNewAuditModalOpen(true)}
              className="text-xs font-bold text-indigo-600 dark:text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>+ Add Schedule</span>
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {audits.map((audit) => {
              const isScheduled = audit.status === 'Scheduled';
              const isInProgress = audit.status === 'In Progress';
              const isDraft = audit.status === 'Draft';

              return (
                <div
                  key={audit.id}
                  onClick={() => setSelectedAudit(audit)}
                  className="py-3.5 px-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer group"
                >
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-xs shrink-0 group-hover:scale-105 transition-transform">
                      <ShieldCheck className="w-5 h-5" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-cyan-400 transition-colors">
                          {audit.title}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">({audit.type})</span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                        <span className="flex items-center gap-1 font-mono">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          {audit.date}
                        </span>
                        <span>•</span>
                        <span>Auditor: {audit.leadAuditor}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <span
                      className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-lg border font-mono ${
                        isScheduled
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800'
                          : isInProgress
                          ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800 animate-pulse'
                          : isDraft
                          ? 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                      }`}
                    >
                      {audit.status}
                    </span>

                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-cyan-400 group-hover:translate-x-1 transition-transform"
                    >
                      <span>Open Checklist</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* 2. DEPARTMENT TASKS & LIVE EMPLOYEE WORK (USER REQUIREMENTS 1,2,3,4,5)    */
        /* ========================================================================= */
        <div className="space-y-6 animate-fade-in">
          {/* Summary KPI Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Total Department Staff
              </span>
              <div className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" />
                <span>{liveStatusData?.summary?.totalEmployees ?? 0}</span>
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">Active plant workers</span>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block mb-1">
                Available Workers
              </span>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500" />
                <span>{liveStatusData?.summary?.available ?? 0}</span>
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">Ready for assignment</span>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 block mb-1">
                In Progress / Busy
              </span>
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-500 animate-ping" />
                <span>{liveStatusData?.summary?.inProgress ?? 0}</span>
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">Currently on floor tasks</span>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-cyan-400 block mb-1">
                Tasks Completed
              </span>
              <div className="text-2xl font-black text-indigo-600 dark:text-cyan-400 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-indigo-600 dark:text-cyan-400" />
                <span>{liveStatusData?.summary?.completed ?? 0}</span>
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">With verified photo proof</span>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs col-span-2 sm:col-span-4 lg:col-span-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 block mb-1">
                Compliance Tasks
              </span>
              <div className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-purple-600" />
                <span>{tasks.length}</span>
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                {tasks.filter((t) => t.workStatus === 'IN_PROGRESS' || t.status === 'In Progress').length} in progress
              </span>
            </div>
          </div>

          {/* First Finisher 🏆 Banner (Identifies who completed task first) */}
          {liveStatusData?.firstFinisher && (
            <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/5 border border-amber-300 dark:border-amber-700/60 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center text-2xl shadow-md shadow-amber-500/30 shrink-0">
                  🏆
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500 text-slate-950">
                      1st Finisher Recognized
                    </span>
                    <span className="text-xs font-mono text-amber-800 dark:text-amber-300 font-bold">
                      Completed 1st in Department
                    </span>
                  </div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                    {liveStatusData.firstFinisher.name} ({liveStatusData.firstFinisher.employeeId})
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Dept: <span className="font-bold">{liveStatusData.firstFinisher.department}</span> • Task:{' '}
                    <span className="font-semibold">
                      {liveStatusData.firstFinisher.assignedTask?.title || 'Floor Task'}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-center">
                <div className="text-right">
                  <span className="text-[10px] font-mono font-bold text-slate-400 block uppercase">
                    Completion Timestamp
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                    {liveStatusData.firstFinisher.completionTime
                      ? new Date(liveStatusData.firstFinisher.completionTime).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })
                      : '—'}
                  </span>
                </div>
                {liveStatusData.firstFinisher.proofPhoto && (
                  <button
                    type="button"
                    onClick={() =>
                      setViewProofTask({
                        title: liveStatusData.firstFinisher.assignedTask?.title || 'Completed Task',
                        department: liveStatusData.firstFinisher.department,
                        completedBy: liveStatusData.firstFinisher,
                        completedAt: liveStatusData.firstFinisher.completionTime,
                        proofPhoto: liveStatusData.firstFinisher.proofPhoto,
                        proofNotes: liveStatusData.firstFinisher.proofNotes,
                      })
                    }
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-xs cursor-pointer transition-all active:scale-95"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>View Proof</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* SECTION 1: LIVE EMPLOYEE WORK STATUS TABLE (REQUIREMENT 1 & 3) */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-indigo-600" />
                  <span>1. Live Employee Availability & Work Tracking</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Instant visibility into available vs busy staff, who started work, and fast finisher rankings.
                </p>
              </div>

              {/* Department & Status Filters */}
              <div className="flex flex-wrap items-center gap-2">
                {(isAuditor || isAdmin) && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewTaskForm({
                        title: '',
                        department: taskDeptFilter !== 'ALL' ? taskDeptFilter : 'Production',
                        description: '',
                        dueDate: new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16),
                        priority: 'MEDIUM',
                        assignedToUserId: 'DEPT_POOL',
                      });
                      setIsNewTaskModalOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>+ Assign Task</span>
                  </button>
                )}

                <div className="flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <select
                    value={taskDeptFilter}
                    onChange={(e) => setTaskDeptFilter(e.target.value)}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white outline-none cursor-pointer"
                  >
                    <option value="ALL">All Departments</option>
                    {['Production', 'Quality', 'Maintenance', 'Store', 'EHS', 'EDP', 'HR', 'Central Quality Audit'].map(
                      (d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <select
                  value={employeeStatusFilter}
                  onChange={(e) => setEmployeeStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white outline-none cursor-pointer"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="AVAILABLE">Available (Idle)</option>
                  <option value="BUSY">In Progress / Busy</option>
                  <option value="COMPLETED">Completed</option>
                </select>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search employee / task..."
                    value={tasksSearchQuery}
                    onChange={(e) => setTasksSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none w-44"
                  />
                </div>
              </div>
            </div>

            {/* Employee Table */}
            <div className="overflow-x-auto rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50/90 dark:bg-slate-950/80 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono text-[10px] sm:text-[11px] border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4 font-bold">Employee Name & ID</th>
                    <th className="py-3.5 px-4 font-bold">Department</th>
                    <th className="py-3.5 px-4 font-bold text-center">Availability Status</th>
                    <th className="py-3.5 px-4 font-bold">Assigned Task</th>
                    <th className="py-3.5 px-3 font-bold">Start Time</th>
                    <th className="py-3.5 px-3 font-bold">Completion Time</th>
                    <th className="py-3.5 px-4 font-bold text-center">Proof Status</th>
                    <th className="py-3.5 px-3 font-bold text-center">Finish Rank</th>
                    <th className="py-3.5 px-4 font-bold text-right">Proof Oversight</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                  {filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400 text-xs font-mono">
                        No employees found matching the current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredEmployees.map((emp) => {
                      const isBusy = emp.status === 'In Progress / Busy';
                      const isDone = emp.status === 'Completed';
                      const isAvailable = emp.status === 'Available';

                      return (
                        <tr
                          key={emp.employeeId || emp.userId}
                          className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors ${
                            isBusy ? 'bg-amber-500/5' : ''
                          }`}
                        >
                          {/* Name & ID */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                                  isBusy
                                    ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/40'
                                    : isDone
                                    ? 'bg-indigo-500/20 text-indigo-700 dark:text-cyan-300 border border-indigo-500/30'
                                    : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                                }`}
                              >
                                {emp.name ? emp.name[0] : 'U'}
                              </div>
                              <div>
                                <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                                  <span>{emp.name}</span>
                                  {emp.completionRank === 1 && (
                                    <span title="First Finisher in Department">🏆</span>
                                  )}
                                </div>
                                <span className="text-[11px] font-mono text-slate-400">
                                  {emp.employeeId} • {emp.designation || 'Staff'}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Department */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              {emp.department}
                            </span>
                          </td>

                          {/* Availability Status */}
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            {isBusy ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40 animate-pulse">
                                <span className="w-2 h-2 rounded-full bg-amber-500" />
                                <span>In Progress / Busy</span>
                              </span>
                            ) : isDone ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Completed</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                <span>Available</span>
                              </span>
                            )}
                          </td>

                          {/* Assigned Task */}
                          <td className="py-3.5 px-4">
                            {emp.assignedTask ? (
                              <div className="max-w-xs">
                                <div className="font-bold text-slate-900 dark:text-white truncate">
                                  {emp.assignedTask.title}
                                </div>
                                {emp.assignedTask.priority && (
                                  <span className="text-[10px] font-mono text-slate-400">
                                    Priority: {emp.assignedTask.priority}
                                  </span>
                                )}
                              </div>
                            ) : emp.openTask ? (
                              <span className="text-[11px] text-slate-500 italic">
                                Open task ready to start
                              </span>
                            ) : (
                              <span className="text-slate-400 font-mono text-xs">—</span>
                            )}
                          </td>

                          {/* Start Time */}
                          <td className="py-3.5 px-3 whitespace-nowrap font-mono text-[11px] text-slate-600 dark:text-slate-300">
                            {emp.startTime ? (
                              <div>
                                <div className="font-bold text-slate-800 dark:text-slate-200">
                                  {new Date(emp.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                                <span className="text-[9px] text-slate-400">
                                  {new Date(emp.startTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          {/* Completion Time */}
                          <td className="py-3.5 px-3 whitespace-nowrap font-mono text-[11px] text-slate-600 dark:text-slate-300">
                            {emp.completionTime ? (
                              <div>
                                <div className="font-bold text-indigo-600 dark:text-cyan-400">
                                  {new Date(emp.completionTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                                <span className="text-[9px] text-slate-400">
                                  {new Date(emp.completionTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          {/* Proof Status */}
                          <td className="py-3.5 px-4 text-center whitespace-nowrap font-mono text-xs">
                            {emp.proofStatus === 'Verified / Uploaded' || emp.proofPhoto ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Photo Verified</span>
                              </span>
                            ) : isBusy ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                <Clock className="w-3 h-3" />
                                <span>Pending Upload</span>
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          {/* Finish Rank */}
                          <td className="py-3.5 px-3 text-center whitespace-nowrap">
                            {emp.completionRank === 1 ? (
                              <span className="px-2 py-0.5 rounded-lg text-xs font-black bg-amber-400 text-slate-950 shadow-2xs">
                                🏆 1st
                              </span>
                            ) : emp.completionRank ? (
                              <span className="px-2 py-0.5 rounded-lg text-xs font-mono font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                #{emp.completionRank}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-mono">—</span>
                            )}
                          </td>

                          {/* Proof Oversight Action */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            {emp.proofPhoto ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setViewProofTask({
                                    title: emp.assignedTask?.title || 'Completed Work',
                                    department: emp.department,
                                    completedBy: emp,
                                    completedAt: emp.completionTime,
                                    proofPhoto: emp.proofPhoto,
                                    proofNotes: emp.proofNotes,
                                  })
                                }
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/30 transition-all active:scale-95 cursor-pointer"
                              >
                                <Camera className="w-3.5 h-3.5" />
                                <span>View Proof</span>
                              </button>
                            ) : isBusy ? (
                              <span className="text-[11px] font-mono text-amber-600 dark:text-amber-400 font-semibold">
                                In Progress
                              </span>
                            ) : (
                              <span className="text-slate-400 font-mono text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECTION 2: DEPARTMENT COMPLIANCE TASKS REGISTER (REQUIREMENT 2, 3, 4, 5) */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-indigo-600" />
                  <span>2. Department Compliance Tasks & In-Progress Work Register</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Current status of every assigned task, active in-progress workers, and recognized first completers.
                </p>
              </div>

              {/* Task Status Filter Pills */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { id: 'ALL', label: 'All Tasks', count: tasks.length },
                  {
                    id: 'IN_PROGRESS',
                    label: 'In Progress',
                    count: tasks.filter((t) => t.workStatus === 'IN_PROGRESS' || t.status === 'In Progress').length,
                  },
                  {
                    id: 'COMPLETED',
                    label: 'Completed',
                    count: tasks.filter((t) => t.status === 'Completed' || t.workStatus === 'COMPLETED').length,
                  },
                  {
                    id: 'PENDING',
                    label: 'Pending',
                    count: tasks.filter(
                      (t) =>
                        t.status !== 'Completed' &&
                        t.workStatus !== 'COMPLETED' &&
                        t.workStatus !== 'IN_PROGRESS' &&
                        t.status !== 'In Progress'
                    ).length,
                  },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setTaskStatusFilter(f.id)}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      taskStatusFilter === f.id
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    {f.label} ({f.count})
                  </button>
                ))}
              </div>
            </div>

            {/* Tasks Register Table */}
            <div className="overflow-x-auto rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50/90 dark:bg-slate-950/80 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono text-[10px] sm:text-[11px] border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4 font-bold">Task Title & Details</th>
                    <th className="py-3.5 px-4 font-bold">Department</th>
                    <th className="py-3.5 px-4 font-bold text-center">Current Task Status</th>
                    <th className="py-3.5 px-4 font-bold">Task Owner / 1st Completer</th>
                    <th className="py-3.5 px-3 font-bold">Completion Time</th>
                    <th className="py-3.5 px-4 font-bold text-right">Proof Verification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                  {filteredTasks.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 text-xs font-mono">
                        No compliance tasks found matching the filter.
                      </td>
                    </tr>
                  ) : (
                    filteredTasks.map((task) => {
                      const isDone = task.status === 'Completed' || task.workStatus === 'COMPLETED';
                      const isBusy = task.workStatus === 'IN_PROGRESS' || (task.status === 'In Progress' && !isDone);
                      const winner = task.completedBy || task.firstCompleter || task.assignedTo;

                      return (
                        <tr
                          key={task.id}
                          className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors ${
                            isDone ? 'bg-emerald-500/5' : isBusy ? 'bg-amber-500/5' : ''
                          }`}
                        >
                          {/* Task Title & Details */}
                          <td className="py-3.5 px-4">
                            <div className="max-w-md">
                              <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                                <span>{task.title}</span>
                                {task.priority && (
                                  <span
                                    className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${
                                      task.priority === 'HIGH'
                                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                    }`}
                                  >
                                    {task.priority}
                                  </span>
                                )}
                              </div>
                              {task.description && (
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                  {task.description}
                                </p>
                              )}
                            </div>
                          </td>

                          {/* Department */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              {task.department}
                            </span>
                          </td>

                          {/* Current Task Status (Requirement 2 & 5) */}
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            {isDone ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Completed</span>
                              </span>
                            ) : isBusy ? (
                              <div className="inline-flex flex-col items-center">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40 animate-pulse">
                                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                                  <span>In Progress / Busy</span>
                                </span>
                                {Array.isArray(task.activeWorkers) && task.activeWorkers.length > 0 && (
                                  <div className="mt-1 flex flex-col items-center">
                                    <span className="text-[10px] font-mono text-amber-700 dark:text-amber-400 font-bold">
                                      {task.activeWorkers.length} Active{' '}
                                      {task.activeWorkers.length === 1 ? 'Worker' : 'Workers'}
                                    </span>
                                    <span className="text-[9px] text-slate-500 dark:text-slate-400 font-mono">
                                      {task.activeWorkers.map((w) => w.name || w.employeeId).join(', ')}
                                    </span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                <span>Pending</span>
                              </span>
                            )}
                          </td>

                          {/* Task Owner / 1st Completer (Requirement 3) */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {isDone ? (
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded-lg text-xs font-black bg-amber-400 text-slate-950 border border-amber-500 shadow-2xs">
                                  🏆 1st Completer
                                </span>
                                <div>
                                  <div className="font-extrabold text-slate-900 dark:text-white">
                                    {winner?.name || 'Department Worker'}
                                  </div>
                                  <span className="text-[10px] font-mono text-slate-400">
                                    {winner?.employeeId}
                                  </span>
                                </div>
                              </div>
                            ) : task.assignedTo?.employeeId === 'DEPT-POOL' ? (
                              <span className="px-2 py-1 rounded-lg text-[11px] font-bold bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                🌟 Open to Department Pool
                              </span>
                            ) : (
                              <div>
                                <span className="font-bold text-slate-800 dark:text-slate-200">
                                  {task.assignedTo?.name || 'Assigned Staff'}
                                </span>
                                {task.assignedTo?.employeeId && (
                                  <span className="text-[10px] font-mono text-slate-400 block">
                                    {task.assignedTo.employeeId}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Completion Time (Requirement 4) */}
                          <td className="py-3.5 px-3 whitespace-nowrap font-mono text-[11px] text-slate-600 dark:text-slate-300">
                            {task.completedAt ? (
                              <div>
                                <div className="font-bold text-indigo-600 dark:text-cyan-400">
                                  {new Date(task.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                                <span className="text-[9px] text-slate-400">
                                  {new Date(task.completedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          {/* Proof Verification Action (Requirement 4) */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            {task.proofPhoto ? (
                              <button
                                type="button"
                                onClick={() => setViewProofTask(task)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/30 transition-all active:scale-95 cursor-pointer"
                              >
                                <Camera className="w-3.5 h-3.5" />
                                <span>View Verified Proof</span>
                              </button>
                            ) : isBusy ? (
                              <span className="text-[11px] font-mono text-amber-600 dark:text-amber-400 font-semibold">
                                Pending Upload
                              </span>
                            ) : (
                              <span className="text-slate-400 font-mono text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
        </div>
      ) : (
        /* ============================================================ */
        /* 4. AUDIT CHECKLIST EXECUTION SCREEN                          */
        /* "AUDIT: Internal Compliance Audit"                           */
        /* ============================================================ */
        <div className="space-y-5">
          {/* Top Bar for Selected Audit */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedAudit(null)}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition-colors"
                title="Back to all upcoming audits"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>

              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 font-mono">
                  ACTIVE AUDIT INSPECTION
                </div>
                <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
                  AUDIT: {selectedAudit.title}
                </h2>
              </div>
            </div>

            {/* Audit Progress & Actions */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  {checklistStats.checked} / {checklistStats.total} Audited ({checklistStats.percent}%)
                </div>
                <div className="w-32 bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden mt-1">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${checklistStats.percent}%` }}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  alert(`Audit [${selectedAudit.title}] session saved successfully.`);
                  setSelectedAudit(null);
                }}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
              >
                Complete Audit
              </button>
            </div>
          </div>

          {/* Checklist Summary Stats Pill */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold border border-emerald-500/20">
              🟢 {checklistStats.compliant} Compliant
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-400 font-bold border border-rose-500/20">
              🔴 {checklistStats.nonCompliant} Non-Compliant
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold border border-amber-500/20">
              🟡 {checklistStats.observation} Observations
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold border border-slate-200 dark:border-slate-700">
              ⚪ {checklistStats.notApplicable} N/A
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 font-bold border border-indigo-200 dark:border-indigo-800/60">
              ☐ {checklistStats.pending} Pending Audit
            </span>
          </div>

          {/* ============================================================ */}
          {/* DEPARTMENT CHECKLIST ACCORDIONS: HR, PRODUCTION, EHS        */}
          {/* ============================================================ */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {['HR', 'Production', 'EHS'].map((deptName) => {
              const items = selectedAudit.checklist?.[deptName] || [];
              const deptCompliantCount = items.filter((i) => i.status === 'COMPLIANT').length;
              const deptNonCompliantCount = items.filter((i) => i.status === 'NON_COMPLIANT').length;

              return (
                <div
                  key={deptName}
                  className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between"
                >
                  <div>
                    {/* Department Header */}
                    <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-extrabold text-slate-900 dark:text-white">
                          {deptName}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {items.length} items
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold">
                        <span className="text-emerald-600">✓ {deptCompliantCount}</span>
                        {deptNonCompliantCount > 0 && (
                          <span className="text-rose-600">✗ {deptNonCompliantCount}</span>
                        )}
                      </div>
                    </div>

                    {/* Department Checklist Items */}
                    <div className="space-y-2.5">
                      {items.map((item) => {
                        const statusInfo = getItemStatusBadge(item.status);
                        const isChecked = item.status === 'COMPLIANT';
                        const isNonCompliant = item.status === 'NON_COMPLIANT';

                        return (
                          <div
                            key={item.id}
                            className={`p-3 rounded-xl border transition-all text-xs flex flex-col gap-1.5 ${
                              isNonCompliant
                                ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60'
                                : isChecked
                                ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60'
                                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              {/* Checkbox item label & click target */}
                              <div
                                onClick={() => handleOpenItemModal(deptName, item)}
                                className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0"
                              >
                                {/* Checkbox representation (☑ / ☐) */}
                                <div
                                  className={`w-5 h-5 rounded-md border flex items-center justify-center font-bold text-xs shrink-0 transition-colors ${statusInfo.boxClass}`}
                                >
                                  {item.status === 'COMPLIANT' && <Check className="w-3.5 h-3.5" />}
                                  {item.status === 'NON_COMPLIANT' && <X className="w-3.5 h-3.5" />}
                                  {item.status === 'OBSERVATION' && <Eye className="w-3 h-3" />}
                                  {item.status === 'NOT_APPLICABLE' && <MinusCircle className="w-3 h-3" />}
                                </div>

                                <span
                                  className={`font-semibold text-slate-800 dark:text-slate-200 truncate ${
                                    isChecked ? 'text-emerald-950 dark:text-emerald-200' : ''
                                  }`}
                                >
                                  {item.label}
                                </span>
                              </div>

                              {/* Status Tag Button */}
                              <button
                                type="button"
                                onClick={() => handleOpenItemModal(deptName, item)}
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md cursor-pointer transition-colors ${statusInfo.badgeClass}`}
                              >
                                {statusInfo.label}
                              </button>
                            </div>

                            {/* Item Notes / Finding text if any */}
                            {item.notes && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 pl-7 italic line-clamp-2">
                                "{item.notes}"
                              </p>
                            )}

                            {/* If Non-Compliant, show quick "+ Raise NC" link directly inside the card */}
                            {isNonCompliant && (
                              <div className="pl-7 pt-1 flex items-center justify-between">
                                <span className="text-[10px] text-rose-600 font-bold">
                                  Defect Logged
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleRaiseNC(deptName, item)}
                                  className="text-[10px] font-bold text-rose-600 hover:text-rose-700 underline flex items-center gap-1 cursor-pointer"
                                >
                                  <span>+ Raise NC Ticket</span>
                                  <ChevronRight className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 text-center">
                    Click any checklist item to set Compliant, Non-Compliant, N/A, or Observation
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 5. INTERACTIVE MODAL WHEN AUDITOR CLICKS ☐ ITEM               */}
      {/* Allows choosing: Compliant | Non-Compliant | N/A | Observation */}
      {/* ============================================================ */}
      {activeChecklistItem && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 sm:p-6 text-slate-900 dark:text-slate-100 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-purple-600 dark:text-cyan-400">
                  {activeChecklistItem.dept} Department
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                  {activeChecklistItem.item.label}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveChecklistItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Checklist Option Buttons (Exact options requested by user) */}
            <div className="space-y-2.5 my-4">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">
                Select Audit Finding Status:
              </label>

              {/* 1. Compliant */}
              <button
                type="button"
                onClick={() => handleSetItemStatus('COMPLIANT')}
                className="w-full p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between text-xs font-bold text-emerald-800 dark:text-emerald-300 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                    <Check className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <div className="font-bold">Compliant</div>
                    <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-normal">
                      Meets standard clauses & procedure requirements
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-emerald-600 group-hover:translate-x-1 transition-transform" />
              </button>

              {/* 2. Non-Compliant */}
              <button
                type="button"
                onClick={() => handleSetItemStatus('NON_COMPLIANT')}
                className="w-full p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-center justify-between text-xs font-bold text-rose-800 dark:text-rose-300 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-rose-600 text-white flex items-center justify-center">
                    <X className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <div className="font-bold">Non-Compliant (Defect Found)</div>
                    <div className="text-[10px] text-rose-600 dark:text-rose-400 font-normal">
                      Fails audit standard. Corrective Action Required (CAP)
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-rose-600 group-hover:translate-x-1 transition-transform" />
              </button>

              {/* 3. Not Applicable */}
              <button
                type="button"
                onClick={() => handleSetItemStatus('NOT_APPLICABLE')}
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-slate-400 text-white flex items-center justify-center">
                    <MinusCircle className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <div className="font-bold">Not Applicable (N/A)</div>
                    <div className="text-[10px] text-slate-500 font-normal">
                      Item does not apply to this production section
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
              </button>

              {/* 4. Observation */}
              <button
                type="button"
                onClick={() => handleSetItemStatus('OBSERVATION')}
                className="w-full p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50 border border-amber-200 dark:border-amber-800 flex items-center justify-between text-xs font-bold text-amber-800 dark:text-amber-300 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-amber-500 text-white flex items-center justify-center">
                    <Eye className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <div className="font-bold">Observation</div>
                    <div className="text-[10px] text-amber-600 dark:text-amber-400 font-normal">
                      Advisory comment / minor potential risk noted
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-amber-600 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            {/* Auditor Finding Notes input */}
            <div className="my-3">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                Auditor Finding Remarks / Floor Evidence:
              </label>
              <textarea
                rows={2}
                value={itemNotes}
                onChange={(e) => setItemNotes(e.target.value)}
                placeholder="E.g., Overtime records in sewing line 2 exceeded 60h/week during peak shipping week..."
                className="w-full p-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>

            {/* Quick Raise NC Button (If auditor wants to file NC right away) */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() =>
                  handleRaiseNC(activeChecklistItem.dept, activeChecklistItem.item)
                }
                className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Issue NC Defect Immediately →</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveChecklistItem(null)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 6. MODAL TO SCHEDULE NEW AUDIT ROUND                         */}
      {/* ============================================================ */}
      {isNewAuditModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 text-slate-900 dark:text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-purple-600" />
                <span>Schedule New Audit Round</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsNewAuditModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAudit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Audit Title:
                </label>
                <input
                  type="text"
                  required
                  placeholder="E.g., Pre-Shipment Technical Audit"
                  value={newAuditTitle}
                  onChange={(e) => setNewAuditTitle(e.target.value)}
                  className="w-full p-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Scheduled Date:
                </label>
                <input
                  type="text"
                  required
                  placeholder="E.g., 28-Oct-26"
                  value={newAuditDate}
                  onChange={(e) => setNewAuditDate(e.target.value)}
                  className="w-full p-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Audit Type / Scope:
                </label>
                <select
                  value={newAuditType}
                  onChange={(e) => setNewAuditType(e.target.value)}
                  className="w-full p-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
                >
                  <option value="Social & Labor">Social & Labor Audit (SA8000)</option>
                  <option value="Environmental Health & Safety">EHS & Fire Safety Audit</option>
                  <option value="Quality & Workmanship">Quality & Workmanship (ISO 9001)</option>
                  <option value="Buyer Technical Audit">Buyer Technical Inspection (Nike/Zara)</option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewAuditModalOpen(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md shadow-purple-600/30 cursor-pointer"
                >
                  Create Audit Round
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 7. MODAL TO VIEW VERIFIED TASK COMPLETION PROOF             */}
      {/* ============================================================ */}
      {viewProofTask && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 text-slate-900 dark:text-slate-100 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Verified Task Completion Proof
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-xs">
                    {viewProofTask.title} • {viewProofTask.department}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewProofTask(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* First Completer & Verification Badge */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/5 border border-amber-300 dark:border-amber-700/60 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">🏆</span>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400 block">
                    Recognized 1st Finisher & Task Owner
                  </span>
                  <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                    {viewProofTask.completedBy?.name || viewProofTask.firstCompleter?.name || viewProofTask.assignedTo?.name}
                    <span className="text-xs font-mono font-normal text-slate-500 dark:text-slate-400 ml-1.5">
                      ({viewProofTask.completedBy?.employeeId || viewProofTask.firstCompleter?.employeeId || viewProofTask.assignedTo?.employeeId})
                    </span>
                  </div>
                </div>
              </div>

              {viewProofTask.completedAt && (
                <div className="text-right">
                  <span className="text-[10px] uppercase font-mono text-slate-400 font-bold block">
                    Completed At
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                    {new Date(viewProofTask.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
            </div>

            {/* Photo Proof Display */}
            {viewProofTask.proofPhoto && (
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Uploaded Floor Photographic Proof:
                </span>
                <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950/80 p-1 flex items-center justify-center">
                  <img
                    src={viewProofTask.proofPhoto}
                    alt="Floor Verification Proof"
                    className="max-h-72 w-full object-contain rounded-xl"
                  />
                </div>
              </div>
            )}

            {/* Verification / Corrective Notes */}
            {viewProofTask.proofNotes && (
              <div className="space-y-1 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block font-mono">
                  Corrective Details & Floor Notes:
                </span>
                <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {viewProofTask.proofNotes}
                </p>
              </div>
            )}

            {/* Verification Sign-Off Footer */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Auditor Verified & Logged</span>
              </span>

              <button
                type="button"
                onClick={() => setViewProofTask(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
              >
                Close Proof
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ============================================================ */}
      {/* 8. AUDITOR TASK ASSIGNMENT MODAL WITH BUSY WORKER VISIBILITY  */}
      {/* ============================================================ */}
      {isNewTaskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 dark:bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold">
                  <ClipboardList className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    Assign Task to {newTaskForm.department}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Verify employee availability before assigning new floor work
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewTaskModalOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {newTaskError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-200 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{newTaskError}</span>
              </div>
            )}

            <form onSubmit={handleAuditorCreateTask} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Task Title *
                </label>
                <input
                  required
                  value={newTaskForm.title}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, title: e.target.value })}
                  placeholder="e.g. Line 3 Needle Guard Verification, Emergency Exit Clearance Audit"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Department
                  </label>
                  <select
                    value={newTaskForm.department}
                    onChange={(e) => setNewTaskForm({ ...newTaskForm, department: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    {['Production', 'Quality', 'Maintenance', 'Store', 'EHS', 'EDP', 'HR', 'Central Quality Audit'].map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Priority Level
                  </label>
                  <select
                    value={newTaskForm.priority}
                    onChange={(e) => setNewTaskForm({ ...newTaskForm, priority: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="LOW">Low Priority</option>
                    <option value="MEDIUM">Medium Priority</option>
                    <option value="HIGH">High Priority</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Assignee / Worker Selection (Check Availability)
                </label>
                <select
                  value={newTaskForm.assignedToUserId}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, assignedToUserId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="DEPT_POOL">
                    🌟 Entire Department Pool (Open to All {newTaskForm.department} Workers)
                  </option>
                  {(liveStatusData?.employees || [])
                    .filter((e) => (e.department || '').toLowerCase() === (newTaskForm.department || '').toLowerCase())
                    .map((emp) => {
                      const isBusy = emp.status === 'In Progress / Busy';
                      return (
                        <option key={emp.employeeId || emp.userId} value={emp.userId || emp.employeeId}>
                          {emp.name} ({emp.employeeId}) — {isBusy ? '🔴 BUSY (Already Working)' : '🟢 AVAILABLE'}
                        </option>
                      );
                    })}
                </select>

                {(() => {
                  const selectedWorker = (liveStatusData?.employees || []).find(
                    (e) => (e.userId === newTaskForm.assignedToUserId || e.employeeId === newTaskForm.assignedToUserId) && e.status === 'In Progress / Busy'
                  );
                  if (selectedWorker) {
                    return (
                      <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300 mt-2 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">Auditor Notice:</span> {selectedWorker.name} is currently occupied working on "{selectedWorker.assignedTask?.title || 'active floor task'}". Consider assigning to an Available employee to avoid overloading them.
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Inspection Scope / Checkpoints
                </label>
                <textarea
                  rows={2}
                  value={newTaskForm.description}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, description: e.target.value })}
                  placeholder="Checkpoints, standard requirements, or specific areas to verify..."
                  className="w-full p-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewTaskModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingNewTask}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 cursor-pointer disabled:opacity-50"
                >
                  {savingNewTask ? 'Assigning...' : 'Assign Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditManagementDashboard;
