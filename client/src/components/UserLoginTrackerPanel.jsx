import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  Search,
  Filter,
  RefreshCw,
  Users,
  LogIn,
  LogOut,
  Calendar,
  AlertCircle,
  Building2,
  CheckCircle2,
  XCircle,
  History,
  Shield,
  Layers,
  ChevronRight,
  X,
  User,
} from 'lucide-react';
import { auditLogService } from '../services/api';

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
      hour12: true,
    });
  } catch {
    return '—';
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
  } catch {
    return '—';
  }
};

const formatDateOnly = (dateStr) => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
};

const formatRelativeTime = (dateStr) => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const diffMs = Date.now() - d.getTime();
    if (diffMs < 0) return 'Just now';
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    return `${diffDays}d ago`;
  } catch {
    return '';
  }
};

export const UserLoginTrackerPanel = ({ initialFilterUserId = null }) => {
  const [data, setData] = useState({
    roster: [],
    recentLogins: [],
    stats: {},
  });
  const [loading, setLoading] = useState(true);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL', 'PRESENT', 'ABSENT'
  const [activeTab, setActiveTab] = useState('ROSTER'); // 'ROSTER' | 'SESSIONS' | 'FEED'

  // User History Modal
  const [selectedUserForHistory, setSelectedUserForHistory] = useState(null);

  const fetchLoginData = async () => {
    try {
      setLoading(true);
      const res = await auditLogService.getUserLoginTimes({
        timeframe: 'all',
        limit: 100,
      });

      if (res.data?.success) {
        setData({
          roster: res.data.roster || [],
          recentLogins: res.data.recentLogins || [],
          stats: res.data.stats || {},
        });
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

  useEffect(() => {
    if (initialFilterUserId) {
      setSearchQuery(initialFilterUserId);
    }
  }, [initialFilterUserId]);

  // Filtered Roster
  const filteredRoster = useMemo(() => {
    return (data.roster || []).filter((u) => {
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      if (statusFilter === 'PRESENT' && !u.isPresent) return false;
      if (statusFilter === 'ABSENT' && u.isPresent) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
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
  const totalUsers = stats.totalUsers || (data.roster || []).length;
  const activeNowCount = stats.activeNowCount || 0;
  const loggedTodayCount = stats.loggedTodayCount || 0;
  const absentCount = stats.absentCount || Math.max(0, totalUsers - loggedTodayCount);

  return (
    <div className="space-y-4">
      {/* Clean KPI Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
            <span className="font-medium">Signed In Today</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <LogIn className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {loggedTodayCount}
            <span className="text-xs font-normal text-slate-400 ml-1">/ {totalUsers}</span>
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
            {totalUsers > 0 ? Math.round((loggedTodayCount / totalUsers) * 100) : 0}% workforce active
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
            <span className="font-medium">Active Personnel</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Users className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {activeNowCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Currently active on shift</div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
            <span className="font-medium">Absent / Pending</span>
            <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {absentCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Not yet signed in today</div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
            <span className="font-medium">Recorded Sessions</span>
            <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-950/40 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <History className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {(data.recentLogins || []).length}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Total audit sessions tracked</div>
        </div>
      </div>

      {/* Clean Control Bar */}
      <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, employee ID, department..."
            className="w-full pl-9 pr-12 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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

        {/* View Switcher & Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Sub-view Segmented Tabs */}
          <div className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setActiveTab('ROSTER')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'ROSTER'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Personnel Roster ({filteredRoster.length})
            </button>
            <button
              onClick={() => setActiveTab('SESSIONS')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'SESSIONS'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Login & Logout Sessions
            </button>
            <button
              onClick={() => setActiveTab('FEED')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'FEED'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Activity Feed
            </button>
          </div>

          {/* Quick Status Filter Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="PRESENT">Present Today</option>
            <option value="ABSENT">Absent Today</option>
          </select>

          {/* Refresh */}
          <button
            onClick={fetchLoginData}
            title="Refresh login tracker"
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ================= TAB 1: PERSONNEL ROSTER ================= */}
      {activeTab === 'ROSTER' && (
        loading && (data.roster || []).length === 0 ? (
          <div className="p-16 text-center text-slate-400 font-mono text-xs flex flex-col items-center justify-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800">
            <div className="w-6 h-6 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin mb-2" />
            <span>Loading personnel login roster...</span>
          </div>
        ) : filteredRoster.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-400 text-xs">
            No personnel found matching the query.
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4">Personnel</th>
                    <th className="py-3 px-4">Role & Department</th>
                    <th className="py-3 px-4">Login Time (IST)</th>
                    <th className="py-3 px-4">Logout / Session</th>
                    <th className="py-3 px-4">Attendance</th>
                    <th className="py-3 px-4 text-right">History</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                  {filteredRoster.map((u) => {
                    const roleLabel =
                      u.role === 'ADMIN'
                        ? 'Admin'
                        : u.role === 'AUDITOR'
                        ? 'Auditor'
                        : 'Supervisor';

                    return (
                      <tr
                        key={u.id || u.employeeId}
                        className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        {/* User Identity Column */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700 relative">
                              {u.name?.charAt(0).toUpperCase()}
                              <span
                                className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white dark:border-slate-900 ${
                                  u.isPresent ? 'bg-emerald-500' : 'bg-slate-400'
                                }`}
                              />
                            </div>
                            <div>
                              <span className="font-medium text-slate-900 dark:text-white block leading-tight">
                                {u.name}
                              </span>
                              <span className="text-[11px] text-slate-400 font-mono">
                                {u.employeeId} · {u.designation}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Role & Department */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              {roleLabel}
                            </span>
                            <span className="text-slate-500 text-xs">
                              {u.department}
                            </span>
                          </div>
                        </td>

                        {/* Login Time */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {u.loginTimestamp || (u.isPresent && u.lastLoginAt) ? (
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                                {formatTimeOnly(u.loginTimestamp || u.lastLoginAt)}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                {formatDateOnly(u.loginTimestamp || u.lastLoginAt)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>

                        {/* Logout / Session Duration */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {u.isPresent ? (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span>Active Now</span>
                              </span>
                              {u.sessionDuration && (
                                <span className="text-[11px] text-slate-500 font-mono">
                                  ({u.sessionDuration})
                                </span>
                              )}
                            </div>
                          ) : u.lastLogoutAt ? (
                            <div className="flex flex-col">
                              <span className="font-medium text-slate-700 dark:text-slate-300 text-xs">
                                Out: {formatTimeOnly(u.lastLogoutAt)}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                {u.sessionDuration ? `Duration: ${u.sessionDuration}` : formatDateOnly(u.lastLogoutAt)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>

                        {/* Attendance Status */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              u.isPresent
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                u.isPresent ? 'bg-emerald-500' : 'bg-slate-400'
                              }`}
                            />
                            <span>{u.isPresent ? 'Present' : 'Absent'}</span>
                          </span>
                        </td>

                        {/* Action Column */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            onClick={() => setSelectedUserForHistory(u)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium text-xs transition-colors cursor-pointer"
                          >
                            <History className="w-3.5 h-3.5" />
                            <span>History</span>
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
      )}

      {/* ================= TAB 2: LOGIN & LOGOUT SESSIONS ================= */}
      {activeTab === 'SESSIONS' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              User Login & Logout Sessions
            </span>
            <span className="text-slate-400 font-mono text-[11px]">
              {(data.recentLogins || []).length} recorded sessions
            </span>
          </div>

          {(data.recentLogins || []).length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              No session events recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4">Event</th>
                    <th className="py-3 px-4">Personnel</th>
                    <th className="py-3 px-4">Time (IST)</th>
                    <th className="py-3 px-4">Session Duration</th>
                    <th className="py-3 px-4">Terminal / IP</th>
                    <th className="py-3 px-4">Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                  {(data.recentLogins || []).map((l, idx) => {
                    const isLogout = l.action === 'AUTH_LOGOUT';

                    return (
                      <tr key={l.id || idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap">
                          {isLogout ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              <LogOut className="w-3 h-3 text-slate-500" />
                              <span>User Sign Out</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60">
                              <LogIn className="w-3 h-3 text-emerald-500" />
                              <span>User Sign In</span>
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="font-medium text-slate-900 dark:text-white block leading-tight">
                            {l.user_name}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {l.user_id} · {l.user_role}
                          </span>
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                              {formatTimeOnly(l.created_at)}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {formatDateOnly(l.created_at)} · {formatRelativeTime(l.created_at)}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          {l.payload?.sessionDuration ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              <Clock className="w-3 h-3 text-slate-500" />
                              <span>{l.payload.sessionDuration}</span>
                            </span>
                          ) : isLogout ? (
                            <span className="text-slate-400 text-xs">—</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              <span>Active</span>
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-500">
                          {l.ip_address || '127.0.0.1'}
                        </td>

                        <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300 max-w-xs truncate">
                          {l.details || l.action_label}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 3: ACTIVITY FEED ================= */}
      {activeTab === 'FEED' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Chronological Authentication Activity
            </span>
            <span className="text-slate-400 font-mono text-[11px]">
              {(data.recentLogins || []).length} events
            </span>
          </div>

          {(data.recentLogins || []).length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              No activity events recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {(data.recentLogins || []).map((l, idx) => {
                const isLogout = l.action === 'AUTH_LOGOUT';

                return (
                  <div
                    key={l.id || idx}
                    className="p-3.5 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                        {isLogout ? <LogOut className="w-3.5 h-3.5 text-slate-500" /> : <LogIn className="w-3.5 h-3.5 text-emerald-500" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900 dark:text-white">
                            {l.user_name}
                          </span>
                          <span className="text-slate-400 font-mono text-[11px]">
                            ({l.user_id})
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {l.user_role}
                          </span>
                        </div>
                        <p className="text-slate-500 text-[11px] mt-0.5">
                          {l.details || l.action_label}
                        </p>
                      </div>
                    </div>

                    <div className="text-right whitespace-nowrap shrink-0">
                      <div className="font-medium text-slate-700 dark:text-slate-300 text-xs">
                        {formatTimeOnly(l.created_at)}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {formatDateOnly(l.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================= USER HISTORY MODAL ================= */}
      {selectedUserForHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center justify-center border border-slate-200 dark:border-slate-700">
                  {selectedUserForHistory.name?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {selectedUserForHistory.name}
                  </h3>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {selectedUserForHistory.employeeId} · {selectedUserForHistory.designation} · {selectedUserForHistory.department}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedUserForHistory(null)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-[11px]">
                <div>
                  <span className="text-slate-400 block">Attendance Status</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {selectedUserForHistory.isPresent ? 'Present' : 'Absent'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Today's Login</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {formatDateTime(selectedUserForHistory.loginTimestamp || selectedUserForHistory.lastLoginAt)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Last Logout</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {formatDateTime(selectedUserForHistory.lastLogoutAt)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Active Duration</span>
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                    {selectedUserForHistory.sessionDuration || '—'}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-2">
                  Session History
                </span>
                {userHistoryEvents.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 rounded-xl bg-slate-50 dark:bg-slate-800/30 text-xs">
                    No individual session events found for this user in recent logs.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {userHistoryEvents.map((l, i) => (
                      <div
                        key={l.id || i}
                        className="p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          {l.action === 'AUTH_LOGOUT' ? (
                            <LogOut className="w-3.5 h-3.5 text-slate-500" />
                          ) : (
                            <LogIn className="w-3.5 h-3.5 text-emerald-500" />
                          )}
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {l.action_label || (l.action === 'AUTH_LOGOUT' ? 'Sign Out' : 'Sign In')}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[11px] font-mono text-slate-500 block">
                            {formatDateTime(l.created_at)}
                          </span>
                          {l.payload?.sessionDuration && (
                            <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono">
                              Duration: {l.payload.sessionDuration}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex justify-end shrink-0">
              <button
                onClick={() => setSelectedUserForHistory(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium text-xs transition-colors cursor-pointer"
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
