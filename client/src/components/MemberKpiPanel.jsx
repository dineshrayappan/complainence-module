import React, { useState, useEffect, useMemo } from 'react';
import {
  Award,
  Users,
  Clock,
  Calendar,
  Search,
  RefreshCw,
  Filter,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Download,
  Info,
  TrendingUp,
  ChevronLeft,
  X,
  Building2,
  Layers,
  Star,
  Activity,
  Check,
  ArrowUpDown,
  AlertTriangle,
  CalendarDays,
  CalendarRange,
} from 'lucide-react';
import { auditLogService } from '../services/api';
import { useUnit } from '../context/UnitContext';

export const MemberKpiPanel = ({ showToast }) => {
  const { units } = useUnit();

  // Current IST date and month defaults
  const todayIST = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
    } catch {
      return '2026-11-05';
    }
  }, []);

  const defaultMonth = useMemo(() => todayIST.slice(0, 7), [todayIST]);

  // Date selection modes: 'MONTH' | 'CUSTOM'
  const [dateMode, setDateMode] = useState('MONTH');
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);

  // Custom range dates (defaults to last 30 days)
  const defaultStartDate = useMemo(() => {
    try {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
    } catch {
      return '2026-10-06';
    }
  }, []);

  const [customStartDate, setCustomStartDate] = useState(defaultStartDate);
  const [customEndDate, setCustomEndDate] = useState(todayIST);

  const [selectedUnit, setSelectedUnit] = useState('ALL');
  const [selectedDepartment, setSelectedDepartment] = useState('ALL');
  const [selectedTier, setSelectedTier] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [showFormulaModal, setShowFormulaModal] = useState(false);
  const [inspectedMember, setInspectedMember] = useState(null);

  const [kpiData, setKpiData] = useState({
    rangeMode: 'MONTH',
    month: defaultMonth,
    startDate: `${defaultMonth}-01`,
    endDate: todayIST,
    rangeLabel: 'November 2026',
    monthLabel: 'November 2026',
    daysInMonth: 30,
    daysInRange: 30,
    elapsedDays: 5,
    todayDate: todayIST,
    summary: {
      totalMembers: 0,
      avgKpiScore: 0,
      avgLoginDays: 0,
      totalHoursLogged: 0,
      topPerformer: null,
      tierCounts: { EXCEPTIONAL: 0, GOOD: 0, AVERAGE: 0, NEEDS_ATTENTION: 0 },
    },
    members: [],
  });

  // Available months for quick picker
  const availableMonths = useMemo(() => {
    return [
      { id: '2026-11', label: 'November 2026' },
      { id: '2026-10', label: 'October 2026' },
      { id: '2026-09', label: 'September 2026' },
      { id: '2026-08', label: 'August 2026' },
      { id: '2026-07', label: 'July 2026' },
    ];
  }, []);

  // Fetch KPI data from backend
  const fetchKpiData = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const params = {};

      if (dateMode === 'CUSTOM') {
        if (customStartDate && customEndDate) {
          params.startDate = customStartDate;
          params.endDate = customEndDate;
        } else {
          params.month = selectedMonth;
        }
      } else {
        params.month = selectedMonth;
      }

      if (selectedUnit !== 'ALL') {
        params.unitId = selectedUnit;
      }
      if (selectedDepartment !== 'ALL') {
        params.department = selectedDepartment;
      }
      if (selectedTier !== 'ALL') {
        params.tier = selectedTier;
      }
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const res = await auditLogService.getMemberKpiStats(params);
      if (res.data?.success) {
        setKpiData(res.data);
        setFetchError(null);
      } else {
        setFetchError(res.data?.message || 'Failed to retrieve member KPI records.');
      }
    } catch (err) {
      console.error('Failed to load member KPI data:', err);
      const isProxyDown = !err.response || err.response.status === 500;
      const msg = isProxyDown
        ? 'Backend API server (port 5000) is unreachable. Please verify server status.'
        : (err.response?.data?.message || 'Failed to load member KPI scorecard.');
      setFetchError(msg);
      if (showToast) {
        showToast(msg, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKpiData();
  }, [dateMode, selectedMonth, customStartDate, customEndDate, selectedUnit, selectedDepartment, selectedTier]);

  // Quick preset ranges helper
  const handleApplyPreset = (preset) => {
    setDateMode('CUSTOM');
    if (preset === '7_DAYS') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      const start = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
      setCustomStartDate(start);
      setCustomEndDate(todayIST);
    } else if (preset === '15_DAYS') {
      const d = new Date();
      d.setDate(d.getDate() - 15);
      const start = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
      setCustomStartDate(start);
      setCustomEndDate(todayIST);
    } else if (preset === '30_DAYS') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      const start = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
      setCustomStartDate(start);
      setCustomEndDate(todayIST);
    } else if (preset === 'OCT_15_NOV_05') {
      setCustomStartDate('2026-10-15');
      setCustomEndDate('2026-11-05');
    }
  };

  // Extract distinct departments for filter dropdown
  const departmentOptions = useMemo(() => {
    const set = new Set();
    (kpiData.members || []).forEach((m) => {
      if (m.department) set.add(m.department);
    });
    return Array.from(set).sort();
  }, [kpiData.members]);

  // Client-side search filtering
  const filteredMembers = useMemo(() => {
    let list = kpiData.members || [];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (m) =>
          (m.name || '').toLowerCase().includes(q) ||
          (m.employeeId || '').toLowerCase().includes(q) ||
          (m.department || '').toLowerCase().includes(q) ||
          (m.role || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [kpiData.members, searchQuery]);

  // Month navigation
  const handleMonthStep = (offset) => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const d = new Date(year, month - 1 + offset, 1);
    const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(newMonth);
    setDateMode('MONTH');
  };

  // Export CSV with active custom date range
  const handleExportCSV = () => {
    try {
      const headers = [
        'Rank',
        'Employee ID',
        'Member Name',
        'Role',
        'Department',
        'Unit',
        'Date Range Mode',
        'Date Range',
        'Days Logged In',
        'Days Not Logged In',
        'Elapsed Days in Range',
        'Total Days in Range',
        'Attendance Rate (%)',
        'Total Work Duration',
        'Daily Avg Work Time',
        'KPI Score (0-100)',
        'Grade',
        'Rating',
      ];

      const rows = filteredMembers.map((m, idx) => [
        idx + 1,
        `"${m.employeeId || ''}"`,
        `"${m.name || ''}"`,
        `"${m.role || ''}"`,
        `"${m.department || ''}"`,
        `"${m.unitName || m.unitId || ''}"`,
        `"${kpiData.rangeMode || dateMode}"`,
        `"${kpiData.rangeLabel || kpiData.monthLabel}"`,
        m.loginDays,
        m.absentDays,
        kpiData.elapsedDays,
        kpiData.daysInRange || kpiData.daysInMonth,
        m.attendancePercentage,
        `"${m.totalDurationFormatted}"`,
        `"${m.avgDailyDurationFormatted}"`,
        m.kpiScore,
        `"${m.tier?.grade || ''}"`,
        `"${m.tier?.label || ''}"`,
      ]);

      const csvContent =
        'data:text/csv;charset=utf-8,' +
        [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      const filename =
        dateMode === 'CUSTOM'
          ? `Member_Work_KPI_${customStartDate}_to_${customEndDate}.csv`
          : `Member_Work_KPI_${selectedMonth}.csv`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      if (showToast) {
        showToast(`Exported KPI report for ${kpiData.rangeLabel || kpiData.monthLabel}.`);
      }
    } catch (err) {
      console.error('CSV export failed:', err);
      if (showToast) {
        showToast('Failed to export CSV report.', 'error');
      }
    }
  };

  // Performance tier badge styling
  const renderTierBadge = (tier) => {
    if (!tier) return null;
    const code = tier.code;
    if (code === 'EXCEPTIONAL') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          {tier.grade} ({tier.label})
        </span>
      );
    }
    if (code === 'GOOD') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
          {tier.grade} ({tier.label})
        </span>
      );
    }
    if (code === 'AVERAGE') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          {tier.grade} ({tier.label})
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
        {tier.grade} ({tier.label})
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* 1. Clean Executive Header with Date Mode Switcher */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/50 dark:border-indigo-800/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Member Work KPI & Duration Scorecard
              </h2>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/50">
                {dateMode === 'CUSTOM' ? 'Custom Date Range' : 'Monthly Performance'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Active Range:{' '}
              <strong className="text-slate-800 dark:text-slate-200 font-semibold">
                {kpiData.rangeLabel || kpiData.monthLabel}
              </strong>{' '}
              ({kpiData.elapsedDays} of {kpiData.daysInRange || kpiData.daysInMonth} days elapsed)
            </p>
          </div>
        </div>

        {/* Date Mode Toggle & Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Segmented Mode Switcher */}
          <div className="flex items-center p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setDateMode('MONTH')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                dateMode === 'MONTH'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5 text-indigo-500" />
              <span>Month</span>
            </button>
            <button
              onClick={() => setDateMode('CUSTOM')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                dateMode === 'CUSTOM'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <CalendarRange className="w-3.5 h-3.5 text-emerald-500" />
              <span>Custom Range</span>
            </button>
          </div>

          {/* Month Stepper (when in MONTH mode) */}
          {dateMode === 'MONTH' ? (
            <div className="flex items-center bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-1 shadow-2xs">
              <button
                onClick={() => handleMonthStep(-1)}
                title="Previous Month"
                className="p-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-all cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-200 px-2 py-1 focus:outline-none cursor-pointer"
              >
                {availableMonths.map((m) => (
                  <option key={m.id} value={m.id} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                    {m.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => handleMonthStep(1)}
                title="Next Month"
                className="p-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-all cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ) : null}

          <button
            onClick={() => setShowFormulaModal(true)}
            title="View KPI calculation rules"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-all cursor-pointer"
          >
            <Info className="w-3.5 h-3.5 text-slate-500" />
            <span>Guide</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={fetchKpiData}
            disabled={loading}
            title="Refresh scorecard"
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Custom Date Range Selector Bar (Shows only when CUSTOM mode is active) */}
      {dateMode === 'CUSTOM' && (
        <div className="p-3.5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-800/50 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3 animate-in fade-in duration-150">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <CalendarRange className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Select Date Range:</span>
            </span>

            {/* From Date */}
            <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1 shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-400 uppercase">From</span>
              <input
                type="date"
                value={customStartDate}
                max={customEndDate || todayIST}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-transparent text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
              />
            </div>

            {/* To Date */}
            <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1 shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-400 uppercase">To</span>
              <input
                type="date"
                value={customEndDate}
                min={customStartDate}
                max={todayIST}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-transparent text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
              />
            </div>

            <button
              onClick={fetchKpiData}
              className="px-3 py-1 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition-all cursor-pointer"
            >
              Apply Range
            </button>
          </div>

          {/* Quick Range Presets */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-slate-400 font-medium">Quick Presets:</span>
            <button
              onClick={() => handleApplyPreset('7_DAYS')}
              className="px-2 py-0.5 rounded-lg text-[11px] font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 text-slate-600 dark:text-slate-300 transition-all cursor-pointer"
            >
              Last 7 Days
            </button>
            <button
              onClick={() => handleApplyPreset('15_DAYS')}
              className="px-2 py-0.5 rounded-lg text-[11px] font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 text-slate-600 dark:text-slate-300 transition-all cursor-pointer"
            >
              Last 15 Days
            </button>
            <button
              onClick={() => handleApplyPreset('30_DAYS')}
              className="px-2 py-0.5 rounded-lg text-[11px] font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 text-slate-600 dark:text-slate-300 transition-all cursor-pointer"
            >
              Last 30 Days
            </button>
            <button
              onClick={() => handleApplyPreset('OCT_15_NOV_05')}
              className="px-2 py-0.5 rounded-lg text-[11px] font-medium bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition-all cursor-pointer font-mono"
            >
              Oct 15 – Nov 05
            </button>
          </div>
        </div>
      )}

      {/* 2. Top Metric Summary Cards (4 Clean, Uniform Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Plant Average KPI */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1.5">
            <span className="font-medium">Plant Average KPI</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {kpiData.summary?.avgKpiScore || 0}
            </span>
            <span className="text-xs text-slate-400 font-mono">/ 100</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Plant index across {kpiData.summary?.totalMembers || 0} members evaluated
          </div>
        </div>

        {/* Average Login Days */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1.5">
            <span className="font-medium">Average Days Logged In</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {kpiData.summary?.avgLoginDays || '0.0'}
            <span className="text-xs font-normal text-slate-400 ml-1">
              / {kpiData.elapsedDays} elapsed days
            </span>
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1">
            {kpiData.elapsedDays > 0
              ? `${Math.round(((kpiData.summary?.avgLoginDays || 0) / kpiData.elapsedDays) * 100)}% active attendance rate`
              : '—'}
          </div>
        </div>

        {/* Total Work Hours Logged */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1.5">
            <span className="font-medium">Total Work Hours</span>
            <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-950/50 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {kpiData.summary?.totalHoursLogged || '0.0'}
            <span className="text-xs font-normal text-slate-400 ml-1">hrs logged</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Cumulative duration in {kpiData.rangeLabel || kpiData.monthLabel}
          </div>
        </div>

        {/* Top Performer */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1.5">
            <span className="font-medium">Top Performer</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Award className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-base font-bold text-slate-900 dark:text-white truncate">
            {kpiData.summary?.topPerformer?.name || '—'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">
              {kpiData.summary?.topPerformer?.kpiScore || 0} pts
            </span>
            <span>•</span>
            <span>{kpiData.summary?.topPerformer?.loginDays || 0} days active</span>
          </div>
        </div>
      </div>

      {/* 3. Streamlined Filter Toolbar */}
      <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search member name, ID, department..."
            className="w-full pl-9 pr-10 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2 text-slate-400 hover:text-slate-600 text-xs"
            >
              ×
            </button>
          )}
        </div>

        {/* Quick Grade Segmented Tabs & Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Grade Tiers Segmented Controls */}
          <div className="flex items-center p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setSelectedTier('ALL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                selectedTier === 'ALL'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All ({kpiData.summary?.totalMembers || 0})
            </button>
            <button
              onClick={() => setSelectedTier('EXCEPTIONAL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                selectedTier === 'EXCEPTIONAL'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-emerald-600'
              }`}
            >
              Grade A+ ({kpiData.summary?.tierCounts?.EXCEPTIONAL || 0})
            </button>
            <button
              onClick={() => setSelectedTier('GOOD')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                selectedTier === 'GOOD'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-indigo-600'
              }`}
            >
              Grade A ({kpiData.summary?.tierCounts?.GOOD || 0})
            </button>
            <button
              onClick={() => setSelectedTier('AVERAGE')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                selectedTier === 'AVERAGE'
                  ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-2xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-amber-600'
              }`}
            >
              Grade B ({kpiData.summary?.tierCounts?.AVERAGE || 0})
            </button>
            <button
              onClick={() => setSelectedTier('NEEDS_ATTENTION')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                selectedTier === 'NEEDS_ATTENTION'
                  ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-2xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-rose-600'
              }`}
            >
              Grade C ({kpiData.summary?.tierCounts?.NEEDS_ATTENTION || 0})
            </button>
          </div>

          {/* Unit Filter */}
          <select
            value={selectedUnit}
            onChange={(e) => setSelectedUnit(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="ALL">All Units</option>
            <option value="UNIT-1">Unit 1</option>
            <option value="UNIT-2">Unit 2</option>
          </select>

          {/* Department Filter */}
          <select
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer max-w-[150px] truncate"
          >
            <option value="ALL">All Departments</option>
            {departmentOptions.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 4. Neat & Clean Member Scorecard Table */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-slate-400 font-mono text-xs flex flex-col items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mb-3" />
            <span>Loading member attendance & work duration records...</span>
          </div>
        ) : fetchError ? (
          <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-full bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center text-rose-500">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {fetchError}
            </div>
            <p className="text-[11px] text-slate-400 max-w-md">
              The frontend is unable to fetch KPI data from the server. Ensure the backend is active at http://localhost:5000 and try again.
            </p>
            <button
              onClick={fetchKpiData}
              className="mt-1 px-4 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Connection</span>
            </button>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="p-12 text-center text-slate-400 font-mono text-xs">
            No member records found matching the active filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-3 text-center w-12">#</th>
                  <th className="py-3 px-4">Member Name</th>
                  <th className="py-3 px-4">Department & Unit</th>
                  <th className="py-3 px-4">
                    {dateMode === 'CUSTOM' ? 'Attendance (in Range)' : 'Monthly Attendance'}
                  </th>
                  <th className="py-3 px-4">Work Duration</th>
                  <th className="py-3 px-4 w-44">KPI Score</th>
                  <th className="py-3 px-4 text-center">Grade Rating</th>
                  <th className="py-3 px-3 text-right w-24">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredMembers.map((member, idx) => {
                  const score = member.kpiScore || 0;
                  const rankNum = String(idx + 1).padStart(2, '0');

                  return (
                    <tr
                      key={member.id || member.employeeId}
                      onClick={() => setInspectedMember(member)}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
                    >
                      {/* Rank */}
                      <td className="py-3 px-3 text-center font-mono text-xs text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300">
                        {rankNum}
                      </td>

                      {/* Member Info */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 font-bold text-xs uppercase shrink-0">
                            {(member.name || 'U').slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                              <span>{member.name}</span>
                              {member.role === 'ADMIN' && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200/60">
                                  ADMIN
                                </span>
                              )}
                              {member.role === 'AUDITOR' && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-400 border border-purple-200/60">
                                  AUDITOR
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400">
                              {member.employeeId}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Department & Unit */}
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[150px]">
                          {member.department}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                          <span>{member.unitName || member.unitId}</span>
                        </div>
                      </td>

                      {/* Attendance: Days Logged In vs Days Absent */}
                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              {member.loginDays}d active
                            </span>
                            <span className="text-slate-300 dark:text-slate-700">•</span>
                            <span className="text-slate-400">
                              {member.absentDays}d absent
                            </span>
                          </div>
                          <div className="w-32 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${Math.min(100, member.attendancePercentage)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Work Duration */}
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-slate-800 dark:text-slate-200">
                          {member.totalDurationFormatted}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {member.avgDailyDurationFormatted || '0m'}
                        </div>
                      </td>

                      {/* KPI Score */}
                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900 dark:text-white font-mono text-sm">
                              {member.kpiScore}
                              <span className="text-[10px] font-normal text-slate-400 ml-0.5">/100</span>
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Att:{member.loginScore} Dur:{member.durationScore}
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                score >= 85
                                  ? 'bg-emerald-500'
                                  : score >= 70
                                  ? 'bg-indigo-500'
                                  : score >= 50
                                  ? 'bg-amber-500'
                                  : 'bg-rose-500'
                              }`}
                              style={{ width: `${Math.min(100, Math.max(5, member.kpiScore))}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Grade Badge */}
                      <td className="py-3 px-4 text-center">
                        {renderTierBadge(member.tier)}
                      </td>

                      {/* Action */}
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectedMember(member);
                          }}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>Log</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. Clean Modal: Member Attendance & Duration Breakdown in Selected Range */}
      {inspectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-3xl max-h-[85vh] bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 font-bold text-sm uppercase">
                  {(inspectedMember.name || 'U').slice(0, 2)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {inspectedMember.name}
                    </h3>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {inspectedMember.employeeId}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {inspectedMember.department} • {inspectedMember.unitName || inspectedMember.unitId} •{' '}
                    <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                      {kpiData.rangeLabel || kpiData.monthLabel}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setInspectedMember(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Metrics Strip */}
            <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 grid grid-cols-4 gap-3 text-center">
              <div>
                <div className="text-[10px] uppercase font-semibold text-slate-400">KPI Score</div>
                <div className="text-lg font-bold text-slate-900 dark:text-white font-mono">
                  {inspectedMember.kpiScore}
                  <span className="text-xs font-normal text-slate-400">/100</span>
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-semibold text-slate-400">Days Active</div>
                <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  {inspectedMember.loginDays} days
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-semibold text-slate-400">Days Absent</div>
                <div className="text-lg font-bold text-slate-600 dark:text-slate-400 font-mono">
                  {inspectedMember.absentDays} days
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-semibold text-slate-400">Total Work Duration</div>
                <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                  {inspectedMember.totalDurationFormatted}
                </div>
              </div>
            </div>

            {/* Modal Body: Day-by-Day Log Table across Date Range */}
            <div className="flex-1 overflow-y-auto p-5">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                    <th className="py-2 px-2 text-center w-10">Day</th>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-2">Weekday</th>
                    <th className="py-2 px-3 text-center">Status</th>
                    <th className="py-2 px-3">First Login (IST)</th>
                    <th className="py-2 px-3">Last Active (IST)</th>
                    <th className="py-2 px-3 text-right">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {inspectedMember.dailyBreakdown?.map((day) => (
                    <tr
                      key={day.date}
                      className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors ${
                        day.isPresent
                          ? 'bg-emerald-50/10'
                          : day.isSunday
                          ? 'opacity-60 bg-slate-50/20'
                          : ''
                      }`}
                    >
                      <td className="py-1.5 px-2 text-center font-mono text-slate-400">
                        {day.dayNumber}
                      </td>
                      <td className="py-1.5 px-3 font-mono text-slate-700 dark:text-slate-300">
                        {day.date}
                      </td>
                      <td className="py-1.5 px-2 text-slate-500">
                        {day.dayOfWeek}
                        {day.isSunday && (
                          <span className="ml-1 text-[9px] text-amber-500 font-mono">(Sun)</span>
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-center">
                        {day.isPresent ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200/50">
                            Present
                          </span>
                        ) : day.isPastOrToday ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-normal text-slate-400 bg-slate-100 dark:bg-slate-800">
                            Absent
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">Upcoming</span>
                        )}
                      </td>
                      <td className="py-1.5 px-3 font-mono text-slate-600 dark:text-slate-400">
                        {day.loginTimeIST || '—'}
                      </td>
                      <td className="py-1.5 px-3 font-mono text-slate-600 dark:text-slate-400">
                        {day.lastActiveIST || '—'}
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono font-medium">
                        {day.isPresent ? (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {day.durationFormatted}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-700">0m</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Attendance breakdown for range: {kpiData.rangeLabel || kpiData.monthLabel}
              </span>
              <button
                onClick={() => setInspectedMember(null)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Clean Formula Guide Modal */}
      {showFormulaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-indigo-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  KPI Scoring Methodology
                </h3>
              </div>
              <button
                onClick={() => setShowFormulaModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
                <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  1. Attendance Consistency (50 Pts Max)
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Formula: <code className="font-mono text-emerald-600 dark:text-emerald-400">(Days Logged In ÷ Elapsed Days in Range) × 50</code>.
                  Rewards consistent presence across the selected date window without penalizing future days.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
                <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-500" />
                  2. Work Session Duration (50 Pts Max)
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Formula: <code className="font-mono text-indigo-600 dark:text-indigo-400">(Avg Daily Work Hours ÷ 4.0 hrs benchmark) × 50</code>.
                  Measures engagement duration per active logged-in day within the selected window.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
                <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-amber-500" />
                  3. Performance Rating Tiers
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                  <div><strong className="text-emerald-600 dark:text-emerald-400">Grade A+ (85–100)</strong>: Exceptional</div>
                  <div><strong className="text-indigo-600 dark:text-indigo-400">Grade A (70–84)</strong>: Good</div>
                  <div><strong className="text-amber-600 dark:text-amber-400">Grade B (50–69)</strong>: Average</div>
                  <div><strong className="text-rose-600 dark:text-rose-400">Grade C (&lt; 50)</strong>: Needs Attention</div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowFormulaModal(false)}
              className="w-full py-2 rounded-xl text-xs font-semibold bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 transition-all"
            >
              Understood
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemberKpiPanel;
