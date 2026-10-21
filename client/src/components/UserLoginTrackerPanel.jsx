import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  LogIn,
  LogOut,
  Users,
  Search,
  Filter,
  RefreshCw,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Building2,
  ShieldCheck,
  Wrench,
  UserCog,
  Laptop,
  Globe,
  X,
  History,
  Activity,
  ArrowRight,
} from 'lucide-react';
import { auditLogService } from '../services/api';

/**
 * Format timestamp to friendly IST date & time string
 */
const formatDateTime = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  } catch (e) {
    return String(dateStr);
  }
};

const formatTimeOnly = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch (e) {
    return '—';
  }
};

const formatRelativeTime = (dateStr) => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const diffMs = Date.now() - d.getTime();
    if (diffMs < 0) return 'Just now';
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    return `${diffDays}d ago`;
  } catch (e) {
    return '';
  }
};

export const UserLoginTrackerPanel = ({ initialFilterUserId = null }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    roster: [],
    recentLogins: [],
    stats: {
      totalUsers: 0,
      loggedTodayCount: 0,
      activeNowCount: 0,
      absentCount: 0,
      neverLoggedInCount: 0,
      todayDate: '',
    },
  });

  const [searchQuery, setSearchQuery] = useState(initialFilterUserId || '');
  const [roleFilter, setRoleFilter] = useState('ALL'); // 'ALL', 'AUDITOR', 'SUPERVISOR', 'ADMIN'
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL', 'LOGGED_TODAY', 'ABSENT'
  const [activeTab, setActiveTab] = useState('ROSTER'); // 'ROSTER' | 'FEED'

  // User Login History Modal
  const [selectedUserForHistory, setSelectedUserForHistory] = useState(null);

  const fetchLoginData = async () => {
    try {
      setLoading(true);
      const res = await auditLogService.getUserLoginTimes({
        search: searchQuery,
      });
      if (res.data?.success) {
        setData(res.data);
      }
    } catch (err) {
      console.error('Failed to load user login times:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLoginData();
  }, []);

  // Filtered roster of users
  const filteredRoster = useMemo(() => {
    return (data.roster || []).filter((u) => {
      // Role filter
      if (roleFilter === 'AUDITOR' && u.role !== 'AUDITOR') return false;
      if (
        roleFilter === 'SUPERVISOR' &&
        u.role !== 'ACTION_PERSON' &&
        u.role !== 'SUPERVISOR'
      )
        return false;
      if (roleFilter === 'ADMIN' && u.role !== 'ADMIN') return false;

      // Status filter
      if (statusFilter === 'LOGGED_TODAY' && !u.isPresent && !u.loginTimestamp) return false;
      if (statusFilter === 'ABSENT' && (u.isPresent || u.loginTimestamp)) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = u.name?.toLowerCase().includes(q);
        const matchEmp = u.employeeId?.toLowerCase().includes(q);
        const matchDept = u.department?.toLowerCase().includes(q);
        const matchDesig = u.designation?.toLowerCase().includes(q);
        const matchRole = u.role?.toLowerCase().includes(q);
        if (!matchName && !matchEmp && !matchDept && !matchDesig && !matchRole) {
          return false;
        }
      }

      return true;
    });
  }, [data.roster, roleFilter, statusFilter, searchQuery]);

  // Filter user's specific login events for modal
  const userHistoryEvents = useMemo(() => {
    if (!selectedUserForHistory) return [];
    const empId = (selectedUserForHistory.employeeId || '').toLowerCase();
    const uId = String(selectedUserForHistory.id || selectedUserForHistory._id || '').toLowerCase();
    const uName = (selectedUserForHistory.name || '').toLowerCase();

    return (data.recentLogins || []).filter((l) => {
      const logUser = (l.user_id || '').toLowerCase();
      const logName = (l.user_name || '').toLowerCase();
      return (
        logUser === empId ||
        logUser === uId ||
        logName === uName ||
        (l.details || '').toLowerCase().includes(empId)
      );
    });
  }, [selectedUserForHistory, data.recentLogins]);

  const stats = data.stats || {};
  const totalUsers = stats.totalUsers || filteredRoster.length;
  const loginPercentage =
    totalUsers > 0 ? Math.round(((stats.loggedTodayCount || 0) / totalUsers) * 100) : 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Card 1: Logged In Today */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-500/20 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 text-xs font-semibold mb-1">
            <span>Signed In Today</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <LogIn className="w-4 h-4 text-emerald-500" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            {stats.loggedTodayCount || 0}
            <span className="text-xs font-bold text-slate-400 font-normal ml-1">
              / {totalUsers}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold font-mono">
              {loginPercentage}% workforce active
            </span>
          </div>
        </div>

        {/* Card 2: Active Sessions (Present) */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-indigo-500/20 shadow-xs">
          <div className="flex items-center justify-between text-indigo-600 dark:text-cyan-400 text-xs font-semibold mb-1">
            <span>Present Staff</span>
            <Users className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-indigo-700 dark:text-indigo-300">
            {stats.activeNowCount || 0}
          </div>
          <span className="text-[10px] text-slate-400 font-mono truncate block">
            Attendance status: Present
          </span>
        </div>

        {/* Card 3: Absent / Pending Sign-In */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold mb-1">
            <span>Absent Today</span>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-700 dark:text-slate-300">
            {stats.absentCount || 0}
          </div>
          <span className="text-[10px] text-slate-400 font-mono truncate block">
            Not yet signed in today
          </span>
        </div>

        {/* Card 4: Historical Login Logs */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-purple-500/20 shadow-xs">
          <div className="flex items-center justify-between text-purple-600 dark:text-purple-400 text-xs font-semibold mb-1">
            <span>Sign-In Audit Logs</span>
            <History className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-purple-700 dark:text-purple-300">
            {(data.recentLogins || []).length}
          </div>
          <span className="text-[10px] text-slate-400 font-mono truncate block">
            Recorded audit events
          </span>
        </div>
      </div>

      {/* Controls & Filter Bar */}
      <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search personnel by name, Employee ID, department..."
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* View Switcher & Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full md:w-auto py-0.5">
          {/* Sub-view toggle */}
          <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 shrink-0">
            <button
              onClick={() => setActiveTab('ROSTER')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'ROSTER'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-cyan-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              👥 Personnel Roster ({filteredRoster.length})
            </button>
            <button
              onClick={() => setActiveTab('FEED')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'FEED'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-cyan-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              ⚡ Live Sign-In Feed ({(data.recentLogins || []).length})
            </button>
          </div>

          {/* Status filter */}
          <button
            onClick={() => setStatusFilter(statusFilter === 'LOGGED_TODAY' ? 'ALL' : 'LOGGED_TODAY')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
              statusFilter === 'LOGGED_TODAY'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100'
            }`}
          >
            ● Logged In Today
          </button>

          <button
            onClick={() => setStatusFilter(statusFilter === 'ABSENT' ? 'ALL' : 'ABSENT')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
              statusFilter === 'ABSENT'
                ? 'bg-slate-700 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
            }`}
          >
            ○ Absent Today
          </button>

          {/* Refresh button */}
          <button
            onClick={fetchLoginData}
            title="Refresh login records"
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Content Area based on Sub-Tab */}
      {activeTab === 'ROSTER' ? (
        /* ================= SUB-TAB 1: PERSONNEL LOGIN ROSTER ================= */
        loading && (data.roster || []).length === 0 ? (
          <div className="p-16 text-center text-slate-400 dark:text-slate-500 font-mono text-xs flex flex-col items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mb-3" />
            <span>Retrieving real-time user login times & timestamps...</span>
          </div>
        ) : filteredRoster.length === 0 ? (
          <div className="p-12 text-center rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-400 font-mono text-xs">
            No personnel found matching the query.
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4">Personnel</th>
                    <th className="py-3 px-4">Role & Department</th>
                    <th className="py-3 px-4">Today's Login Time</th>
                    <th className="py-3 px-4">Last Activity / Logout</th>
                    <th className="py-3 px-4">Daily Attendance</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                  {filteredRoster.map((u) => {
                    const isAdm = u.role === 'ADMIN';
                    const isAud = u.role === 'AUDITOR';

                    return (
                      <tr
                        key={u.id || u.employeeId}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        {/* User Identity Column */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs text-white shadow-xs shrink-0 relative ${
                                isAdm
                                  ? 'bg-gradient-to-br from-amber-500 to-orange-600'
                                  : isAud
                                  ? 'bg-gradient-to-br from-purple-600 to-indigo-600'
                                  : 'bg-gradient-to-br from-emerald-600 to-teal-600'
                              }`}
                            >
                              {u.name?.charAt(0).toUpperCase()}
                              <span
                                className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${
                                  u.isPresent
                                    ? 'bg-emerald-500 ring-2 ring-emerald-400/50'
                                    : 'bg-slate-400'
                                }`}
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 dark:text-white truncate">
                                {u.name}
                              </div>
                              <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                <span className="font-semibold text-indigo-600 dark:text-cyan-400">
                                  {u.employeeId}
                                </span>
                                <span>•</span>
                                <span className="truncate">{u.designation}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Role & Department */}
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-1 items-start">
                            <span
                              className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                                isAdm
                                  ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                                  : isAud
                                  ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                              }`}
                            >
                              {isAdm ? 'Admin' : isAud ? 'Auditor' : 'Supervisor'}
                            </span>
                            <span className="text-[11px] text-slate-600 dark:text-slate-300 font-medium truncate flex items-center gap-1">
                              <Building2 className="w-3 h-3 text-slate-400" />
                              {u.department}
                            </span>
                          </div>
                        </td>

                        {/* Today's Login Time */}
                        <td className="py-3 px-4">
                          {u.loginTimestamp || (u.isPresent && u.lastLoginAt) ? (
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5 font-mono font-bold text-emerald-700 dark:text-emerald-400 text-xs">
                                <Clock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                <span>{formatTimeOnly(u.loginTimestamp || u.lastLoginAt)}</span>
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono mt-0.5">
                                {formatDateTime(u.loginTimestamp || u.lastLoginAt)}
                              </span>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-400">
                              <span>— Not logged in today</span>
                            </span>
                          )}
                        </td>

                        {/* Last Activity / Logout Time */}
                        <td className="py-3 px-4">
                          {u.isPresent ? (
                            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                              <span>Active Session</span>
                            </div>
                          ) : u.lastLogoutAt ? (
                            <div className="flex flex-col">
                              <span className="text-slate-600 dark:text-slate-300 font-mono text-xs">
                                {formatDateTime(u.lastLogoutAt)}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                Logged out ({formatRelativeTime(u.lastLogoutAt)})
                              </span>
                            </div>
                          ) : u.lastLoginAt ? (
                            <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                              Last login: {formatDateTime(u.lastLoginAt)}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">— No prior activity</span>
                          )}
                        </td>

                        {/* Attendance Status */}
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                              u.isPresent
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                                : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                            }`}
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${
                                u.isPresent ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                              }`}
                            />
                            <span>{u.isPresent ? 'Present' : 'Absent'}</span>
                          </span>
                        </td>

                        {/* Action Column */}
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => setSelectedUserForHistory(u)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-cyan-300 font-bold text-[11px] transition-all cursor-pointer whitespace-nowrap shadow-xs"
                          >
                            <History className="w-3.5 h-3.5" />
                            <span>Login History</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        /* ================= SUB-TAB 2: LIVE SIGN-IN EVENT FEED ================= */
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-500" />
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Chronological Sign-In & Authentication Trail
              </h3>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              {(data.recentLogins || []).length} events tracked
            </span>
          </div>

          {(data.recentLogins || []).length === 0 ? (
            <div className="p-12 text-center text-slate-400 font-mono text-xs">
              No login events recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {(data.recentLogins || []).map((l, idx) => {
                const isLogout = l.action === 'AUTH_LOGOUT';
                const isFailed = l.action === 'AUTH_LOGIN_FAILED' || l.severity === 'WARNING';

                return (
                  <div
                    key={l.id || idx}
                    className="p-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-white ${
                          isLogout
                            ? 'bg-slate-600'
                            : isFailed
                            ? 'bg-amber-500'
                            : 'bg-emerald-600'
                        }`}
                      >
                        {isLogout ? (
                          <LogOut className="w-4 h-4" />
                        ) : isFailed ? (
                          <AlertCircle className="w-4 h-4" />
                        ) : (
                          <LogIn className="w-4 h-4" />
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {l.user_name}
                          </span>
                          <span className="text-indigo-600 dark:text-cyan-400 font-mono text-[11px] font-semibold">
                            ({l.user_id})
                          </span>
                          <span
                            className={`text-[9px] font-extrabold uppercase px-2 py-0.2 rounded-full border ${
                              l.user_role === 'ADMIN'
                                ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                                : l.user_role === 'AUDITOR'
                                ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                            }`}
                          >
                            {l.user_role}
                          </span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-300 mt-1 text-[11px]">
                          {l.details || l.action_label}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-right shrink-0">
                      <div className="flex flex-col sm:items-end">
                        <span className="font-mono font-bold text-slate-700 dark:text-slate-200 text-[11px]">
                          {formatDateTime(l.created_at)}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {formatRelativeTime(l.created_at)} • IP: {l.ip_address || '127.0.0.1'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================= USER SPECIFIC LOGIN HISTORY MODAL ================= */}
      {selectedUserForHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-indigo-500/10 to-transparent shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Login History: {selectedUserForHistory.name}
                  </h3>
                  <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    <span className="font-bold text-indigo-600 dark:text-cyan-400">
                      {selectedUserForHistory.employeeId}
                    </span>
                    <span>•</span>
                    <span>{selectedUserForHistory.department}</span>
                    <span>•</span>
                    <span>{selectedUserForHistory.designation}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedUserForHistory(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
              {/* Status Header Box */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
                    Current Attendance
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        selectedUserForHistory.isPresent
                          ? 'bg-emerald-500 animate-pulse'
                          : 'bg-slate-400'
                      }`}
                    />
                    <strong className="text-xs font-bold text-slate-900 dark:text-white">
                      {selectedUserForHistory.isPresent ? 'Present (Signed In)' : 'Absent Today'}
                    </strong>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
                    Today's First Login
                  </span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                    {formatTimeOnly(
                      selectedUserForHistory.loginTimestamp || selectedUserForHistory.lastLoginAt
                    )}
                  </span>
                </div>
              </div>

              {/* Event Timeline */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Recorded Authentication Sessions</span>
                </h4>

                {userHistoryEvents.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 font-mono text-xs rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/20">
                    No individual sign-in events recorded for this user yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {userHistoryEvents.map((ev, idx) => (
                      <div
                        key={ev.id || idx}
                        className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                            <LogIn className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white block">
                              {ev.action_label || 'User Sign In'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              IP: {ev.ip_address || '127.0.0.1'}
                            </span>
                          </div>
                        </div>

                        <div className="text-right font-mono">
                          <span className="text-slate-700 dark:text-slate-200 font-semibold block">
                            {formatDateTime(ev.created_at)}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {formatRelativeTime(ev.created_at)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end shrink-0">
              <button
                onClick={() => setSelectedUserForHistory(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserLoginTrackerPanel;
