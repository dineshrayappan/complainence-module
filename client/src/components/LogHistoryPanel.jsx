import React, { useState, useEffect } from 'react';
import {
  History,
  Clock,
  Search,
  Download,
  RefreshCw,
  AlertTriangle,
  Users,
  Building2,
  ShieldCheck,
  Trash2,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  LogIn,
  LogOut,
  FileText,
  User,
  Shield,
  Layers,
  ArrowUpDown,
  CheckCircle,
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
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    return `${diffDays}d ago`;
  } catch {
    return '';
  }
};

const CATEGORIES = [
  { id: 'ALL', label: 'All Records', icon: Layers },
  { id: 'DELETIONS', label: 'Deleted Records', icon: Trash2 },
  { id: 'AUTH', label: 'Login & Logout', icon: Clock },
  { id: 'NC_DEFECT', label: 'NC Defects', icon: AlertTriangle },
  { id: 'USER_MGMT', label: 'Users', icon: Users },
  { id: 'DEPARTMENT', label: 'Departments', icon: Building2 },
  { id: 'SECURITY', label: 'Security', icon: ShieldCheck },
];

export const LogHistoryPanel = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [timeframeFilter, setTimeframeFilter] = useState('all');

  // Modal State for inspecting full log details
  const [inspectLog, setInspectLog] = useState(null);
  const [isExporting, setIsExporting] = useState(false);

  const fetchLogs = async (targetPage = page) => {
    try {
      setLoading(true);
      const res = await auditLogService.getAuditLogs({
        search: searchQuery,
        category: categoryFilter,
        severity: severityFilter,
        timeframe: timeframeFilter,
        page: targetPage,
        limit: 20,
      });

      if (res.data?.success) {
        setLogs(res.data.logs || []);
        setTotal(res.data.total || 0);
        setPage(res.data.page || 1);
        setTotalPages(res.data.totalPages || 1);
      }
    } catch (err) {
      console.error('Failed to load past audit records:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1);
  }, [categoryFilter, severityFilter, timeframeFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchLogs(1);
  };

  const handleExportCSV = async () => {
    try {
      setIsExporting(true);
      const res = await auditLogService.exportAuditLogs('csv');
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `factory_audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to export past records. ' + (err.message || ''));
    } finally {
      setIsExporting(false);
    }
  };

  // Helper to render event badge
  const renderActionBadge = (log) => {
    const act = log.action || '';
    const actLabel = log.action_label || act;
    const isDelete =
      act.includes('DELET') ||
      actLabel.toLowerCase().includes('delete') ||
      (log.details && log.details.toLowerCase().includes('deleted by'));
    const isLogout = act === 'AUTH_LOGOUT';
    const isLogin = act.startsWith('AUTH_LOGIN');

    if (isDelete) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60">
          <Trash2 className="w-3 h-3 text-rose-500" />
          <span>Record Deleted</span>
        </span>
      );
    }
    if (isLogout) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
          <LogOut className="w-3 h-3 text-slate-500" />
          <span>User Sign Out</span>
        </span>
      );
    }
    if (isLogin) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60">
          <LogIn className="w-3 h-3 text-emerald-500" />
          <span>User Sign In</span>
        </span>
      );
    }
    if (act.includes('NC_') || log.category === 'NC_DEFECT') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60">
          <AlertTriangle className="w-3 h-3 text-amber-500" />
          <span>{actLabel}</span>
        </span>
      );
    }
    if (act.includes('USER_') || log.category === 'USER_MGMT') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/60">
          <Users className="w-3 h-3 text-indigo-500" />
          <span>{actLabel}</span>
        </span>
      );
    }
    if (act.includes('DEPT_') || log.category === 'DEPARTMENT') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-900/60">
          <Building2 className="w-3 h-3 text-blue-500" />
          <span>{actLabel}</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
        <History className="w-3 h-3 text-slate-400" />
        <span>{actLabel}</span>
      </span>
    );
  };

  const loginCount = logs.filter(
    (l) => l.category === 'AUTH' || (l.action && l.action.startsWith('AUTH_'))
  ).length;

  const deletionCount = logs.filter(
    (l) =>
      (l.action && l.action.includes('DELET')) ||
      (l.action_label && l.action_label.toLowerCase().includes('delete')) ||
      (l.details && l.details.toLowerCase().includes('deleted by'))
  ).length;

  return (
    <div className="space-y-4">
      {/* KPI Metric Cards - Clean & Minimalist */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
            <span className="font-medium">Total Ledger Logs</span>
            <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
              <Layers className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {total}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Recorded historical entries</div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
            <span className="font-medium">Login & Logout Events</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {loginCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">User sign-in / sign-out activity</div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
            <span className="font-medium">Record Deletions</span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <Trash2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {deletionCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Who deleted what audit trail</div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
            <span className="font-medium">System Operations</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <ShieldCheck className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {logs.filter((l) => l.category === 'NC_DEFECT' || l.category === 'USER_MGMT').length}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">NC tickets & user updates</div>
        </div>
      </div>

      {/* Clean Control Bar */}
      <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          {/* Search Box */}
          <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by user, ID, NC ticket, or action details..."
              className="w-full pl-9 pr-16 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  fetchLogs(1);
                }}
                className="absolute right-12 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
              >
                Clear
              </button>
            )}
            <button
              type="submit"
              className="absolute right-1 top-1 px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs transition-colors cursor-pointer"
            >
              Search
            </button>
          </form>

          {/* Timeframe & Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={timeframeFilter}
              onChange={(e) => setTimeframeFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="all">All Time</option>
              <option value="today">Today (24h)</option>
              <option value="7days">Past 7 Days</option>
              <option value="30days">Past 30 Days</option>
            </select>

            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Severities</option>
              <option value="SUCCESS">Success</option>
              <option value="WARNING">Warnings</option>
              <option value="CRITICAL">Critical</option>
            </select>

            <button
              onClick={handleExportCSV}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium text-xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>{isExporting ? 'Exporting...' : 'Export CSV'}</span>
            </button>

            <button
              onClick={() => fetchLogs(page)}
              title="Refresh logs"
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Clean Category Segmented Filter */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pt-2 border-t border-slate-100 dark:border-slate-800">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = categoryFilter === cat.id;

            return (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                  isActive
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{cat.label}</span>
                {cat.id === 'DELETIONS' && deletionCount > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500 text-white">
                    {deletionCount}
                  </span>
                )}
                {cat.id === 'AUTH' && loginCount > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-500 text-white">
                    {loginCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Table: Clean, Modern, Scannable */}
      {loading && logs.length === 0 ? (
        <div className="p-16 text-center text-slate-400 font-mono text-xs flex flex-col items-center justify-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800">
          <div className="w-6 h-6 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin mb-2" />
          <span>Loading audit log records...</span>
        </div>
      ) : logs.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-400 text-xs">
          No records found matching your filters.
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Time (IST)</th>
                  <th className="py-3 px-4">Event</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Target / Entity</th>
                  <th className="py-3 px-4">Summary</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                {logs.map((log) => {
                  const isDelete =
                    (log.action && log.action.includes('DELET')) ||
                    (log.action_label && log.action_label.toLowerCase().includes('delete')) ||
                    (log.details && log.details.toLowerCase().includes('deleted by'));
                  const isLogout = log.action === 'AUTH_LOGOUT';
                  const isLogin = log.action && log.action.startsWith('AUTH_LOGIN');

                  return (
                    <tr
                      key={log.id || log._id}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Timestamp Column */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                            {formatTimeOnly(log.created_at)}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {formatDateOnly(log.created_at)} · {formatRelativeTime(log.created_at)}
                          </span>
                        </div>
                      </td>

                      {/* Event Badge */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {renderActionBadge(log)}
                      </td>

                      {/* Actor (Who performed the action) */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[11px] flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                            {log.user_name?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-medium text-slate-900 dark:text-white block leading-tight">
                              {log.user_name}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              {log.user_id} · {log.user_role}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Target / Entity */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {log.related_nc_id ? (
                          <div className="flex flex-col items-start">
                            <span className="font-mono font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded text-[11px] border border-amber-200 dark:border-amber-900/50">
                              {log.related_nc_id}
                            </span>
                            {log.entity_name && (
                              <span className="text-[11px] text-slate-500 truncate max-w-[150px] mt-0.5">
                                {log.entity_name}
                              </span>
                            )}
                          </div>
                        ) : log.entity_name ? (
                          <span className="text-slate-700 dark:text-slate-300 font-medium text-xs truncate max-w-[160px] block">
                            {log.entity_name}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">System</span>
                        )}
                      </td>

                      {/* Summary / Details */}
                      <td className="py-3 px-4 max-w-sm">
                        {isDelete ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                              Permanently deleted by {log.user_name} ({log.user_id})
                            </span>
                            <span className="text-[11px] text-slate-500 truncate">
                              Target: {log.related_nc_id || log.entity_name || log.entity_id}
                            </span>
                          </div>
                        ) : isLogout ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-slate-700 dark:text-slate-300">
                              User signed out
                            </span>
                            {log.payload?.sessionDuration && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                <Clock className="w-3 h-3 text-slate-500" />
                                <span>Duration: {log.payload.sessionDuration}</span>
                              </span>
                            )}
                          </div>
                        ) : isLogin ? (
                          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                            <span>Signed in successfully</span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              IP: {log.ip_address || '127.0.0.1'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-600 dark:text-slate-300 truncate block">
                            {log.details || log.action_label}
                          </span>
                        )}
                      </td>

                      {/* Inspect Button */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => setInspectLog(log)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium text-xs transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Details</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Clean Pagination Footer */}
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <span>
              Page <strong className="text-slate-900 dark:text-white">{page}</strong> of{' '}
              <strong className="text-slate-900 dark:text-white">{totalPages}</strong> ·{' '}
              {total} total records
            </span>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => fetchLogs(page - 1)}
                disabled={page <= 1}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>

              <button
                onClick={() => fetchLogs(page + 1)}
                disabled={page >= totalPages}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium transition-colors cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= CLEAN AUDIT INSPECTION MODAL ================= */}
      {inspectLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Audit Log Details
                </h3>
              </div>
              <button
                onClick={() => setInspectLog(null)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
              {/* Deletion Summary Card */}
              {((inspectLog.action && inspectLog.action.includes('DELET')) ||
                (inspectLog.action_label && inspectLog.action_label.toLowerCase().includes('delete')) ||
                (inspectLog.details && inspectLog.details.toLowerCase().includes('deleted by'))) && (
                <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-rose-900 dark:text-rose-200">
                  <div className="flex items-center gap-1.5 font-semibold text-rose-700 dark:text-rose-300 mb-2">
                    <Trash2 className="w-4 h-4" />
                    <span>Permanent Deletion Record</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-500 block">Deleted By:</span>
                      <strong className="text-slate-900 dark:text-white">
                        {inspectLog.user_name} ({inspectLog.user_id})
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Actor Role:</span>
                      <strong className="text-slate-900 dark:text-white">
                        {inspectLog.user_role}
                      </strong>
                    </div>
                    <div className="col-span-2">
                      <span className="text-slate-500 block">Target Entity:</span>
                      <strong className="text-rose-700 dark:text-rose-300 font-mono">
                        {inspectLog.related_nc_id || inspectLog.entity_name || inspectLog.entity_id}
                      </strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Session Duration Summary Card */}
              {(inspectLog.category === 'AUTH' || (inspectLog.action && inspectLog.action.startsWith('AUTH_'))) && (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200 mb-2">
                    <Clock className="w-4 h-4 text-indigo-500" />
                    <span>Authentication Timeline</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-500 block">Login Time (IST):</span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {inspectLog.payload?.loginTimestamp
                          ? formatDateTime(inspectLog.payload.loginTimestamp)
                          : inspectLog.payload?.loginTimeIST || formatDateTime(inspectLog.created_at)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Logout Time (IST):</span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {inspectLog.payload?.logoutTimestamp
                          ? formatDateTime(inspectLog.payload.logoutTimestamp)
                          : inspectLog.payload?.logoutTimeIST || (inspectLog.action === 'AUTH_LOGOUT' ? formatDateTime(inspectLog.created_at) : 'Active Session')}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-slate-500 block">Session Duration:</span>
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                        {inspectLog.payload?.sessionDuration || (inspectLog.action === 'AUTH_LOGOUT' ? '—' : 'Active Session')}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* General Metadata */}
              <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-[11px]">
                <div>
                  <span className="text-slate-400 block">Timestamp</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {formatDateTime(inspectLog.created_at)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Actor</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {inspectLog.user_name} ({inspectLog.user_id})
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Category</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {inspectLog.category}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">IP Address</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">
                    {inspectLog.ip_address || '127.0.0.1'}
                  </span>
                </div>
              </div>

              {/* Full Details */}
              <div>
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Details
                </span>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-xs">
                  {inspectLog.details || 'No additional note provided.'}
                </div>
              </div>

              {/* Payload if present */}
              {inspectLog.payload && Object.keys(inspectLog.payload).length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Event Payload
                  </span>
                  <pre className="p-3 rounded-xl bg-slate-950 text-slate-200 font-mono text-[11px] overflow-x-auto max-h-48">
                    {JSON.stringify(inspectLog.payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex justify-end shrink-0">
              <button
                onClick={() => setInspectLog(null)}
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

export default LogHistoryPanel;
