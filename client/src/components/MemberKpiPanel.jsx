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
  AlertTriangle,
  ChevronRight,
  Download,
  Printer,
  Info,
  TrendingUp,
  Sparkles,
  ChevronLeft,
  X,
  Building2,
  Layers,
  Flame,
  Star,
  Activity,
  Check,
} from 'lucide-react';
import { auditLogService } from '../services/api';
import { useUnit } from '../context/UnitContext';

export const MemberKpiPanel = ({ showToast }) => {
  const { units, activeUnitId } = useUnit();

  // Current IST month default 'YYYY-MM'
  const defaultMonth = useMemo(() => {
    try {
      const now = new Date();
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
      }).format(now);
    } catch {
      return '2026-11';
    }
  }, []);

  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [selectedUnit, setSelectedUnit] = useState('ALL');
  const [selectedDepartment, setSelectedDepartment] = useState('ALL');
  const [selectedTier, setSelectedTier] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [kpiData, setKpiData] = useState({
    summary: {
      totalMembers: 0,
      avgKpiScore: 0,
      avgLoginDays: 0,
      totalHoursLogged: 0,
      topPerformer: null,
      tierCounts: { EXCEPTIONAL: 0, GOOD: 0, AVERAGE: 0, NEEDS_ATTENTION: 0 },
    },
    members: [],
    daysInMonth: 30,
    elapsedDays: 5,
    monthLabel: 'November 2026',
  });

  const [showFormulaInfo, setShowFormulaInfo] = useState(false);
  const [inspectedMember, setInspectedMember] = useState(null);

  // Available months for quick picker
  const availableMonths = useMemo(() => {
    return [
      { id: '2026-11', label: 'November 2026 (Current)' },
      { id: '2026-10', label: 'October 2026' },
      { id: '2026-09', label: 'September 2026' },
      { id: '2026-08', label: 'August 2026' },
      { id: '2026-07', label: 'July 2026' },
    ];
  }, []);

  // Fetch KPI data from backend
  const fetchKpiData = async () => {
    setLoading(true);
    try {
      const params = {
        month: selectedMonth,
      };
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
      }
    } catch (err) {
      console.error('Failed to load member KPI data:', err);
      if (showToast) {
        showToast('error', 'Failed to load member KPI scorecard.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKpiData();
  }, [selectedMonth, selectedUnit, selectedDepartment, selectedTier]);

  // Extract distinct departments from loaded members for filter dropdown
  const departmentOptions = useMemo(() => {
    const set = new Set();
    (kpiData.members || []).forEach((m) => {
      if (m.department) set.add(m.department);
    });
    return Array.from(set).sort();
  }, [kpiData.members]);

  // Client-side search filtering if user types quickly without full refetch
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

  // Month navigation (Previous / Next Month)
  const handleMonthStep = (offset) => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const d = new Date(year, month - 1 + offset, 1);
    const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(newMonth);
  };

  // Export to CSV
  const handleExportCSV = () => {
    try {
      const headers = [
        'Rank',
        'Employee ID',
        'Member Name',
        'Email',
        'Role',
        'Department',
        'Unit',
        'Days Logged In',
        'Days Not Logged In',
        'Elapsed Days in Month',
        'Total Days in Month',
        'Attendance Rate (%)',
        'Total Work Duration (Mins)',
        'Total Work Duration (Formatted)',
        'Avg Daily Duration (Formatted)',
        'Login Consistency Score (Max 50)',
        'Duration Score (Max 50)',
        'Overall KPI Score (Max 100)',
        'Performance Grade',
        'Performance Rating',
      ];

      const rows = filteredMembers.map((m, idx) => [
        idx + 1,
        `"${m.employeeId || ''}"`,
        `"${m.name || ''}"`,
        `"${m.email || ''}"`,
        `"${m.role || ''}"`,
        `"${m.department || ''}"`,
        `"${m.unitName || m.unitId || ''}"`,
        m.loginDays,
        m.absentDays,
        kpiData.elapsedDays,
        kpiData.daysInMonth,
        m.attendancePercentage,
        m.totalDurationMinutes,
        `"${m.totalDurationFormatted}"`,
        `"${m.avgDailyDurationFormatted}"`,
        m.loginScore,
        m.durationScore,
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
      link.setAttribute(
        'download',
        `Member_Work_KPI_Scorecard_${selectedMonth}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      if (showToast) {
        showToast('success', `Exported KPI scorecard for ${kpiData.monthLabel}.`);
      }
    } catch (err) {
      console.error('CSV export failed:', err);
      if (showToast) {
        showToast('error', 'Failed to generate CSV export.');
      }
    }
  };

  // Helper for rank badge
  const renderRankBadge = (idx) => {
    if (idx === 0) {
      return (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 font-bold text-xs shadow-xs border border-amber-300/40">
          🥇
        </span>
      );
    }
    if (idx === 1) {
      return (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs shadow-xs border border-slate-300/40">
          🥈
        </span>
      );
    }
    if (idx === 2) {
      return (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700/10 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-bold text-xs shadow-xs border border-amber-600/30">
          🥉
        </span>
      );
    }
    return (
      <span className="text-xs font-mono font-semibold text-slate-400">
        #{idx + 1}
      </span>
    );
  };

  // Helper for progress bar color
  const getScoreColor = (score) => {
    if (score >= 85) return 'bg-emerald-500';
    if (score >= 70) return 'bg-indigo-500';
    if (score >= 50) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  const getScoreTextColor = (score) => {
    if (score >= 85) return 'text-emerald-600 dark:text-emerald-400';
    if (score >= 70) return 'text-indigo-600 dark:text-indigo-400';
    if (score >= 50) return 'text-amber-600 dark:text-amber-400';
    return 'text-rose-600 dark:text-rose-400';
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950 text-white shadow-xl border border-indigo-500/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-400" />
                Live Performance Engine
              </span>
              <span className="text-xs text-indigo-200/80 font-mono">
                Month: {kpiData.monthLabel || selectedMonth}
              </span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2.5">
              <Activity className="w-6 h-6 text-indigo-400" />
              Member Work KPI & Duration Scorecard
            </h2>
            <p className="text-xs text-indigo-100/70 max-w-2xl leading-relaxed">
              Transparent monthly productivity analytics tracking how many days each member logged in,
              absent/non-login days, and total active session duration time across factory operations.
            </p>
          </div>

          {/* Month Stepper & Quick Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-slate-800/90 rounded-xl p-1 border border-slate-700/80 shadow-inner">
              <button
                onClick={() => handleMonthStep(-1)}
                title="Previous Month"
                className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-xs font-semibold text-white px-2 py-1 focus:outline-none cursor-pointer"
              >
                {availableMonths.map((m) => (
                  <option key={m.id} value={m.id} className="bg-slate-900 text-white">
                    {m.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => handleMonthStep(1)}
                title="Next Month"
                className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => setShowFormulaInfo(!showFormulaInfo)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 transition-all cursor-pointer"
            >
              <Info className="w-3.5 h-3.5 text-indigo-300" />
              <span>{showFormulaInfo ? 'Hide Formula' : 'Scoring Formula'}</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Expandable Scoring Formula Transparency Banner */}
        {showFormulaInfo && (
          <div className="mt-5 pt-4 border-t border-indigo-500/20 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs animate-in fade-in duration-200">
            <div className="p-3 rounded-xl bg-slate-800/60 border border-indigo-500/20">
              <div className="font-semibold text-emerald-300 mb-1 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                1. Login Consistency (50 Pts Max)
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                Calculated as <code className="text-emerald-200 font-mono">(Login Days ÷ Elapsed Days) × 50</code>.
                Evaluates active presence in the plant without penalizing future calendar days.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-800/60 border border-indigo-500/20">
              <div className="font-semibold text-indigo-300 mb-1 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-indigo-400" />
                2. Work Session Duration (50 Pts Max)
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                Calculated as <code className="text-indigo-200 font-mono">(Avg Daily Hours ÷ 4.0 hrs) × 50</code>.
                Rewards members actively engaged on tasks, complaints, and inspection updates.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-800/60 border border-indigo-500/20">
              <div className="font-semibold text-amber-300 mb-1 flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-400" />
                3. Total Member KPI (0 - 100 Score)
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                <strong className="text-emerald-300">Grade A+</strong> (85+),{' '}
                <strong className="text-indigo-300">Grade A</strong> (70–84),{' '}
                <strong className="text-amber-300">Grade B</strong> (50–69),{' '}
                <strong className="text-rose-300">Grade C</strong> (&lt;50).
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 4 Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Members */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-2">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Tracked Personnel</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white">
            {kpiData.summary?.totalMembers || 0}
          </div>
          <div className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
            <span className="font-mono text-indigo-600 dark:text-indigo-400 font-semibold">
              {kpiData.elapsedDays} of {kpiData.daysInMonth}
            </span>{' '}
            days elapsed in month
          </div>
        </div>

        {/* Plant Average KPI */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-2">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Plant Average KPI</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-extrabold ${getScoreTextColor(kpiData.summary?.avgKpiScore || 0)}`}>
              {kpiData.summary?.avgKpiScore || 0}
            </span>
            <span className="text-xs text-slate-400 font-mono">/ 100</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Across all departments & active shifts
          </div>
        </div>

        {/* Average Login Days */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-2">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Avg Days Logged In</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white">
            {kpiData.summary?.avgLoginDays || '0.0'}
            <span className="text-xs font-normal text-slate-400 ml-1">days / member</span>
          </div>
          <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-medium">
            {kpiData.elapsedDays > 0
              ? `${Math.round(((kpiData.summary?.avgLoginDays || 0) / kpiData.elapsedDays) * 100)}% active rate`
              : '—'}
          </div>
        </div>

        {/* Total Plant Duration */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-2">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Total Hours Logged</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/50 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white">
            {kpiData.summary?.totalHoursLogged || '0.0'}
            <span className="text-xs font-normal text-slate-400 ml-1">hrs</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Top Performer:{' '}
            <strong className="text-slate-700 dark:text-slate-200">
              {kpiData.summary?.topPerformer?.name || '—'}
            </strong>{' '}
            ({kpiData.summary?.topPerformer?.kpiScore || 0} pts)
          </div>
        </div>
      </div>

      {/* Control Bar: Search, Filters & Quick Toggles */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search member name, employee ID, role..."
            className="w-full pl-9 pr-12 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2 text-slate-400 hover:text-slate-600 text-xs"
            >
              Clear
            </button>
          )}
        </div>

        {/* Dropdowns */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Unit Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="bg-transparent text-xs text-slate-700 dark:text-slate-300 font-medium focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Units</option>
              <option value="UNIT-1">Unit 1</option>
              <option value="UNIT-2">Unit 2</option>
            </select>
          </div>

          {/* Department Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="bg-transparent text-xs text-slate-700 dark:text-slate-300 font-medium focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Departments</option>
              {departmentOptions.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          {/* Tier Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <Award className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedTier}
              onChange={(e) => setSelectedTier(e.target.value)}
              className="bg-transparent text-xs text-slate-700 dark:text-slate-300 font-medium focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Grades</option>
              <option value="EXCEPTIONAL">Grade A+ (85+)</option>
              <option value="GOOD">Grade A (70-84)</option>
              <option value="AVERAGE">Grade B (50-69)</option>
              <option value="NEEDS_ATTENTION">Grade C (&lt;50)</option>
            </select>
          </div>

          <button
            onClick={fetchKpiData}
            disabled={loading}
            title="Refresh Data"
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main KPI Scorecard Table */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-slate-400 font-mono text-xs flex flex-col items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mb-3" />
            <span>Calculating individual member KPI scores from attendance & duration logs...</span>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="p-12 text-center text-slate-400 font-mono text-xs">
            No member records found matching the specified filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-3 text-center w-12">Rank</th>
                  <th className="py-3 px-4">Member Name & ID</th>
                  <th className="py-3 px-4">Department & Unit</th>
                  <th className="py-3 px-4 text-center">Days Logged In</th>
                  <th className="py-3 px-4 text-center">Days Not Logged In</th>
                  <th className="py-3 px-4">Total Work Time</th>
                  <th className="py-3 px-4">Avg Daily Time</th>
                  <th className="py-3 px-4 w-48">KPI Score (0-100)</th>
                  <th className="py-3 px-4 text-center">Performance Rating</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredMembers.map((member, idx) => {
                  const score = member.kpiScore || 0;
                  const scoreColor = getScoreColor(score);
                  const scoreTextColor = getScoreTextColor(score);

                  return (
                    <tr
                      key={member.id || member.employeeId}
                      className="hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition-colors group cursor-pointer"
                      onClick={() => setInspectedMember(member)}
                    >
                      {/* Rank */}
                      <td className="py-3.5 px-3 text-center">
                        {renderRankBadge(idx)}
                      </td>

                      {/* Member Info */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs uppercase shadow-xs shrink-0">
                            {(member.name || 'U').slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                              <span>{member.name}</span>
                              {member.role === 'ADMIN' && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-300/40">
                                  ADMIN
                                </span>
                              )}
                              {member.role === 'AUDITOR' && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400 border border-purple-300/40">
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
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[160px]">
                          {member.department}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Layers className="w-2.5 h-2.5" />
                          <span>{member.unitName || member.unitId}</span>
                        </div>
                      </td>

                      {/* Days Logged In (Present) */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            {member.loginDays} {member.loginDays === 1 ? 'day' : 'days'}
                          </span>
                          <span className="text-[10px] text-slate-400 mt-0.5 font-mono">
                            {member.attendancePercentage}% of elapsed
                          </span>
                        </div>
                      </td>

                      {/* Days Not Logged In (Absent) */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                              member.absentDays === 0
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                                : 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800'
                            }`}
                          >
                            {member.absentDays > 0 ? (
                              <XCircle className="w-3 h-3 text-rose-500" />
                            ) : (
                              <Check className="w-3 h-3 text-slate-400" />
                            )}
                            {member.absentDays} {member.absentDays === 1 ? 'day' : 'days'}
                          </span>
                          <span className="text-[10px] text-slate-400 mt-0.5">
                            missed logins
                          </span>
                        </div>
                      </td>

                      {/* Total Duration Time */}
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-indigo-500" />
                          <span>{member.totalDurationFormatted}</span>
                        </div>
                        <div className="text-[10px] font-normal text-slate-400 mt-0.5">
                          {member.totalDurationMinutes} mins total
                        </div>
                      </td>

                      {/* Avg Daily Duration */}
                      <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-300">
                        {member.avgDailyDurationFormatted || '0m'}
                      </td>

                      {/* KPI Score Progress & Number */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className={`font-mono font-bold text-sm ${scoreTextColor}`}>
                              {member.kpiScore}
                              <span className="text-[10px] font-normal text-slate-400 ml-0.5">/100</span>
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              L:{member.loginScore} + D:{member.durationScore}
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${scoreColor}`}
                              style={{ width: `${Math.min(100, Math.max(4, member.kpiScore))}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Performance Rating / Tier Badge */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                            member.tier?.code === 'EXCEPTIONAL'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                              : member.tier?.code === 'GOOD'
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800'
                              : member.tier?.code === 'AVERAGE'
                              ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                              : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                          }`}
                        >
                          <Star className="w-3 h-3 fill-current" />
                          <span>{member.tier?.grade}</span>
                          <span className="text-[10px] font-normal opacity-80">({member.tier?.label})</span>
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectedMember(member);
                          }}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all flex items-center gap-1 ml-auto cursor-pointer"
                        >
                          <span>Inspect Log</span>
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

      {/* Member Monthly Day-by-Day Breakdown Modal */}
      {inspectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-lg shadow-md">
                  {(inspectedMember.name || 'U').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold tracking-tight">{inspectedMember.name}</h3>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                      {inspectedMember.employeeId}
                    </span>
                  </div>
                  <div className="text-xs text-indigo-200/80 flex items-center gap-2 mt-0.5">
                    <span>{inspectedMember.department}</span>
                    <span>•</span>
                    <span>{inspectedMember.unitName || inspectedMember.unitId}</span>
                    <span>•</span>
                    <span>{inspectedMember.role}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-xl text-xs font-bold bg-white/10 text-white border border-white/20">
                  {kpiData.monthLabel}
                </span>
                <button
                  onClick={() => setInspectedMember(null)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal KPI Highlights Strip */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800">
                <div className="text-[10px] uppercase font-semibold text-slate-400">KPI Score</div>
                <div className={`text-xl font-black ${getScoreTextColor(inspectedMember.kpiScore)}`}>
                  {inspectedMember.kpiScore}
                  <span className="text-xs font-normal text-slate-400">/100</span>
                </div>
                <div className="text-[10px] font-bold text-slate-500">
                  {inspectedMember.tier?.grade}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800">
                <div className="text-[10px] uppercase font-semibold text-slate-400">Days Logged In</div>
                <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                  {inspectedMember.loginDays}
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  {inspectedMember.attendancePercentage}% rate
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800">
                <div className="text-[10px] uppercase font-semibold text-slate-400">Days Absent</div>
                <div className="text-xl font-black text-rose-600 dark:text-rose-400">
                  {inspectedMember.absentDays}
                </div>
                <div className="text-[10px] text-slate-400">non-login days</div>
              </div>

              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800">
                <div className="text-[10px] uppercase font-semibold text-slate-400">Total Work Time</div>
                <div className="text-xl font-black text-indigo-600 dark:text-indigo-400 font-mono">
                  {inspectedMember.totalDurationFormatted}
                </div>
                <div className="text-[10px] text-slate-400">cumulative</div>
              </div>

              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800">
                <div className="text-[10px] uppercase font-semibold text-slate-400">Daily Average</div>
                <div className="text-xl font-black text-slate-800 dark:text-slate-200 font-mono">
                  {inspectedMember.avgDailyDurationFormatted || '0m'}
                </div>
                <div className="text-[10px] text-slate-400">per logged-in day</div>
              </div>
            </div>

            {/* Modal Body: Day-by-Day Calendar & Attendance History */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Monthly Day-by-Day Attendance & Session Log ({inspectedMember.dailyBreakdown?.length || 0} Days)
                </h4>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> Present / Active
                  </span>
                  <span className="flex items-center gap-1 text-slate-400 font-medium">
                    <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700" /> Absent / No Session
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 text-[10px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
                      <th className="py-2.5 px-3 text-center w-12">Day</th>
                      <th className="py-2.5 px-4">Date</th>
                      <th className="py-2.5 px-3">Day of Week</th>
                      <th className="py-2.5 px-4 text-center">Status</th>
                      <th className="py-2.5 px-4">First Login (IST)</th>
                      <th className="py-2.5 px-4">Last Active (IST)</th>
                      <th className="py-2.5 px-4 text-right">Work Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {inspectedMember.dailyBreakdown?.map((day) => {
                      return (
                        <tr
                          key={day.date}
                          className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                            day.isPresent
                              ? 'bg-emerald-50/20 dark:bg-emerald-950/10'
                              : day.isSunday
                              ? 'bg-slate-50/40 dark:bg-slate-900/40 opacity-70'
                              : ''
                          }`}
                        >
                          <td className="py-2 px-3 text-center font-mono font-semibold text-slate-400">
                            {day.dayNumber}
                          </td>
                          <td className="py-2 px-4 font-mono font-medium text-slate-700 dark:text-slate-300">
                            {day.date}
                          </td>
                          <td className="py-2 px-3 text-slate-500 font-medium">
                            {day.dayOfWeek}
                            {day.isSunday && (
                              <span className="ml-1 text-[9px] text-amber-500 font-mono">(Sun)</span>
                            )}
                          </td>
                          <td className="py-2 px-4 text-center">
                            {day.isPresent ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300/40">
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                Present
                              </span>
                            ) : day.isPastOrToday ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                <XCircle className="w-3 h-3 text-slate-400" />
                                Absent
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-slate-400 bg-slate-50 dark:bg-slate-800/40">
                                Upcoming
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-4 font-mono text-slate-600 dark:text-slate-400">
                            {day.loginTimeIST || '—'}
                          </td>
                          <td className="py-2 px-4 font-mono text-slate-600 dark:text-slate-400">
                            {day.lastActiveIST || '—'}
                          </td>
                          <td className="py-2 px-4 text-right font-mono font-bold">
                            {day.isPresent ? (
                              <span className="text-emerald-600 dark:text-emerald-400">
                                {day.durationFormatted}
                              </span>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600">0m</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-400 font-mono">
                Log records verified against factory database & audit timestamps.
              </span>
              <button
                onClick={() => setInspectedMember(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 transition-all cursor-pointer"
              >
                Close Breakdown
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemberKpiPanel;

