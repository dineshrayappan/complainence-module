import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Building2,
  TrendingUp,
  AlertTriangle,
  Flame,
  CheckCircle2,
  Sliders,
  RefreshCw,
  Search,
  ArrowRight,
  ShieldCheck,
  Layers,
  ArrowUpRight,
  ChevronRight,
  SlidersHorizontal,
  X,
  RotateCcw,
  Sparkles,
  Info,
  Clock,
  LayoutGrid,
  List,
  Users,
  Eye,
  Trophy,
  Award,
  Filter,
  Play,
  Square,
  Camera,
  Upload,
  Check,
  UserCheck,
  ClipboardList,
  Calendar,
  User,
  Plus,
  AlertCircle,
} from 'lucide-react';
import { complaintService, taskService, userService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { compressImage } from '../utils/imageCompressor';

const FACTORY_DEPARTMENTS = [
  'Production',
  'Quality',
  'Maintenance',
  'Store',
  'EHS',
  'EDP',
  'HR',
];

// Department icon mapping
const getDeptIcon = (deptName) => {
  const lower = (deptName || '').toLowerCase();
  if (lower.includes('prod')) return '🏭';
  if (lower.includes('qual')) return '🔍';
  if (lower.includes('maint')) return '⚙️';
  if (lower.includes('store')) return '📦';
  if (lower.includes('ehs') || lower.includes('safe')) return '🛡️';
  if (lower.includes('hr')) return '👥';
  if (lower.includes('edp') || lower.includes('it')) return '💻';
  return '🏢';
};

export const DepartmentComplianceDashboard = ({ onSelectDepartment, onViewRegister }) => {
  const { isAdmin, user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('score-desc'); // 'score-desc', 'score-asc', 'overdue-desc', 'open-desc'
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'grid'

  // Threshold Configuration Modal State
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [highThreshold, setHighThreshold] = useState(90);
  const [moderateThreshold, setModerateThreshold] = useState(75);
  const [savingThresholds, setSavingThresholds] = useState(false);
  const [configSuccess, setConfigSuccess] = useState(false);
  const [configError, setConfigError] = useState(null);

  // Department Tasks & Live Work Operations State
  const [tasks, setTasks] = useState([]);
  const [liveStatusData, setLiveStatusData] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const [selectedDept, setSelectedDept] = useState(() => {
    if (user?.department && FACTORY_DEPARTMENTS.includes(user.department)) {
      return user.department;
    }
    return 'Production';
  });
  const [tasksSearchQuery, setTasksSearchQuery] = useState('');
  const [tasksStatusFilter, setTasksStatusFilter] = useState('ALL'); // 'ALL' | 'AVAILABLE' | 'BUSY' | 'COMPLETED'
  const [busyTaskId, setBusyTaskId] = useState(null);

  // Proof Upload Modal State
  const [proofModalTask, setProofModalTask] = useState(null);
  const [proofPhoto, setProofPhoto] = useState('');
  const [proofPhotoPreview, setProofPhotoPreview] = useState(null);
  const [proofNotes, setProofNotes] = useState('');
  const [proofError, setProofError] = useState(null);
  const [submittingProof, setSubmittingProof] = useState(false);

  // View Proof Modal State
  const [viewProofTask, setViewProofTask] = useState(null);

  // Schedule Task Modal State
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    title: '',
    department: 'Production',
    description: '',
    dueDate: '',
    priority: 'MEDIUM',
    assignedToUserId: 'DEPT_POOL',
  });
  const [savingTask, setSavingTask] = useState(false);
  const [scheduleError, setScheduleError] = useState(null);

  const loadData = useCallback(async (showSpinner = false) => {
    try {
      if (showSpinner) setLoading(true);
      else setIsRefreshing(true);
      setError(null);

      const [compRes, taskRes, liveRes, usersRes] = await Promise.allSettled([
        complaintService.getDepartmentCompliance(),
        taskService.getTasks(),
        taskService.getLiveStatus({ department: selectedDept !== 'ALL' ? selectedDept : undefined }),
        userService.getAllUsers(),
      ]);

      if (compRes.status === 'fulfilled' && compRes.value.data?.success) {
        setData(compRes.value.data);
        if (compRes.value.data.thresholds) {
          setHighThreshold(compRes.value.data.thresholds.highThreshold ?? 90);
          setModerateThreshold(compRes.value.data.thresholds.moderateThreshold ?? 75);
        }
      }

      if (taskRes.status === 'fulfilled' && taskRes.value.data?.success) {
        setTasks(taskRes.value.data.tasks || []);
      }

      if (liveRes.status === 'fulfilled' && liveRes.value.data?.success) {
        setLiveStatusData(liveRes.value.data);
      }

      if (usersRes.status === 'fulfilled' && usersRes.value.data?.success && Array.isArray(usersRes.value.data.users)) {
        setUsersList(usersRes.value.data.users.filter((u) => u.isActive !== false));
      }
    } catch (err) {
      console.error('Failed to load department compliance data:', err);
      setError(err.response?.data?.message || 'Could not load compliance scorecard.');
    } finally {
      if (showSpinner) setLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedDept]);

  useEffect(() => {
    loadData(true);
    const interval = setInterval(() => {
      loadData(false);
    }, 15000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Save Threshold Settings
  const handleSaveThresholds = async (e) => {
    e.preventDefault();
    setConfigError(null);
    setConfigSuccess(false);

    const high = Number(highThreshold);
    const mod = Number(moderateThreshold);

    if (isNaN(high) || high < 50 || high > 100) {
      setConfigError('High Compliance Threshold (Green) must be between 50% and 100%.');
      return;
    }

    if (isNaN(mod) || mod < 20 || mod >= high) {
      setConfigError(`Moderate Threshold (Amber) must be between 20% and ${high - 1}%.`);
      return;
    }

    try {
      setSavingThresholds(true);
      const res = await complaintService.updateComplianceThresholds({
        highThreshold: high,
        moderateThreshold: mod,
      });

      if (res.data?.success) {
        setConfigSuccess(true);
        setTimeout(() => {
          setIsConfigModalOpen(false);
          setConfigSuccess(false);
        }, 1200);
        loadData(false);
      }
    } catch (err) {
      setConfigError(err.response?.data?.message || 'Failed to update thresholds.');
    } finally {
      setSavingThresholds(false);
    }
  };

  const handleResetDefaults = () => {
    setHighThreshold(90);
    setModerateThreshold(75);
  };

  // Start Work on assigned task: updates task to In Progress, marks employee Busy, records start time
  const handleStartWork = async (task) => {
    setBusyTaskId(task.id);
    try {
      const res = await taskService.startTask(task.id);
      await loadData(false);
    } catch (err) {
      if (err.response?.data?.code === 'EMPLOYEE_ALREADY_BUSY') {
        alert(`⚠️ Already Busy: ${err.response.data.message}`);
      } else if (err.response?.data?.code === 'UNAUTHORIZED_DEPARTMENT') {
        alert(`⛔ Department Access Denied: ${err.response.data.message}`);
      } else {
        alert(err.response?.data?.message || 'Could not start work on task.');
      }
    } finally {
      setBusyTaskId(null);
    }
  };

  // Open the Mandatory Proof Upload modal
  const openProofModal = (task) => {
    setProofModalTask(task);
    setProofPhoto('');
    setProofPhotoPreview(null);
    setProofNotes('');
    setProofError(null);
  };

  // Handle proof photo selection and compression
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
      const reader = new FileReader();
      reader.onload = (event) => {
        setProofPhoto(event.target.result);
        setProofPhotoPreview(event.target.result);
        setProofError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  // Submit proof and stop/complete work
  const handleSubmitProof = async (e) => {
    e.preventDefault();
    if (!proofModalTask) return;

    if (!proofPhoto || !proofPhoto.trim()) {
      setProofError('Mandatory: Upload or capture floor photographic proof before stopping/completing work.');
      return;
    }

    if (!proofNotes || !proofNotes.trim()) {
      setProofError('Mandatory: Enter completion details / actions taken to verify task completion.');
      return;
    }

    setSubmittingProof(true);
    setProofError(null);

    try {
      const res = await taskService.completeTask(proofModalTask.id, {
        proofPhoto: proofPhoto.trim(),
        proofNotes: proofNotes.trim(),
      });
      setProofModalTask(null);
      await loadData(false);
      if (res.data?.message) {
        alert(res.data.message);
      }
    } catch (err) {
      if (err.response?.status === 409) {
        setProofError(`⛔ Task Already Completed: ${err.response.data?.message || 'Another employee submitted completion proof first!'}`);
        loadData(false);
      } else if (err.response?.data?.code === 'UNAUTHORIZED_DEPARTMENT') {
        setProofError(`⛔ Unauthorized Department: ${err.response.data.message}`);
      } else {
        setProofError(err.response?.data?.message || 'Failed to submit completion proof.');
      }
    } finally {
      setSubmittingProof(false);
    }
  };

  // Schedule task handler
  const handleScheduleTask = async (e) => {
    e.preventDefault();
    if (!scheduleForm.title.trim()) return;

    setSavingTask(true);
    setScheduleError(null);
    try {
      const res = await taskService.createTask({
        title: scheduleForm.title.trim(),
        department: scheduleForm.department || (selectedDept !== 'ALL' ? selectedDept : 'Production'),
        description: scheduleForm.description.trim(),
        dueDate: scheduleForm.dueDate || null,
        priority: scheduleForm.priority || 'MEDIUM',
        assignedToUserId: scheduleForm.assignedToUserId === 'DEPT_POOL' ? undefined : scheduleForm.assignedToUserId,
      });

      if (res.data?.success) {
        setIsScheduleModalOpen(false);
        setScheduleForm({
          title: '',
          department: selectedDept !== 'ALL' ? selectedDept : 'Production',
          description: '',
          dueDate: '',
          priority: 'MEDIUM',
          assignedToUserId: 'DEPT_POOL',
        });
        await loadData(false);
      }
    } catch (err) {
      setScheduleError(err.response?.data?.message || 'Failed to schedule task.');
    } finally {
      setSavingTask(false);
    }
  };

  // Helper to get status color and badge based on configurable thresholds
  const getScoreClassification = (score, high = highThreshold, mod = moderateThreshold) => {
    if (score >= high) {
      return {
        level: 'HIGH',
        label: 'Compliant',
        dot: '🟢',
        textColor: 'text-emerald-700 dark:text-emerald-300',
        bgColor: 'bg-emerald-50 dark:bg-emerald-950/60',
        borderColor: 'border-emerald-200 dark:border-emerald-800',
        progressColor: 'bg-emerald-500',
        ringColor: 'stroke-emerald-500',
        badgeBg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200',
        riskLabel: 'Low Risk',
      };
    }
    if (score >= mod) {
      return {
        level: 'MODERATE',
        label: 'Watchlist',
        dot: '🟡',
        textColor: 'text-amber-700 dark:text-amber-300',
        bgColor: 'bg-amber-50 dark:bg-amber-950/60',
        borderColor: 'border-amber-200 dark:border-amber-800',
        progressColor: 'bg-amber-500',
        ringColor: 'stroke-amber-500',
        badgeBg: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200',
        riskLabel: 'Moderate Risk',
      };
    }
    return {
      level: 'CRITICAL',
      label: 'At Risk',
      dot: '🔴',
      textColor: 'text-rose-700 dark:text-rose-300',
      bgColor: 'bg-rose-50 dark:bg-rose-950/60',
      borderColor: 'border-rose-200 dark:border-rose-800',
      progressColor: 'bg-rose-500',
      ringColor: 'stroke-rose-500',
      badgeBg: 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200',
      riskLabel: 'Critical Attention',
    };
  };

  const departmentsList = data?.departments || [];
  const activeDepartments = useMemo(() => {
    if (departmentsList && departmentsList.length > 0) {
      return departmentsList.map((d) => d.department);
    }
    return FACTORY_DEPARTMENTS;
  }, [departmentsList]);

  // Filter and sort departments
  const filteredDepartments = useMemo(() => {
    let list = departmentsList.filter((d) => {
      if (!searchQuery.trim()) return true;
      return d.department.toLowerCase().includes(searchQuery.toLowerCase());
    });

    return list.sort((a, b) => {
      if (sortBy === 'score-desc') return b.score - a.score;
      if (sortBy === 'score-asc') return a.score - b.score;
      if (sortBy === 'overdue-desc') return b.overdueNC - a.overdueNC;
      if (sortBy === 'open-desc') return b.openNC - a.openNC;
      if (sortBy === 'risk-desc') return (b.riskLevel || 1) - (a.riskLevel || 1);
      return 0;
    });
  }, [departmentsList, searchQuery, sortBy]);

  // Key performers
  const topDepartment = departmentsList.length > 0 ? departmentsList[0] : null;
  const criticalDepartment =
    departmentsList.length > 0 ? [...departmentsList].sort((a, b) => a.score - b.score)[0] : null;

  if (loading && !data) {
    return (
      <div className="p-16 text-center text-slate-400 dark:text-slate-500 font-mono text-xs flex flex-col items-center justify-center">
        <div className="w-9 h-9 rounded-xl border-3 border-indigo-600 border-t-transparent animate-spin mb-3" />
        <span>Aggregating Factory Department Compliance Scores...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-in font-sans">
      {/* SECTION 1: Top Hero Banner with Live Threshold Configuration */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-4 sm:p-7 shadow-xl border border-indigo-900/50">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-16 w-80 h-80 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold uppercase tracking-wider bg-indigo-500/30 text-indigo-300 border border-indigo-500/40">
                Garment QMS Matrix
              </span>
              <span className="text-xs text-slate-400 font-mono">• 100% Closed-Loop Accountability</span>
            </div>
            <h1 className="text-lg sm:text-2xl lg:text-3xl font-black tracking-tight text-white flex items-center gap-2.5">
              <span>Department Compliance Scorecard</span>
              <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400" />
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Real-time audit performance, open NC backlogs, SLA overdue breaches, and CAP implementation rate across all 7 manufacturing plant divisions.
            </p>
          </div>

          {/* Action Tools: Refresh & Configure Thresholds */}
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <button
              onClick={() => loadData(false)}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold backdrop-blur-md transition-all active:scale-95 border border-white/10 cursor-pointer disabled:opacity-50"
              title="Refresh scorecard"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sync Metrics</span>
            </button>

            {isAdmin && (
              <button
                onClick={() => setIsConfigModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white text-xs font-bold shadow-md shadow-amber-500/20 transition-all active:scale-95 cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Configure Thresholds</span>
              </button>
            )}
          </div>
        </div>

        {/* Threshold Legend Bar */}
        <div className="relative z-10 mt-5 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap font-mono text-[11px]">
            <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">
              Active Rule:
            </span>
            <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 font-bold">
              <span>🟢</span>
              <span>≥ {highThreshold}% Compliant</span>
            </span>
            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 font-bold">
              <span>🟡</span>
              <span>{moderateThreshold}–{highThreshold - 1}% Moderate</span>
            </span>
            <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1.5 font-bold">
              <span>🔴</span>
              <span>&lt; {moderateThreshold}% At Risk</span>
            </span>
          </div>

          <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
            <Info className="w-3 h-3 text-slate-400" />
            <span>Administrator Configured Target Bounds</span>
          </div>
        </div>
      </div>

      {/* DEPARTMENT COMPLIANCE SCORECARD */}
      <div className="space-y-5 animate-fade-in">
          {/* SECTION 2: Top KPI Highlights Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Factory Overall Compliance Score */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Plant Index
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-cyan-300 border border-indigo-200 dark:border-indigo-800">
              Composite
            </span>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-baseline gap-1">
              <span>{data?.overallScore ?? 100}%</span>
              <span className="text-xs font-bold text-slate-400">Score</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Across all {departmentsList.length} plant divisions
            </p>
          </div>
        </div>

        {/* Card 2: Highest Compliance Department */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Top Performer
            </span>
            <span className="text-sm">🏆</span>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight flex items-center gap-1.5">
              <span>{topDepartment?.department || '—'}</span>
              <span className="text-sm font-mono font-extrabold bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-2 py-0.2 rounded border border-emerald-300">
                {topDepartment ? `${topDepartment.score}%` : '100%'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              {topDepartment ? `${topDepartment.openNC ?? 0} Open • ${topDepartment.overdueNC ?? 0} Overdue • ${topDepartment.capPercent ?? 100}% CAP` : 'No active division backlogs'}
            </p>
          </div>
        </div>

        {/* Card 3: Total Overdue NCs Across Plant */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Plant Overdue NCs
            </span>
            <span className={`p-1 rounded-lg ${data?.totalOverdueNC > 0 ? 'bg-rose-100 text-rose-600 dark:bg-rose-950' : 'bg-slate-100 text-slate-400'}`}>
              <Flame className="w-3.5 h-3.5" />
            </span>
          </div>
          <div>
            <div className={`text-2xl sm:text-3xl font-black tracking-tight ${data?.totalOverdueNC > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
              {data?.totalOverdueNC ?? 0}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Breached mandatory 12–24h resolution window
            </p>
          </div>
        </div>

        {/* Card 4: Most Attention Required */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Priority Focus
            </span>
            <AlertTriangle className={`w-4 h-4 ${criticalDepartment && criticalDepartment.openNC > 0 ? 'text-amber-500' : 'text-slate-400'}`} />
          </div>
          <div>
            <div className={`text-xl sm:text-2xl font-black tracking-tight flex items-center gap-1.5 ${criticalDepartment && criticalDepartment.openNC > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              <span>{criticalDepartment && criticalDepartment.openNC > 0 ? criticalDepartment.department : 'All Compliant'}</span>
              <span className={`text-sm font-mono font-extrabold px-2 py-0.2 rounded border ${criticalDepartment && criticalDepartment.openNC > 0 ? 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border-rose-300' : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-300'}`}>
                {criticalDepartment && criticalDepartment.openNC > 0 ? `${criticalDepartment.score}%` : '100%'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              {criticalDepartment && criticalDepartment.openNC > 0 ? `${criticalDepartment.openNC} Open NCs • ${criticalDepartment.overdueNC} Overdue` : 'Zero active quality breaches'}
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 3: Control & View Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 sm:p-3.5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search department (HR, Production, Stores, EHS)..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Sort & View Mode */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
          >
            <option value="score-desc">Score: Highest First</option>
            <option value="score-asc">Score: Lowest First</option>
            <option value="overdue-desc">Most Overdue NCs</option>
            <option value="open-desc">Most Open NCs</option>
            <option value="risk-desc">Risk: Highest First</option>
          </select>

          <div className="flex items-center bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setViewMode('table')}
              title="Matrix Table View"
              className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              title="Department Cards Grid"
              className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 4: Department Compliance Matrix Table */}
      {viewMode === 'table' ? (
        <div className="overflow-x-auto rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50/90 dark:bg-slate-950/80 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono text-[10px] sm:text-[11px] border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3.5 px-4 font-bold">Department</th>
                <th className="py-3.5 px-4 font-bold">Compliance Score</th>
                <th className="py-3.5 px-3 font-bold text-center">Risk Score</th>
                <th className="py-3.5 px-3 font-bold text-center">Open NC</th>
                <th className="py-3.5 px-3 font-bold text-center">Critical NC</th>
                <th className="py-3.5 px-3 font-bold text-center">Overdue</th>
                <th className="py-3.5 px-3 font-bold text-center">Overdue CAP</th>
                <th className="py-3.5 px-4 font-bold">CAP %</th>
                <th className="py-3.5 px-4 font-bold text-right">Drill-Down</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
              {filteredDepartments.map((dept) => {
                const classification = getScoreClassification(dept.score);
                return (
                  <tr
                    key={dept.department}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group"
                  >
                    {/* 1. Department */}
                    <td className="py-4 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-lg flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                          {getDeptIcon(dept.department)}
                        </div>
                        <div>
                          <div className="font-extrabold text-sm text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-cyan-400 transition-colors">
                            {dept.department}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {dept.totalNC} Total NCs Logged
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 2. Compliance Score */}
                    <td className="py-4 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <span className={`text-base font-black font-mono ${classification.textColor}`}>
                          {dept.score}%
                        </span>
                        <div className="w-24 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden border border-slate-200 dark:border-slate-700">
                          <div
                            className={`h-full rounded-full ${classification.progressColor} transition-all duration-500`}
                            style={{ width: `${dept.score}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* 3. Risk Score */}
                    <td className="py-4 px-3 text-center whitespace-nowrap">
                      {(() => {
                        const riskBadge = {
                          Critical: 'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-700',
                          High: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-700',
                          Medium: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-700',
                          Low: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-700',
                        };
                        const risk = dept.riskScore || 'Low';
                        const emoji = dept.riskEmoji || '🟢';
                        return (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${riskBadge[risk] || riskBadge.Low}`}>
                            <span>{emoji}</span>
                            <span>{risk}</span>
                          </span>
                        );
                      })()}
                    </td>

                    {/* 4. Open NC */}
                    <td className="py-4 px-3 text-center whitespace-nowrap">
                      <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        {dept.openNC}
                      </span>
                    </td>

                    {/* 5. Critical NC */}
                    <td className="py-4 px-3 text-center whitespace-nowrap">
                      {(dept.criticalNC || 0) > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-600 text-white border border-rose-700 animate-pulse shadow-xs">
                          🔥 {dept.criticalNC}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono text-xs font-semibold">—</span>
                      )}
                    </td>

                    {/* 6. Overdue NC */}
                    <td className="py-4 px-3 text-center whitespace-nowrap">
                      {dept.overdueNC > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-200 border border-rose-300 dark:border-rose-700">
                          <Flame className="w-3 h-3" />
                          <span>{dept.overdueNC}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono text-xs font-semibold">0</span>
                      )}
                    </td>

                    {/* 7. Overdue CAP */}
                    <td className="py-4 px-3 text-center whitespace-nowrap">
                      {(dept.overdueCap || 0) > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 text-orange-700 border border-orange-300 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-700">
                          ⚠ {dept.overdueCap}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono text-xs font-semibold">—</span>
                      )}
                    </td>

                    {/* 8. CAP % */}
                    <td className="py-4 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold font-mono text-slate-800 dark:text-slate-200 w-9">
                          {dept.capPercent}%
                        </span>
                        <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-indigo-500"
                            style={{ width: `${dept.capPercent}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* 9. Drill-Down Action */}
                    <td className="py-4 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDept(dept.department);
                            const el = document.getElementById('department-tasks-section');
                            if (el) el.scrollIntoView({ behavior: 'smooth' });
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-cyan-300 hover:bg-indigo-600 hover:text-white text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
                          title={`View ${dept.department} Tasks, Start Work & Stop Work controls`}
                        >
                          <ClipboardList className="w-3 h-3" />
                          <span>Tasks & Work</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (onSelectDepartment) onSelectDepartment(dept.department);
                            else if (onViewRegister) onViewRegister(dept.department);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
                        >
                          <span>Filter NCs</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* SECTION 5: Card Grid Presentation Mode */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDepartments.map((dept) => {
            const classification = getScoreClassification(dept.score);
            return (
              <div
                key={dept.department}
                className={`relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border ${classification.borderColor} p-4 sm:p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-xl flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                        {getDeptIcon(dept.department)}
                      </div>
                      <div>
                        <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                          {dept.department}
                        </h3>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          Plant Division
                        </span>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold border ${classification.bgColor} ${classification.textColor} ${classification.borderColor}`}
                    >
                      <span>{classification.dot}</span>
                      <span>{classification.label}</span>
                    </span>
                  </div>

                  {/* Big Score Display */}
                  <div className="my-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Compliance Index
                      </span>
                      <span className={`text-xl font-black font-mono ${classification.textColor}`}>
                        {dept.score}%
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${classification.progressColor} transition-all duration-500`}
                        style={{ width: `${dept.score}%` }}
                      />
                    </div>
                  </div>

                  {/* 3-Col Mini Stats */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs my-3">
                    <div className="p-2 rounded-xl bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900">
                      <div className="text-[10px] font-bold text-blue-800 dark:text-blue-300 uppercase">
                        Open NC
                      </div>
                      <div className="text-base font-black text-blue-900 dark:text-blue-200 font-mono mt-0.5">
                        {dept.openNC}
                      </div>
                    </div>

                    <div
                      className={`p-2 rounded-xl border ${
                        dept.overdueNC > 0
                          ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 animate-pulse'
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div
                        className={`text-[10px] font-bold uppercase ${
                          dept.overdueNC > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-slate-400'
                        }`}
                      >
                        Overdue
                      </div>
                      <div
                        className={`text-base font-black font-mono mt-0.5 ${
                          dept.overdueNC > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-slate-500'
                        }`}
                      >
                        {dept.overdueNC}
                      </div>
                    </div>

                    <div className="p-2 rounded-xl bg-purple-50/60 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900">
                      <div className="text-[10px] font-bold text-purple-800 dark:text-cyan-300 uppercase">
                        CAP %
                      </div>
                      <div className="text-base font-black text-purple-900 dark:text-cyan-200 font-mono mt-0.5">
                        {dept.capPercent}%
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="flex items-center gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDept(dept.department);
                      const el = document.getElementById('department-tasks-section');
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-600 hover:text-white dark:bg-indigo-950/60 dark:hover:bg-indigo-600 text-indigo-700 dark:text-cyan-300 text-xs font-bold transition-all cursor-pointer active:scale-95"
                    title={`View ${dept.department} Tasks, Start Work & Stop Work controls`}
                  >
                    <ClipboardList className="w-3.5 h-3.5" />
                    <span>Tasks & Work</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (onSelectDepartment) onSelectDepartment(dept.department);
                      else if (onViewRegister) onViewRegister(dept.department);
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer active:scale-95"
                  >
                    <span>Inspect NCs</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>

      {/* SECTION 6: DEPARTMENT ASSIGNED TASKS & LIVE WORK OPERATIONS */}
      <div id="department-tasks-section" className="pt-6 border-t border-slate-200 dark:border-slate-800 space-y-6">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold uppercase tracking-wider bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-cyan-300 border border-indigo-200 dark:border-indigo-800">
                Department Workstation
              </span>
              <span className="text-xs text-slate-400 font-mono">• Start / Stop Work Controls</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-indigo-600" />
              <span>Department Assigned Tasks & Live Work Operations</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              Start Work on assigned department tasks, mark employee status as Busy, and submit mandatory floor photo proof before completing tasks.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <button
              onClick={() => loadData(false)}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer transition-all active:scale-95 disabled:opacity-50"
              title="Refresh department tasks & live employee status"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Sync Work</span>
            </button>

            {(isAdmin || user?.role === 'AUDITOR' || user?.role === 'SUPERVISOR') && (
              <button
                onClick={() => {
                  setScheduleForm({
                    title: '',
                    department: selectedDept !== 'ALL' ? selectedDept : 'Production',
                    description: '',
                    dueDate: '',
                    priority: 'MEDIUM',
                    assignedToUserId: 'DEPT_POOL',
                  });
                  setIsScheduleModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition-all cursor-pointer active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Assign Department Task</span>
              </button>
            )}
          </div>
        </div>

        {/* Department Switcher Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setSelectedDept('ALL')}
            className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
              selectedDept === 'ALL'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-md'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
            }`}
          >
            🏢 All Departments
          </button>
          {activeDepartments.map((dept) => {
            const isCurrent = selectedDept === dept;
            const icon = getDeptIcon(dept);
            const deptTaskCount = tasks.filter((t) => (t.department || '').toLowerCase() === dept.toLowerCase()).length;
            const isUserDept = (user?.department || '').toLowerCase() === dept.toLowerCase();

            return (
              <button
                key={dept}
                onClick={() => setSelectedDept(dept)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                  isCurrent
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-2 ring-indigo-400/30'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                }`}
              >
                <span>{icon}</span>
                <span>{dept}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    isCurrent ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}
                >
                  {deptTaskCount}
                </span>
                {isUserDept && (
                  <span className={`text-[9px] font-mono px-1 rounded ${isCurrent ? 'bg-emerald-400 text-slate-950 font-bold' : 'bg-emerald-100 text-emerald-800'}`}>
                    My Dept
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* LIVE EMPLOYEE AVAILABILITY & WORK TRACKING BAR */}
        {(() => {
          const allEmps = liveStatusData?.employees || [];
          const deptEmps =
            selectedDept === 'ALL'
              ? allEmps
              : allEmps.filter((e) => (e.department || '').toLowerCase() === selectedDept.toLowerCase());

          const available = deptEmps.filter((e) => e.status === 'Available');
          const busy = deptEmps.filter((e) => e.status === 'In Progress / Busy');
          const completed = deptEmps.filter((e) => e.status === 'Completed');

          return (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
                {/* 1. AVAILABLE (IDLE) */}
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-200/90 dark:border-emerald-900/60 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        <span>Available Workers</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                        Ready to Start
                      </span>
                    </div>
                    <div className="text-2xl font-black text-slate-900 dark:text-white">
                      {available.length}{' '}
                      <span className="text-xs font-medium text-slate-400">
                        {available.length === 1 ? 'employee' : 'employees'} idle
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-emerald-100 dark:border-emerald-950/60">
                    {available.length === 0 ? (
                      <span className="text-[11px] text-slate-400 italic">No idle staff in this section</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                        {available.map((e) => (
                          <span
                            key={e.employeeId || e.userId}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                            title={`${e.name} (${e.employeeId}) • Available for tasks`}
                          >
                            <span>🟢</span>
                            <span>{e.name}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. BUSY / IN PROGRESS */}
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800/80 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
                        <span>Busy / In Progress</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300 animate-pulse">
                        Working On Floor
                      </span>
                    </div>
                    <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
                      {busy.length}{' '}
                      <span className="text-xs font-medium text-slate-400">
                        {busy.length === 1 ? 'employee' : 'employees'} occupied
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-amber-100 dark:border-amber-950/60">
                    {busy.length === 0 ? (
                      <span className="text-[11px] text-slate-400 italic">No employees currently busy</span>
                    ) : (
                      <div className="space-y-1.5 max-h-24 overflow-y-auto">
                        {busy.map((e) => (
                          <div
                            key={e.employeeId || e.userId}
                            className="p-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-[11px] flex items-center justify-between"
                          >
                            <div className="min-w-0 pr-2">
                              <span className="font-bold text-slate-900 dark:text-white block truncate">
                                🟡 {e.name} ({e.employeeId})
                              </span>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate block">
                                Task: {e.assignedTask?.title || 'Active inspection'}
                              </span>
                            </div>
                            {e.startTime && (
                              <span className="text-[10px] font-mono font-bold text-amber-700 dark:text-amber-300 shrink-0">
                                {new Date(e.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. COMPLETED WITH VERIFIED PROOF */}
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-indigo-200/90 dark:border-indigo-900/60 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-indigo-700 dark:text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Completed Tasks</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-cyan-300">
                        Photo Verified
                      </span>
                    </div>
                    <div className="text-2xl font-black text-slate-900 dark:text-white">
                      {completed.length}{' '}
                      <span className="text-xs font-medium text-slate-400">with verified proof</span>
                    </div>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-indigo-100 dark:border-indigo-950/60">
                    {completed.length === 0 ? (
                      <span className="text-[11px] text-slate-400 italic">No tasks completed yet in this section</span>
                    ) : (
                      <div className="space-y-1.5 max-h-24 overflow-y-auto">
                        {completed.map((e) => (
                          <div
                            key={e.employeeId || e.userId}
                            className="p-1.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 text-[11px] flex items-center justify-between"
                          >
                            <div className="min-w-0 pr-2">
                              <span className="font-bold text-slate-900 dark:text-white block truncate">
                                🏆 {e.name} ({e.employeeId})
                              </span>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate block">
                                {e.assignedTask?.title || 'Completed task'}
                              </span>
                            </div>
                            {e.proofPhoto && (
                              <button
                                onClick={() =>
                                  setViewProofTask({
                                    title: e.assignedTask?.title || 'Completed Work',
                                    department: e.department,
                                    completedBy: e,
                                    completedAt: e.completionTime,
                                    proofPhoto: e.proofPhoto,
                                    proofNotes: e.proofNotes,
                                  })
                                }
                                className="px-2 py-0.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] shrink-0 cursor-pointer"
                              >
                                View Proof
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* TASKS LIST & WORK BUTTON CONTROLS */}
        {(() => {
          // Filter tasks
          let list = tasks;
          if (selectedDept !== 'ALL') {
            list = list.filter((t) => (t.department || '').toLowerCase() === selectedDept.toLowerCase());
          }

          if (tasksStatusFilter === 'AVAILABLE') {
            list = list.filter(
              (t) =>
                t.status !== 'Completed' &&
                t.workStatus !== 'COMPLETED' &&
                t.workStatus !== 'IN_PROGRESS' &&
                t.status !== 'In Progress'
            );
          } else if (tasksStatusFilter === 'BUSY') {
            list = list.filter(
              (t) =>
                (t.workStatus === 'IN_PROGRESS' || t.status === 'In Progress') &&
                t.status !== 'Completed' &&
                t.workStatus !== 'COMPLETED'
            );
          } else if (tasksStatusFilter === 'COMPLETED') {
            list = list.filter((t) => t.status === 'Completed' || t.workStatus === 'COMPLETED');
          }

          if (tasksSearchQuery.trim()) {
            const q = tasksSearchQuery.toLowerCase();
            list = list.filter(
              (t) =>
                t.title?.toLowerCase().includes(q) ||
                t.description?.toLowerCase().includes(q) ||
                t.department?.toLowerCase().includes(q) ||
                t.assignedTo?.name?.toLowerCase().includes(q) ||
                t.completedBy?.name?.toLowerCase().includes(q) ||
                t.firstCompleter?.name?.toLowerCase().includes(q)
            );
          }

          // Check if current logged-in employee has an active task they are currently working on
          const uEmp = (user?.employeeId || '').toUpperCase();
          const uId = String(user?.id || user?._id || '');
          const currentUserActiveTask = tasks.find(
            (t) =>
              t.status !== 'Completed' &&
              t.workStatus !== 'COMPLETED' &&
              (t.status === 'In Progress' || t.workStatus === 'IN_PROGRESS') &&
              (
                (Array.isArray(t.activeWorkers) &&
                  t.activeWorkers.some(
                    (w) => (w.employeeId && w.employeeId.toUpperCase() === uEmp) || (w.userId && String(w.userId) === uId)
                  )) ||
                (t.startedBy?.employeeId && t.startedBy.employeeId.toUpperCase() === uEmp) ||
                (t.assignedTo?.employeeId && t.assignedTo.employeeId.toUpperCase() === uEmp)
              )
          );

          return (
            <div className="space-y-4">
              {/* Task Filter and Search Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
                {/* Search */}
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={tasksSearchQuery}
                    onChange={(e) => setTasksSearchQuery(e.target.value)}
                    placeholder="Search task title, checkpoint, or employee..."
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Status Filter Tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  {[
                    { id: 'ALL', label: 'All Tasks', count: tasks.filter((t) => selectedDept === 'ALL' || (t.department || '').toLowerCase() === selectedDept.toLowerCase()).length },
                    {
                      id: 'AVAILABLE',
                      label: 'Available (Pending)',
                      count: tasks.filter((t) => (selectedDept === 'ALL' || (t.department || '').toLowerCase() === selectedDept.toLowerCase()) && t.status !== 'Completed' && t.workStatus !== 'COMPLETED' && t.workStatus !== 'IN_PROGRESS' && t.status !== 'In Progress').length,
                    },
                    {
                      id: 'BUSY',
                      label: 'In Progress / Busy',
                      count: tasks.filter((t) => (selectedDept === 'ALL' || (t.department || '').toLowerCase() === selectedDept.toLowerCase()) && (t.workStatus === 'IN_PROGRESS' || t.status === 'In Progress') && t.status !== 'Completed' && t.workStatus !== 'COMPLETED').length,
                    },
                    {
                      id: 'COMPLETED',
                      label: 'Completed',
                      count: tasks.filter((t) => (selectedDept === 'ALL' || (t.department || '').toLowerCase() === selectedDept.toLowerCase()) && (t.status === 'Completed' || t.workStatus === 'COMPLETED')).length,
                    },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setTasksStatusFilter(tab.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                        tasksStatusFilter === tab.id
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      {tab.label} ({tab.count})
                    </button>
                  ))}
                </div>
              </div>

              {/* Tasks Cards / Rows */}
              {list.length === 0 ? (
                <div className="p-12 text-center rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <ClipboardList className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    No tasks found for {selectedDept === 'ALL' ? 'selected filter' : `${selectedDept} Department`}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Tasks assigned to this department will appear here with Start Work and Stop Work action buttons.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {list.map((task) => {
                    const isDone = task.status === 'Completed' || task.workStatus === 'COMPLETED';
                    const isBusy = (task.workStatus === 'IN_PROGRESS' || task.status === 'In Progress') && !isDone;
                    const winner = task.completedBy || task.firstCompleter || task.assignedTo;

                    // Department permission check:
                    // Elevated users or matching department employee can interact with this task
                    const isElevatedUser = isAdmin || user?.role === 'AUDITOR' || user?.isUniversal;
                    const userDept = (user?.department || '').trim().toLowerCase();
                    const taskDept = (task.department || '').trim().toLowerCase();
                    const isDirectlyAssigned =
                      (task.assignedTo?.employeeId || '').toUpperCase() === uEmp ||
                      task.assignedTo?.userId === user?.id;
                    const isEligibleWorker = isElevatedUser || isDirectlyAssigned || (userDept && taskDept && userDept === taskDept);

                    // Is this user already busy working on another task?
                    const isUserBusyOnOtherTask = Boolean(currentUserActiveTask && currentUserActiveTask.id !== task.id);

                    return (
                      <div
                        key={task.id}
                        className={`p-4 sm:p-5 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                          isDone
                            ? 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800'
                            : isBusy
                            ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/80 shadow-xs'
                            : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-indigo-300 shadow-xs'
                        }`}
                      >
                        {/* Task Title & Information */}
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`px-2 py-0.5 rounded-lg text-xs font-bold ${
                                isDone
                                  ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                  : isBusy
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                  : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-cyan-300'
                              }`}
                            >
                              {getDeptIcon(task.department)} {task.department}
                            </span>

                            {task.priority && (
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                                  task.priority === 'HIGH'
                                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                    : task.priority === 'MEDIUM'
                                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                }`}
                              >
                                {task.priority} Priority
                              </span>
                            )}

                            {/* Task Status Badge */}
                            {isDone ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Completed</span>
                              </span>
                            ) : isBusy ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40 animate-pulse">
                                <span className="w-2 h-2 rounded-full bg-amber-500" />
                                <span>In Progress / Busy</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-300">
                                <span>🟢</span>
                                <span>Available</span>
                              </span>
                            )}
                          </div>

                          <h3
                            className={`text-base font-extrabold ${
                              isDone ? 'text-slate-500 dark:text-slate-400 line-through' : 'text-slate-900 dark:text-white'
                            }`}
                          >
                            {task.title}
                          </h3>

                          {task.description && (
                            <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                              {task.description}
                            </p>
                          )}

                          {/* Task Metadata & Active Worker Details */}
                          <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 font-mono flex-wrap pt-1">
                            {task.dueDate && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                <span>Due: {new Date(task.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                              </span>
                            )}

                            {/* Active Starter Details */}
                            {isBusy && task.startedAt && (
                              <span className="text-amber-700 dark:text-amber-300 font-bold flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                <span>
                                  Started: {new Date(task.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {task.startedBy?.name && <span>by {task.startedBy.name}</span>}
                              </span>
                            )}

                            {/* 1st Completer Details */}
                            {isDone && (
                              <span className="text-amber-700 dark:text-amber-300 font-bold flex items-center gap-1">
                                <span>🏆 1st Completer: {winner?.name || 'Department Staff'}</span>
                                {task.completedAt && (
                                  <span>({new Date(task.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</span>
                                )}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* WORK ACTION BUTTONS ALONGSIDE THE TASK */}
                        <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                          {/* CASE 1: TASK IS PENDING / AVAILABLE -> START WORK BUTTON */}
                          {!isDone && !isBusy && (
                            <>
                              {!isEligibleWorker ? (
                                <span
                                  className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 text-xs font-mono font-bold"
                                  title={`Only employees of the ${task.department} department can start work on this task.`}
                                >
                                  🔒 {task.department} Staff Only
                                </span>
                              ) : isUserBusyOnOtherTask ? (
                                <button
                                  type="button"
                                  disabled
                                  title={`You are already busy working on "${currentUserActiveTask?.title}". Please complete that task before starting another.`}
                                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 text-xs font-bold cursor-not-allowed opacity-75"
                                >
                                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                                  <span>Busy On Other Task</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleStartWork(task)}
                                  disabled={busyTaskId === task.id}
                                  title="Click to start work: updates task status to In Progress and marks you as Busy / Working"
                                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                                >
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                  <span>{busyTaskId === task.id ? 'Starting...' : 'Start Work'}</span>
                                </button>
                              )}
                            </>
                          )}

                          {/* CASE 2: TASK IS IN PROGRESS / BUSY -> STOP WORK BUTTON (PROOF REQUIRED) */}
                          {isBusy && (
                            <button
                              type="button"
                              onClick={() => openProofModal(task)}
                              title="Stop Work & Complete Task: Photo proof and details are required before completion"
                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/30 transition-all active:scale-95 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Stop Work</span>
                            </button>
                          )}

                          {/* CASE 3: TASK IS COMPLETED -> VIEW PROOF BUTTON */}
                          {isDone && (task.proofPhoto || task.proofNotes) && (
                            <button
                              type="button"
                              onClick={() =>
                                setViewProofTask({
                                  title: task.title,
                                  department: task.department,
                                  completedBy: winner,
                                  completedAt: task.completedAt,
                                  proofPhoto: task.proofPhoto,
                                  proofNotes: task.proofNotes,
                                })
                              }
                              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer transition-all active:scale-95"
                            >
                              <Camera className="w-3.5 h-3.5 text-indigo-600 dark:text-cyan-400" />
                              <span>View Proof</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* MANDATORY COMPLETION PROOF MODAL (FOR STOP WORK ACTION) */}
      {proofModalTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 dark:bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto p-6 space-y-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    Stop Work — Mandatory Completion Proof
                  </h3>
                  <p className="text-xs text-slate-500 truncate max-w-xs">
                    {proofModalTask.title} • {proofModalTask.department}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProofModalTask(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {proofError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{proofError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitProof} className="space-y-4">
              {/* Photo Upload Area */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  <span>Floor Photographic Proof</span>
                  <span className="text-rose-500 ml-1">* Mandatory</span>
                </label>

                {proofPhotoPreview ? (
                  <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 max-h-56 flex items-center justify-center p-1">
                    <img
                      src={proofPhotoPreview}
                      alt="Floor Proof Preview"
                      className="max-h-52 w-full object-contain rounded-xl"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setProofPhoto('');
                        setProofPhotoPreview(null);
                      }}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-slate-900/80 text-white hover:bg-rose-600 cursor-pointer"
                      title="Remove image"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 bg-slate-50 dark:bg-slate-950/50 cursor-pointer transition-colors">
                    <Camera className="w-8 h-8 text-slate-400 mb-2" />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Take photo or browse image
                    </span>
                    <span className="text-[10px] text-slate-500 mt-0.5">
                      Clear proof of task rectification / completion (JPG, PNG, WebP)
                    </span>
                    <input
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
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  <span>Completion Details & Corrective Notes</span>
                  <span className="text-rose-500 ml-1">* Mandatory</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={proofNotes}
                  onChange={(e) => setProofNotes(e.target.value)}
                  placeholder="Detail the work done, checkpoints verified, or corrective actions taken on the floor..."
                  className="w-full p-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Modal Actions */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setProofModalTask(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingProof || !proofPhoto || !proofNotes.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{submittingProof ? 'Verifying & Completing...' : 'Submit Proof & Stop Work'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW VERIFIED PROOF MODAL */}
      {viewProofTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 dark:bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    Verified Task Completion Proof
                  </h3>
                  <p className="text-[11px] text-slate-500 truncate max-w-xs">
                    {viewProofTask.title} • {viewProofTask.department}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewProofTask(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Winner Badge */}
            <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase text-amber-700 dark:text-amber-300 block">
                  🏆 Recognized 1st Completer & Task Owner
                </span>
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  {viewProofTask.completedBy?.name || 'Department Staff'}{' '}
                  {viewProofTask.completedBy?.employeeId && `(${viewProofTask.completedBy.employeeId})`}
                </span>
              </div>
              {viewProofTask.completedAt && (
                <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                  {new Date(viewProofTask.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            {/* Photo Preview */}
            {viewProofTask.proofPhoto && (
              <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 p-1 flex items-center justify-center">
                <img
                  src={viewProofTask.proofPhoto}
                  alt="Verified Proof"
                  className="max-h-72 w-full object-contain rounded-xl"
                />
              </div>
            )}

            {/* Notes */}
            {viewProofTask.proofNotes && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">
                  Floor Actions & Corrective Notes:
                </span>
                <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {viewProofTask.proofNotes}
                </p>
              </div>
            )}

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setViewProofTask(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 cursor-pointer"
              >
                Close Proof
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SCHEDULE DEPARTMENT TASK MODAL */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 dark:bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold">
                  <ClipboardList className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    Assign Task to {scheduleForm.department || 'Department'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Schedule inspection or floor compliance work
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsScheduleModalOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {scheduleError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{scheduleError}</span>
              </div>
            )}

            <form onSubmit={handleScheduleTask} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Task Title *
                </label>
                <input
                  required
                  value={scheduleForm.title}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, title: e.target.value })}
                  placeholder="e.g. Line 4 Needle Guard Safety Audit, Fabric Shrinkage Verification"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Department
                  </label>
                  <select
                    value={scheduleForm.department}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, department: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    {activeDepartments.map((d) => (
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
                    value={scheduleForm.priority}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, priority: e.target.value })}
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
                  Assignee / Worker Selection
                </label>
                <select
                  value={scheduleForm.assignedToUserId}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, assignedToUserId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="DEPT_POOL">
                    🌟 Entire Department Pool (Any {scheduleForm.department} Worker can Start)
                  </option>
                  {usersList
                    .filter((u) => (u.department || '').toLowerCase() === (scheduleForm.department || '').toLowerCase())
                    .map((u) => {
                      // Check if busy
                      const isBusy = (liveStatusData?.employees || []).some(
                        (e) =>
                          (e.employeeId || '').toUpperCase() === (u.employeeId || '').toUpperCase() &&
                          e.status === 'In Progress / Busy'
                      );
                      return (
                        <option key={u.id || u.employeeId} value={u.id || u.employeeId}>
                          {u.name} ({u.employeeId}) — {isBusy ? '🔴 BUSY (Working on task)' : '🟢 AVAILABLE'}
                        </option>
                      );
                    })}
                </select>
                {(() => {
                  const selectedWorker = (liveStatusData?.employees || []).find(
                    (e) => (e.userId === scheduleForm.assignedToUserId || e.employeeId === scheduleForm.assignedToUserId) && e.status === 'In Progress / Busy'
                  );
                  if (selectedWorker) {
                    return (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Warning: This employee is currently Busy on "{selectedWorker.assignedTask?.title || 'active task'}". Avoid assigning another task to them unnecessarily.</span>
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Description / Inspection Scope
                </label>
                <textarea
                  rows={2}
                  value={scheduleForm.description}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, description: e.target.value })}
                  placeholder="Checkpoints, standard requirements, or specific areas to verify..."
                  className="w-full p-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsScheduleModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingTask}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 cursor-pointer disabled:opacity-50"
                >
                  {savingTask ? 'Assigning...' : 'Assign Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* SECTION 6: Configurable Thresholds Modal (Administrator Exclusive) */}
      {isConfigModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto transition-colors">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Compliance Threshold Rules
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Administrator Configurable KPI Ranges
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsConfigModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Content */}
            <form onSubmit={handleSaveThresholds} className="p-5 space-y-4">
              {configError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-200 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{configError}</span>
                </div>
              )}

              {configSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-200 text-xs flex items-center gap-2 font-bold">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Thresholds updated successfully across the plant!</span>
                </div>
              )}

              {/* Threshold 1: High Compliance (Green >= X%) */}
              <div className="space-y-1.5 p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/80">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                    <span>🟢 High Compliance Target</span>
                    <span className="text-[10px] font-mono font-normal text-emerald-700 dark:text-emerald-400">
                      (Green Status)
                    </span>
                  </label>
                  <span className="font-mono text-sm font-black text-emerald-700 dark:text-emerald-300">
                    ≥ {highThreshold}%
                  </span>
                </div>
                <input
                  type="range"
                  min="60"
                  max="100"
                  step="1"
                  value={highThreshold}
                  onChange={(e) => setHighThreshold(Number(e.target.value))}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
                <p className="text-[11px] text-emerald-800 dark:text-emerald-400 leading-snug">
                  Departments at or above this score are flagged as fully compliant with minimal quality risk.
                </p>
              </div>

              {/* Threshold 2: Moderate Compliance (Yellow X% - High - 1%) */}
              <div className="space-y-1.5 p-3.5 rounded-2xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/80">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                    <span>🟡 Moderate Target Lower Bound</span>
                    <span className="text-[10px] font-mono font-normal text-amber-700 dark:text-amber-400">
                      (Amber Watchlist)
                    </span>
                  </label>
                  <span className="font-mono text-sm font-black text-amber-700 dark:text-amber-300">
                    {moderateThreshold}% – {highThreshold - 1}%
                  </span>
                </div>
                <input
                  type="range"
                  min="30"
                  max={highThreshold - 1}
                  step="1"
                  value={moderateThreshold}
                  onChange={(e) => setModerateThreshold(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <p className="text-[11px] text-amber-800 dark:text-amber-400 leading-snug">
                  Departments falling between {moderateThreshold}% and {highThreshold - 1}% are placed on the operational quality watchlist.
                </p>
              </div>

              {/* Red Zone Info */}
              <div className="p-3 rounded-2xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/80 text-xs">
                <div className="flex items-center justify-between font-bold text-rose-800 dark:text-rose-300 mb-0.5">
                  <span className="flex items-center gap-1.5">
                    <span>🔴 Critical / Non-Compliant Zone</span>
                  </span>
                  <span className="font-mono font-black">&lt; {moderateThreshold}%</span>
                </div>
                <p className="text-[11px] text-rose-700 dark:text-rose-400">
                  Any department scoring below {moderateThreshold}% automatically triggers red flags and supervisor escalation.
                </p>
              </div>

              {/* Live Visual Gradient Spectrum */}
              <div className="pt-2">
                <div className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex justify-between">
                  <span>Color Spectrum Preview</span>
                  <span>0% – 100%</span>
                </div>
                <div className="h-3 rounded-full w-full overflow-hidden flex shadow-inner border border-slate-200 dark:border-slate-800">
                  <div
                    className="bg-rose-500"
                    style={{ width: `${moderateThreshold}%` }}
                    title={`Red Zone: 0 - ${moderateThreshold - 1}%`}
                  />
                  <div
                    className="bg-amber-500"
                    style={{ width: `${highThreshold - moderateThreshold}%` }}
                    title={`Yellow Zone: ${moderateThreshold} - ${highThreshold - 1}%`}
                  />
                  <div
                    className="bg-emerald-500 flex-1"
                    title={`Green Zone: ${highThreshold} - 100%`}
                  />
                </div>
              </div>

              {/* Modal Footer Controls */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={handleResetDefaults}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white text-xs font-semibold cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Defaults (90 / 75)</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsConfigModalOpen(false)}
                    className="px-3 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingThresholds}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {savingThresholds ? 'Saving...' : 'Apply Thresholds'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DepartmentComplianceDashboard;
