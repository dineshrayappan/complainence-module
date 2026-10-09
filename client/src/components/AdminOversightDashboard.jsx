import React, { useState, useEffect } from 'react';
import {
  Crown,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Wrench,
  Activity,
  ArrowRight,
  TrendingUp,
  Building2,
  RefreshCw,
  Eye,
  AlertOctagon,
  Flame,
  MessageSquare,
  Sparkles,
  Search,
  Users,
  Camera,
  Filter,
  Trophy,
  Play,
  X,
  ChevronRight,
  Calendar,
  ClipboardList,
  UserCheck,
} from 'lucide-react';
import { complaintService, taskService } from '../services/api';
import { supabase } from '../services/supabase';

export const AdminOversightDashboard = ({ onViewComplaint }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activityFilter, setActivityFilter] = useState('ALL'); // 'ALL', 'AUDITOR', 'SUPERVISOR', 'WARNINGS'
  const [searchQuery, setSearchQuery] = useState('');

  // Tab switcher: 'bottlenecks' (NC & SLA Oversight) | 'department-tasks' (Tasks & Live Work Status)
  const [activeMainTab, setActiveMainTab] = useState('department-tasks'); // Default to tasks per user request so Admin immediately sees live work!
  const [tasks, setTasks] = useState([]);
  const [liveStatusData, setLiveStatusData] = useState(null);
  const [tasksDeptFilter, setTasksDeptFilter] = useState('ALL');
  const [taskStatusFilter, setTaskStatusFilter] = useState('ALL'); // 'ALL', 'IN_PROGRESS', 'COMPLETED', 'PENDING'
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState('ALL'); // 'ALL', 'AVAILABLE', 'BUSY', 'COMPLETED'
  const [tasksSearchQuery, setTasksSearchQuery] = useState('');
  const [viewProofTask, setViewProofTask] = useState(null);

  const loadOversightData = async (showSpinner = false) => {
    try {
      if (showSpinner) {
        setLoading(true);
      } else {
        setIsRefreshing(true);
      }

      const [oversightRes, taskRes, liveRes] = await Promise.allSettled([
        complaintService.getAdminOversight(),
        taskService.getTasks({ state: 'all' }),
        taskService.getLiveStatus({ department: tasksDeptFilter }),
      ]);

      if (oversightRes.status === 'fulfilled' && oversightRes.value.data?.success) {
        setData(oversightRes.value.data);
      }

      if (taskRes.status === 'fulfilled' && taskRes.value.data?.success) {
        setTasks(taskRes.value.data.tasks || []);
      }

      if (liveRes.status === 'fulfilled' && liveRes.value.data?.success) {
        setLiveStatusData(liveRes.value.data);
      }
    } catch (err) {
      console.error('Failed to load admin oversight data:', err);
    } finally {
      if (showSpinner) setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadOversightData(true);
  }, [tasksDeptFilter]);

  if (loading && !data) {
    return (
      <div className="p-16 text-center text-slate-400 dark:text-slate-500 font-mono text-xs flex flex-col items-center justify-center">
        <div className="w-9 h-9 rounded-xl border-3 border-amber-500 border-t-transparent animate-spin mb-3" />
        <span>Aggregating Factory Operations & Auditor/Supervisor Telemetry...</span>
      </div>
    );
  }

  const bottlenecks = data?.bottlenecks || {};
  const supervisorScorecard = data?.supervisorScorecard || [];
  const auditorActivity = data?.auditorActivity || {};
  const activityStream = data?.activityStream || [];

  // Filter activity stream
  const filteredActivities = activityStream.filter((item) => {
    if (activityFilter === 'AUDITOR') {
      return item.performedBy?.role === 'AUDITOR';
    }
    if (activityFilter === 'SUPERVISOR') {
      return item.performedBy?.role === 'ACTION_PERSON' || item.performedBy?.role === 'SUPERVISOR';
    }
    if (activityFilter === 'WARNINGS') {
      return item.action === 'REJECTED' || item.currentStatus === 'Overdue';
    }
    return true;
  }).filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.complaintId?.toLowerCase().includes(q) ||
      item.performedBy?.name?.toLowerCase().includes(q) ||
      item.department?.toLowerCase().includes(q) ||
      item.notes?.toLowerCase().includes(q)
    );
  });

  // Filtered employees from live telemetry (Available vs Busy vs Completed)
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
      if (tasksDeptFilter !== 'ALL' && t.department !== tasksDeptFilter) return false;
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
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner & Control Bar */}
      <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-rose-500/10 border border-amber-300/40 dark:border-amber-700/30 flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 sm:gap-4 shadow-sm backdrop-blur-md">
        <div className="flex items-start sm:items-center gap-3 sm:gap-3.5">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20 shrink-0">
            <Crown className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                Executive Operations Control Center
              </h2>
              <span className="px-2 py-0.5 text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider rounded-md bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                Live
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 mt-0.5">
              Continuous monitoring of Auditor defect logging vs Supervisor resolution • Bottlenecks & Inaction detection
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between lg:justify-end gap-3 pt-2 lg:pt-0 border-t lg:border-t-0 border-amber-200/50 dark:border-amber-900/40">
          <span className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            Telemetry: {new Date(data?.timestamp || Date.now()).toLocaleTimeString()}
          </span>
          <button
            onClick={() => loadOversightData(false)}
            disabled={isRefreshing || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold shadow-2xs transition-colors cursor-pointer shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Top Primary Tab Switcher */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveMainTab('department-tasks')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-black transition-all cursor-pointer ${
            activeMainTab === 'department-tasks'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          <span>Department Tasks & Live Employee Work</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
              activeMainTab === 'department-tasks'
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

        <button
          type="button"
          onClick={() => setActiveMainTab('bottlenecks')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-black transition-all cursor-pointer ${
            activeMainTab === 'bottlenecks'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <AlertOctagon className="w-4 h-4" />
          <span>Executive Defect & SLA Oversight</span>
          {bottlenecks.totalBreachedSlas > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-rose-500 text-white animate-pulse">
              {bottlenecks.totalBreachedSlas}
            </span>
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* VIEW A: DEPARTMENT TASKS & LIVE EMPLOYEE WORK (USER REQUIREMENTS 1,2,3,4,5) */}
      {/* ========================================================================= */}
      {activeMainTab === 'department-tasks' && (
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
                <div className="flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <select
                    value={tasksDeptFilter}
                    onChange={(e) => setTasksDeptFilter(e.target.value)}
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

      {/* ========================================================================= */}
      {/* VIEW B: EXECUTIVE BOTTLENECKS & SLA RADAR (EXISTING OVERSIGHT)            */}
      {/* ========================================================================= */}
      {activeMainTab === 'bottlenecks' && (
        <div className="space-y-6 animate-fade-in">
          {/* SECTION 1: INACTION & BOTTLENECK RADAR (WHAT THEY ARE NOT DOING) */}
          <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 text-rose-500" />
            <h3 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
              Inaction & Bottleneck Radar
            </h3>
          </div>
          <span className="text-[10px] sm:text-[11px] text-slate-400 font-mono">12–24h SLA Enforcement</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* 1. Breached SLAs */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              bottlenecks.totalBreachedSlas > 0
                ? 'bg-rose-50/80 border-rose-200 dark:bg-rose-950/40 dark:border-rose-900/60 shadow-sm'
                : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Flame className={`w-4 h-4 ${bottlenecks.totalBreachedSlas > 0 ? 'text-rose-600 animate-pulse' : 'text-slate-400'}`} />
                SLA Breaches (Overdue)
              </span>
              <span
                className={`text-xs font-mono font-extrabold px-2 py-0.5 rounded-full ${
                  bottlenecks.totalBreachedSlas > 0
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {bottlenecks.totalBreachedSlas}
              </span>
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {bottlenecks.totalBreachedSlas}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
              {bottlenecks.totalBreachedSlas > 0
                ? 'Supervisors failed to resolve defect within mandatory 12–24h window.'
                : 'Zero overdue defects. All lines meeting closed-loop SLA targets.'}
            </p>
          </div>

          {/* 2. Unstarted Assigned Defects */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              bottlenecks.totalUnstartedTickets > 0
                ? 'bg-amber-50/80 border-amber-200 dark:bg-amber-950/40 dark:border-amber-900/60 shadow-sm'
                : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Clock className={`w-4 h-4 ${bottlenecks.totalUnstartedTickets > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
                Unstarted Defects
              </span>
              <span
                className={`text-xs font-mono font-extrabold px-2 py-0.5 rounded-full ${
                  bottlenecks.totalUnstartedTickets > 0
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {bottlenecks.totalUnstartedTickets}
              </span>
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {bottlenecks.totalUnstartedTickets}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
              {bottlenecks.totalUnstartedTickets > 0
                ? 'NC defects assigned by auditor where supervisor has NOT started rectification.'
                : 'All assigned NC defects have active progress started.'}
            </p>
          </div>

          {/* 3. Pending Audit Sign-Offs */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              bottlenecks.totalPendingAuditorSignOffs > 0
                ? 'bg-purple-50/80 border-purple-200 dark:bg-purple-950/40 dark:border-purple-900/60 shadow-sm'
                : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <ShieldCheck className={`w-4 h-4 ${bottlenecks.totalPendingAuditorSignOffs > 0 ? 'text-purple-600' : 'text-slate-400'}`} />
                Awaiting Auditor Sign-Off
              </span>
              <span
                className={`text-xs font-mono font-extrabold px-2 py-0.5 rounded-full ${
                  bottlenecks.totalPendingAuditorSignOffs > 0
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {bottlenecks.totalPendingAuditorSignOffs}
              </span>
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {bottlenecks.totalPendingAuditorSignOffs}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
              {bottlenecks.totalPendingAuditorSignOffs > 0
                ? 'Supervisor submitted proof photo; Auditor has NOT verified or closed.'
                : 'No pending proof verifications queued for auditor.'}
            </p>
          </div>

          {/* 4. Rejected Tickets Awaiting Rework */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              bottlenecks.totalRejectedAwaitingRework > 0
                ? 'bg-orange-50/80 border-orange-200 dark:bg-orange-950/40 dark:border-orange-900/60 shadow-sm'
                : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <XCircle className={`w-4 h-4 ${bottlenecks.totalRejectedAwaitingRework > 0 ? 'text-orange-600' : 'text-slate-400'}`} />
                Rejections Awaiting Rework
              </span>
              <span
                className={`text-xs font-mono font-extrabold px-2 py-0.5 rounded-full ${
                  bottlenecks.totalRejectedAwaitingRework > 0
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {bottlenecks.totalRejectedAwaitingRework}
              </span>
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {bottlenecks.totalRejectedAwaitingRework}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
              {bottlenecks.totalRejectedAwaitingRework > 0
                ? 'Auditor rejected proof & returned NC defect; supervisor must re-rectify.'
                : 'Zero active defect rejections pending line re-work.'}
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 2: SUPERVISOR ACCOUNTABILITY SCORECARD & AUDITOR ACTIVITY */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Supervisor Line-by-Line Table (2 Cols) */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                <Wrench className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Line Supervisor Accountability Scorecard
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Performance and inaction tracking across all factory sections
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto no-scrollbar sm:overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-slate-800 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                  <th className="py-2.5 px-3">Line & Supervisor</th>
                  <th className="py-2.5 px-2 text-center">Assigned</th>
                  <th className="py-2.5 px-2 text-center">Unstarted</th>
                  <th className="py-2.5 px-2 text-center">In Progress</th>
                  <th className="py-2.5 px-2 text-center">Under Review</th>
                  <th className="py-2.5 px-2 text-center">Closed</th>
                  <th className="py-2.5 px-2 text-center">Overdue</th>
                  <th className="py-2.5 px-3 text-right">SLA Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {supervisorScorecard.map((sup) => (
                  <tr key={sup._id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {sup.name}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        {sup.department} • {sup.employeeId}
                      </div>
                    </td>
                    <td className="py-3 px-2 text-center font-bold text-slate-700 dark:text-slate-200">
                      {sup.totalAssigned}
                    </td>
                    <td className="py-3 px-2 text-center">
                      <span
                        className={`px-1.5 py-0.5 rounded font-mono font-bold text-[10px] ${
                          sup.unstartedCount > 0
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : 'text-slate-400'
                        }`}
                      >
                        {sup.unstartedCount}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-center text-blue-600 dark:text-blue-400 font-mono font-bold">
                      {sup.inProgressCount}
                    </td>
                    <td className="py-3 px-2 text-center text-purple-600 dark:text-purple-400 font-mono font-bold">
                      {sup.underVerificationCount}
                    </td>
                    <td className="py-3 px-2 text-center text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                      {sup.closedCount}
                    </td>
                    <td className="py-3 px-2 text-center">
                      {sup.overdueCount > 0 ? (
                        <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white font-mono font-bold text-[10px] animate-pulse">
                          {sup.overdueCount} 🚨
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono">0</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                          {sup.complianceRate}%
                        </span>
                        <div className="w-12 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden hidden sm:block">
                          <div
                            className={`h-full rounded-full ${
                              sup.complianceRate >= 90
                                ? 'bg-emerald-500'
                                : sup.complianceRate >= 70
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                            }`}
                            style={{ width: `${sup.complianceRate}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Auditor Quality Inspection Activity Card (1 Col) */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Auditor Quality Governance
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Defects logged, severity profile & sign-off velocity
                </p>
              </div>
            </div>

            {/* Total Defects Metric */}
            <div className="p-3.5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 mb-4">
              <div className="text-[11px] font-bold text-indigo-900 dark:text-indigo-200 uppercase tracking-wider">
                Total Plant Defects Logged
              </div>
              <div className="text-3xl font-black text-indigo-700 dark:text-indigo-300 mt-0.5">
                {auditorActivity.totalDefectsLogged || 0}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
                <span>Closed: <strong>{auditorActivity.closedComplaints || 0}</strong></span>
                <span>•</span>
                <span>Awaiting Review: <strong className="text-purple-600 dark:text-purple-400">{auditorActivity.pendingAuditorSignOff || 0}</strong></span>
              </div>
            </div>

            {/* Severity Distribution */}
            <div className="space-y-2 mb-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Defect Severity Breakdown
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-bold">
                    <span className="w-2 h-2 rounded-full bg-rose-600" /> Critical Defect
                  </span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {auditorActivity.severityBreakdown?.critical || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-bold">
                    <span className="w-2 h-2 rounded-full bg-amber-500" /> High Severity
                  </span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {auditorActivity.severityBreakdown?.high || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-bold">
                    <span className="w-2 h-2 rounded-full bg-blue-500" /> Medium
                  </span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {auditorActivity.severityBreakdown?.medium || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-slate-500 font-bold">
                    <span className="w-2 h-2 rounded-full bg-slate-400" /> Low
                  </span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {auditorActivity.severityBreakdown?.low || 0}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Active Auditor List */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Designated Quality Auditors
            </div>
            {auditorActivity.auditorsList?.map((aud) => (
              <div key={aud._id} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center font-bold text-xs">
                    {aud.name.charAt(0)}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      {aud.name}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {aud.employeeId} • {aud.department}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                  {aud.ticketsLogged} NCs logged
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SECTION 3: LIVE PLANT AUDIT TRAIL STREAM ("WHO DID WHAT & WHEN") */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                Cross-Factory Live Audit Trail Stream
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Chronological event stream of Auditor inspections vs Supervisor rectifications
              </p>
            </div>
          </div>

          {/* Filter Pills with Horizontal Scroll on Mobile */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl overflow-x-auto no-scrollbar w-full sm:w-auto">
            <button
              onClick={() => setActivityFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap shrink-0 ${
                activityFilter === 'ALL'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All ({activityStream.length})
            </button>
            <button
              onClick={() => setActivityFilter('AUDITOR')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap shrink-0 ${
                activityFilter === 'AUDITOR'
                  ? 'bg-purple-600 text-white shadow-2xs'
                  : 'text-slate-500 hover:text-purple-600'
              }`}
            >
              Auditors
            </button>
            <button
              onClick={() => setActivityFilter('SUPERVISOR')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap shrink-0 ${
                activityFilter === 'SUPERVISOR'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-500 hover:text-emerald-600'
              }`}
            >
              Supervisors
            </button>
            <button
              onClick={() => setActivityFilter('WARNINGS')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap shrink-0 ${
                activityFilter === 'WARNINGS'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'text-slate-500 hover:text-rose-600'
              }`}
            >
              Warnings
            </button>
          </div>
        </div>

        {/* Search in audit trail */}
        <div className="relative mb-3 sm:mb-4">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by NC ID (e.g. CMP-10492), actor name, or notes..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        {/* Timeline Events List */}
        <div className="divide-y divide-slate-100 dark:divide-slate-800/70 max-h-[420px] overflow-y-auto pr-1">
          {filteredActivities.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 font-mono">
              No matching activity events found.
            </div>
          ) : (
            filteredActivities.map((event, idx) => {
              const isAud = event.performedBy?.role === 'AUDITOR';
              const isSup = event.performedBy?.role === 'ACTION_PERSON' || event.performedBy?.role === 'SUPERVISOR';
              const isRejected = event.action === 'REJECTED';
              const isClosed = event.action === 'CLOSED';
              const isSubmitted = event.action === 'ACTION_SUBMITTED';

              return (
                <div key={idx} className="py-3 flex items-start gap-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 px-2 rounded-xl transition-colors">
                  {/* Action Icon Badge */}
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-white shadow-2xs ${
                      isRejected
                        ? 'bg-rose-600'
                        : isClosed
                        ? 'bg-emerald-600'
                        : isSubmitted
                        ? 'bg-purple-600'
                        : isAud
                        ? 'bg-indigo-600'
                        : 'bg-teal-600'
                    }`}
                  >
                    {isRejected ? (
                      <XCircle className="w-4 h-4" />
                    ) : isClosed ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : isAud ? (
                      <ShieldCheck className="w-4 h-4" />
                    ) : (
                      <Wrench className="w-4 h-4" />
                    )}
                  </div>

                  {/* Event Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-xs text-slate-900 dark:text-white">
                          {event.performedBy?.name}
                        </span>
                        <span
                          className={`text-[10px] font-extrabold uppercase px-1.5 py-0.2 rounded border ${
                            isAud
                              ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                          }`}
                        >
                          {isAud ? 'Auditor' : 'Supervisor'}
                        </span>
                        <span className="text-slate-400 text-xs">•</span>
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                          {event.action.replace('_', ' ')}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(event.timestamp).toLocaleDateString()}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                      {event.notes}
                    </p>

                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-400 font-mono">
                      <button
                        onClick={() => onViewComplaint && onViewComplaint({ complaintId: event.complaintId, _id: event.complaintId })}
                        className="text-indigo-600 dark:text-cyan-400 hover:underline font-bold"
                      >
                        {event.complaintId}
                      </button>
                      <span>•</span>
                      <span>{event.department}</span>
                      <span>•</span>
                      <span>{event.category}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  )}

  {/* VIEW PROOF MODAL (Requirement 4: Completion Proof, Photos, and Timestamps) */}
  {viewProofTask && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-600 dark:text-cyan-400 block">
              Task Completion Photographic Proof & Oversight
            </span>
            <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-0.5">
              {viewProofTask.title}
            </h3>
            <span className="text-xs text-slate-500 font-medium">
              Department: <strong className="text-slate-700 dark:text-slate-300">{viewProofTask.department}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setViewProofTask(null)}
            className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Recognized 1st Finisher Banner */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/5 border border-amber-300 dark:border-amber-700/60 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🏆</span>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400 block">
                Recognized 1st Finisher & Task Owner
              </span>
              <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                {viewProofTask.completedBy?.name ||
                  viewProofTask.firstCompleter?.name ||
                  viewProofTask.assignedTo?.name ||
                  'Department Worker'}
                <span className="text-xs font-mono font-normal text-slate-500 dark:text-slate-400 ml-1.5">
                  ({viewProofTask.completedBy?.employeeId ||
                    viewProofTask.firstCompleter?.employeeId ||
                    viewProofTask.assignedTo?.employeeId ||
                    'ID Verified'})
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
            <span>Auditor Verified & Admin Monitored</span>
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
</div>
  );
};

export default AdminOversightDashboard;
