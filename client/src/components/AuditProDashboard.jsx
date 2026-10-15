import React, { useState, useEffect, useMemo } from 'react';
import {
  ClipboardList,
  CheckCircle2,
  Calendar,
  Clock,
  AlertTriangle,
  Flame,
  CheckCheck,
  Hourglass,
  Layers,
  Search,
  Bell,
  ChevronDown,
  ArrowRight,
  ChevronRight,
  TrendingUp,
  Building2,
  AlertOctagon,
  Zap,
  Lightbulb,
  ShieldAlert,
  ShieldCheck,
  PlusCircle,
  ExternalLink,
  User,
  X,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  FileCheck,
  AlertCircle,
  Activity,
} from 'lucide-react';
import { complaintService, taskService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { DepartmentWorkOperations } from './DepartmentWorkOperations';

export const AuditProDashboard = ({
  onNavigateSection,
  onDrilldownDepartment,
  onOpenNewComplaint,
  onViewComplaint,
}) => {
  const { user, isAdmin, isAuditor } = useAuth();

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [complaints, setComplaints] = useState([]);

  // Dashboard View Tab: 'compliance' | 'operations'
  const [dashboardViewTab, setDashboardViewTab] = useState('compliance');
  const [liveOpsSummary, setLiveOpsSummary] = useState(null);

  useEffect(() => {
    taskService
      .getLiveFloorStatus()
      .then((res) => {
        if (res?.data?.summary) setLiveOpsSummary(res.data.summary);
      })
      .catch(() => {});
  }, []);

  // Filter & Search states
  const [dateRangePreset, setDateRangePreset] = useState('ALL'); // 'ALL', 'THIS_MONTH', '30D', '7D'
  const [isDateMenuOpen, setIsDateMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInspectionItem, setSelectedInspectionItem] = useState(null);
  const [hoveredTrendMonth, setHoveredTrendMonth] = useState(null);

  // Load live data from database/APIs (100% driven by complaints)
  const loadDashboardData = async (showSpinner = false) => {
    try {
      if (showSpinner) setLoading(true);
      else setIsRefreshing(true);

      const complaintsRes = await complaintService.getComplaints();
      if (complaintsRes?.data) {
        const list = Array.isArray(complaintsRes.data)
          ? complaintsRes.data
          : complaintsRes.data.complaints || [];
        setComplaints(list);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      if (showSpinner) setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboardData(true);
  }, []);



  // Date range label
  const dateRangeLabel = useMemo(() => {
    if (dateRangePreset === 'THIS_MONTH') return 'Current Month (Live)';
    if (dateRangePreset === '30D') return 'Past 30 Days';
    if (dateRangePreset === '7D') return 'Past 7 Days';
    return 'All Time History (Live)';
  }, [dateRangePreset]);

  // Filtered Complaints based on Date Range and Search Query
  const filteredComplaints = useMemo(() => {
    let list = complaints;
    const now = new Date();

    if (dateRangePreset === 'THIS_MONTH') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      list = list.filter((c) => new Date(c.createdAt || now) >= startOfMonth);
    } else if (dateRangePreset === '30D') {
      const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      list = list.filter((c) => new Date(c.createdAt || now) >= past30);
    } else if (dateRangePreset === '7D') {
      const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      list = list.filter((c) => new Date(c.createdAt || now) >= past7);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (c) =>
          (c.complaintId && c.complaintId.toLowerCase().includes(q)) ||
          (c.title && c.title.toLowerCase().includes(q)) ||
          (c.department && c.department.toLowerCase().includes(q)) ||
          (c.category && c.category.toLowerCase().includes(q)) ||
          (c.location && c.location.toLowerCase().includes(q)) ||
          (c.description && c.description.toLowerCase().includes(q))
      );
    }

    return list;
  }, [complaints, dateRangePreset, searchQuery]);

  // ---------------------------------------------------------------------------
  // 1. TOP 8 NC & CAP METRICS (100% Dynamic from live records)
  // ---------------------------------------------------------------------------
  const metrics = useMemo(() => {
    const totalNCs = filteredComplaints.length;
    const openNCs = filteredComplaints.filter((c) =>
      ['Open', 'Assigned'].includes(c.status)
    ).length;
    const inProgressNCs = filteredComplaints.filter((c) =>
      ['In Progress', 'Under Review', 'Under Verification'].includes(c.status)
    ).length;
    const criticalNCs = filteredComplaints.filter((c) =>
      ['CRITICAL', 'HIGH', 'MAJOR'].includes((c.priority || c.riskSeverity || '').toUpperCase()) &&
      !['Closed', 'Verified'].includes(c.status)
    ).length;
    const pendingCAPs = filteredComplaints.filter((c) =>
      ['CAP Submitted', 'Under Review', 'Under Verification', 'Rejected / Rework'].includes(c.status) ||
      (Boolean(c.capRequired) && !['Closed', 'Verified'].includes(c.status))
    ).length;
    const closedNCs = filteredComplaints.filter((c) =>
      ['Closed', 'Verified'].includes(c.status)
    ).length;
    const resolutionRate = totalNCs > 0 ? Math.round((closedNCs / totalNCs) * 100) : 0;

    const today = new Date();
    const overdueNCs = filteredComplaints.filter((c) => {
      if (['Closed', 'Verified'].includes(c.status)) return false;
      const d = c.deadlineTimestamp ? new Date(c.deadlineTimestamp) : c.dueDate ? new Date(c.dueDate) : null;
      return d && d < today;
    }).length;

    return {
      totalNCs,
      openNCs,
      inProgressNCs,
      criticalNCs,
      pendingCAPs,
      closedNCs,
      resolutionRate,
      overdueNCs,
    };
  }, [filteredComplaints]);

  // ---------------------------------------------------------------------------
  // 2. NC INFLOW & RESOLUTION TREND (Dynamically computed from actual complaints)
  // ---------------------------------------------------------------------------
  const trendData = useMemo(() => {
    const months = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = d.toLocaleString('en-US', { month: 'short' });
      const year = d.getFullYear();
      const monthIndex = d.getMonth();

      const monthComplaints = complaints.filter((c) => {
        const date = new Date(c.createdAt || now);
        return date.getFullYear() === year && date.getMonth() === monthIndex;
      });

      const monthClosedComplaints = monthComplaints.filter((c) =>
        ['Closed', 'Verified'].includes(c.status)
      );

      const raised = monthComplaints.length;
      const resolved = monthClosedComplaints.length;
      const resolutionRate = raised > 0 ? Math.round((resolved / raised) * 100) : 0;

      months.push({
        month: monthName,
        raised,
        resolved,
        resolutionRate,
      });
    }

    return months;
  }, [complaints]);

  // ---------------------------------------------------------------------------
  // 3. NC SEVERITY BREAKDOWN (Dynamically computed from complaints)
  // ---------------------------------------------------------------------------
  const severityBreakdown = useMemo(() => {
    let high = 0;
    let med = 0;
    let low = 0;

    filteredComplaints.forEach((c) => {
      const p = (c.priority || c.riskSeverity || '').toUpperCase();
      if (p === 'CRITICAL' || p === 'HIGH' || p === 'MAJOR') high++;
      else if (p === 'LOW' || p === 'MINOR') low++;
      else med++;
    });

    const total = high + med + low;
    if (total === 0) {
      return {
        total: 0,
        high: { count: 0, pct: 0 },
        med: { count: 0, pct: 0 },
        low: { count: 0, pct: 0 },
      };
    }

    return {
      total,
      high: { count: high, pct: Math.round((high / total) * 100) },
      med: { count: med, pct: Math.round((med / total) * 100) },
      low: { count: low, pct: Math.round((low / total) * 100) },
    };
  }, [filteredComplaints]);

  // ---------------------------------------------------------------------------
  // 4. CAP STATUS BREAKDOWN (Dynamically computed from live complaints)
  // ---------------------------------------------------------------------------
  const capStatusBreakdown = useMemo(() => {
    let submitted = 0;
    let inProgress = 0;
    let pending = 0;
    let notSubmitted = 0;

    filteredComplaints.forEach((c) => {
      if (c.status === 'Closed' || c.status === 'Verified') {
        submitted++;
      } else if (c.status === 'In Progress') {
        inProgress++;
      } else if (c.status === 'CAP Submitted' || c.status === 'Under Review' || c.status === 'Under Verification') {
        pending++;
      } else {
        notSubmitted++;
      }
    });

    const total = submitted + inProgress + pending + notSubmitted;
    if (total === 0) {
      return {
        total: 0,
        submitted: { count: 0, pct: 0 },
        inProgress: { count: 0, pct: 0 },
        pending: { count: 0, pct: 0 },
        notSubmitted: { count: 0, pct: 0 },
      };
    }

    return {
      total,
      submitted: { count: submitted, pct: Math.round((submitted / total) * 100) },
      inProgress: { count: inProgress, pct: Math.round((inProgress / total) * 100) },
      pending: { count: pending, pct: Math.round((pending / total) * 100) },
      notSubmitted: { count: notSubmitted, pct: Math.round((notSubmitted / total) * 100) },
    };
  }, [filteredComplaints]);

  // ---------------------------------------------------------------------------
  // 5. DEPARTMENT NC & CAP MATRIX (100% Dynamic from live complaints)
  // ---------------------------------------------------------------------------
  const departmentPerformanceList = useMemo(() => {
    const deptIcons = {
      Production: '🏭',
      Quality: '🛡️',
      Maintenance: '🔧',
      Warehouse: '📦',
      Packing: '📦',
      Logistics: '🚚',
      Cutting: '✂️',
      Sewing: '🪡',
      Finishing: '👔',
      Safety: '🦺',
      HR: '👥',
      EHS: '🌱',
      Stores: '📦',
      EDP: '💻',
    };

    // Extract ONLY departments that exist in actual complaints
    const activeDepts = new Set();
    filteredComplaints.forEach((c) => {
      if (c.department && c.department.trim()) {
        activeDepts.add(c.department.trim());
      }
    });

    const today = new Date();
    const list = Array.from(activeDepts).map((deptName) => {
      const deptComplaints = filteredComplaints.filter(
        (c) => c.department && c.department.trim().toLowerCase() === deptName.toLowerCase()
      );

      const totalNC = deptComplaints.length;
      const openNC = deptComplaints.filter((c) =>
        ['Open', 'Assigned'].includes(c.status)
      ).length;
      const inProgressNC = deptComplaints.filter((c) =>
        ['In Progress', 'Under Review', 'Under Verification'].includes(c.status)
      ).length;
      const closedNC = deptComplaints.filter((c) =>
        ['Closed', 'Verified'].includes(c.status)
      ).length;
      const pendingCAP = deptComplaints.filter((c) =>
        ['CAP Submitted', 'Under Review', 'Under Verification', 'Rejected / Rework'].includes(c.status) ||
        (Boolean(c.capRequired) && !['Closed', 'Verified'].includes(c.status))
      ).length;
      const overdueNC = deptComplaints.filter((c) => {
        if (['Closed', 'Verified'].includes(c.status)) return false;
        const d = c.deadlineTimestamp ? new Date(c.deadlineTimestamp) : c.dueDate ? new Date(c.dueDate) : null;
        return d && d < today;
      }).length;

      const resolutionRate = totalNC > 0 ? Math.round((closedNC / totalNC) * 100) : 0;

      return {
        name: deptName,
        icon: deptIcons[deptName] || '🏢',
        totalNC,
        openNC,
        inProgressNC,
        closedNC,
        pendingCAP,
        overdueNC,
        resolutionRate,
      };
    });

    list.sort((a, b) => b.totalNC - a.totalNC || b.openNC - a.openNC || a.name.localeCompare(b.name));

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter((d) => d.name.toLowerCase().includes(q));
  }, [filteredComplaints, searchQuery]);

  // ---------------------------------------------------------------------------
  // 6. OVERDUE & PENDING WORK TABLE (Dynamic from NCs and CAPs)
  // ---------------------------------------------------------------------------
  const overdueWorkList = useMemo(() => {
    const list = [];
    const today = new Date();

    complaints.forEach((c) => {
      const isClosed = ['Closed', 'Verified'].includes(c.status);
      const isPendingCAP = ['CAP Submitted', 'Under Review', 'Under Verification', 'Rejected / Rework'].includes(c.status);
      const deadline = c.deadlineTimestamp ? new Date(c.deadlineTimestamp) : c.dueDate ? new Date(c.dueDate) : null;
      const isOverdue = !isClosed && deadline && deadline < today;
      const daysOverdue = isOverdue ? Math.max(1, Math.ceil((today - deadline) / (1000 * 60 * 60 * 24))) : 0;

      const assignedName = typeof c.assignedTo === 'object' ? (c.assignedTo?.name || 'Assigned Staff') : (c.assignedTo || 'Unassigned');

      if (isPendingCAP) {
        list.push({
          type: 'CAP',
          id: c.complaintId ? `CAP-${c.complaintId.replace(/^CMP-/, '')}` : (c.id || 'CAP-REQ'),
          dept: c.department || 'Factory',
          assignedTo: assignedName,
          dueDate: deadline ? deadline.toISOString().slice(0, 10) : 'Pending Review',
          daysOverdue,
          status: isOverdue ? 'Overdue' : 'Under Review',
          priority: (c.priority || c.riskSeverity || 'High').charAt(0).toUpperCase() + (c.priority || c.riskSeverity || 'High').slice(1).toLowerCase(),
          title: c.title || c.description || `${c.department} Corrective Action Plan`,
        });
      } else if (!isClosed) {
        list.push({
          type: 'NC',
          id: c.complaintId || `NC-${c.id || c._id}`,
          dept: c.department || 'Factory',
          assignedTo: assignedName,
          dueDate: deadline ? deadline.toISOString().slice(0, 10) : 'Open',
          daysOverdue,
          status: isOverdue ? 'Overdue' : c.status || 'Open',
          priority: (c.priority || c.riskSeverity || 'Medium').charAt(0).toUpperCase() + (c.priority || c.riskSeverity || 'Medium').slice(1).toLowerCase(),
          title: c.title || c.description || `${c.category || 'Quality'} Non-Conformance`,
        });
      }
    });

    list.sort((a, b) => {
      if (a.status === 'Overdue' && b.status !== 'Overdue') return -1;
      if (a.status !== 'Overdue' && b.status === 'Overdue') return 1;
      return b.daysOverdue - a.daysOverdue;
    });

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(
      (item) =>
        item.id.toLowerCase().includes(q) ||
        item.dept.toLowerCase().includes(q) ||
        item.assignedTo.toLowerCase().includes(q) ||
        item.type.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q)
    );
  }, [complaints, searchQuery]);

  // ---------------------------------------------------------------------------
  // 7. DEPARTMENT-WISE NCs HORIZONTAL BARS (Dynamic from live complaints)
  // ---------------------------------------------------------------------------
  const departmentNCBars = useMemo(() => {
    const countsByDept = {};
    filteredComplaints.forEach((c) => {
      const dept = (c.department || '').trim();
      if (dept) {
        countsByDept[dept] = (countsByDept[dept] || 0) + 1;
      }
    });

    const colors = [
      { color: 'bg-blue-500', barBg: 'bg-blue-100 dark:bg-blue-950/60' },
      { color: 'bg-teal-500', barBg: 'bg-teal-100 dark:bg-teal-950/60' },
      { color: 'bg-amber-500', barBg: 'bg-amber-100 dark:bg-amber-950/60' },
      { color: 'bg-purple-500', barBg: 'bg-purple-100 dark:bg-purple-950/60' },
      { color: 'bg-pink-500', barBg: 'bg-pink-100 dark:bg-pink-950/60' },
      { color: 'bg-cyan-500', barBg: 'bg-cyan-100 dark:bg-cyan-950/60' },
    ];

    const sortedDepts = Object.keys(countsByDept).sort((a, b) => countsByDept[b] - countsByDept[a]);
    const deptsToDisplay = sortedDepts.slice(0, 6);

    return deptsToDisplay.map((name, idx) => ({
      name,
      count: countsByDept[name] || 0,
      color: colors[idx % colors.length].color,
      barBg: colors[idx % colors.length].barBg,
    }));
  }, [filteredComplaints]);

  // ---------------------------------------------------------------------------
  // 8. RECENT ACTIVITY FEED (Dynamically gathered from complaints)
  // ---------------------------------------------------------------------------
  const recentActivities = useMemo(() => {
    const activities = [];

    complaints.forEach((c) => {
      const createdDate = c.createdAt ? new Date(c.createdAt) : null;
      if (createdDate) {
        activities.push({
          id: `act-nc-${c._id || c.id || c.complaintId}`,
          title: 'New NC created',
          detail: `${c.complaintId || 'NC'} • ${c.title || c.category || c.department || 'Issue logged'}`,
          timestamp: createdDate,
          icon: AlertTriangle,
          iconBg: 'bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400',
        });
      }

      if (['Closed', 'Verified'].includes(c.status)) {
        const completedDate = c.actualCompletedAt ? new Date(c.actualCompletedAt) : c.updatedAt ? new Date(c.updatedAt) : createdDate;
        if (completedDate) {
          activities.push({
            id: `act-nc-close-${c._id || c.id || c.complaintId}`,
            title: 'NC closed & verified',
            detail: `${c.complaintId || 'NC'} • ${c.department || 'Resolved'}`,
            timestamp: completedDate,
            icon: CheckCircle2,
            iconBg: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
          });
        }
      }

      if (['CAP Submitted', 'Under Review'].includes(c.status) || c.cap?.submittedAt) {
        const capDate = c.cap?.submittedAt ? new Date(c.cap.submittedAt) : c.updatedAt ? new Date(c.updatedAt) : createdDate;
        if (capDate) {
          activities.push({
            id: `act-cap-${c._id || c.id || c.complaintId}`,
            title: 'CAP submitted',
            detail: `${c.complaintId ? `CAP-${c.complaintId.replace(/^CMP-/, '')}` : 'CAP'} • ${c.department || 'Under Review'}`,
            timestamp: capDate,
            icon: CheckCheck,
            iconBg: 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
          });
        }
      }

      if (c.status === 'In Progress') {
        const progDate = c.updatedAt ? new Date(c.updatedAt) : createdDate;
        if (progDate) {
          activities.push({
            id: `act-prog-${c._id || c.id || c.complaintId}`,
            title: 'Floor containment in progress',
            detail: `${c.complaintId || 'NC'} • ${c.department || 'Active work'}`,
            timestamp: progDate,
            icon: Activity,
            iconBg: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400',
          });
        }
      }
    });

    activities.sort((a, b) => b.timestamp - a.timestamp);
    return activities.slice(0, 5);
  }, [complaints]);

  // Format relative timestamp
  const formatRelativeTime = (date) => {
    if (!date) return 'Recently';
    const diff = Math.floor((new Date() - date) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  // ---------------------------------------------------------------------------
  // 9. QUICK INSIGHTS (Dynamic derived recommendations)
  // ---------------------------------------------------------------------------
  const quickInsights = useMemo(() => {
    const insights = [];

    // 1. Overdue status
    if (metrics.overdueNCs > 0) {
      insights.push({
        id: 'ins-1',
        title: `${metrics.overdueNCs} ${metrics.overdueNCs === 1 ? 'NC defect is' : 'NC defects are'} overdue`,
        desc: 'Immediate floor containment required to maintain SLA compliance.',
        icon: AlertOctagon,
        iconColor: 'text-rose-600 dark:text-rose-400',
        cardBg: 'hover:bg-rose-50/50 dark:hover:bg-rose-950/20 border-rose-100 dark:border-rose-900/40',
        targetSec: 'nc-cap',
      });
    } else {
      insights.push({
        id: 'ins-1',
        title: 'All NC tickets on schedule',
        desc: '0 overdue defects across all plant lines.',
        icon: CheckCircle2,
        iconColor: 'text-emerald-600 dark:text-emerald-400',
        cardBg: 'hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/40',
        targetSec: 'nc-cap',
      });
    }

    // 2. Highest NC department
    const deptCounts = {};
    complaints.forEach((c) => {
      const dept = c.department || 'General';
      deptCounts[dept] = (deptCounts[dept] || 0) + 1;
    });
    const sortedDepts = Object.entries(deptCounts).sort((a, b) => b[1] - a[1]);

    if (sortedDepts.length > 0 && sortedDepts[0][1] > 0) {
      const [topDept, topCount] = sortedDepts[0];
      const pct = complaints.length > 0 ? Math.round((topCount / complaints.length) * 100) : 0;
      insights.push({
        id: 'ins-2',
        title: `${topDept} has highest NC volume`,
        desc: `${topCount} NCs (${pct}% of plant defects). Focus on recurring line issues.`,
        icon: AlertTriangle,
        iconColor: 'text-amber-600 dark:text-amber-400',
        cardBg: 'hover:bg-amber-50/50 dark:hover:bg-amber-950/20 border-amber-100 dark:border-amber-900/40',
        targetSec: 'nc-cap',
      });
    }

    // 3. CAP verification progress
    if (metrics.pendingCAPs > 0) {
      insights.push({
        id: 'ins-3',
        title: `${metrics.pendingCAPs} CAPs awaiting verification`,
        desc: 'Review submitted corrective evidence and close verified defects.',
        icon: Hourglass,
        iconColor: 'text-blue-600 dark:text-cyan-400',
        cardBg: 'hover:bg-blue-50/50 dark:hover:bg-blue-950/20 border-blue-100 dark:border-blue-900/40',
        targetSec: 'cap',
      });
    } else {
      insights.push({
        id: 'ins-3',
        title: 'CAP pipeline cleared',
        desc: 'All corrective action plans verified and up to date.',
        icon: ShieldCheck,
        iconColor: 'text-emerald-600 dark:text-emerald-400',
        cardBg: 'hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/40',
        targetSec: 'cap',
      });
    }

    // 4. Resolution rate
    if (metrics.totalNCs > 0) {
      insights.push({
        id: 'ins-4',
        title: `${metrics.resolutionRate}% Defect Resolution Rate`,
        desc: `${metrics.closedNCs} of ${metrics.totalNCs} non-conformances successfully resolved.`,
        icon: TrendingUp,
        iconColor: 'text-purple-600 dark:text-purple-400',
        cardBg: 'hover:bg-purple-50/50 dark:hover:bg-purple-950/20 border-purple-100 dark:border-purple-900/40',
        targetSec: 'reports',
      });
    } else {
      insights.push({
        id: 'ins-4',
        title: 'Zero NC Defects Logged',
        desc: 'Plant defect registry is clear with no open non-conformances.',
        icon: ShieldCheck,
        iconColor: 'text-emerald-600 dark:text-emerald-400',
        cardBg: 'hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/40',
        targetSec: 'nc-cap',
      });
    }

    return insights;
  }, [metrics, complaints]);

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* -----------------------------------------------------------------------
          TOP HEADER: DASHBOARD TITLE & CONTROLS
          ----------------------------------------------------------------------- */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            NC &amp; CAP Dashboard
          </h1>
        </div>

        {/* Header Right Controls: Date Range Dropdown, Search Input */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Date Range Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsDateMenuOpen(!isDateMenuOpen)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs hover:border-blue-400 transition-colors cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400" />
              <span>{dateRangeLabel}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {isDateMenuOpen && (
              <div className="absolute right-0 mt-1 w-56 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 p-1.5 z-40 text-xs animate-in fade-in">
                <button
                  type="button"
                  onClick={() => {
                    setDateRangePreset('ALL');
                    setIsDateMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg font-medium cursor-pointer ${
                    dateRangePreset === 'ALL'
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-cyan-300 font-bold'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  All Time History (Live)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDateRangePreset('THIS_MONTH');
                    setIsDateMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg font-medium cursor-pointer ${
                    dateRangePreset === 'THIS_MONTH'
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-cyan-300 font-bold'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Current Calendar Month
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDateRangePreset('30D');
                    setIsDateMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg font-medium cursor-pointer ${
                    dateRangePreset === '30D'
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-cyan-300 font-bold'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Past 30 Days
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDateRangePreset('7D');
                    setIsDateMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg font-medium cursor-pointer ${
                    dateRangePreset === '7D'
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-cyan-300 font-bold'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Past 7 Days
                </button>
              </div>
            )}
          </div>

          {/* Search by NC ID, Department, Category */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by NC ID, Department, Category..."
              className="pl-8 pr-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-blue-500 w-56 sm:w-72 shadow-2xs"
            />
          </div>

          {/* Quick Log NC Button */}
          {onOpenNewComplaint && (
            <button
              type="button"
              onClick={onOpenNewComplaint}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-600/20 active:scale-95 transition-all cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Log NC</span>
            </button>
          )}

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => loadDashboardData(false)}
            className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-blue-600 shadow-2xs transition-colors cursor-pointer"
            title="Refresh Live Data"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* VIEW SELECTION SWITCHER & TELEMETRY RIBBON */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-1.5 rounded-2xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setDashboardViewTab('compliance')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              dashboardViewTab === 'compliance'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-cyan-400 shadow-sm border border-slate-200/60 dark:border-slate-700/60'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>NC &amp; CAP Compliance Dashboard</span>
          </button>

          <button
            type="button"
            onClick={() => setDashboardViewTab('operations')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              dashboardViewTab === 'operations'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-cyan-400 shadow-sm border border-slate-200/60 dark:border-slate-700/60'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span>Live Department Work Operations</span>
            {liveOpsSummary && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                <span>{liveOpsSummary.presentEmployees || 0} Present</span>
              </span>
            )}
          </button>
        </div>

        {/* Quick telemetry stats on the right */}
        {dashboardViewTab === 'compliance' && liveOpsSummary && (
          <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400 px-2 overflow-x-auto">
            <span>Floor Live:</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
              🟢 {liveOpsSummary.presentEmployees || 0} Staff
            </span>
            <span>•</span>
            <span className="font-bold text-amber-600 dark:text-amber-400 font-mono">
              🟡 {liveOpsSummary.busyEmployees || 0} Busy
            </span>
            <span>•</span>
            <span className="font-bold text-indigo-600 dark:text-cyan-400 font-mono">
              📋 {liveOpsSummary.tasksInProgress || 0} In Progress
            </span>
          </div>
        )}
      </div>

      {dashboardViewTab === 'operations' ? (
        <DepartmentWorkOperations
          initialDepartment="ALL"
          embedded={true}
          onBackToScorecard={() => setDashboardViewTab('compliance')}
        />
      ) : (
        <>
          {/* -----------------------------------------------------------------------
              ROW 1: 8 NC & CAP KPI METRIC CARDS
              ----------------------------------------------------------------------- */}
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2.5 sm:gap-3">
        {/* CARD 1: Total NCs */}
        <div
          onClick={() => onNavigateSection && onNavigateSection('nc-cap')}
          className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between min-w-0"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
              <span className="p-1 rounded-lg bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-cyan-400 shrink-0">
                <FileCheck className="w-3.5 h-3.5" />
              </span>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate" title="Total Non-Conformances">
                Total NCs
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono my-0.5 truncate">
              {metrics.totalNCs}
            </div>
            <div className="text-[10px] text-slate-400 font-medium truncate">
              <span className="text-blue-600 dark:text-cyan-400 font-bold">{metrics.closedNCs} of {metrics.totalNCs}</span> resolved
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-blue-600 dark:text-cyan-400 font-bold group-hover:translate-x-0.5 transition-transform">
            <span>View all</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>

        {/* CARD 2: Open NCs */}
        <div
          onClick={() => onNavigateSection && onNavigateSection('nc-cap')}
          className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs hover:border-amber-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between min-w-0"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
              <span className="p-1 rounded-lg bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 shrink-0">
                <AlertCircle className="w-3.5 h-3.5" />
              </span>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate" title="Open Non-Conformances">
                Open NCs
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 font-mono my-0.5 truncate">
              {metrics.openNCs}
            </div>
            <div className="text-[10px] text-slate-400 font-medium truncate">
              <span className="text-amber-600 dark:text-amber-400 font-bold">{metrics.openNCs}</span> awaiting action
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-amber-600 dark:text-amber-400 font-bold group-hover:translate-x-0.5 transition-transform">
            <span>View open</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>

        {/* CARD 3: In Progress NCs */}
        <div
          onClick={() => onNavigateSection && onNavigateSection('nc-cap')}
          className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between min-w-0"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
              <span className="p-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 shrink-0">
                <Activity className="w-3.5 h-3.5" />
              </span>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate" title="In Progress Floor Work">
                In Progress
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400 font-mono my-0.5 truncate">
              {metrics.inProgressNCs}
            </div>
            <div className="text-[10px] text-slate-400 font-medium truncate">
              <span className="text-indigo-600 dark:text-indigo-400 font-bold">{metrics.inProgressNCs}</span> active floor tasks
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-indigo-600 dark:text-indigo-400 font-bold group-hover:translate-x-0.5 transition-transform">
            <span>View active</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>

        {/* CARD 4: Critical & High Priority */}
        <div
          onClick={() => onNavigateSection && onNavigateSection('nc-cap')}
          className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs hover:border-rose-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between min-w-0"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
              <span className="p-1 rounded-lg bg-rose-50 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 shrink-0">
                <AlertTriangle className="w-3.5 h-3.5" />
              </span>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate" title="Critical & High Priority NCs">
                Critical NCs
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400 font-mono my-0.5 truncate">
              {metrics.criticalNCs}
            </div>
            <div className="text-[10px] text-slate-400 font-medium truncate">
              {metrics.criticalNCs > 0 ? (
                <span className="text-rose-600 dark:text-rose-400 font-bold">Immediate attention</span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">0 critical risks</span>
              )}
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-rose-600 dark:text-rose-400 font-bold group-hover:translate-x-0.5 transition-transform">
            <span>View critical</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>

        {/* CARD 5: Pending CAPs */}
        <div
          onClick={() => onNavigateSection && onNavigateSection('cap')}
          className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs hover:border-sky-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between min-w-0"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
              <span className="p-1 rounded-lg bg-sky-50 dark:bg-sky-950/80 text-sky-600 dark:text-cyan-400 shrink-0">
                <Hourglass className="w-3.5 h-3.5" />
              </span>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate" title="Pending Corrective Actions">
                Pending CAPs
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-sky-600 dark:text-cyan-400 font-mono my-0.5 truncate">
              {metrics.pendingCAPs}
            </div>
            <div className="text-[10px] text-slate-400 font-medium truncate">
              {metrics.pendingCAPs > 0 ? (
                <><span className="text-sky-600 dark:text-cyan-400 font-bold">{metrics.pendingCAPs}</span> under review</>
              ) : (
                <><span className="text-emerald-600 dark:text-emerald-400 font-bold">All clear</span></>
              )}
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-sky-600 dark:text-cyan-400 font-bold group-hover:translate-x-0.5 transition-transform">
            <span>View CAPs</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>

        {/* CARD 6: Closed & Verified */}
        <div
          onClick={() => onNavigateSection && onNavigateSection('nc-cap')}
          className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between min-w-0"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
              <span className="p-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </span>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate" title="Resolved and Verified NCs">
                Resolved NCs
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono my-0.5 truncate">
              {metrics.closedNCs}
            </div>
            <div className="text-[10px] text-slate-400 font-medium truncate">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">{metrics.resolutionRate}%</span> closure rate
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-emerald-600 dark:text-emerald-400 font-bold group-hover:translate-x-0.5 transition-transform">
            <span>View closed</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>

        {/* CARD 7: Resolution Rate */}
        <div
          onClick={() => onNavigateSection && onNavigateSection('reports')}
          className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs hover:border-purple-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between min-w-0"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
              <span className="p-1 rounded-lg bg-purple-50 dark:bg-purple-950/80 text-purple-600 dark:text-purple-400 shrink-0">
                <TrendingUp className="w-3.5 h-3.5" />
              </span>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate" title="Resolution Rate">
                Resolution %
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-purple-600 dark:text-purple-400 font-mono my-0.5 truncate">
              {metrics.resolutionRate}%
            </div>
            <div className="text-[10px] text-slate-400 font-medium truncate">
              <span className="text-purple-600 dark:text-purple-400 font-bold">{metrics.closedNCs} of {metrics.totalNCs}</span> resolved
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-purple-600 dark:text-purple-400 font-bold group-hover:translate-x-0.5 transition-transform">
            <span>View reports</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>

        {/* CARD 8: Overdue Tasks */}
        <div
          onClick={() => onNavigateSection && onNavigateSection('nc-cap')}
          className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs hover:border-red-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between min-w-0"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
              <span className="p-1 rounded-lg bg-red-50 dark:bg-red-950/80 text-red-600 dark:text-red-400 shrink-0">
                <Clock className="w-3.5 h-3.5" />
              </span>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate" title="Overdue Defect Tickets">
                Overdue Tasks
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-red-600 dark:text-red-400 font-mono my-0.5 truncate">
              {metrics.overdueNCs}
            </div>
            <div className="text-[10px] text-slate-400 font-medium truncate">
              {metrics.overdueNCs > 0 ? (
                <span className="text-red-600 dark:text-red-400 font-bold">{metrics.overdueNCs} exceeded SLA</span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">All on time</span>
              )}
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-red-600 dark:text-red-400 font-bold group-hover:translate-x-0.5 transition-transform">
            <span>View overdue</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>
      </div>

      {/* -----------------------------------------------------------------------
          ROW 2: 3 ANALYTICS VISUALIZATIONS (NC Inflow Trend, NC Severity, CAP Status)
          ----------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        {/* Visual 1: NC Defect Inflow & Resolution Trend (Combo Bar & Line Chart, 5 cols) */}
        <div className="xl:col-span-5 p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between min-w-0 overflow-hidden h-full">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-cyan-400 shrink-0">
                  <TrendingUp className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    NC Inflow &amp; Resolution Trend
                  </h3>
                  <p className="text-xs text-slate-400 truncate">
                    Monthly registered defects vs resolved actions
                  </p>
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-2.5 text-[10px] sm:text-[11px] font-semibold text-slate-600 dark:text-slate-400 shrink-0">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-xs bg-blue-600" />
                  <span>New NCs</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" />
                  <span>Resolved</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-1 rounded-full bg-indigo-600" />
                  <span>Rate %</span>
                </span>
              </div>
            </div>

            {/* SVG Combo Chart (Grouped Bars + Line on Dual Axis) */}
            <div className="relative h-56 w-full pt-2">
              {(() => {
                const maxTrendCount = Math.max(5, ...trendData.map((d) => Math.max(d.raised, d.resolved)));

                const linePoints = trendData.map((d, i) => {
                  const x = 55 + i * 74 + 15;
                  const y = 170 - (Math.min(100, Math.max(0, d.resolutionRate)) / 100) * 140;
                  return { x, y, rate: d.resolutionRate, month: d.month };
                });

                const dPath = linePoints.reduce((acc, pt, idx) => {
                  return idx === 0 ? `M ${pt.x},${pt.y}` : `${acc} L ${pt.x},${pt.y}`;
                }, '');

                return (
                  <svg viewBox="0 0 540 200" className="w-full h-full overflow-visible">
                    {/* Horizontal Grid lines */}
                    {[0, 25, 50, 75, 100].map((val, idx) => {
                      const y = 170 - (val / 100) * 140;
                      return (
                        <g key={val}>
                          <line
                            x1="30"
                            y1={y}
                            x2="500"
                            y2={y}
                            stroke="#e2e8f0"
                            strokeDasharray={idx === 0 ? 'none' : '3,3'}
                            className="dark:stroke-slate-800"
                          />
                          {/* Left Y-axis labels */}
                          <text
                            x="24"
                            y={y + 3}
                            fontSize="9"
                            fill="#94a3b8"
                            textAnchor="end"
                            fontFamily="monospace"
                          >
                            {Math.round((val / 100) * maxTrendCount)}
                          </text>
                          {/* Right Y-axis labels */}
                          <text
                            x="506"
                            y={y + 3}
                            fontSize="9"
                            fill="#94a3b8"
                            textAnchor="start"
                            fontFamily="monospace"
                          >
                            {val}%
                          </text>
                        </g>
                      );
                    })}

                    {/* Bars for Raised & Resolved */}
                    {trendData.map((d, i) => {
                      const groupX = 55 + i * 74;
                      const raisedHeight = maxTrendCount > 0 ? (d.raised / maxTrendCount) * 140 : 0;
                      const resolvedHeight = maxTrendCount > 0 ? (d.resolved / maxTrendCount) * 140 : 0;

                      return (
                        <g key={d.month} className="cursor-pointer group">
                          {/* New NCs Bar (Blue) */}
                          <rect
                            x={groupX}
                            y={170 - raisedHeight}
                            width="14"
                            height={raisedHeight}
                            rx="3"
                            fill="#2563eb"
                            className="transition-all hover:opacity-80"
                          >
                            <title>{`${d.month} New NCs: ${d.raised}`}</title>
                          </rect>

                          {/* Resolved NCs Bar (Emerald) */}
                          <rect
                            x={groupX + 16}
                            y={170 - resolvedHeight}
                            width="14"
                            height={resolvedHeight}
                            rx="3"
                            fill="#10b981"
                            className="transition-all hover:opacity-90"
                          >
                            <title>{`${d.month} Resolved: ${d.resolved}`}</title>
                          </rect>

                          {/* X-axis Month Label */}
                          <text
                            x={groupX + 15}
                            y="188"
                            fontSize="10"
                            fill="#64748b"
                            textAnchor="middle"
                            fontWeight="bold"
                          >
                            {d.month}
                          </text>
                        </g>
                      );
                    })}

                    {/* Resolution Rate Line Path */}
                    {dPath && (
                      <path
                        d={dPath}
                        fill="none"
                        stroke="#6366f1"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}

                    {/* Line Points */}
                    {linePoints.map((pt) => (
                      <g key={pt.month} className="group/dot cursor-pointer">
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r="4.5"
                          fill="#ffffff"
                          stroke="#6366f1"
                          strokeWidth="2.5"
                          className="transition-transform group-hover/dot:scale-125"
                        />
                        <title>{`${pt.month} Resolution Rate: ${pt.rate}%`}</title>
                      </g>
                    ))}
                  </svg>
                );
              })()}
            </div>
          </div>

          <div className="pt-3 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <span className="font-medium">6-Month Continuous Trend</span>
            <button
              type="button"
              onClick={() => onNavigateSection && onNavigateSection('reports')}
              className="text-blue-600 hover:text-blue-700 dark:text-cyan-400 font-bold flex items-center gap-1 cursor-pointer"
            >
              <span>Detailed Analytics</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Visuals 2 & 3: Donut Charts Container (7 cols, equal 2-col subgrid) */}
        <div className="xl:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
          {/* Visual 2: NC Severity Breakdown */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between min-w-0 h-full">
            <div className="flex-1 flex flex-col justify-between">
              {/* Card Header */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 shrink-0">
                    <ShieldAlert className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      NC Severity Breakdown
                    </h3>
                    <p className="text-xs text-slate-400 truncate">
                      Risk distribution of active non-conformances
                    </p>
                  </div>
                </div>
              </div>

              {/* Donut Container & Legend */}
              <div className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 py-2 min-w-0">
                {/* SVG Donut */}
                <div className="relative w-28 h-28 sm:w-32 sm:h-32 flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90 transform">
                    {/* Background Track */}
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      stroke="#f1f5f9"
                      className="dark:stroke-slate-800"
                      strokeWidth="13"
                      fill="transparent"
                    />
                    {/* High (Red) */}
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      stroke="#ef4444"
                      strokeWidth="13"
                      fill="transparent"
                      strokeDasharray={`${(severityBreakdown.high.pct * 238.76) / 100} 238.76`}
                      strokeDashoffset="0"
                    />
                    {/* Med (Amber) */}
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      stroke="#f59e0b"
                      strokeWidth="13"
                      fill="transparent"
                      strokeDasharray={`${(severityBreakdown.med.pct * 238.76) / 100} 238.76`}
                      strokeDashoffset={`-${(severityBreakdown.high.pct * 238.76) / 100}`}
                    />
                    {/* Low (Blue) */}
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      stroke="#3b82f6"
                      strokeWidth="13"
                      fill="transparent"
                      strokeDasharray={`${(severityBreakdown.low.pct * 238.76) / 100} 238.76`}
                      strokeDashoffset={`-${((severityBreakdown.high.pct + severityBreakdown.med.pct) * 238.76) / 100}`}
                    />
                  </svg>

                  {/* Donut Center Text */}
                  <div className="absolute text-center pointer-events-none">
                    <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono leading-none">
                      {severityBreakdown.total}
                    </div>
                    <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Total NCs</div>
                  </div>
                </div>

                {/* Legend List */}
                <div className="w-full sm:flex-1 min-w-0 flex flex-col justify-center space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-1 py-0.5">
                    <span className="flex items-center gap-1.5 min-w-0 font-medium text-slate-700 dark:text-slate-300">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-rose-500" />
                      <span className="truncate whitespace-nowrap text-[11px]">Critical / High</span>
                    </span>
                    <span className="font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200 shrink-0 whitespace-nowrap pl-1">
                      {severityBreakdown.high.count} <span className="text-[10px] text-slate-400 font-normal">({severityBreakdown.high.pct}%)</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-1 py-0.5">
                    <span className="flex items-center gap-1.5 min-w-0 font-medium text-slate-700 dark:text-slate-300">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-amber-500" />
                      <span className="truncate whitespace-nowrap text-[11px]">Medium</span>
                    </span>
                    <span className="font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200 shrink-0 whitespace-nowrap pl-1">
                      {severityBreakdown.med.count} <span className="text-[10px] text-slate-400 font-normal">({severityBreakdown.med.pct}%)</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-1 py-0.5">
                    <span className="flex items-center gap-1.5 min-w-0 font-medium text-slate-700 dark:text-slate-300">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-blue-500" />
                      <span className="truncate whitespace-nowrap text-[11px]">Low / Minor</span>
                    </span>
                    <span className="font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200 shrink-0 whitespace-nowrap pl-1">
                      {severityBreakdown.low.count} <span className="text-[10px] text-slate-400 font-normal">({severityBreakdown.low.pct}%)</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Card Footer */}
            <div className="pt-3 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
              <span className="font-medium">Active Risk Levels</span>
              <button
                type="button"
                onClick={() => onNavigateSection && onNavigateSection('nc-cap')}
                className="text-rose-600 hover:text-rose-700 dark:text-rose-400 font-bold flex items-center gap-1 cursor-pointer"
              >
                <span>View Active NCs</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Visual 3: CAP Status Breakdown */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between min-w-0 h-full">
            <div className="flex-1 flex flex-col justify-between">
              {/* Card Header */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 shrink-0">
                    <CheckCheck className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      CAP Status Breakdown
                    </h3>
                    <p className="text-xs text-slate-400 truncate">
                      Corrective &amp; preventive action lifecycle
                    </p>
                  </div>
                </div>
              </div>

              {/* Donut Container & Legend */}
              <div className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 py-2 min-w-0">
                {/* SVG Donut */}
                <div className="relative w-28 h-28 sm:w-32 sm:h-32 flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90 transform">
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      stroke="#f1f5f9"
                      className="dark:stroke-slate-800"
                      strokeWidth="13"
                      fill="transparent"
                    />
                    {/* Closed / Verified (Green) */}
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      stroke="#10b981"
                      strokeWidth="13"
                      fill="transparent"
                      strokeDasharray={`${(capStatusBreakdown.submitted.pct * 238.76) / 100} 238.76`}
                      strokeDashoffset="0"
                    />
                    {/* In Progress (Blue) */}
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      stroke="#3b82f6"
                      strokeWidth="13"
                      fill="transparent"
                      strokeDasharray={`${(capStatusBreakdown.inProgress.pct * 238.76) / 100} 238.76`}
                      strokeDashoffset={`-${(capStatusBreakdown.submitted.pct * 238.76) / 100}`}
                    />
                    {/* Pending Review (Amber) */}
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      stroke="#f59e0b"
                      strokeWidth="13"
                      fill="transparent"
                      strokeDasharray={`${(capStatusBreakdown.pending.pct * 238.76) / 100} 238.76`}
                      strokeDashoffset={`-${((capStatusBreakdown.submitted.pct + capStatusBreakdown.inProgress.pct) * 238.76) / 100}`}
                    />
                    {/* Not Submitted (Red) */}
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      stroke="#ef4444"
                      strokeWidth="13"
                      fill="transparent"
                      strokeDasharray={`${(capStatusBreakdown.notSubmitted.pct * 238.76) / 100} 238.76`}
                      strokeDashoffset={`-${((capStatusBreakdown.submitted.pct + capStatusBreakdown.inProgress.pct + capStatusBreakdown.pending.pct) * 238.76) / 100}`}
                    />
                  </svg>

                  {/* Donut Center Text */}
                  <div className="absolute text-center pointer-events-none">
                    <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono leading-none">
                      {capStatusBreakdown.total}
                    </div>
                    <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Total NCs</div>
                  </div>
                </div>

                {/* Legend List */}
                <div className="w-full sm:flex-1 min-w-0 flex flex-col justify-center space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-1 py-0.5">
                    <span className="flex items-center gap-1.5 min-w-0 font-medium text-slate-700 dark:text-slate-300">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-emerald-500" />
                      <span className="truncate whitespace-nowrap text-[11px]">Closed / Verified</span>
                    </span>
                    <span className="font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200 shrink-0 whitespace-nowrap pl-1">
                      {capStatusBreakdown.submitted.count} <span className="text-[10px] text-slate-400 font-normal">({capStatusBreakdown.submitted.pct}%)</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-1 py-0.5">
                    <span className="flex items-center gap-1.5 min-w-0 font-medium text-slate-700 dark:text-slate-300">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-blue-500" />
                      <span className="truncate whitespace-nowrap text-[11px]">In Progress</span>
                    </span>
                    <span className="font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200 shrink-0 whitespace-nowrap pl-1">
                      {capStatusBreakdown.inProgress.count} <span className="text-[10px] text-slate-400 font-normal">({capStatusBreakdown.inProgress.pct}%)</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-1 py-0.5">
                    <span className="flex items-center gap-1.5 min-w-0 font-medium text-slate-700 dark:text-slate-300">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-amber-500" />
                      <span className="truncate whitespace-nowrap text-[11px]">Pending Review</span>
                    </span>
                    <span className="font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200 shrink-0 whitespace-nowrap pl-1">
                      {capStatusBreakdown.pending.count} <span className="text-[10px] text-slate-400 font-normal">({capStatusBreakdown.pending.pct}%)</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-1 py-0.5">
                    <span className="flex items-center gap-1.5 min-w-0 font-medium text-slate-700 dark:text-slate-300">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-rose-500" />
                      <span className="truncate whitespace-nowrap text-[11px]">Open / Not Started</span>
                    </span>
                    <span className="font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200 shrink-0 whitespace-nowrap pl-1">
                      {capStatusBreakdown.notSubmitted.count} <span className="text-[10px] text-slate-400 font-normal">({capStatusBreakdown.notSubmitted.pct}%)</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Card Footer */}
            <div className="pt-3 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
              <span className="font-medium">Lifecycle Tracking</span>
              <button
                type="button"
                onClick={() => onNavigateSection && onNavigateSection('cap')}
                className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1 cursor-pointer"
              >
                <span>View CAP Register</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* -----------------------------------------------------------------------
          ROW 3: 2 OPERATIONAL TABLES (Department Performance & Overdue Work)
          ----------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Table 1: Department Performance (7 cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600">
                  <Building2 className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Department NC Matrix
                  </h3>
                  <p className="text-xs text-slate-400">
                    NC defect resolution and CAP status by department
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onNavigateSection && onNavigateSection('nc-cap')}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-cyan-400 flex items-center gap-1 cursor-pointer"
              >
                <span>View All NCs</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 text-[11px] font-bold text-slate-500">
                    <th className="py-2.5 px-4">Department</th>
                    <th className="py-2.5 px-3 text-center">Total NCs</th>
                    <th className="py-2.5 px-3 text-center text-rose-600">Open NCs</th>
                    <th className="py-2.5 px-3 text-center text-indigo-600">In Progress</th>
                    <th className="py-2.5 px-3 text-center text-emerald-600">Closed NCs</th>
                    <th className="py-2.5 px-3 text-center text-amber-600">Pending CAPs</th>
                    <th className="py-2.5 px-3 text-center text-red-600">Overdue</th>
                    <th className="py-2.5 px-4 text-center">Resolution %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {departmentPerformanceList.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="py-8 text-center text-slate-400">
                        <Building2 className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-700" />
                        <p className="font-bold text-slate-700 dark:text-slate-300">No departments match your filter</p>
                        <p className="text-xs text-slate-400">Try clearing the search query or changing filters.</p>
                      </td>
                    </tr>
                  ) : (
                    departmentPerformanceList.map((d) => (
                      <tr
                        key={d.name}
                        onClick={() => onDrilldownDepartment && onDrilldownDepartment(d.name)}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group"
                      >
                        <td className="py-2.5 px-4 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <span>{d.icon}</span>
                          <span className="group-hover:text-blue-600 transition-colors">{d.name}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800 dark:text-slate-200">
                          {d.totalNC}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-rose-600">
                          {d.openNC}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-indigo-600">
                          {d.inProgressNC}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-600">
                          {d.closedNC}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-amber-600">
                          {d.pendingCAP}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-red-600">
                          {d.overdueNC}
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center justify-center gap-2">
                            <span className="font-mono font-bold text-[11px] text-slate-800 dark:text-slate-200 w-8 text-right">
                              {d.resolutionRate}%
                            </span>
                            <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full"
                                style={{ width: `${d.resolutionRate}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Table 2: Overdue & Pending Work (5 cols) */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-xl bg-rose-50 dark:bg-rose-950 text-rose-600">
                  <AlertOctagon className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Overdue &amp; Pending Work
                  </h3>
                  <p className="text-xs text-slate-400">
                    Defect tickets that need immediate attention
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onNavigateSection && onNavigateSection('nc-cap')}
                className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
              >
                <span>View All</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 text-[11px] font-bold text-slate-500">
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">ID</th>
                    <th className="py-2.5 px-3">Department</th>
                    <th className="py-2.5 px-3">Assigned To</th>
                    <th className="py-2.5 px-3">Due Date</th>
                    <th className="py-2.5 px-2 text-center">Overdue</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-center">Priority</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {overdueWorkList.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="py-8 text-center text-slate-400">
                        <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500 opacity-80" />
                        <p className="font-bold text-slate-700 dark:text-slate-300">All tasks are up to date</p>
                        <p className="text-xs text-slate-400">No overdue NCs or pending CAPs found.</p>
                      </td>
                    </tr>
                  ) : (
                    overdueWorkList.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedInspectionItem(item)}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group"
                      >
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              item.type === 'NC'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950 dark:text-rose-300'
                                : 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-300'
                            }`}
                          >
                            {item.type}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white">
                          {item.id}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                          {item.dept}
                        </td>
                        <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {item.assignedTo}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {item.dueDate}
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono font-bold text-rose-600">
                          {item.daysOverdue}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              item.status === 'Overdue'
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              item.priority === 'High' || item.priority === 'Critical'
                                ? 'text-rose-600 bg-rose-50 dark:bg-rose-950/60'
                                : item.priority === 'Medium'
                                ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/60'
                                : 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60'
                            }`}
                          >
                            {item.priority}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* -----------------------------------------------------------------------
          ROW 4: 3 OPERATIONAL WIDGETS (Department-wise NCs, Activity, Quick Insights)
          ----------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Widget 1: Department-wise NCs (Horizontal Bars) */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 shrink-0">
                <BarChartIcon />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Department-wise NCs
                </h3>
                <p className="text-xs text-slate-400">Non-conformance distribution</p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              {departmentNCBars.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No department NC defects recorded.
                </div>
              ) : (
                (() => {
                  const maxNC = Math.max(1, ...departmentNCBars.map((d) => d.count));
                  return departmentNCBars.map((d) => {
                    const pct = Math.round((d.count / maxNC) * 100);
                    return (
                      <div key={d.name} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-700 dark:text-slate-300">{d.name}</span>
                          <span className="font-mono font-bold text-slate-900 dark:text-white">{d.count} NCs</span>
                        </div>
                        <div className={`h-2 rounded-full overflow-hidden ${d.barBg}`}>
                          <div
                            className={`h-full rounded-full ${d.color} transition-all duration-500`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  });
                })()
              )}
            </div>
          </div>
        </div>

        {/* Widget 2: Recent Activity Feed */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950 text-purple-600 shrink-0">
                <Clock className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Recent Activity Log
                </h3>
                <p className="text-xs text-slate-400">Latest actions and defect status updates</p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              {recentActivities.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  No activity events recorded yet.
                </div>
              ) : (
                recentActivities.map((act) => {
                  const IconComp = act.icon;
                  return (
                    <div key={act.id} className="flex items-start gap-2.5 text-xs">
                      <span className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${act.iconBg}`}>
                        <IconComp className="w-3.5 h-3.5" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-slate-800 dark:text-slate-200 truncate">{act.title}</span>
                          <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                            {formatRelativeTime(act.timestamp)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{act.detail}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Widget 3: Quick Insights */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600 shrink-0">
                <Lightbulb className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Actionable Insights
                </h3>
                <p className="text-xs text-slate-400">Focus areas for floor quality</p>
              </div>
            </div>

            <div className="space-y-2.5">
              {quickInsights.map((ins) => {
                const IconComp = ins.icon;
                return (
                  <div
                    key={ins.id}
                    onClick={() => onNavigateSection && onNavigateSection(ins.targetSec)}
                    className={`p-3 rounded-xl border bg-slate-50/50 dark:bg-slate-950/40 flex items-center justify-between gap-2.5 cursor-pointer transition-all ${ins.cardBg} group`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <IconComp className={`w-4 h-4 shrink-0 ${ins.iconColor}`} />
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {ins.title}
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {ins.desc}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform shrink-0" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* -----------------------------------------------------------------------
          ITEM INSPECTION MODAL (When clicking Overdue / Pending work rows)
          ----------------------------------------------------------------------- */}
      {selectedInspectionItem && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setSelectedInspectionItem(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full p-6 space-y-4 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-cyan-300 font-mono">
                  {selectedInspectionItem.type} • {selectedInspectionItem.id}
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1">
                  {selectedInspectionItem.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInspectionItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-950">
                <span className="text-slate-500">Department:</span>
                <strong className="text-slate-800 dark:text-slate-200">{selectedInspectionItem.dept}</strong>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-950">
                <span className="text-slate-500">Assigned To:</span>
                <strong className="text-slate-800 dark:text-slate-200">{selectedInspectionItem.assignedTo}</strong>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-950">
                <span className="text-slate-500">Target Due Date:</span>
                <strong className="text-slate-800 dark:text-slate-200">{selectedInspectionItem.dueDate}</strong>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-950">
                <span className="text-slate-500">Days Overdue:</span>
                <strong className="text-rose-600 font-bold">{selectedInspectionItem.daysOverdue} Days</strong>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-950">
                <span className="text-slate-500">Priority:</span>
                <strong className="text-rose-600 font-bold">{selectedInspectionItem.priority}</strong>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setSelectedInspectionItem(null);
                  if (onNavigateSection) {
                    onNavigateSection('nc-cap');
                  }
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
              >
                Open Ticket in NC/CAP Register
              </button>
              <button
                type="button"
                onClick={() => setSelectedInspectionItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};

const BarChartIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

export default AuditProDashboard;
