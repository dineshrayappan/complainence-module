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
  ClipboardList,
} from 'lucide-react';
import { complaintService } from '../services/api';
import { useAuth } from '../context/AuthContext';

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

export const DepartmentComplianceDashboard = ({
  onSelectDepartment,
  onViewRegister,
  onNavigateWorkOperations,
}) => {
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

  const loadData = useCallback(async (showSpinner = false) => {
    try {
      if (showSpinner) setLoading(true);
      else setIsRefreshing(true);
      setError(null);

      const res = await complaintService.getDepartmentCompliance();

      if (res.data?.success) {
        setData(res.data);
        if (res.data.thresholds) {
          setHighThreshold(res.data.thresholds.highThreshold ?? 90);
          setModerateThreshold(res.data.thresholds.moderateThreshold ?? 75);
        }
      }
    } catch (err) {
      console.error('Failed to load department compliance data:', err);
      setError(err.response?.data?.message || 'Could not load compliance scorecard.');
    } finally {
      if (showSpinner) setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

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

  // Helper to get status color and badge based on configurable thresholds
  const getScoreClassification = (score, high = highThreshold, mod = moderateThreshold) => {
    if (score === null || score === undefined) {
      return {
        level: 'NO_DATA',
        label: 'No NCs',
        dot: '⚪',
        textColor: 'text-slate-500 dark:text-slate-400',
        bgColor: 'bg-slate-50 dark:bg-slate-900/60',
        borderColor: 'border-slate-200 dark:border-slate-800',
        progressColor: 'bg-slate-300 dark:bg-slate-700',
        ringColor: 'stroke-slate-300 dark:stroke-slate-700',
        badgeBg: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
        riskLabel: 'No Active NCs',
      };
    }
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
      if (sortBy === 'score-desc') {
        if (a.hasNC && !b.hasNC) return -1;
        if (!a.hasNC && b.hasNC) return 1;
        return (b.score ?? -1) - (a.score ?? -1);
      }
      if (sortBy === 'score-asc') {
        if (a.hasNC && !b.hasNC) return -1;
        if (!a.hasNC && b.hasNC) return 1;
        return (a.score ?? 999) - (b.score ?? 999);
      }
      if (sortBy === 'overdue-desc') return (b.overdueNC || 0) - (a.overdueNC || 0);
      if (sortBy === 'open-desc') return (b.openNC || 0) - (a.openNC || 0);
      if (sortBy === 'risk-desc') return (b.riskLevel || 0) - (a.riskLevel || 0);
      return 0;
    });
  }, [departmentsList, searchQuery, sortBy]);

  // Key performers (strictly based on actual NC activity)
  const activeWithNCs = departmentsList.filter((d) => d.hasNC && d.score !== null);
  const topDepartment = activeWithNCs.length > 0 ? activeWithNCs[0] : null;
  const criticalDepartment =
    activeWithNCs.length > 0 ? [...activeWithNCs].sort((a, b) => a.score - b.score)[0] : null;

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
              <span>{data?.overallScore !== null && data?.overallScore !== undefined ? `${data.overallScore}%` : '—'}</span>
              <span className="text-xs font-bold text-slate-400">Score</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              {data?.totalPlantNC > 0 ? `Across ${data.totalPlantNC} Total NCs` : 'Zero NC complaints logged'}
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
            {topDepartment && topDepartment.totalNC > 0 ? (
              <>
                <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight flex items-center gap-1.5">
                  <span>{topDepartment.department}</span>
                  <span className="text-sm font-mono font-extrabold bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-2 py-0.2 rounded border border-emerald-300">
                    {topDepartment.score}%
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  {topDepartment.openNC ?? 0} Open • {topDepartment.overdueNC ?? 0} Overdue • {topDepartment.capPercent ?? 0}% CAP
                </p>
              </>
            ) : (
              <>
                <div className="text-xl sm:text-2xl font-black text-slate-400 tracking-tight flex items-center gap-1.5">
                  <span>—</span>
                  <span className="text-xs font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                    No NCs Logged
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  No department NC activity recorded
                </p>
              </>
            )}
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
            {criticalDepartment && criticalDepartment.openNC > 0 ? (
              <>
                <div className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                  <span>{criticalDepartment.department}</span>
                  <span className="text-sm font-mono font-extrabold px-2 py-0.2 rounded border bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border-rose-300">
                    {criticalDepartment.score !== null ? `${criticalDepartment.score}%` : '—'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  {criticalDepartment.openNC} Open NCs • {criticalDepartment.overdueNC} Overdue
                </p>
              </>
            ) : (
              <>
                <div className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <span>All Clear</span>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded border bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-300">
                    0 Breaches
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Zero active quality breaches
                </p>
              </>
            )}
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
                          {dept.score !== null ? `${dept.score}%` : '—'}
                        </span>
                        <div className="w-24 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden border border-slate-200 dark:border-slate-700">
                          <div
                            className={`h-full rounded-full ${classification.progressColor} transition-all duration-500`}
                            style={{ width: `${dept.score ?? 0}%` }}
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
                          None: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
                        };
                        const risk = dept.riskScore || 'None';
                        const emoji = dept.riskEmoji || '⚪';
                        return (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${riskBadge[risk] || riskBadge.None}`}>
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
                          {dept.capPercent !== null ? `${dept.capPercent}%` : '—'}
                        </span>
                        <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-indigo-500"
                            style={{ width: `${dept.capPercent ?? 0}%` }}
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
                            if (onNavigateWorkOperations) {
                              onNavigateWorkOperations(dept.department);
                            }
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-cyan-300 hover:bg-indigo-600 hover:text-white text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
                          title={`View ${dept.department} Live Work Operations & Tasks`}
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
                        {dept.score !== null ? `${dept.score}%` : '—'}
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${classification.progressColor} transition-all duration-500`}
                        style={{ width: `${dept.score ?? 0}%` }}
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
                        {dept.capPercent !== null ? `${dept.capPercent}%` : '—'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="flex items-center gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (onNavigateWorkOperations) {
                        onNavigateWorkOperations(dept.department);
                      }
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-600 hover:text-white dark:bg-indigo-950/60 dark:hover:bg-indigo-600 text-indigo-700 dark:text-cyan-300 text-xs font-bold transition-all cursor-pointer active:scale-95"
                    title={`View ${dept.department} Live Work Operations & Tasks`}
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

      {/* Configurable Thresholds Modal (Administrator Exclusive) */}

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
