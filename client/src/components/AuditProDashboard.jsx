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
} from 'lucide-react';
import { complaintService, taskService, departmentService } from '../services/api';
import { useAuth } from '../context/AuthContext';

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
  const [audits, setAudits] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [complianceData, setComplianceData] = useState(null);

  // Filter & Search states
  const [dateRangePreset, setDateRangePreset] = useState('ALL'); // 'ALL', 'THIS_MONTH', '30D', '7D'
  const [isDateMenuOpen, setIsDateMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [selectedInspectionItem, setSelectedInspectionItem] = useState(null);
  const [hoveredTrendMonth, setHoveredTrendMonth] = useState(null);

  // Load live data from database/APIs
  const loadDashboardData = async (showSpinner = false) => {
    try {
      if (showSpinner) setLoading(true);
      else setIsRefreshing(true);

      const [complaintsRes, auditsRes, tasksRes, complianceRes] =
        await Promise.allSettled([
          complaintService.getComplaints(),
          complaintService.getAudits(),
          taskService.getTasks(),
          complaintService.getDepartmentCompliance(),
        ]);

      if (complaintsRes.status === 'fulfilled' && complaintsRes.value?.data) {
        const list = Array.isArray(complaintsRes.value.data)
          ? complaintsRes.value.data
          : complaintsRes.value.data.complaints || [];
        setComplaints(list);
      }

      if (auditsRes.status === 'fulfilled' && auditsRes.value?.data?.success) {
        setAudits(auditsRes.value.data.audits || []);
      }

      if (tasksRes.status === 'fulfilled' && tasksRes.value?.data?.success) {
        setTasks(tasksRes.value.data.tasks || []);
      }

      if (complianceRes.status === 'fulfilled' && complianceRes.value?.data?.success) {
        setComplianceData(complianceRes.value.data);
      }
    } catch (err) {
      console.error('Failed to load AuditPro dashboard data:', err);
    } finally {
      if (showSpinner) setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboardData(true);
  }, []);

  // Time of day greeting
  const greetingText = useMemo(() => {
    const hour = new Date().getHours();
    let timeGreeting = 'Good Morning';
    if (hour >= 12 && hour < 17) timeGreeting = 'Good Afternoon';
    else if (hour >= 17) timeGreeting = 'Good Evening';

    const roleName = isAdmin ? 'Admin' : isAuditor ? 'Auditor' : user?.name || 'Admin';
    return `${timeGreeting}, ${roleName} 👋`;
  }, [user, isAdmin, isAuditor]);

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

  // Filtered Audits based on Date Range and Search Query
  const filteredAudits = useMemo(() => {
    let list = audits;
    const now = new Date();

    if (dateRangePreset === 'THIS_MONTH') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      list = list.filter((a) => new Date(a.scheduled_date || a.createdAt || now) >= startOfMonth);
    } else if (dateRangePreset === '30D') {
      const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      list = list.filter((a) => new Date(a.scheduled_date || a.createdAt || now) >= past30);
    } else if (dateRangePreset === '7D') {
      const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      list = list.filter((a) => new Date(a.scheduled_date || a.createdAt || now) >= past7);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (a) =>
          (a.audit_number && a.audit_number.toLowerCase().includes(q)) ||
          (a.title && a.title.toLowerCase().includes(q)) ||
          (a.department && a.department.toLowerCase().includes(q))
      );
    }

    return list;
  }, [audits, dateRangePreset, searchQuery]);

  // ---------------------------------------------------------------------------
  // 1. TOP 8 METRICS CALCULATION (100% Dynamic from live records)
  // ---------------------------------------------------------------------------
  const metrics = useMemo(() => {
    const totalNCs = filteredComplaints.length;
    const openNCs = filteredComplaints.filter((c) =>
      ['Open', 'Assigned', 'In Progress'].includes(c.status)
    ).length;
    const closedNCs = filteredComplaints.filter((c) =>
      ['Closed', 'Verified'].includes(c.status)
    ).length;
    const pendingCAPs = filteredComplaints.filter((c) =>
      ['CAP Submitted', 'Under Review', 'Under Verification', 'Rejected / Rework'].includes(c.status) ||
      (Boolean(c.capRequired) && !['Closed', 'Verified'].includes(c.status))
    ).length;

    const totalAudits = filteredAudits.length;
    const completedAudits = filteredAudits.filter((a) => a.status === 'Completed').length;
    const scheduledAudits = filteredAudits.filter((a) =>
      ['Scheduled', 'Planned', 'In Progress'].includes(a.status)
    ).length;
    const overdueAudits = filteredAudits.filter((a) => {
      if (a.status === 'Overdue') return true;
      if (a.status !== 'Completed' && a.scheduled_date) {
        return new Date(a.scheduled_date) < new Date();
      }
      return false;
    }).length;

    return {
      totalAudits,
      completedAudits,
      scheduledAudits,
      overdueAudits,
      totalNCs,
      openNCs,
      closedNCs,
      pendingCAPs,
    };
  }, [filteredComplaints, filteredAudits]);

  // ---------------------------------------------------------------------------
  // 2. AUDIT PERFORMANCE TREND DATA (Dynamically computed from actual records)
  // ---------------------------------------------------------------------------
  const trendData = useMemo(() => {
    const months = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = d.toLocaleString('en-US', { month: 'short' });
      const year = d.getFullYear();
      const monthIndex = d.getMonth();

      const monthAudits = audits.filter((a) => {
        const date = new Date(a.scheduled_date || a.createdAt);
        return date.getFullYear() === year && date.getMonth() === monthIndex;
      });
      const monthCompletedAudits = monthAudits.filter((a) => a.status === 'Completed');

      const monthComplaints = complaints.filter((c) => {
        const date = new Date(c.createdAt);
        return date.getFullYear() === year && date.getMonth() === monthIndex;
      });
      const monthClosedComplaints = monthComplaints.filter((c) =>
        ['Closed', 'Verified'].includes(c.status)
      );

      const planned = monthAudits.length > 0 ? monthAudits.length : monthComplaints.length;
      const completed = monthAudits.length > 0 ? monthCompletedAudits.length : monthClosedComplaints.length;

      let score = 100;
      if (monthAudits.length > 0) {
        const completedPct = Math.round((monthCompletedAudits.length / monthAudits.length) * 100);
        score = Math.max(50, completedPct);
      } else if (monthComplaints.length > 0) {
        const resRate = Math.round((monthClosedComplaints.length / monthComplaints.length) * 100);
        score = Math.max(50, resRate);
      }

      months.push({
        month: monthName,
        completed,
        planned,
        score,
      });
    }

    return months;
  }, [audits, complaints]);

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
  // 4. CAP STATUS BREAKDOWN (Dynamically computed from NC/CAP details)
  // ---------------------------------------------------------------------------
  const capStatusBreakdown = useMemo(() => {
    let submitted = 0;
    let inProgress = 0;
    let pending = 0;
    let notSubmitted = 0;

    filteredComplaints.forEach((c) => {
      if (c.status === 'Closed' || c.status === 'Verified' || c.cap?.verifiedEffective) {
        submitted++;
      } else if (c.status === 'In Progress' || c.status === 'Assigned') {
        inProgress++;
      } else if (['CAP Submitted', 'Under Review', 'Under Verification'].includes(c.status)) {
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
  // 5. DEPARTMENT PERFORMANCE MATRIX (Dynamic aggregation from database)
  // ---------------------------------------------------------------------------
  const departmentPerformanceList = useMemo(() => {
    const deptIcons = {
      Production: '🏭',
      Quality: '🔍',
      Maintenance: '⚙️',
      Warehouse: '📦',
      Packing: '🎁',
      Logistics: '🚚',
      Cutting: '✂️',
      Finishing: '👔',
      Safety: '🦺',
      HR: '👥',
    };

    const knownDepts = new Set([
      'Production',
      'Quality',
      'Maintenance',
      'Warehouse',
      'Packing',
      'Logistics',
    ]);

    if (complianceData?.departments && Array.isArray(complianceData.departments)) {
      complianceData.departments.forEach((d) => {
        if (d.department) knownDepts.add(d.department);
      });
    }

    complaints.forEach((c) => {
      if (c.department) knownDepts.add(c.department);
    });

    audits.forEach((a) => {
      if (a.department) knownDepts.add(a.department);
    });

    const list = Array.from(knownDepts).map((deptName) => {
      const compRecord = complianceData?.departments?.find(
        (d) => d.department?.toLowerCase() === deptName.toLowerCase()
      );

      const deptAudits = audits.filter(
        (a) => a.department && a.department.toLowerCase() === deptName.toLowerCase()
      );

      const deptComplaints = complaints.filter(
        (c) => c.department && c.department.toLowerCase() === deptName.toLowerCase()
      );

      const totalNC = deptComplaints.length;
      const openNC = deptComplaints.filter((c) =>
        ['Open', 'Assigned', 'In Progress'].includes(c.status)
      ).length;
      const closedNC = deptComplaints.filter((c) =>
        ['Closed', 'Verified'].includes(c.status)
      ).length;
      const pendingCAP = deptComplaints.filter((c) =>
        ['CAP Submitted', 'Under Review', 'Under Verification', 'Rejected / Rework'].includes(c.status) ||
        (Boolean(c.capRequired) && !['Closed', 'Verified'].includes(c.status))
      ).length;

      let score = 100;
      if (compRecord && typeof compRecord.score === 'number') {
        score = Math.round(compRecord.score);
      } else if (totalNC > 0) {
        score = Math.max(0, Math.min(100, Math.round(100 - (openNC / totalNC) * 35 - (pendingCAP / totalNC) * 25)));
      } else if (deptAudits.length > 0) {
        const completedCount = deptAudits.filter((a) => a.status === 'Completed').length;
        score = Math.round((completedCount / deptAudits.length) * 100);
      }

      return {
        name: deptName,
        icon: deptIcons[deptName] || '🏢',
        audits: deptAudits.length,
        score,
        totalNC,
        openNC,
        closedNC,
        pendingCAP,
      };
    });

    list.sort((a, b) => b.totalNC - a.totalNC || a.name.localeCompare(b.name));

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter((d) => d.name.toLowerCase().includes(q));
  }, [complianceData, complaints, audits, searchQuery]);

  // ---------------------------------------------------------------------------
  // 6. OVERDUE & PENDING WORK TABLE (Dynamic from actual audits, NCs, and CAPs)
  // ---------------------------------------------------------------------------
  const overdueWorkList = useMemo(() => {
    const list = [];
    const today = new Date();

    // 1. Audits pending or overdue
    audits.forEach((a) => {
      const scheduledDate = a.scheduled_date ? new Date(a.scheduled_date) : null;
      const isCompleted = a.status === 'Completed';
      const isOverdue = a.status === 'Overdue' || (scheduledDate && scheduledDate < today && !isCompleted);

      if (!isCompleted) {
        const daysOverdue = isOverdue && scheduledDate ? Math.max(1, Math.ceil((today - scheduledDate) / (1000 * 60 * 60 * 24))) : 0;
        list.push({
          type: 'Audit',
          id: a.audit_number || a._id || `A-${a.id}`,
          dept: a.department || 'General',
          assignedTo: typeof a.auditor === 'object' ? (a.auditor?.name || 'Assigned Auditor') : (a.auditor || 'Auditor'),
          dueDate: scheduledDate ? scheduledDate.toISOString().slice(0, 10) : 'Not scheduled',
          daysOverdue,
          status: isOverdue ? 'Overdue' : a.status || 'Scheduled',
          priority: isOverdue ? 'High' : 'Medium',
          title: a.title || `${a.department} Internal Inspection`,
        });
      }
    });

    // 2. NCs & CAPs pending or overdue
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

    // Sort: Overdue items first, then by days overdue descending
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
  }, [audits, complaints, searchQuery]);

  // ---------------------------------------------------------------------------
  // 7. DEPARTMENT-WISE NCs HORIZONTAL BARS (Dynamic from live complaints)
  // ---------------------------------------------------------------------------
  const departmentNCBars = useMemo(() => {
    const countsByDept = {};
    filteredComplaints.forEach((c) => {
      const dept = c.department || 'General';
      countsByDept[dept] = (countsByDept[dept] || 0) + 1;
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
    const deptsToDisplay = sortedDepts.length > 0
      ? sortedDepts.slice(0, 6)
      : ['Production', 'Quality', 'Maintenance', 'Warehouse', 'Packing', 'Logistics'];

    return deptsToDisplay.map((name, idx) => ({
      name,
      count: countsByDept[name] || 0,
      color: colors[idx % colors.length].color,
      barBg: colors[idx % colors.length].barBg,
    }));
  }, [filteredComplaints]);

  // ---------------------------------------------------------------------------
  // 8. RECENT ACTIVITY FEED (Dynamically gathered from complaints and audits)
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
    });

    audits.forEach((a) => {
      if (a.status === 'Completed' && (a.completed_date || a.updatedAt)) {
        activities.push({
          id: `act-audit-done-${a._id || a.id || a.audit_number}`,
          title: 'Audit completed',
          detail: `${a.audit_number || 'Audit'} • ${a.title || a.department}`,
          timestamp: new Date(a.completed_date || a.updatedAt),
          icon: CheckCircle2,
          iconBg: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
        });
      } else if (a.createdAt || a.scheduled_date) {
        activities.push({
          id: `act-audit-sched-${a._id || a.id || a.audit_number}`,
          title: 'Audit scheduled',
          detail: `${a.audit_number || 'Audit'} • ${a.department || 'Inspection'}`,
          timestamp: new Date(a.scheduled_date || a.createdAt),
          icon: Calendar,
          iconBg: 'bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400',
        });
      }
    });

    activities.sort((a, b) => b.timestamp - a.timestamp);

    const formatTimeAgo = (date) => {
      if (!date || isNaN(date.getTime())) return 'Recently';
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    return activities.slice(0, 5).map((act) => ({
      ...act,
      time: formatTimeAgo(act.timestamp),
    }));
  }, [complaints, audits]);

  // ---------------------------------------------------------------------------
  // 9. QUICK INSIGHTS (Computed dynamically from current NC and Audit status)
  // ---------------------------------------------------------------------------
  const quickInsights = useMemo(() => {
    const insights = [];

    // 1. Overdue status
    if (metrics.overdueAudits > 0) {
      insights.push({
        id: 'ins-1',
        title: `${metrics.overdueAudits} ${metrics.overdueAudits === 1 ? 'audit is' : 'audits are'} overdue`,
        desc: 'Immediate action required to resolve pending audit items.',
        icon: AlertOctagon,
        iconColor: 'text-rose-600 dark:text-rose-400',
        cardBg: 'hover:bg-rose-50/50 dark:hover:bg-rose-950/20 border-rose-100 dark:border-rose-900/40',
        targetSec: 'audits',
      });
    } else {
      insights.push({
        id: 'ins-1',
        title: 'All audits on schedule',
        desc: '0 overdue audits across all factory departments.',
        icon: CheckCircle2,
        iconColor: 'text-emerald-600 dark:text-emerald-400',
        cardBg: 'hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/40',
        targetSec: 'audits',
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
        title: `${topDept} has highest NC count`,
        desc: `${topCount} NCs (${pct}% of total). Focus on recurring issues.`,
        icon: AlertTriangle,
        iconColor: 'text-amber-600 dark:text-amber-400',
        cardBg: 'hover:bg-amber-50/50 dark:hover:bg-amber-950/20 border-amber-100 dark:border-amber-900/40',
        targetSec: 'departments',
      });
    } else {
      insights.push({
        id: 'ins-2',
        title: 'Zero open non-conformances',
        desc: 'All factory departments operating within quality standards.',
        icon: CheckCircle2,
        iconColor: 'text-emerald-600 dark:text-emerald-400',
        cardBg: 'hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/40',
        targetSec: 'departments',
      });
    }

    // 3. CAP status
    const totalNCs = metrics.totalNCs;
    const pendingCAPs = metrics.pendingCAPs;
    if (pendingCAPs > 0) {
      insights.push({
        id: 'ins-3',
        title: `${pendingCAPs} CAPs awaiting verification`,
        desc: 'Review submitted action plans for root cause prevention.',
        icon: Hourglass,
        iconColor: 'text-sky-600 dark:text-cyan-400',
        cardBg: 'hover:bg-sky-50/50 dark:hover:bg-sky-950/20 border-sky-100 dark:border-sky-900/40',
        targetSec: 'nc-cap',
      });
    } else {
      insights.push({
        id: 'ins-3',
        title: 'All CAPs verified & up to date',
        desc: '100% of corrective action plans processed.',
        icon: CheckCircle2,
        iconColor: 'text-emerald-600 dark:text-emerald-400',
        cardBg: 'hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/40',
        targetSec: 'nc-cap',
      });
    }

    // 4. Resolution rate
    const resolutionRate = totalNCs > 0 ? Math.round((metrics.closedNCs / totalNCs) * 100) : 100;
    insights.push({
      id: 'ins-4',
      title: `NC resolution rate: ${resolutionRate}%`,
      desc: `${metrics.closedNCs} of ${totalNCs} NCs closed and verified.`,
      icon: CheckCheck,
      iconColor: 'text-purple-600 dark:text-purple-400',
      cardBg: 'hover:bg-purple-50/50 dark:hover:bg-purple-950/20 border-purple-100 dark:border-purple-900/40',
      targetSec: 'reports',
    });

    return insights;
  }, [metrics, complaints]);

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* -----------------------------------------------------------------------
          TOP HEADER: GREETING & CONTROLS (AuditPro Style)
          ----------------------------------------------------------------------- */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <span>{greetingText}</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Here's your audit and NC-CAP overview for today.
          </p>
        </div>

        {/* Header Right Controls: Date Range Dropdown, Search Input, Bell, Avatar */}
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

          {/* Search by Audit ID, NC ID, Department */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Audit ID, NC ID, Department..."
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

      {/* -----------------------------------------------------------------------
          ROW 1: 8 KPI METRIC CARDS (Exact Replica of AuditPro Grid)
          ----------------------------------------------------------------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2.5 sm:gap-3">
        {/* CARD 1: Total Audits */}
        <div
          onClick={() => onNavigateSection && onNavigateSection('audits')}
          className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between min-w-0"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
              <span className="p-1 rounded-lg bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-cyan-400 shrink-0">
                <ClipboardList className="w-3.5 h-3.5" />
              </span>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate" title="Total Audits">
                Total Audits
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono my-0.5 truncate">
              {metrics.totalAudits}
            </div>
            <div className="text-[10px] text-slate-400 font-medium truncate">
              <span className="text-blue-600 dark:text-cyan-400 font-bold">{metrics.completedAudits} of {metrics.totalAudits}</span> completed
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-blue-600 dark:text-cyan-400 font-bold group-hover:translate-x-0.5 transition-transform">
            <span>View all</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>

        {/* CARD 2: Completed Audits */}
        <div
          onClick={() => onNavigateSection && onNavigateSection('audits')}
          className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between min-w-0"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
              <span className="p-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </span>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate" title="Completed Audits">
                Completed Audits
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono my-0.5 truncate">
              {metrics.completedAudits}
            </div>
            <div className="text-[10px] text-slate-400 font-medium truncate">
              {metrics.totalAudits > 0 ? (
                <><span className="text-emerald-600 dark:text-emerald-400 font-bold">{Math.round((metrics.completedAudits / metrics.totalAudits) * 100)}%</span> completion rate</>
              ) : (
                <><span className="text-slate-400 font-bold">0%</span> completion rate</>
              )}
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-emerald-600 dark:text-emerald-400 font-bold group-hover:translate-x-0.5 transition-transform">
            <span>View all</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>

        {/* CARD 3: Scheduled Audits */}
        <div
          onClick={() => onNavigateSection && onNavigateSection('audits')}
          className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs hover:border-purple-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between min-w-0"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
              <span className="p-1 rounded-lg bg-purple-50 dark:bg-purple-950/80 text-purple-600 dark:text-purple-400 shrink-0">
                <Calendar className="w-3.5 h-3.5" />
              </span>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate" title="Scheduled Audits">
                Scheduled Audits
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono my-0.5 truncate">
              {metrics.scheduledAudits}
            </div>
            <div className="text-[10px] text-slate-400 font-medium truncate">
              <span className="text-purple-600 dark:text-purple-400 font-bold">{metrics.scheduledAudits}</span> pending inspection
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-purple-600 dark:text-purple-400 font-bold group-hover:translate-x-0.5 transition-transform">
            <span>View all</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>

        {/* CARD 4: Overdue Audits */}
        <div
          onClick={() => onNavigateSection && onNavigateSection('audits')}
          className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs hover:border-rose-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between min-w-0"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
              <span className="p-1 rounded-lg bg-rose-50 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 shrink-0">
                <Clock className="w-3.5 h-3.5" />
              </span>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate" title="Overdue Audits">
                Overdue Audits
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400 font-mono my-0.5 truncate">
              {metrics.overdueAudits}
            </div>
            <div className="text-[10px] text-slate-400 font-medium truncate">
              {metrics.overdueAudits > 0 ? (
                <><span className="text-rose-600 dark:text-rose-400 font-bold">{metrics.overdueAudits} overdue</span> requires action</>
              ) : (
                <><span className="text-emerald-600 dark:text-emerald-400 font-bold">0 overdue</span> on schedule</>
              )}
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-rose-600 dark:text-rose-400 font-bold group-hover:translate-x-0.5 transition-transform">
            <span>View details</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>

        {/* CARD 5: Total NCs */}
        <div
          onClick={() => onNavigateSection && onNavigateSection('nc-cap')}
          className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs hover:border-amber-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between min-w-0"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
              <span className="p-1 rounded-lg bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 shrink-0">
                <AlertTriangle className="w-3.5 h-3.5" />
              </span>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate" title="Total NCs">
                Total NCs
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono my-0.5 truncate">
              {metrics.totalNCs}
            </div>
            <div className="text-[10px] text-slate-400 font-medium truncate">
              <span className="text-amber-600 dark:text-amber-400 font-bold">{metrics.openNCs} active</span> NC records
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-amber-600 dark:text-amber-400 font-bold group-hover:translate-x-0.5 transition-transform">
            <span>View all</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>

        {/* CARD 6: Open NCs */}
        <div
          onClick={() => onNavigateSection && onNavigateSection('nc')}
          className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs hover:border-rose-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between min-w-0"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
              <span className="p-1 rounded-lg bg-rose-50 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 shrink-0">
                <AlertOctagon className="w-3.5 h-3.5" />
              </span>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate" title="Open NCs">
                Open NCs
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400 font-mono my-0.5 truncate">
              {metrics.openNCs}
            </div>
            <div className="text-[10px] text-slate-400 font-medium truncate">
              {metrics.totalNCs > 0 ? (
                <><span className="text-rose-600 dark:text-rose-400 font-bold">{Math.round((metrics.openNCs / metrics.totalNCs) * 100)}%</span> of total NCs</>
              ) : (
                <><span className="text-emerald-600 dark:text-emerald-400 font-bold">0%</span> active NCs</>
              )}
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-rose-600 dark:text-rose-400 font-bold group-hover:translate-x-0.5 transition-transform">
            <span>View all</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>

        {/* CARD 7: Closed NCs */}
        <div
          onClick={() => onNavigateSection && onNavigateSection('nc-cap')}
          className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between min-w-0"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
              <span className="p-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 shrink-0">
                <CheckCheck className="w-3.5 h-3.5" />
              </span>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate" title="Closed NCs">
                Closed NCs
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono my-0.5 truncate">
              {metrics.closedNCs}
            </div>
            <div className="text-[10px] text-slate-400 font-medium truncate">
              {metrics.totalNCs > 0 ? (
                <><span className="text-emerald-600 dark:text-emerald-400 font-bold">{Math.round((metrics.closedNCs / metrics.totalNCs) * 100)}%</span> resolution rate</>
              ) : (
                <><span className="text-slate-400 font-bold">0%</span> resolution rate</>
              )}
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-emerald-600 dark:text-emerald-400 font-bold group-hover:translate-x-0.5 transition-transform">
            <span>View all</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>

        {/* CARD 8: Pending CAPs */}
        <div
          onClick={() => onNavigateSection && onNavigateSection('cap')}
          className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs hover:border-sky-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between min-w-0"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
              <span className="p-1 rounded-lg bg-sky-50 dark:bg-sky-950/80 text-sky-600 dark:text-cyan-400 shrink-0">
                <Hourglass className="w-3.5 h-3.5" />
              </span>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate" title="Pending CAPs">
                Pending CAPs
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-sky-600 dark:text-cyan-400 font-mono my-0.5 truncate">
              {metrics.pendingCAPs}
            </div>
            <div className="text-[10px] text-slate-400 font-medium truncate">
              {metrics.pendingCAPs > 0 ? (
                <><span className="text-sky-600 dark:text-cyan-400 font-bold">{metrics.pendingCAPs} CAPs</span> awaiting review</>
              ) : (
                <><span className="text-emerald-600 dark:text-emerald-400 font-bold">All clear</span> 0 pending CAPs</>
              )}
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-sky-600 dark:text-cyan-400 font-bold group-hover:translate-x-0.5 transition-transform">
            <span>View all</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>
      </div>

      {/* -----------------------------------------------------------------------
          ROW 2: 3 ANALYTICS VISUALIZATIONS (Audit Performance, NC Severity, CAP Status)
          ----------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Visual 1: Audit Performance Trend (Combo Bar & Line Chart, 5 cols ~ 42%) */}
        <div className="xl:col-span-5 p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between min-w-0 overflow-hidden">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-cyan-400 shrink-0">
                  <TrendingUp className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    Audit Performance Trend
                  </h3>
                  <p className="text-xs text-slate-400 truncate">
                    Monthly audit completion rate and score trend
                  </p>
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-2.5 text-[10px] sm:text-[11px] font-semibold text-slate-600 dark:text-slate-400 shrink-0">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-xs bg-blue-600" />
                  <span>Completed</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-xs bg-sky-300" />
                  <span>Planned</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-1 rounded-full bg-indigo-600" />
                  <span>Score</span>
                </span>
              </div>
            </div>

            {/* SVG Combo Chart (Grouped Bars + Line on Dual Axis) */}
            <div className="relative h-56 w-full pt-2">
              {(() => {
                const maxTrendCount = Math.max(5, ...trendData.map((d) => Math.max(d.planned, d.completed)));

                const linePoints = trendData.map((d, i) => {
                  const x = 55 + i * 74 + 15;
                  const y = 170 - (Math.min(100, Math.max(0, d.score)) / 100) * 140;
                  return { x, y, score: d.score, month: d.month };
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

                    {/* Bars for Planned & Completed */}
                    {trendData.map((d, i) => {
                      const groupX = 55 + i * 74;
                      const plannedHeight = maxTrendCount > 0 ? (d.planned / maxTrendCount) * 140 : 0;
                      const completedHeight = maxTrendCount > 0 ? (d.completed / maxTrendCount) * 140 : 0;

                      return (
                        <g key={d.month} className="cursor-pointer group">
                          {/* Planned Audits Bar (Sky blue) */}
                          <rect
                            x={groupX}
                            y={170 - plannedHeight}
                            width="14"
                            height={plannedHeight}
                            rx="3"
                            fill="#7dd3fc"
                            className="transition-all hover:opacity-80"
                          >
                            <title>{`${d.month} Planned: ${d.planned}`}</title>
                          </rect>

                          {/* Completed Audits Bar (Blue 600) */}
                          <rect
                            x={groupX + 16}
                            y={170 - completedHeight}
                            width="14"
                            height={completedHeight}
                            rx="3"
                            fill="#2563eb"
                            className="transition-all hover:opacity-90"
                          >
                            <title>{`${d.month} Completed: ${d.completed}`}</title>
                          </rect>

                          {/* Month X label */}
                          <text
                            x={groupX + 15}
                            y="188"
                            fontSize="10"
                            fontWeight="600"
                            fill="#64748b"
                            textAnchor="middle"
                          >
                            {d.month}
                          </text>
                        </g>
                      );
                    })}

                    {/* Score Line */}
                    <g>
                      <path
                        d={dPath}
                        fill="none"
                        stroke="#1e40af"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                      {linePoints.map((pt, idx) => (
                        <circle
                          key={idx}
                          cx={pt.x}
                          cy={pt.y}
                          r="4"
                          fill="#1e40af"
                          stroke="#ffffff"
                          strokeWidth="2"
                          className="cursor-pointer hover:r-6 transition-all"
                        >
                          <title>{`${pt.month} Score: ${pt.score}%`}</title>
                        </circle>
                      ))}
                    </g>
                  </svg>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Visual 2: NC Severity Breakdown (Donut Chart, 3 cols) */}
        <div className="col-span-1 sm:col-span-6 xl:col-span-3 p-4 sm:p-4.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between min-w-0 overflow-hidden">
          <div>
            <div className="flex items-center justify-between gap-1 mb-3">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="p-1.5 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </span>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                  NC Severity Breakdown
                </h3>
              </div>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0 whitespace-nowrap">
                Total: {severityBreakdown.total}
              </span>
            </div>

            {/* Donut Chart with Center Text & Non-overlapping Legend */}
            <div className="flex items-center gap-3 sm:gap-4 my-2 min-w-0">
              <div className="relative w-26 h-26 sm:w-28 sm:h-28 shrink-0 flex items-center justify-center">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  {/* Background Track */}
                  <circle cx="50" cy="50" r="38" stroke="#f1f5f9" strokeWidth="13" fill="transparent" className="dark:stroke-slate-800" />
                  {/* High (Rose) */}
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    stroke="#f43f5e"
                    strokeWidth="13"
                    fill="transparent"
                    strokeDasharray={`${(severityBreakdown.high.pct * 238.76) / 100} 238.76`}
                    strokeDashoffset="0"
                  />
                  {/* Medium (Amber) */}
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
                  {/* Low (Emerald) */}
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    stroke="#10b981"
                    strokeWidth="13"
                    fill="transparent"
                    strokeDasharray={`${(severityBreakdown.low.pct * 238.76) / 100} 238.76`}
                    strokeDashoffset={`-${((severityBreakdown.high.pct + severityBreakdown.med.pct) * 238.76) / 100}`}
                  />
                </svg>

                {/* Donut Center Text */}
                <div className="absolute text-center pointer-events-none">
                  <div className="text-lg sm:text-xl font-black text-slate-900 dark:text-white font-mono leading-none">
                    {severityBreakdown.total}
                  </div>
                  <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Total NCs</div>
                </div>
              </div>

              {/* Legend List */}
              <div className="space-y-1.5 text-xs flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 py-0.5">
                  <span className="flex items-center gap-1.5 min-w-0 font-medium text-slate-700 dark:text-slate-300">
                    <span className="w-2 h-2 rounded-full shrink-0 bg-rose-500" />
                    <span className="truncate whitespace-nowrap text-[11px]">High</span>
                  </span>
                  <span className="font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200 shrink-0 whitespace-nowrap pl-1">
                    {severityBreakdown.high.count} <span className="text-[10px] text-slate-400 font-normal">({severityBreakdown.high.pct}%)</span>
                  </span>
                </div>

                <div className="flex items-center justify-between gap-1 py-0.5">
                  <span className="flex items-center gap-1.5 min-w-0 font-medium text-slate-700 dark:text-slate-300">
                    <span className="w-2 h-2 rounded-full shrink-0 bg-amber-500" />
                    <span className="truncate whitespace-nowrap text-[11px]">Medium</span>
                  </span>
                  <span className="font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200 shrink-0 whitespace-nowrap pl-1">
                    {severityBreakdown.med.count} <span className="text-[10px] text-slate-400 font-normal">({severityBreakdown.med.pct}%)</span>
                  </span>
                </div>

                <div className="flex items-center justify-between gap-1 py-0.5">
                  <span className="flex items-center gap-1.5 min-w-0 font-medium text-slate-700 dark:text-slate-300">
                    <span className="w-2 h-2 rounded-full shrink-0 bg-emerald-500" />
                    <span className="truncate whitespace-nowrap text-[11px]">Low</span>
                  </span>
                  <span className="font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200 shrink-0 whitespace-nowrap pl-1">
                    {severityBreakdown.low.count} <span className="text-[10px] text-slate-400 font-normal">({severityBreakdown.low.pct}%)</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Visual 3: CAP Status Breakdown (Donut Chart, 4 cols) */}
        <div className="col-span-1 sm:col-span-6 xl:col-span-4 p-4 sm:p-4.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between min-w-0 overflow-hidden">
          <div>
            <div className="flex items-center justify-between gap-1 mb-3">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="p-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </span>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                  CAP Status
                </h3>
              </div>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0 whitespace-nowrap">
                Total: {capStatusBreakdown.total}
              </span>
            </div>

            {/* Donut Chart with Center Text & Non-overlapping Legend */}
            <div className="flex items-center gap-3 sm:gap-4 my-2 min-w-0">
              <div className="relative w-26 h-26 sm:w-28 sm:h-28 shrink-0 flex items-center justify-center">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle cx="50" cy="50" r="38" stroke="#f1f5f9" strokeWidth="13" fill="transparent" className="dark:stroke-slate-800" />
                  {/* Submitted (Emerald) */}
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
                  {/* Pending (Amber) */}
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
                  <div className="text-lg sm:text-xl font-black text-slate-900 dark:text-white font-mono leading-none">
                    {capStatusBreakdown.total}
                  </div>
                  <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Total NCs</div>
                </div>
              </div>

              {/* Legend List */}
              <div className="space-y-1.5 text-xs flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 py-0.5">
                  <span className="flex items-center gap-1.5 min-w-0 font-medium text-slate-700 dark:text-slate-300">
                    <span className="w-2 h-2 rounded-full shrink-0 bg-emerald-500" />
                    <span className="truncate whitespace-nowrap text-[11px]">Submitted</span>
                  </span>
                  <span className="font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200 shrink-0 whitespace-nowrap pl-1">
                    {capStatusBreakdown.submitted.count} <span className="text-[10px] text-slate-400 font-normal">({capStatusBreakdown.submitted.pct}%)</span>
                  </span>
                </div>

                <div className="flex items-center justify-between gap-1 py-0.5">
                  <span className="flex items-center gap-1.5 min-w-0 font-medium text-slate-700 dark:text-slate-300">
                    <span className="w-2 h-2 rounded-full shrink-0 bg-blue-500" />
                    <span className="truncate whitespace-nowrap text-[11px]">In Progress</span>
                  </span>
                  <span className="font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200 shrink-0 whitespace-nowrap pl-1">
                    {capStatusBreakdown.inProgress.count} <span className="text-[10px] text-slate-400 font-normal">({capStatusBreakdown.inProgress.pct}%)</span>
                  </span>
                </div>

                <div className="flex items-center justify-between gap-1 py-0.5">
                  <span className="flex items-center gap-1.5 min-w-0 font-medium text-slate-700 dark:text-slate-300">
                    <span className="w-2 h-2 rounded-full shrink-0 bg-amber-500" />
                    <span className="truncate whitespace-nowrap text-[11px]">Pending</span>
                  </span>
                  <span className="font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200 shrink-0 whitespace-nowrap pl-1">
                    {capStatusBreakdown.pending.count} <span className="text-[10px] text-slate-400 font-normal">({capStatusBreakdown.pending.pct}%)</span>
                  </span>
                </div>

                <div className="flex items-center justify-between gap-1 py-0.5">
                  <span className="flex items-center gap-1.5 min-w-0 font-medium text-slate-700 dark:text-slate-300">
                    <span className="w-2 h-2 rounded-full shrink-0 bg-rose-500" />
                    <span className="truncate whitespace-nowrap text-[11px]">Not Submitted</span>
                  </span>
                  <span className="font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200 shrink-0 whitespace-nowrap pl-1">
                    {capStatusBreakdown.notSubmitted.count} <span className="text-[10px] text-slate-400 font-normal">({capStatusBreakdown.notSubmitted.pct}%)</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* -----------------------------------------------------------------------
          ROW 3: 2 OPERATIONAL TABLES (Department Performance & Overdue Work)
          ----------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Table 1: Department Performance (7 cols ~ 58%) */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600">
                  <Building2 className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Department Performance
                  </h3>
                  <p className="text-xs text-slate-400">
                    Audit score, NCs and CAP status by department
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onNavigateSection && onNavigateSection('departments')}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-cyan-400 flex items-center gap-1 cursor-pointer"
              >
                <span>View All Departments</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 text-[11px] font-bold text-slate-500">
                    <th className="py-2.5 px-4">Department</th>
                    <th className="py-2.5 px-3 text-center">Audits</th>
                    <th className="py-2.5 px-4">Score</th>
                    <th className="py-2.5 px-3 text-center">Total NCs</th>
                    <th className="py-2.5 px-3 text-center text-rose-600">Open NCs</th>
                    <th className="py-2.5 px-3 text-center text-emerald-600">Closed NCs</th>
                    <th className="py-2.5 px-3 text-center">Pending CAPs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {departmentPerformanceList.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-8 text-center text-slate-400">
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
                        <td className="py-2.5 px-3 text-center font-mono font-semibold text-slate-700 dark:text-slate-300">
                          {d.audits}
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-[11px] text-slate-800 dark:text-slate-200 w-8">
                              {d.score}%
                            </span>
                            <div className="w-20 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full"
                                style={{ width: `${d.score}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800 dark:text-slate-200">
                          {d.totalNC}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-rose-600 dark:text-rose-400">
                          {d.openNC}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {d.closedNC}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-600 dark:text-slate-400">
                          {d.pendingCAP}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Table 2: Overdue & Pending Work (5 cols ~ 42%) */}
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
                    Tasks that need immediate attention
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
                        <p className="text-xs text-slate-400">No overdue audits, NCs, or pending CAPs found.</p>
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
                              item.type === 'Audit'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950 dark:text-cyan-300'
                                : item.type === 'NC'
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
                              item.priority === 'High'
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
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="p-1.5 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600">
                <Layers className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Department-wise NCs
                </h3>
                <p className="text-xs text-slate-400">
                  Total NCs raised in each department
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-1">
              {departmentNCBars.length === 0 || departmentNCBars.every((d) => d.count === 0) ? (
                <div className="py-6 text-center text-slate-400">
                  <CheckCircle2 className="w-6 h-6 mx-auto mb-1.5 text-emerald-500 opacity-80" />
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">No non-conformances</p>
                  <p className="text-[11px] text-slate-400">All departments currently have 0 NCs recorded.</p>
                </div>
              ) : (
                (() => {
                  const maxNC = Math.max(1, ...departmentNCBars.map((d) => d.count));
                  return departmentNCBars.map((item) => (
                    <div key={item.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                        <span>{item.name}</span>
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          {item.count}
                        </span>
                      </div>
                      <div className={`w-full h-2 rounded-full ${item.barBg} overflow-hidden`}>
                        <div
                          className={`h-full rounded-full ${item.color} transition-all duration-500`}
                          style={{ width: `${(item.count / maxNC) * 100}%` }}
                        />
                      </div>
                    </div>
                  ));
                })()
              )}
            </div>
          </div>
        </div>

        {/* Widget 2: Recent Activity (Chronological Audit/NC Feed) */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600">
                  <Zap className="w-4 h-4" />
                </span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Recent Activity
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigateSection && onNavigateSection('reports')}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-cyan-400 flex items-center gap-1 cursor-pointer"
              >
                <span>View All</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              {recentActivities.length === 0 ? (
                <div className="py-6 text-center text-slate-400">
                  <Clock className="w-6 h-6 mx-auto mb-1.5 text-slate-400 opacity-60" />
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">No recent activity</p>
                  <p className="text-[11px] text-slate-400">Live audit and NC events will appear here.</p>
                </div>
              ) : (
                recentActivities.map((act) => {
                  const IconComponent = act.icon;
                  return (
                    <div
                      key={act.id}
                      className="flex items-start justify-between gap-3 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <div className="flex items-start gap-2.5">
                        <span className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${act.iconBg}`}>
                          <IconComponent className="w-3.5 h-3.5" />
                        </span>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                            {act.title}
                          </h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {act.detail}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">
                        {act.time}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Widget 3: Quick Insights (Actionable Cards) */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="p-1.5 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600">
                <Lightbulb className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Quick Insights
                </h3>
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
                    onNavigateSection(selectedInspectionItem.type === 'Audit' ? 'audits' : 'nc-cap');
                  }
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
              >
                Open Full Workbench
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
    </div>
  );
};

export default AuditProDashboard;
