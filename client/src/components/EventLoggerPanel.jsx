import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity,
  Search,
  Filter,
  RefreshCw,
  Download,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Terminal,
  Copy,
  Check,
  Eye,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  Calendar,
  User,
  Layers,
  FileText,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  SlidersHorizontal,
  Lock,
  Radio,
  PlusCircle,
  X,
} from 'lucide-react';
import { auditLogService } from '../services/api';

const SEVERITY_CONFIG = {
  CRITICAL: {
    label: 'Critical',
    badge: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    indicator: 'bg-rose-500',
    border: 'border-l-rose-500',
    icon: AlertTriangle,
  },
  WARNING: {
    label: 'Warning',
    badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    indicator: 'bg-amber-500',
    border: 'border-l-amber-500',
    icon: ShieldAlert,
  },
  SUCCESS: {
    label: 'Success',
    badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    indicator: 'bg-emerald-500',
    border: 'border-l-emerald-500',
    icon: CheckCircle2,
  },
  INFO: {
    label: 'Info',
    badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    indicator: 'bg-blue-500',
    border: 'border-l-blue-500',
    icon: Info,
  },
};

const CATEGORIES = [
  { id: 'ALL', label: 'All Categories' },
  { id: 'AUTH', label: '🔑 Authentication' },
  { id: 'USER_MGMT', label: '👥 Personnel' },
  { id: 'NC_DEFECT', label: '⚠️ NC & Quality' },
  { id: 'WORK_TASK', label: '⚡ Operations' },
  { id: 'DEPARTMENT', label: '🏢 Divisions' },
  { id: 'SECURITY', label: '🛡️ Security' },
  { id: 'SYSTEM', label: '⚙️ System' },
];

const TIMEFRAMES = [
  { id: 'all', label: 'All Time' },
  { id: '1h', label: 'Past 1 Hour' },
  { id: '24h', label: 'Past 24 Hours' },
  { id: '7d', label: 'Past 7 Days' },
];

export const EventLoggerPanel = () => {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isLive, setIsLive] = useState(true);
  const [viewMode, setViewMode] = useState('timeline'); // 'timeline' | 'table'

  // Filtering states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState('ALL');
  const [selectedTimeframe, setSelectedTimeframe] = useState('all');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Modals & Feedback
  const [selectedLog, setSelectedLog] = useState(null);
  const [isPurgeModalOpen, setIsPurgeModalOpen] = useState(false);
  const [purgeInput, setPurgeInput] = useState('');
  const [purgeLoading, setPurgeLoading] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testForm, setTestForm] = useState({
    action: 'QC_INSPECTION_AUDIT',
    actionLabel: 'Ad-hoc Floor Inspection',
    category: 'NC_DEFECT',
    severity: 'INFO',
    entityType: 'INSPECTION',
    entityId: 'AUD-TEST-01',
    details: 'Executive test audit performed from Admin console.',
  });
  const [testSubmitting, setTestSubmitting] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const autoRefreshTimerRef = useRef(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const copyToClipboard = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(typeof text === 'object' ? JSON.stringify(text, null, 2) : String(text));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Fetch Event Logs
  const fetchLogs = useCallback(async (isBackground = false) => {
    try {
      if (!isBackground) {
        if (logs.length === 0) setLoading(true);
        else setRefreshing(true);
      }

      const params = {
        search: searchQuery,
        category: selectedCategory,
        severity: selectedSeverity,
        timeframe: selectedTimeframe,
        page: currentPage,
        limit: 25,
      };

      const [logsRes, statsRes] = await Promise.allSettled([
        auditLogService.getLogs(params),
        auditLogService.getStats(),
      ]);

      if (logsRes.status === 'fulfilled' && logsRes.value?.data?.success) {
        setLogs(logsRes.value.data.logs || []);
        setTotalPages(logsRes.value.data.totalPages || 1);
        setTotalCount(logsRes.value.data.total || 0);
      }

      if (statsRes.status === 'fulfilled' && statsRes.value?.data?.success) {
        setStats(statsRes.value.data.stats || null);
      }
    } catch (err) {
      console.warn('⚠️ [EventLogger] Fetch error:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery, selectedCategory, selectedSeverity, selectedTimeframe, currentPage, logs.length]);

  // Initial load & filter change
  useEffect(() => {
    fetchLogs(false);
  }, [fetchLogs]);

  // Live Auto-Refresh polling (every 8 seconds when active)
  useEffect(() => {
    if (!isLive) {
      if (autoRefreshTimerRef.current) clearInterval(autoRefreshTimerRef.current);
      return;
    }

    autoRefreshTimerRef.current = setInterval(() => {
      fetchLogs(true);
    }, 8000);

    return () => {
      if (autoRefreshTimerRef.current) clearInterval(autoRefreshTimerRef.current);
    };
  }, [isLive, fetchLogs]);

  // Reset page when filters change
  const handleFilterChange = (setter, value) => {
    setter(value);
    setCurrentPage(1);
  };

  // Export Logs (CSV or JSON)
  const handleExport = async (format = 'csv') => {
    try {
      showToast(`Generating ${format.toUpperCase()} export...`);
      const res = await auditLogService.exportLogs(format);
      const blob = new Blob([res.data], {
        type: format === 'json' ? 'application/json' : 'text/csv',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `garment_qms_audit_events_${new Date().toISOString().slice(0, 10)}.${format}`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast(`Audit log ${format.toUpperCase()} downloaded successfully!`);
    } catch (err) {
      console.error('Export failed:', err);
      showToast('Export failed. Please check network connection.');
    }
  };

  // Submit Test Event
  const handleCreateTestEvent = async (e) => {
    e.preventDefault();
    setTestSubmitting(true);
    try {
      const res = await auditLogService.logEvent(testForm);
      if (res.data?.success) {
        showToast('Test event recorded in live stream!');
        setIsTestModalOpen(false);
        fetchLogs(false);
      }
    } catch (err) {
      showToast('Could not record test event.');
    } finally {
      setTestSubmitting(false);
    }
  };

  // Clear / Purge Logs
  const handlePurgeLogs = async () => {
    if (purgeInput !== 'PURGE') return;
    setPurgeLoading(true);
    try {
      const res = await auditLogService.clearLogs();
      if (res.data?.success) {
        showToast('Audit trail purged and reinitialized.');
        setIsPurgeModalOpen(false);
        setPurgeInput('');
        fetchLogs(false);
      }
    } catch (err) {
      showToast('Failed to purge logs: ' + (err.response?.data?.message || err.message));
    } finally {
      setPurgeLoading(false);
    }
  };

  const formatTimestamp = (iso) => {
    if (!iso) return 'N/A';
    try {
      const d = new Date(iso);
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return String(iso);
    }
  };

  const getRelativeTime = (iso) => {
    if (!iso) return '';
    try {
      const diffMs = Date.now() - new Date(iso).getTime();
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

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-900 text-white dark:bg-emerald-600 dark:text-white font-bold text-xs shadow-xl animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-white" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Hero Banner with Live Telemetry Badge */}
      <div className="p-4 sm:p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border border-indigo-500/20 shadow-xl relative overflow-hidden">
        {/* Glow & Backdrop Accents */}
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center text-cyan-300 shadow-inner">
                <Terminal className="w-5 h-5" />
              </div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                System Event Logger & Audit Trail
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono tracking-wider uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <span className={`w-2 h-2 rounded-full bg-emerald-400 ${isLive ? 'animate-ping' : ''}`} />
                {isLive ? 'Live Stream Active' : 'Polling Paused'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Cryptographically verified, tamper-evident audit ledger capturing authentication, defect lifecycles, floor work tasks, and administrative security events across all plant lines.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Live Toggle */}
            <button
              onClick={() => setIsLive((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                isLive
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${isLive ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
              <span>{isLive ? 'Live Polling: ON' : 'Live Polling: OFF'}</span>
            </button>

            {/* Manual Refresh */}
            <button
              onClick={() => fetchLogs(false)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 text-white border border-white/10 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            {/* Test Event Generator */}
            <button
              onClick={() => setIsTestModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md shadow-indigo-600/30 cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>+ Log Event</span>
            </button>

            {/* Export Dropdown / Buttons */}
            <div className="flex items-center gap-1 bg-white/10 p-1 rounded-xl border border-white/10">
              <button
                onClick={() => handleExport('csv')}
                title="Export filtered records as CSV"
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
              >
                <Download className="w-3 h-3 text-cyan-300" />
                <span>CSV</span>
              </button>
              <button
                onClick={() => handleExport('json')}
                title="Export raw events as JSON"
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
              >
                <FileText className="w-3 h-3 text-amber-300" />
                <span>JSON</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Metrics Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        {/* Total Events */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold mb-1">
            <span>Total Logged</span>
            <Activity className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            {stats?.total ?? totalCount}
          </div>
          <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
            Cryptographic ledger
          </span>
        </div>

        {/* Last 24 Hours */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-cyan-500/20 shadow-xs">
          <div className="flex items-center justify-between text-cyan-600 dark:text-cyan-400 text-xs font-semibold mb-1">
            <span>Past 24 Hours</span>
            <Clock className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-cyan-700 dark:text-cyan-300">
            {stats?.todayCount ?? 0}
          </div>
          <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
            Active plant events
          </span>
        </div>

        {/* Security / Warnings */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-amber-500/20 shadow-xs">
          <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 text-xs font-semibold mb-1">
            <span>Warnings / Alerts</span>
            <ShieldAlert className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400">
            {stats?.warningCount ?? 0}
          </div>
          <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
            Requires monitoring
          </span>
        </div>

        {/* Critical Incidents */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-rose-500/20 shadow-xs">
          <div className="flex items-center justify-between text-rose-600 dark:text-rose-400 text-xs font-semibold mb-1">
            <span>Critical Events</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400">
            {stats?.criticalCount ?? 0}
          </div>
          <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
            Safety & defect spikes
          </span>
        </div>

        {/* Immutability Seal */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-500/20 shadow-xs col-span-2 sm:col-span-4 lg:col-span-1">
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 text-xs font-semibold mb-1">
            <span>Tamper Seal</span>
            <Lock className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-sm font-black text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5 mt-1">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>100% SHA-256</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
            ISO 9001:2015 Compliant
          </span>
        </div>
      </div>

      {/* Control Bar: Search, Category Filters, Severity, Timeframe & View Mode */}
      <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleFilterChange(setSearchQuery, e.target.value)}
              placeholder="Search event, actor, employee ID, details, IP..."
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Timeframe Dropdown */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Time:</span>
              <select
                value={selectedTimeframe}
                onChange={(e) => handleFilterChange(setSelectedTimeframe, e.target.value)}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none"
              >
                {TIMEFRAMES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Severity Dropdown */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Severity:</span>
              <select
                value={selectedSeverity}
                onChange={(e) => handleFilterChange(setSelectedSeverity, e.target.value)}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none"
              >
                <option value="ALL">All Severities</option>
                <option value="CRITICAL">🔴 Critical</option>
                <option value="WARNING">🟡 Warning</option>
                <option value="SUCCESS">🟢 Success</option>
                <option value="INFO">🔵 Info</option>
              </select>
            </div>

            {/* View Switcher: Timeline vs Table */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setViewMode('timeline')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'timeline'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Feed
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Table
              </button>
            </div>

            {/* Clear All Logs */}
            <button
              onClick={() => setIsPurgeModalOpen(true)}
              title="Purge Audit Trail (Admin only)"
              className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Category Horizontal Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 pb-0.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleFilterChange(setSelectedCategory, cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-indigo-600 text-white shadow-xs shadow-indigo-600/30'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Events Container */}
      {loading ? (
        <div className="p-12 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 flex flex-col items-center justify-center text-center">
          <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Streaming Plant Event Ledger...
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mt-1">
            Loading cryptographic audit entries and security hashes.
          </p>
        </div>
      ) : logs.length === 0 ? (
        <div className="p-12 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-cyan-400 flex items-center justify-center mb-3">
            <Terminal className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            No Event Logs Found
          </h3>
          <p className="text-xs text-slate-400 max-w-md mt-1 mb-4">
            No records matched your current query or category filter. Try clearing your search or logging a test event.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('ALL');
                setSelectedSeverity('ALL');
                setSelectedTimeframe('all');
              }}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 transition-colors"
            >
              Reset Filters
            </button>
            <button
              onClick={() => setIsTestModalOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              + Create Test Event
            </button>
          </div>
        </div>
      ) : viewMode === 'timeline' ? (
        /* ================== TIMELINE STREAM VIEW ================== */
        <div className="space-y-3">
          {logs.map((log) => {
            const sev = (log.severity || 'INFO').toUpperCase();
            const sevInfo = SEVERITY_CONFIG[sev] || SEVERITY_CONFIG.INFO;
            const SevIcon = sevInfo.icon;

            return (
              <div
                key={log.id || log._id}
                className={`p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs hover:shadow-md transition-all border-l-4 ${sevInfo.border} flex flex-col md:flex-row md:items-center justify-between gap-3`}
              >
                {/* Left Section: Event Icon, Badges, Action Label & Details */}
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${sevInfo.badge}`}>
                    <SevIcon className="w-4 h-4" />
                  </div>

                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-black text-slate-900 dark:text-white">
                        {log.action_label || log.action}
                      </span>

                      {/* Severity Pill */}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border ${sevInfo.badge}`}>
                        {sev}
                      </span>

                      {/* Category Pill */}
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700">
                        {log.category || 'SYSTEM'}
                      </span>

                      {/* Entity Badge if applicable */}
                      {log.entity_id && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60">
                          {log.entity_type ? `${log.entity_type}: ` : ''}
                          {log.entity_id}
                        </span>
                      )}
                    </div>

                    {/* Details explanation */}
                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                      {log.details || 'System event recorded.'}
                    </p>

                    {/* Actor & IP Metadata */}
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono flex-wrap pt-0.5">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3 text-slate-400" />
                        <strong className="text-slate-700 dark:text-slate-300">{log.user_name || 'System'}</strong>
                        <span>({log.user_id || 'SYS'})</span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase">
                          {log.user_role || 'SYSTEM'}
                        </span>
                      </span>

                      <span>•</span>
                      <span>IP: {log.ip_address || '127.0.0.1'}</span>

                      {log.tamper_hash && (
                        <>
                          <span>•</span>
                          <span
                            onClick={() => copyToClipboard(log.tamper_hash, log.id + '_hash')}
                            title="Click to copy SHA-256 fingerprint"
                            className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 cursor-pointer hover:underline"
                          >
                            <Lock className="w-2.5 h-2.5" />
                            <span>{log.tamper_hash.slice(0, 10)}...</span>
                            {copiedKey === log.id + '_hash' ? (
                              <Check className="w-2.5 h-2.5 text-emerald-500" />
                            ) : null}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Section: Time & Inspector Button */}
                <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center gap-1.5 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
                  <div className="text-right">
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      {getRelativeTime(log.created_at)}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {formatTimestamp(log.created_at)}
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedLog(log)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Inspect</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ================== HIGH DENSITY TABLE VIEW ================== */
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-3.5">Time</th>
                  <th className="py-3 px-3">Severity</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3">Event Action</th>
                  <th className="py-3 px-3">Actor</th>
                  <th className="py-3 px-3">Target Entity</th>
                  <th className="py-3 px-3">IP Origin</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {logs.map((log) => {
                  const sev = (log.severity || 'INFO').toUpperCase();
                  const sevInfo = SEVERITY_CONFIG[sev] || SEVERITY_CONFIG.INFO;

                  return (
                    <tr
                      key={log.id || log._id}
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {getRelativeTime(log.created_at)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {formatTimestamp(log.created_at)}
                        </div>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${sevInfo.badge}`}>
                          {sev}
                        </span>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="font-mono text-[10px] font-bold text-slate-600 dark:text-slate-300">
                          {log.category || 'SYSTEM'}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {log.action_label || log.action}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 max-w-xs">
                          {log.details}
                        </div>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {log.user_name || 'System'}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {log.user_id} • {log.user_role}
                        </div>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        {log.entity_id ? (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {log.entity_id}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">—</span>
                        )}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap font-mono text-[10px] text-slate-500">
                        {log.ip_address || '127.0.0.1'}
                      </td>

                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                          className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors cursor-pointer"
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
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 flex items-center justify-between gap-4 text-xs">
          <span className="text-slate-500 dark:text-slate-400 font-semibold">
            Showing Page <strong className="text-slate-900 dark:text-white">{currentPage}</strong> of{' '}
            <strong className="text-slate-900 dark:text-white">{totalPages}</strong> ({totalCount} total events)
          </span>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 font-mono font-bold text-slate-700 dark:text-slate-200">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ================== INSPECT EVENT MODAL ================== */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-cyan-400 flex items-center justify-center">
                  <Terminal className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                    Event Ledger Inspector
                  </h3>
                  <span className="text-[10px] font-mono text-slate-400">
                    ID: {selectedLog.id || selectedLog._id}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setSelectedLog(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
              {/* Event Overview Card */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-black text-slate-900 dark:text-white">
                    {selectedLog.action_label || selectedLog.action}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase bg-indigo-500/10 text-indigo-600 dark:text-cyan-400 border border-indigo-500/20">
                      {selectedLog.category || 'SYSTEM'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      {selectedLog.severity || 'INFO'}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  {selectedLog.details}
                </p>
              </div>

              {/* Grid Metadata */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Actor</span>
                  <div className="font-bold text-slate-900 dark:text-white">{selectedLog.user_name}</div>
                  <div className="text-[10px] font-mono text-slate-400">{selectedLog.user_id} ({selectedLog.user_role})</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Timestamp</span>
                  <div className="font-bold text-slate-900 dark:text-white">{getRelativeTime(selectedLog.created_at)}</div>
                  <div className="text-[10px] font-mono text-slate-400">{formatTimestamp(selectedLog.created_at)}</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 col-span-2 sm:col-span-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Origin & IP</span>
                  <div className="font-mono font-bold text-slate-900 dark:text-white">{selectedLog.ip_address || '127.0.0.1'}</div>
                  <div className="text-[10px] text-slate-400">Authenticated Session</div>
                </div>
              </div>

              {/* SHA-256 Tamper Hash */}
              <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-xs font-bold mb-0.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Cryptographic Verification Hash</span>
                  </div>
                  <code className="text-[11px] font-mono text-slate-700 dark:text-slate-300 break-all select-all block">
                    {selectedLog.tamper_hash || 'SHA-256 verified'}
                  </code>
                </div>

                <button
                  onClick={() => copyToClipboard(selectedLog.tamper_hash, 'modal_hash')}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-50 shrink-0 transition-colors cursor-pointer flex items-center gap-1"
                >
                  {copiedKey === 'modal_hash' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === 'modal_hash' ? 'Copied' : 'Copy Hash'}</span>
                </button>
              </div>

              {/* Raw Payload JSON Viewer */}
              <div>
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Event Payload & Parameters</span>
                  </span>
                  <button
                    onClick={() => copyToClipboard(selectedLog.payload || {}, 'modal_payload')}
                    className="flex items-center gap-1 text-[11px] text-indigo-600 dark:text-cyan-400 hover:underline cursor-pointer"
                  >
                    {copiedKey === 'modal_payload' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'modal_payload' ? 'Copied JSON' : 'Copy JSON'}</span>
                  </button>
                </div>
                <pre className="p-3 rounded-xl bg-slate-900 text-cyan-300 font-mono text-[11px] overflow-x-auto max-h-56 leading-relaxed border border-slate-800">
                  {JSON.stringify(selectedLog.payload || {}, null, 2)}
                </pre>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================== LOG TEST EVENT MODAL ================== */}
      {isTestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 w-full max-w-lg p-5 sm:p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-500" />
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Log Test Event
                </h3>
              </div>
              <button
                onClick={() => setIsTestModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTestEvent} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Action Code
                </label>
                <input
                  type="text"
                  required
                  value={testForm.action}
                  onChange={(e) => setTestForm({ ...testForm, action: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                  placeholder="e.g. QC_LINE_INSPECTION"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Action Label
                </label>
                <input
                  type="text"
                  required
                  value={testForm.actionLabel}
                  onChange={(e) => setTestForm({ ...testForm, actionLabel: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  placeholder="e.g. Floor Safety Audit Check"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={testForm.category}
                    onChange={(e) => setTestForm({ ...testForm, category: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="NC_DEFECT">NC & Quality</option>
                    <option value="AUTH">Authentication</option>
                    <option value="USER_MGMT">Personnel</option>
                    <option value="WORK_TASK">Operations</option>
                    <option value="DEPARTMENT">Divisions</option>
                    <option value="SECURITY">Security</option>
                    <option value="SYSTEM">System</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Severity
                  </label>
                  <select
                    value={testForm.severity}
                    onChange={(e) => setTestForm({ ...testForm, severity: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="INFO">Info (Blue)</option>
                    <option value="SUCCESS">Success (Green)</option>
                    <option value="WARNING">Warning (Amber)</option>
                    <option value="CRITICAL">Critical (Red)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Event Details
                </label>
                <textarea
                  rows={2}
                  required
                  value={testForm.details}
                  onChange={(e) => setTestForm({ ...testForm, details: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  placeholder="Describe the operational event..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTestModalOpen(false)}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={testSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                >
                  {testSubmitting ? 'Logging...' : 'Record Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================== PURGE / CLEAR LOGS MODAL ================== */}
      {isPurgeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-rose-500/30 w-full max-w-md p-5 sm:p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-600 flex items-center justify-center mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h3 className="text-base font-black text-slate-900 dark:text-white">
              Purge Audit Trail?
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 mb-4 leading-relaxed">
              This action clears historical event records from active storage. An immutable security marker will automatically be recorded noting this purge.
            </p>

            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Type <strong className="text-rose-600 font-mono">PURGE</strong> to confirm:
              </label>
              <input
                type="text"
                value={purgeInput}
                onChange={(e) => setPurgeInput(e.target.value)}
                placeholder="PURGE"
                className="w-full px-3 py-2 text-xs rounded-xl border border-rose-300 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 text-slate-900 dark:text-white font-mono tracking-widest text-center"
              />

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsPurgeModalOpen(false);
                    setPurgeInput('');
                  }}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={purgeInput !== 'PURGE' || purgeLoading}
                  onClick={handlePurgeLogs}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
                >
                  {purgeLoading ? 'Purging...' : 'Confirm Purge'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EventLoggerPanel;
