import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Building2,
  RefreshCw,
  Search,
  Plus,
  Play,
  CheckCircle2,
  Camera,
  X,
  AlertCircle,
  AlertTriangle,
  AlertOctagon,
  Clock,
  Calendar,
  ClipboardList,
  Check,
  Eye,
  Users,
  UserCheck,
  UserX,
  Zap,
  Filter,
  Sparkles,
  ArrowRight,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { taskService, userService, complaintService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useUnit } from '../context/UnitContext';
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

export const DepartmentWorkOperations = ({
  initialDepartment = 'ALL',
  onBackToScorecard,
  embedded = false,
}) => {
  const { isAdmin, isAuditor, user } = useAuth();
  const { units, activeUnitId, activeUnit, isCompanyAdmin } = useUnit();
  const isSupervisor = user?.role === 'ACTION_PERSON' || user?.role === 'SUPERVISOR' || (!isAdmin && !isAuditor);

  const getDefaultUnitId = useCallback(() => {
    if (user?.unitId === 'UNIT-2' || activeUnitId === 'UNIT-2') return 'UNIT-2';
    return 'UNIT-1';
  }, [user, activeUnitId]);

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Department Tasks & Live Work Operations State
  const [tasks, setTasks] = useState([]);
  const [liveStatusData, setLiveStatusData] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const [departmentsList, setDepartmentsList] = useState([]);

  // Admin & Auditor View Mode: 'employees' (Employee Details Table) | 'tasks' (Floor Tasks Queue)
  const [activeViewMode, setActiveViewMode] = useState(isAdmin || isAuditor ? 'employees' : 'tasks');
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState('');
  const [employeeAvailabilityFilter, setEmployeeAvailabilityFilter] = useState('ALL'); // 'ALL' | 'PRESENT' | 'ABSENT' | 'BUSY' | 'AVAILABLE'

  const [selectedDept, setSelectedDept] = useState(() => {
    if (initialDepartment && initialDepartment !== 'ALL') {
      return initialDepartment;
    }
    if (user?.department && FACTORY_DEPARTMENTS.includes(user.department)) {
      return user.department;
    }
    return 'ALL';
  });

  const [tasksSearchQuery, setTasksSearchQuery] = useState('');
  const [tasksStatusFilter, setTasksStatusFilter] = useState('ALL'); // 'ALL' | 'AVAILABLE' | 'BUSY' | 'COMPLETED'
  const [busyTaskId, setBusyTaskId] = useState(null);

  // Sync selected department if initialDepartment changes
  useEffect(() => {
    if (initialDepartment) {
      setSelectedDept(initialDepartment);
    }
  }, [initialDepartment]);

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
    department: selectedDept !== 'ALL' ? selectedDept : 'Production',
    unitId: getDefaultUnitId(),
    description: '',
    dueDate: '',
    priority: 'MEDIUM',
    assignedToUserId: 'DEPT_POOL',
  });
  const [savingTask, setSavingTask] = useState(false);
  const [scheduleError, setScheduleError] = useState(null);
  const inFlightRef = useRef(false);

  const loadData = useCallback(async (showSpinner = false) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      if (showSpinner) setLoading(true);
      else setIsRefreshing(true);
      setError(null);

      const [taskRes, liveRes, usersRes, deptRes] = await Promise.allSettled([
        taskService.getTasks(),
        taskService.getLiveStatus({ department: selectedDept !== 'ALL' ? selectedDept : undefined }),
        userService.getAllUsers(),
        complaintService.getDepartmentCompliance(),
      ]);

      if (taskRes.status === 'fulfilled' && taskRes.value.data?.success) {
        setTasks(taskRes.value.data.tasks || []);
      }

      if (liveRes.status === 'fulfilled' && liveRes.value.data?.success) {
        setLiveStatusData(liveRes.value.data);
      }

      if (usersRes.status === 'fulfilled' && usersRes.value.data?.success && Array.isArray(usersRes.value.data.users)) {
        setUsersList(usersRes.value.data.users.filter((u) => u.isActive !== false));
      }

      if (deptRes.status === 'fulfilled' && deptRes.value.data?.success && Array.isArray(deptRes.value.data.departments)) {
        setDepartmentsList(deptRes.value.data.departments);
      }
    } catch (err) {
      console.error('Failed to load department work operations:', err);
      setError(err.response?.data?.message || 'Could not load work operations data.');
    } finally {
      inFlightRef.current = false;
      if (showSpinner) setLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedDept, activeUnitId]);

  useEffect(() => {
    loadData(true);
    const interval = setInterval(() => {
      loadData(false);
    }, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Dynamically compute department tabs
  const activeDepartments = useMemo(() => {
    if (departmentsList && departmentsList.length > 0) {
      return departmentsList.map((d) => d.department || d.name || d).filter(Boolean);
    }
    return FACTORY_DEPARTMENTS;
  }, [departmentsList]);

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
      const targetUnitId = scheduleForm.unitId || getDefaultUnitId();
      const matchedUnit = units.find((u) => u.unitId === targetUnitId);
      const targetUnitName = matchedUnit?.name || (targetUnitId === 'UNIT-2' ? 'Unit 2' : 'Unit 1');

      const res = await taskService.createTask({
        title: scheduleForm.title.trim(),
        department: scheduleForm.department || (selectedDept !== 'ALL' ? selectedDept : 'Production'),
        unitId: targetUnitId,
        unitName: targetUnitName,
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
          unitId: getDefaultUnitId(),
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

  if (loading && tasks.length === 0) {
    return (
      <div className="p-16 text-center text-slate-400 dark:text-slate-500 font-mono text-xs flex flex-col items-center justify-center">
        <div className="w-9 h-9 rounded-xl border-3 border-indigo-600 border-t-transparent animate-spin mb-3" />
        <span>Loading Department Tasks & Live Work Operations...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      {/* SECTION HEADER BANNER */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-5 sm:p-7 shadow-xl border border-indigo-900/50">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-16 w-80 h-80 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold uppercase tracking-wider bg-indigo-500/30 text-indigo-300 border border-indigo-500/40">
                Floor Workstation
              </span>
              {!(isAdmin || isAuditor || user?.role === 'ADMIN' || user?.role === 'AUDITOR') && (
                <span className="text-xs text-slate-400 font-mono">• Live Start / Stop Controls</span>
              )}
              {onBackToScorecard && (
                <button
                  type="button"
                  onClick={onBackToScorecard}
                  className="ml-2 text-xs font-bold text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                >
                  ← Factory Dashboard
                </button>
              )}
            </div>
            <h1 className="text-lg sm:text-2xl lg:text-3xl font-black tracking-tight text-white flex items-center gap-2.5">
              <span>Department Assigned Tasks & Live Work Operations</span>
              <ClipboardList className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400" />
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              {(isAdmin || isAuditor || user?.role === 'ADMIN' || user?.role === 'AUDITOR')
                ? 'Monitor department assigned tasks, employee working status, and review mandatory floor completion photo proofs.'
                : 'Start Work on assigned department tasks, mark employee status as Busy, and submit mandatory floor photo proof before completing tasks.'}
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <button
              onClick={() => loadData(false)}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold cursor-pointer transition-all active:scale-95 disabled:opacity-50 border border-white/10"
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
      </div>

      {/* DEPARTMENT SWITCHER PILLS */}
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

      {/* LIVE DEPARTMENT WORK OPERATIONS & TASK TRACKING BAR */}
      {(() => {
        const allEmps = liveStatusData?.employees || [];
        const deptEmps =
          selectedDept === 'ALL'
            ? allEmps
            : allEmps.filter((e) => (e.department || '').toLowerCase() === selectedDept.toLowerCase());

        const deptTasks =
          selectedDept === 'ALL'
            ? tasks
            : tasks.filter((t) => (t.department || '').toLowerCase() === selectedDept.toLowerCase());

        const summary = liveStatusData?.summary || {};

        const pendingTasks = deptTasks.filter(
          (t) =>
            t.status !== 'Completed' &&
            t.workStatus !== 'COMPLETED' &&
            t.workStatus !== 'IN_PROGRESS' &&
            t.status !== 'In Progress'
        );
        const busy = deptEmps.filter((e) => e.isBusy || e.workAvailability === 'Busy' || e.status === 'In Progress / Busy');
        const completed = deptEmps.filter((e) => e.status === 'Completed' || e.taskStatus === 'Completed');

        return (
          <div className="space-y-4">
            {/* 1. TOP STATUS METRICS */}
            {!isSupervisor ? (
              /* ADMIN & AUDITOR OVERSIGHT: FULL 9 LIVE STATUS METRICS */
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-2.5 sm:gap-3">
                {/* 1. Present Employees */}
                <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/60 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Present</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  </div>
                  <div className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    {summary.presentEmployees ?? deptEmps.filter((e) => e.isPresent).length}
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">Logged in today</span>
                </div>

                {/* 2. Absent Employees */}
                <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Absent</span>
                    <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                  </div>
                  <div className="mt-2 text-2xl font-black text-slate-600 dark:text-slate-300">
                    {summary.absentEmployees ?? deptEmps.filter((e) => !e.isPresent).length}
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">No active session</span>
                </div>

                {/* 3. Busy Employees */}
                <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Busy</span>
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                  </div>
                  <div className="mt-2 text-2xl font-black text-amber-600 dark:text-amber-400">
                    {summary.busyEmployees ?? busy.length}
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">Occupied on task</span>
                </div>

                {/* 4. Available Employees */}
                <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-teal-200 dark:border-teal-900/60 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Available</span>
                    <span className="w-2 h-2 rounded-full bg-teal-500" />
                  </div>
                  <div className="mt-2 text-2xl font-black text-teal-600 dark:text-teal-400">
                    {summary.availableEmployees ?? deptEmps.filter((e) => e.isPresent && !e.isBusy).length}
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">Ready for work</span>
                </div>

                {/* 5. Currently Working */}
                <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900/60 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Working</span>
                    <Zap className="w-3 h-3 text-blue-500" />
                  </div>
                  <div className="mt-2 text-2xl font-black text-blue-600 dark:text-blue-400">
                    {summary.workingEmployees ?? busy.length}
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">Active floor action</span>
                </div>

                {/* 6. Tasks In Progress */}
                <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/60 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">In Progress</span>
                    <Clock className="w-3 h-3 text-indigo-500" />
                  </div>
                  <div className="mt-2 text-2xl font-black text-indigo-600 dark:text-indigo-400">
                    {summary.tasksInProgress ?? summary.inProgress ?? deptTasks.filter((t) => t.status === 'In Progress' || t.workStatus === 'IN_PROGRESS').length}
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">Floor tasks started</span>
                </div>

                {/* 7. Completed Tasks */}
                <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/60 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Completed</span>
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  </div>
                  <div className="mt-2 text-2xl font-black text-emerald-700 dark:text-emerald-300">
                    {summary.completedTasks ?? summary.completed ?? deptTasks.filter((t) => t.status === 'Completed' || t.workStatus === 'COMPLETED').length}
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">Saved &amp; verified</span>
                </div>

                {/* 8. Pending Tasks */}
                <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-violet-200 dark:border-violet-900/60 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pending</span>
                    <ClipboardList className="w-3 h-3 text-violet-500" />
                  </div>
                  <div className="mt-2 text-2xl font-black text-violet-600 dark:text-violet-400">
                    {summary.pendingTasks ?? summary.pending ?? pendingTasks.length}
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">Awaiting floor start</span>
                </div>

                {/* 9. Overdue Tasks */}
                <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Overdue</span>
                    <AlertOctagon className="w-3 h-3 text-rose-500" />
                  </div>
                  <div className="mt-2 text-2xl font-black text-rose-600 dark:text-rose-400">
                    {summary.overdueTasks ?? summary.overdue ?? 0}
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">Past SLA deadline</span>
                </div>
              </div>
            ) : (
              /* SUPERVISOR VIEW: FOCUSED FLOOR OPERATIONS CARDS */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {/* 1. PENDING TASKS QUEUE */}
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-indigo-200/90 dark:border-indigo-900/60 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                        <ClipboardList className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Pending Floor Tasks</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300">
                        Ready to Start
                      </span>
                    </div>
                    <div className="text-2xl font-black text-slate-900 dark:text-white">
                      {pendingTasks.length}{' '}
                      <span className="text-xs font-medium text-slate-400">
                        {pendingTasks.length === 1 ? 'task' : 'tasks'} queued
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-indigo-100 dark:border-indigo-950/60">
                    {pendingTasks.length === 0 ? (
                      <span className="text-[11px] text-slate-400 italic">No pending tasks queued</span>
                    ) : (
                      <div className="space-y-1.5 max-h-24 overflow-y-auto">
                        {pendingTasks.slice(0, 5).map((t) => (
                          <div
                            key={t.id || t._id}
                            className="p-1.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/60 text-[11px] flex items-center justify-between"
                          >
                            <span className="font-semibold text-slate-800 dark:text-slate-200 truncate pr-2">
                              {t.title}
                            </span>
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 shrink-0">
                              {t.priority || 'MEDIUM'}
                            </span>
                          </div>
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
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-200/90 dark:border-emerald-900/60 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Completed Tasks</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                        Photo Verified
                      </span>
                    </div>
                    <div className="text-2xl font-black text-slate-900 dark:text-white">
                      {completed.length}{' '}
                      <span className="text-xs font-medium text-slate-400">with verified proof</span>
                    </div>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-emerald-100 dark:border-emerald-950/60">
                    {completed.length === 0 ? (
                      <span className="text-[11px] text-slate-400 italic">No tasks completed yet in this section</span>
                    ) : (
                      <div className="space-y-1.5 max-h-24 overflow-y-auto">
                        {completed.map((e) => (
                          <div
                            key={e.employeeId || e.userId}
                            className="p-1.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900 text-[11px] flex items-center justify-between"
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
                                className="px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] shrink-0 cursor-pointer"
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
            )}

            {/* 2. ADMIN & AUDITOR VIEW MODE SWITCHER TABS */}
            {!isSupervisor && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 pb-1 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveViewMode('employees')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      activeViewMode === 'employees'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Employee Details Table</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/20 text-white">
                      {deptEmps.length}
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveViewMode('tasks')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      activeViewMode === 'tasks'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <ClipboardList className="w-3.5 h-3.5" />
                    <span>Department Floor Tasks Queue</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500">
                      {deptTasks.length}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* EMPLOYEE DETAILS TABLE (ADMIN & AUDITOR OVERSIGHT) */}
      {!isSupervisor && activeViewMode === 'employees' && (() => {
        const allEmps = liveStatusData?.employees || [];
        let deptEmps =
          selectedDept === 'ALL'
            ? allEmps
            : allEmps.filter((e) => (e.department || '').toLowerCase() === selectedDept.toLowerCase());

        // Employee-wise search filter
        if (employeeSearchQuery.trim()) {
          const q = employeeSearchQuery.toLowerCase();
          deptEmps = deptEmps.filter(
            (e) =>
              e.name?.toLowerCase().includes(q) ||
              e.employeeId?.toLowerCase().includes(q) ||
              e.department?.toLowerCase().includes(q) ||
              e.designation?.toLowerCase().includes(q) ||
              e.currentAssignedTask?.toLowerCase().includes(q) ||
              e.assignedTask?.title?.toLowerCase().includes(q)
          );
        }

        // Work availability / attendance filter
        if (employeeAvailabilityFilter === 'PRESENT') {
          deptEmps = deptEmps.filter((e) => e.isPresent);
        } else if (employeeAvailabilityFilter === 'ABSENT') {
          deptEmps = deptEmps.filter((e) => !e.isPresent);
        } else if (employeeAvailabilityFilter === 'BUSY') {
          deptEmps = deptEmps.filter((e) => e.isBusy || e.workAvailability === 'Busy');
        } else if (employeeAvailabilityFilter === 'AVAILABLE') {
          deptEmps = deptEmps.filter((e) => e.isPresent && !e.isBusy);
        }

        const presentCount = (selectedDept === 'ALL' ? allEmps : allEmps.filter((e) => (e.department || '').toLowerCase() === selectedDept.toLowerCase())).filter((e) => e.isPresent).length;
        const absentCount = (selectedDept === 'ALL' ? allEmps : allEmps.filter((e) => (e.department || '').toLowerCase() === selectedDept.toLowerCase())).filter((e) => !e.isPresent).length;
        const busyCount = (selectedDept === 'ALL' ? allEmps : allEmps.filter((e) => (e.department || '').toLowerCase() === selectedDept.toLowerCase())).filter((e) => e.isBusy || e.workAvailability === 'Busy').length;
        const availableCount = (selectedDept === 'ALL' ? allEmps : allEmps.filter((e) => (e.department || '').toLowerCase() === selectedDept.toLowerCase())).filter((e) => e.isPresent && !e.isBusy).length;

        return (
          <div className="space-y-3">
            {/* Search & Quick Filter Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter employee by name, ID, designation, or task..."
                  value={employeeSearchQuery}
                  onChange={(e) => setEmployeeSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Quick status filter pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                {[
                  { id: 'ALL', label: 'All Staff' },
                  { id: 'PRESENT', label: `🟢 Present (${presentCount})` },
                  { id: 'ABSENT', label: `⚪ Absent (${absentCount})` },
                  { id: 'BUSY', label: `🟡 Busy (${busyCount})` },
                  { id: 'AVAILABLE', label: `🟢 Available (${availableCount})` },
                ].map((pill) => (
                  <button
                    key={pill.id}
                    onClick={() => setEmployeeAvailabilityFilter(pill.id)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                      employeeAvailabilityFilter === pill.id
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Table Container */}
            <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 dark:bg-slate-800/50 text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200/80 dark:border-slate-800">
                    <tr>
                      <th className="py-3 px-3.5">Employee Name &amp; ID</th>
                      <th className="py-3 px-3">Department</th>
                      <th className="py-3 px-3">Attendance</th>
                      <th className="py-3 px-3">Availability</th>
                      <th className="py-3 px-3">Current Assigned Task</th>
                      <th className="py-3 px-3">Start Time</th>
                      <th className="py-3 px-3">Duration</th>
                      <th className="py-3 px-3">Task Status</th>
                      <th className="py-3 px-2 text-center">Assigned</th>
                      <th className="py-3 px-2 text-center">Completed</th>
                      <th className="py-3 px-2 text-center">Pending</th>
                      <th className="py-3 px-3 text-right">Completion Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {deptEmps.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="py-8 text-center text-slate-400 italic font-mono text-xs">
                          No employee records match the selected filter criteria.
                        </td>
                      </tr>
                    ) : (
                      deptEmps.map((emp) => (
                        <tr key={emp.employeeId || emp.userId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                          {/* Employee */}
                          <td className="py-2.5 px-3.5">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-black text-xs text-slate-700 dark:text-slate-300 shrink-0">
                                {emp.name?.charAt(0)?.toUpperCase() || 'U'}
                              </div>
                              <div className="min-w-0">
                                <span className="font-bold text-slate-900 dark:text-white block truncate">
                                  {emp.name}
                                </span>
                                <span className="text-[10px] font-mono text-slate-400 block">
                                  {emp.employeeId || 'N/A'} {emp.designation ? `• ${emp.designation}` : ''}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Department */}
                          <td className="py-2.5 px-3">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              <span>{getDeptIcon(emp.department)}</span>
                              <span>{emp.department || 'General'}</span>
                            </span>
                          </td>

                          {/* Attendance Status */}
                          <td className="py-2.5 px-3">
                            {emp.isPresent ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800" title={emp.loginTimestamp ? `Logged in: ${new Date(emp.loginTimestamp).toLocaleTimeString()}` : 'Active session'}>
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span>Present</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                <span>Absent</span>
                              </span>
                            )}
                          </td>

                          {/* Work Availability */}
                          <td className="py-2.5 px-3">
                            {emp.isBusy || emp.workAvailability === 'Busy' || emp.status === 'In Progress / Busy' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-300 dark:border-amber-800">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                <span>Busy</span>
                              </span>
                            ) : emp.isPresent ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400 border border-teal-300 dark:border-teal-800">
                                <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                                <span>Available</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-400 dark:bg-slate-800/80 dark:text-slate-500">
                                <span>Offline</span>
                              </span>
                            )}
                          </td>

                          {/* Current Assigned Task */}
                          <td className="py-2.5 px-3">
                            <div className="max-w-[180px]">
                              {emp.assignedTask?.title || (emp.currentAssignedTask && emp.currentAssignedTask !== '-') ? (
                                <div className="truncate">
                                  <span className="font-semibold text-slate-800 dark:text-slate-200 block truncate" title={emp.assignedTask?.title || emp.currentAssignedTask}>
                                    {emp.assignedTask?.title || emp.currentAssignedTask}
                                  </span>
                                  {emp.assignedTask?.priority && (
                                    <span className={`text-[9px] font-bold font-mono uppercase ${emp.assignedTask.priority === 'HIGH' || emp.assignedTask.priority === 'CRITICAL' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                      {emp.assignedTask.priority}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">-</span>
                              )}
                            </div>
                          </td>

                          {/* Task Start Time */}
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {emp.startTime || emp.taskStartTime
                              ? new Date(emp.startTime || emp.taskStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              : '-'}
                          </td>

                          {/* Work Duration */}
                          <td className="py-2.5 px-3 font-mono font-bold text-[11px] text-slate-800 dark:text-slate-200 whitespace-nowrap">
                            {emp.workDuration || '-'}
                          </td>

                          {/* Task Status */}
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {emp.taskStatus === 'In Progress' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                                <Clock className="w-3 h-3 text-amber-500" />
                                <span>In Progress</span>
                              </span>
                            ) : emp.taskStatus === 'Completed' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                <span>Completed</span>
                              </span>
                            ) : emp.taskStatus === 'Overdue' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                                <AlertOctagon className="w-3 h-3 text-rose-500" />
                                <span>Overdue</span>
                              </span>
                            ) : emp.taskStatus === 'Pending' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                                <span>Pending</span>
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>

                          {/* Tasks Assigned */}
                          <td className="py-2.5 px-2 text-center font-mono font-bold text-[11px] text-slate-700 dark:text-slate-300">
                            {emp.tasksAssigned || 0}
                          </td>

                          {/* Tasks Completed */}
                          <td className="py-2.5 px-2 text-center font-mono font-bold text-[11px] text-emerald-600 dark:text-emerald-400">
                            {emp.tasksCompleted || emp.totalCompletedCount || 0}
                          </td>

                          {/* Pending Tasks */}
                          <td className="py-2.5 px-2 text-center font-mono font-bold text-[11px] text-amber-600 dark:text-amber-400">
                            {emp.pendingTasks || 0}
                          </td>

                          {/* Task Completion Details */}
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            {emp.taskCompletionDetails?.proofPhoto || emp.proofPhoto ? (
                              <button
                                onClick={() =>
                                  setViewProofTask({
                                    title: emp.taskCompletionDetails?.taskTitle || emp.assignedTask?.title || 'Completed Task',
                                    department: emp.department,
                                    completedBy: emp,
                                    completedAt: emp.taskCompletionDetails?.completedAt || emp.completionTime,
                                    proofPhoto: emp.taskCompletionDetails?.proofPhoto || emp.proofPhoto,
                                    proofNotes: emp.taskCompletionDetails?.proofNotes || emp.proofNotes,
                                  })
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] shadow-xs cursor-pointer transition-all active:scale-95"
                              >
                                <Eye className="w-3 h-3" />
                                <span>View Proof</span>
                              </button>
                            ) : emp.taskCompletionDetails?.completedAt || emp.completionTime ? (
                              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                                ✓ {new Date(emp.taskCompletionDetails?.completedAt || emp.completionTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[10px] italic">-</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* TASKS LIST & WORK BUTTON CONTROLS */}
      {(isSupervisor || activeViewMode === 'tasks') && (() => {
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
                    label: 'Pending Tasks',
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
                  {(isAdmin || isAuditor || user?.role === 'ADMIN' || user?.role === 'AUDITOR')
                    ? 'Tasks assigned to this department will appear here for oversight and compliance monitoring.'
                    : 'Tasks assigned to this department will appear here with Start Work and Stop Work action buttons.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {list.map((task) => {
                  const isDone = task.status === 'Completed' || task.workStatus === 'COMPLETED';
                  const isBusy = (task.workStatus === 'IN_PROGRESS' || task.status === 'In Progress') && !isDone;
                  const winner = task.completedBy || task.firstCompleter || task.assignedTo;

                  // Department permission check:
                  // Only floor workers/supervisors of the matching department can start or stop work.
                  // Admins and Auditors monitor and verify compliance, but do NOT execute floor containment (Start / Stop Work).
                  const isPrivilegedAuditorOrAdmin = isAdmin || isAuditor || user?.role === 'ADMIN' || user?.role === 'AUDITOR';
                  const userDept = (user?.department || '').trim().toLowerCase();
                  const taskDept = (task.department || '').trim().toLowerCase();
                  const isDirectlyAssigned =
                    (task.assignedTo?.employeeId || '').toUpperCase() === uEmp ||
                    task.assignedTo?.userId === user?.id;
                  const isEligibleWorker = !isPrivilegedAuditorOrAdmin && (isDirectlyAssigned || (userDept && taskDept && userDept === taskDept));

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
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                              <Clock className="w-3 h-3 text-indigo-500" />
                              <span>Pending Action</span>
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
                        {/* CASE 1: TASK IS PENDING / AVAILABLE -> START WORK BUTTON (FLOOR WORKERS ONLY) */}
                        {!isDone && !isBusy && (
                          <>
                            {isPrivilegedAuditorOrAdmin ? (
                              <span
                                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-mono font-medium"
                                title="Floor task pending for assigned department personnel"
                              >
                                Pending Floor Action
                              </span>
                            ) : !isEligibleWorker ? (
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

                        {/* CASE 2: TASK IS IN PROGRESS / BUSY -> STOP WORK BUTTON (PROOF REQUIRED FOR WORKER ONLY) */}
                        {isBusy && !isPrivilegedAuditorOrAdmin && (
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
                        {isBusy && isPrivilegedAuditorOrAdmin && (
                          <span
                            className="px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-xs font-bold font-mono flex items-center gap-1.5"
                            title="Shop floor containment currently active by assigned personnel"
                          >
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                            <span>Floor In Progress</span>
                          </span>
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

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Plant Unit Assignment
                </label>
                {isCompanyAdmin ? (
                  <select
                    value={scheduleForm.unitId || getDefaultUnitId()}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, unitId: e.target.value, assignedToUserId: 'DEPT_POOL' })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    {units.filter((u) => u.unitId === 'UNIT-1' || u.unitId === 'UNIT-2').map((u) => (
                      <option key={u.unitId} value={u.unitId}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                    <span>{units.find((u) => u.unitId === (scheduleForm.unitId || getDefaultUnitId()))?.name || 'Unit 1'}</span>
                    <span className="text-[10px] text-slate-400 font-mono">🔒 Assigned Unit</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  Assignee / Worker Selection (Unit-Isolated)
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
                    .filter((u) => {
                      const deptMatch = (u.department || '').toLowerCase() === (scheduleForm.department || '').toLowerCase();
                      if (!deptMatch) return false;
                      const targetUnit = scheduleForm.unitId || getDefaultUnitId();
                      const uUnit = u.unitId === 'UNIT-2' ? 'UNIT-2' : 'UNIT-1';
                      return uUnit === targetUnit;
                    })
                    .map((u) => {
                      const empStatus = (liveStatusData?.employees || []).find(
                        (e) => (e.employeeId || '').toUpperCase() === (u.employeeId || '').toUpperCase()
                      );
                      const isBusy = empStatus?.status === 'In Progress / Busy';
                      const busyText = isBusy ? ' — 🟡 Busy on Floor Task' : '';

                      return (
                        <option key={u.id || u.employeeId} value={u.id || u.employeeId}>
                          {u.name} ({u.employeeId}){busyText}
                        </option>
                      );
                    })}
                </select>
                {(() => {
                  const selectedWorker = (liveStatusData?.employees || []).find(
                    (e) => e.userId === scheduleForm.assignedToUserId || e.employeeId === scheduleForm.assignedToUserId
                  );
                  if (selectedWorker?.status === 'In Progress / Busy') {
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
                  Due Date (Optional)
                </label>
                <input
                  type="date"
                  value={scheduleForm.dueDate}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, dueDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                />
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
    </div>
  );
};

export default DepartmentWorkOperations;
