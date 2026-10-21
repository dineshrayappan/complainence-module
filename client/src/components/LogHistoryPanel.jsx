import React, { useState, useEffect, useMemo } from 'react';
import {
  History,
  Search,
  Filter,
  Download,
  RefreshCw,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  ShieldCheck,
  User,
  Users,
  Building2,
  KeyRound,
  FileText,
  FileCheck,
  Wrench,
  Trash2,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Lock,
  LogIn,
  LogOut,
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
      second: '2-digit',
      hour12: true,
    });
  } catch (e) {
    return String(dateStr);
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

const CATEGORIES = [
  { id: 'ALL', label: 'All Records', icon: History },
  { id: 'AUTH', label: '🔐 Logins & Auth', icon: LogIn },
  { id: 'NC_DEFECT', label: '⚠️ Defect NCs', icon: AlertTriangle },
  { id: 'USER_MGMT', label: '👥 User Accounts', icon: Users },
  { id: 'DEPARTMENT', label: '🏢 Departments', icon: Building2 },
  { id: 'SECURITY', label: '🛡️ Security', icon: ShieldCheck },
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
  const [timeframeFilter, setTimeframeFilter] = useState('all'); // 'all', 'today', '7days', '30days'

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
        limit: 25,
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

  // Debounced search trigger
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchLogs(1);
  };

  // Export CSV handler
  const handleExportCSV = async () => {
    try {
      setIsExporting(true);
      const res = await auditLogService.exportAuditLogs('csv');
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `garment_qms_past_records_log_${new Date().toISOString().slice(0, 10)}.csv`;
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

  // Helper to choose badge and icon based on category/severity
  const getActionBadge = (log) => {
    const act = log.action || '';
    const sev = log.severity || 'INFO';

    if (act.includes('LOGIN')) {
      return {
        bg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
        icon: LogIn,
      };
    }
    if (act.includes('LOGOUT')) {
      return {
        bg: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
        icon: LogOut,
      };
    }
    if (act.includes('NC_CREATED') || sev === 'WARNING') {
      return {
        bg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
        icon: AlertTriangle,
      };
    }
    if (act.includes('CAP') || act.includes('VERIFIED') || sev === 'SUCCESS') {
      return {
        bg: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-cyan-300 border-indigo-200 dark:border-indigo-800',
        icon: FileCheck,
      };
    }
    if (sev === 'CRITICAL' || act.includes('DELETED')) {
      return {
        bg: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
        icon: Trash2,
      };
    }
    if (act.includes('USER') || act.includes('PERSONNEL')) {
      return {
        bg: 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
        icon: Users,
      };
    }
    return {
      bg: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
      icon: History,
    };
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* KPI Metric Summary Header */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold mb-1">
            <span>Total Recorded Logs</span>
            <History className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            {total}
          </div>
          <span className="text-[10px] text-slate-400 font-mono truncate block">
            System ledger entries
          </span>
        </div>

        <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-500/20 shadow-xs">
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 text-xs font-semibold mb-1">
            <span>Auth & Login Events</span>
            <LogIn className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-300">
            {logs.filter((l) => l.category === 'AUTH').length}
          </div>
          <span className="text-[10px] text-slate-400 font-mono truncate block">
            Current page entries
          </span>
        </div>

        <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-amber-500/20 shadow-xs">
          <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 text-xs font-semibold mb-1">
            <span>Defect Actions</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-700 dark:text-amber-300">
            {logs.filter((l) => l.category === 'NC_DEFECT').length}
          </div>
          <span className="text-[10px] text-slate-400 font-mono truncate block">
            Rectification history
          </span>
        </div>

        <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-purple-500/20 shadow-xs">
          <div className="flex items-center justify-between text-purple-600 dark:text-purple-400 text-xs font-semibold mb-1">
            <span>Admin Actions</span>
            <UserCog className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-purple-700 dark:text-purple-300">
            {logs.filter((l) => l.category === 'USER_MGMT' || l.category === 'SECURITY').length}
          </div>
          <span className="text-[10px] text-slate-400 font-mono truncate block">
            User & role operations
          </span>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Input */}
          <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search past records, NC ID, user name, details..."
              className="w-full pl-10 pr-16 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              className="absolute right-2 top-1.5 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] transition-colors cursor-pointer"
            >
              Search
            </button>
          </form>

          {/* Timeframe & Export Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Timeframe Dropdown / Selector */}
            <select
              value={timeframeFilter}
              onChange={(e) => setTimeframeFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="all">📅 All Time</option>
              <option value="today">Today (24h)</option>
              <option value="7days">Past 7 Days</option>
              <option value="30days">Past 30 Days</option>
            </select>

            {/* Severity Selector */}
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="ALL">⚡ All Severities</option>
              <option value="SUCCESS">● Success Only</option>
              <option value="WARNING">▲ Warnings Only</option>
              <option value="CRITICAL">■ Critical Only</option>
            </select>

            {/* Export CSV button */}
            <button
              onClick={handleExportCSV}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition-colors cursor-pointer"
              title="Download entire log history as CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExporting ? 'Exporting...' : 'Export CSV'}</span>
            </button>

            {/* Refresh */}
            <button
              onClick={() => fetchLogs(page)}
              title="Refresh log records"
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 border-t border-slate-100 dark:border-slate-800/80">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = categoryFilter === cat.id;

            return (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Table: Log Records */}
      {loading && logs.length === 0 ? (
        <div className="p-16 text-center text-slate-400 dark:text-slate-500 font-mono text-xs flex flex-col items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mb-3" />
          <span>Scanning past records and activity ledger...</span>
        </div>
      ) : logs.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-400 font-mono text-xs">
          No log history records found matching the criteria.
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Date & Time (IST)</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Entity / Target</th>
                  <th className="py-3 px-4">Details</th>
                  <th className="py-3 px-4 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                {logs.map((log) => {
                  const badge = getActionBadge(log);
                  const Icon = badge.icon;

                  return (
                    <tr
                      key={log.id || log._id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      {/* Timestamp */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-200 text-xs">
                            {formatDateTime(log.created_at)}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {formatRelativeTime(log.created_at)}
                          </span>
                        </div>
                      </td>

                      {/* Action & Category */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${badge.bg}`}
                          >
                            <Icon className="w-3 h-3 shrink-0" />
                            <span>{log.action_label || log.action}</span>
                          </span>
                        </div>
                      </td>

                      {/* Actor */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold text-[11px] text-slate-700 dark:text-slate-300">
                            {log.user_name?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white block leading-tight">
                              {log.user_name}
                            </span>
                            <div className="flex items-center gap-1 font-mono text-[10px] text-slate-400">
                              <span className="font-semibold text-indigo-600 dark:text-cyan-400">
                                {log.user_id}
                              </span>
                              <span>•</span>
                              <span>{log.user_role}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Entity / Reference */}
                      <td className="py-3 px-4">
                        {log.related_nc_id || log.entity_name || log.entity_id ? (
                          <div className="flex flex-col items-start gap-0.5">
                            {log.related_nc_id && (
                              <span className="font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-1.5 py-0.5 rounded-md border border-amber-200 dark:border-amber-800 text-[10px]">
                                {log.related_nc_id}
                              </span>
                            )}
                            <span className="text-[11px] text-slate-700 dark:text-slate-300 font-medium truncate max-w-[160px]">
                              {log.entity_name || log.entity_id}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono text-[11px]">System</span>
                        )}
                      </td>

                      {/* Details */}
                      <td className="py-3 px-4">
                        <p className="text-slate-600 dark:text-slate-300 text-xs line-clamp-2 max-w-md">
                          {log.details || log.action_label}
                        </p>
                      </td>

                      {/* Inspect Button */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => setInspectLog(log)}
                          className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
                          title="View complete record details and payload"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing Page <strong className="text-slate-900 dark:text-white">{page}</strong> of{' '}
              <strong className="text-slate-900 dark:text-white">{totalPages}</strong> (
              {total} total records)
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchLogs(page - 1)}
                disabled={page <= 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>

              <button
                onClick={() => fetchLogs(page + 1)}
                disabled={page >= totalPages}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold transition-colors cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: RECORD INSPECTION ================= */}
      {inspectLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-indigo-500/10 to-transparent shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Audit Record: {inspectLog.action_label || inspectLog.action}
                  </h3>
                  <span className="text-[11px] font-mono text-slate-400">
                    ID: {inspectLog.id || inspectLog._id}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setInspectLog(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 font-mono text-[11px]">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Timestamp (IST)</span>
                  <strong className="text-slate-800 dark:text-slate-200">
                    {formatDateTime(inspectLog.created_at)}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Actor</span>
                  <strong className="text-slate-800 dark:text-slate-200">
                    {inspectLog.user_name} ({inspectLog.user_id})
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Category</span>
                  <strong className="text-slate-800 dark:text-slate-200">
                    {inspectLog.category}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Severity</span>
                  <strong className="text-slate-800 dark:text-slate-200">
                    {inspectLog.severity || 'INFO'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Target Entity</span>
                  <strong className="text-slate-800 dark:text-slate-200">
                    {inspectLog.entity_name || inspectLog.entity_id || inspectLog.related_nc_id || 'System'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Source IP</span>
                  <strong className="text-slate-800 dark:text-slate-200">
                    {inspectLog.ip_address || '127.0.0.1'}
                  </strong>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-700 dark:text-slate-300 uppercase text-[11px] mb-1">
                  Full Details
                </h4>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 font-sans">
                  {inspectLog.details || 'No detailed note attached.'}
                </div>
              </div>

              {inspectLog.payload && Object.keys(inspectLog.payload).length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-700 dark:text-slate-300 uppercase text-[11px] mb-1">
                    Event Data Payload
                  </h4>
                  <pre className="p-3 rounded-xl bg-slate-900 text-slate-200 font-mono text-[11px] overflow-x-auto">
                    {JSON.stringify(inspectLog.payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end shrink-0">
              <button
                onClick={() => setInspectLog(null)}
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

export default LogHistoryPanel;
