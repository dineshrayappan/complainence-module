import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  ShieldCheck,
  Search,
  Filter,
  CheckCheck,
  ChevronDown,
  Info,
  Repeat,
  UserCheck,
  Calendar,
  User,
  Users,
  Flame,
  Building2,
  ExternalLink,
  Eye,
  RefreshCw,
  SlidersHorizontal,
  TrendingUp,
  Maximize2,
  ChevronRight,
  Sparkles,
  X,
  AlertCircle,
  RotateCcw,
  FileCheck,
  ArrowRight,
  ShieldAlert,
  ArrowLeft,
  CheckCircle,
  XCircle,
  Camera,
  ZoomIn,
  Briefcase,
  Phone,
  Mail,
  BadgeCheck,
  Shield,
  HelpCircle,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '../context/AuthContext';
import { userService, departmentService } from '../services/api';

export const ReportsView = ({
  complaints = [],
  departmentData = null,
  onViewDetails = null,
  onNavigateNC = null,
}) => {
  const { user } = useAuth();
  const [downloadingCSV, setDownloadingCSV] = useState(false);
  const [downloadingPDF, setDownloadingPDF] = useState(false);

  // ---------------------------------------------------------------------------
  // REPORT VIEW NAVIGATION MODES (Preserving Master Register & Adding 3 New Modes)
  // ---------------------------------------------------------------------------
  // 'audit-register': Master Audit Register (KPI Scorecard, Filter Bar, Charts, Table)
  // 'dept-report': Department-wise NC Report (Total NCs, Open/Closed/Pending, CAP Status, Drilldown)
  // 'members-report': Department Members Report (Roster, Assigned NCs, Open/Closed/Pending, CAP Status)
  // 'member-detail': Individual Member NC Details (NC ID, Finding, Requirement, CAP 5-Why, Photos, Verification)
  const [activeReportTab, setActiveReportTab] = useState('audit-register');
  const [selectedDeptDetail, setSelectedDeptDetail] = useState(null);
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [lightboxPhoto, setLightboxPhoto] = useState(null);

  // ---------------------------------------------------------------------------
  // REAL DATABASE MASTER DATA (Users & Departments)
  // ---------------------------------------------------------------------------
  const [usersList, setUsersList] = useState([]);
  const [dbDepartments, setDbDepartments] = useState([]);
  const [loadingMasterData, setLoadingMasterData] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchMasterData = async () => {
      setLoadingMasterData(true);
      try {
        const [uRes, dRes] = await Promise.allSettled([
          userService.getAllUsers(),
          departmentService.getDepartments(),
        ]);
        if (isMounted) {
          if (uRes.status === 'fulfilled' && uRes.value?.data) {
            const list = Array.isArray(uRes.value.data)
              ? uRes.value.data
              : uRes.value.data.users || [];
            setUsersList(list);
          }
          if (dRes.status === 'fulfilled' && dRes.value?.data) {
            const depts = Array.isArray(dRes.value.data)
              ? dRes.value.data
              : dRes.value.data.departments || [];
            setDbDepartments(depts);
          }
        }
      } catch (err) {
        console.warn('Could not load master users/depts:', err);
      } finally {
        if (isMounted) setLoadingMasterData(false);
      }
    };
    fetchMasterData();
    return () => {
      isMounted = false;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // FILTER STATES (Fulfilling all user requirements + dropdown filters)
  // ---------------------------------------------------------------------------
  // 1. Search & Free text
  const [searchTerm, setSearchTerm] = useState('');

  // 2. Date Range Filter
  const [datePreset, setDatePreset] = useState('ALL'); // 'ALL' | 'TODAY' | '7D' | '30D' | 'THIS_MONTH' | 'CUSTOM'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // 3. Department Wise Filter
  const [departmentFilter, setDepartmentFilter] = useState('ALL');

  // 4. Individual Member Filter
  const [memberFilter, setMemberFilter] = useState('ALL');

  // 5. NC Status Filter
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'OPEN' | 'CAP_SUBMITTED' | 'UNDER_REVIEW' | 'REWORK' | 'CLOSED' | 'OVERDUE'

  // 6. Risk / Severity Filter
  const [riskFilter, setRiskFilter] = useState('ALL'); // 'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

  // 7. CAP Status Filter
  const [capStatusFilter, setCapStatusFilter] = useState('ALL'); // 'ALL' | 'CAP_COMPLETED' | 'CAP_PENDING' | 'CAP_REQUIRED_OPEN' | 'NO_CAP_DIRECT'

  // 8. Responsible Person & Auditor Filter
  const [responsibleFilter, setResponsibleFilter] = useState('ALL');
  const [auditorFilter, setAuditorFilter] = useState('ALL');

  // 9. Aging & Repeat NC Filter
  const [agingFilter, setAgingFilter] = useState('ALL'); // 'ALL' | 'FRESH' | 'MODERATE' | 'HIGH' | 'SEVERE'
  const [repeatFilter, setRepeatFilter] = useState('ALL'); // 'ALL' | 'REPEAT' | 'SINGLE'

  // 10. Export Scope & Drill-Down Modal State
  const [exportScope, setExportScope] = useState('FILTERED'); // 'FILTERED' | 'ALL'
  const [drilldownComplaint, setDrilldownComplaint] = useState(null);
  const [showFiltersExpanded, setShowFiltersExpanded] = useState(true);

  // ---------------------------------------------------------------------------
  // DATA HELPERS & NORMALIZERS
  // ---------------------------------------------------------------------------
  const norm = (s) => (s || '').trim().toLowerCase();

  const isDeptMatch = (d1, d2) => {
    const a = norm(d1);
    const b = norm(d2);
    if (!a || !b) return false;
    return a === b || a.includes(b) || b.includes(a);
  };

  const getFindingText = (c) => {
    return (
      c.describeFinding ||
      c.findingDescription ||
      c.description ||
      c.title ||
      'No defect description logged.'
    );
  };

  const getIssueKey = (c) => {
    const finding = (
      c.describeFinding ||
      c.findingDescription ||
      c.description ||
      c.title ||
      ''
    )
      .trim()
      .toLowerCase();
    if (finding && finding !== 'no defect description logged.') return finding;
    return (c.category || 'General Quality Defect').trim().toLowerCase();
  };

  const issueFrequencyMap = useMemo(() => {
    const map = {};
    (complaints || []).forEach((c) => {
      const key = getIssueKey(c);
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [complaints]);

  const getIssueFrequency = (c) => {
    const key = getIssueKey(c);
    return issueFrequencyMap[key] || 1;
  };

  const getImmediateCorrectionText = (c) => {
    return (
      c.cap?.immediateCorrection ||
      c.cap?.immediateContainment ||
      c.actionNotes ||
      'Pending immediate containment action from supervisor.'
    );
  };

  const getRootCauseText = (c) => {
    return (
      c.cap?.rootCause ||
      c.feedbackRemarks ||
      c.actionNotes ||
      'Pending 5-Why root cause analysis.'
    );
  };

  const getCorrectiveActionText = (c) => {
    return (
      c.cap?.correctiveAction ||
      c.actionNotes ||
      'Pending corrective action execution.'
    );
  };

  const getPreventiveActionText = (c) => {
    return (
      c.cap?.preventiveAction ||
      'Pending systemic recurrence prevention procedure.'
    );
  };

  const getAssignedToName = (c) => {
    if (c.assignedTo?.name && c.assignedTo.name !== 'Unassigned') {
      return c.assignedTo.name;
    }
    if (
      typeof c.cap?.responsiblePerson === 'object' &&
      c.cap?.responsiblePerson?.name
    ) {
      return c.cap.responsiblePerson.name;
    }
    if (
      typeof c.cap?.responsiblePerson === 'string' &&
      c.cap.responsiblePerson.trim()
    ) {
      return c.cap.responsiblePerson.trim();
    }
    return c.assignedTo?.name || 'Assigned Line In-Charge';
  };

  const getResponsiblePerson = (c) => {
    return getAssignedToName(c);
  };

  const getAuditorName = (c) => {
    return c.createdBy?.name || 'Quality Team Auditor';
  };

  const getCapTargetDate = (c) => {
    if (c.cap?.targetDate) return new Date(c.cap.targetDate).toLocaleDateString();
    if (c.deadlineTimestamp)
      return new Date(c.deadlineTimestamp).toLocaleDateString();
    return 'Not Specified';
  };

  const getTicketAgeHours = (c) => {
    const createdTime = new Date(c.createdAt || Date.now()).getTime();
    const endTime =
      (c.status === 'Closed' || c.status === 'Verified') && c.actualCompletedAt
        ? new Date(c.actualCompletedAt).getTime()
        : Date.now();
    return Math.max(0, (endTime - createdTime) / (1000 * 3600));
  };

  const getTicketAgeLabel = (c) => {
    const hours = getTicketAgeHours(c);
    if (hours < 24) return `${Math.round(hours)}h (Fresh)`;
    const days = Math.round(hours / 24);
    return `${days}d aged`;
  };

  // ---------------------------------------------------------------------------
  // CONSOLIDATED MASTER DATASETS (Exact DB mappings without duplication)
  // ---------------------------------------------------------------------------
  // 1. Consolidated Departments List (DB + distinct in complaints)
  const consolidatedDepartmentsList = useMemo(() => {
    const deptMap = new Map();

    // From DB departments collection
    (dbDepartments || []).forEach((d) => {
      if (d.name && d.name.trim()) {
        const key = norm(d.name);
        deptMap.set(key, {
          name: d.name.trim(),
          code: d.code || '',
          manager: d.manager || '',
          headcount: d.headcount || 0,
        });
      }
    });

    // From distinct complaints department field
    (complaints || []).forEach((c) => {
      if (c.department && c.department.trim()) {
        const key = norm(c.department);
        if (!deptMap.has(key)) {
          deptMap.set(key, {
            name: c.department.trim(),
            code: '',
            manager: '',
            headcount: 0,
          });
        }
      }
    });

    return Array.from(deptMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [dbDepartments, complaints]);

  // 2. Consolidated Members List (Users collection + assigned supervisors in complaints)
  const consolidatedMembersList = useMemo(() => {
    const memberMap = new Map();

    // From DB users collection
    (usersList || []).forEach((u) => {
      const idKey = String(u.id || u._id || u.employeeId || u.name);
      const nameKey = norm(u.name);
      const empKey = norm(u.employeeId);

      const memObj = {
        id: idKey,
        employeeId: u.employeeId || '',
        name: u.name || 'Unnamed Staff',
        department: u.department || 'Production',
        designation: u.designation || 'Supervisor',
        role: u.role || 'ACTION_PERSON',
        mobileNumber: u.mobileNumber || '',
        email: u.email || '',
        isActive: u.isActive !== false,
      };

      memberMap.set(idKey, memObj);
      if (nameKey) memberMap.set(`name:${nameKey}`, memObj);
      if (empKey) memberMap.set(`emp:${empKey}`, memObj);
    });

    // From complaints.assignedTo to ensure anyone assigned an NC is included
    (complaints || []).forEach((c) => {
      const a = c.assignedTo;
      if (a && a.name && a.name !== 'Unassigned') {
        const nameKey = norm(a.name);
        const empKey = a.employeeId ? norm(a.employeeId) : null;
        if (!memberMap.has(`name:${nameKey}`) && (!empKey || !memberMap.has(`emp:${empKey}`))) {
          const customId = a.userId || a.employeeId || `mem-${a.name}`;
          const customObj = {
            id: String(customId),
            employeeId: a.employeeId || '',
            name: a.name,
            department: a.department || c.department || 'Production',
            designation: a.designation || 'Production Supervisor',
            role: 'ACTION_PERSON',
            mobileNumber: a.mobileNumber || '',
            email: '',
            isActive: true,
          };
          memberMap.set(String(customId), customObj);
          memberMap.set(`name:${nameKey}`, customObj);
          if (empKey) memberMap.set(`emp:${empKey}`, customObj);
        }
      }
    });

    // Extract unique array
    const unique = [];
    const seen = new Set();
    memberMap.forEach((m) => {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        unique.push(m);
      }
    });

    return unique.sort((a, b) => a.name.localeCompare(b.name));
  }, [usersList, complaints]);

  // Helper: Match complaint to member
  const isComplaintAssignedToMember = (c, member) => {
    if (!member || !c) return false;
    const mId = String(member.id || member._id || '');
    const mEmp = member.employeeId ? norm(member.employeeId) : '';
    const mName = member.name ? norm(member.name) : '';

    // Direct assignedTo object
    if (c.assignedTo) {
      const cUid = String(c.assignedTo.userId || c.assignedTo.id || c.assignedTo._id || '');
      if (mId && cUid && cUid === mId) return true;
      if (mEmp && c.assignedTo.employeeId && norm(c.assignedTo.employeeId) === mEmp) return true;
      if (mName && c.assignedTo.name && norm(c.assignedTo.name) === mName) return true;
    }

    // Normalized assigned name
    const resolvedName = norm(getAssignedToName(c));
    if (mName && resolvedName === mName) return true;

    // CAP responsiblePerson
    if (c.cap?.responsiblePerson) {
      if (typeof c.cap.responsiblePerson === 'object') {
        const capUid = String(
          c.cap.responsiblePerson.id ||
          c.cap.responsiblePerson._id ||
          c.cap.responsiblePerson.userId ||
          ''
        );
        if (mId && capUid && capUid === mId) return true;
        if (mEmp && c.cap.responsiblePerson.employeeId && norm(c.cap.responsiblePerson.employeeId) === mEmp) return true;
        if (mName && c.cap.responsiblePerson.name && norm(c.cap.responsiblePerson.name) === mName) return true;
      } else if (typeof c.cap.responsiblePerson === 'string' && mName) {
        if (norm(c.cap.responsiblePerson) === mName) return true;
      }
    }

    return false;
  };

  // ---------------------------------------------------------------------------
  // DYNAMIC FILTER OPTION EXTRACTORS
  // ---------------------------------------------------------------------------
  const departmentCounts = useMemo(() => {
    const counts = {};
    (complaints || []).forEach((c) => {
      const dept = c.department || 'Unassigned';
      counts[dept] = (counts[dept] || 0) + 1;
    });
    return counts;
  }, [complaints]);

  const responsibleList = useMemo(() => {
    const set = new Set();
    (complaints || []).forEach((c) => {
      const name = getAssignedToName(c);
      if (name && name !== 'Unassigned' && name !== 'Assigned Line In-Charge') {
        set.add(name);
      }
    });
    return Array.from(set).sort();
  }, [complaints]);

  const auditorList = useMemo(() => {
    const set = new Set();
    (complaints || []).forEach((c) => {
      const name = c.createdBy?.name;
      if (name && name.trim()) {
        set.add(name.trim());
      }
    });
    return Array.from(set).sort();
  }, [complaints]);

  // ---------------------------------------------------------------------------
  // MULTI-DIMENSIONAL FILTERING LOGIC
  // ---------------------------------------------------------------------------
  const filteredComplaints = useMemo(() => {
    return complaints.filter((c) => {
      // 1. Status Filter
      if (statusFilter !== 'ALL') {
        if (
          statusFilter === 'OPEN' &&
          !['Open', 'Assigned', 'In Progress'].includes(c.status)
        )
          return false;
        if (statusFilter === 'CAP_SUBMITTED' && c.status !== 'CAP Submitted')
          return false;
        if (
          statusFilter === 'UNDER_REVIEW' &&
          !['CAP Submitted', 'Under Review', 'Under Verification'].includes(
            c.status
          )
        )
          return false;
        if (statusFilter === 'REWORK' && c.status !== 'Rejected / Rework')
          return false;
        if (
          statusFilter === 'CLOSED' &&
          !['Closed', 'Verified'].includes(c.status)
        )
          return false;
        if (statusFilter === 'OVERDUE') {
          const isClosed = c.status === 'Closed' || c.status === 'Verified';
          const isOverdue =
            !isClosed &&
            c.deadlineTimestamp &&
            Date.now() > new Date(c.deadlineTimestamp).getTime();
          if (!isOverdue) return false;
        }
      }

      // 2. Risk / Priority Filter
      if (riskFilter !== 'ALL') {
        const cRisk = (
          c.priority ||
          c.riskSeverity ||
          c.risk ||
          'MEDIUM'
        ).toUpperCase();
        if (cRisk !== riskFilter) return false;
      }

      // 3. Department Filter
      if (departmentFilter !== 'ALL') {
        if (!isDeptMatch(c.department, departmentFilter)) return false;
      }

      // 4. Individual Member Filter
      if (memberFilter !== 'ALL') {
        const targetMem = consolidatedMembersList.find((m) => m.id === memberFilter);
        if (!isComplaintAssignedToMember(c, targetMem)) return false;
      }

      // 5. CAP Status Filter
      if (capStatusFilter !== 'ALL') {
        const isClosed = c.status === 'Closed' || c.status === 'Verified';
        const isCapEffective = c.cap?.verifiedEffective === true;
        const isCapPending = ['CAP Submitted', 'Under Review', 'Under Verification'].includes(c.status);
        const isOpenNoCap = c.capRequired && ['Open', 'Assigned', 'In Progress'].includes(c.status);

        if (capStatusFilter === 'CAP_COMPLETED' && !(isClosed || isCapEffective))
          return false;
        if (capStatusFilter === 'CAP_PENDING' && !isCapPending)
          return false;
        if (capStatusFilter === 'CAP_REQUIRED_OPEN' && !isOpenNoCap)
          return false;
        if (capStatusFilter === 'NO_CAP_DIRECT' && c.capRequired)
          return false;
      }

      // 6. Responsible Person Filter
      if (responsibleFilter !== 'ALL') {
        const respName = getAssignedToName(c).toLowerCase();
        if (!respName.includes(responsibleFilter.toLowerCase())) return false;
      }

      // 7. Auditor Filter
      if (auditorFilter !== 'ALL') {
        const audName = (c.createdBy?.name || '').toLowerCase();
        if (!audName.includes(auditorFilter.toLowerCase())) return false;
      }

      // 8. Aging Filter
      if (agingFilter !== 'ALL') {
        const ageHours = getTicketAgeHours(c);
        if (agingFilter === 'FRESH' && ageHours > 24) return false;
        if (agingFilter === 'MODERATE' && (ageHours <= 24 || ageHours > 72))
          return false;
        if (agingFilter === 'HIGH' && (ageHours <= 72 || ageHours > 168))
          return false;
        if (agingFilter === 'SEVERE' && ageHours <= 168) return false;
      }

      // 9. Repeat NC Filter
      if (repeatFilter !== 'ALL') {
        const freq = getIssueFrequency(c);
        if (repeatFilter === 'REPEAT' && freq <= 1) return false;
        if (repeatFilter === 'SINGLE' && freq > 1) return false;
      }

      // 10. Date Range Filter
      if (datePreset !== 'ALL' || startDate || endDate) {
        const created = new Date(
          c.createdAt || c.deadlineTimestamp || Date.now()
        );

        if (datePreset === 'TODAY') {
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          if (created < todayStart) return false;
        } else if (datePreset === '7D') {
          const d7 = new Date();
          d7.setDate(d7.getDate() - 7);
          if (created < d7) return false;
        } else if (datePreset === '30D') {
          const d30 = new Date();
          d30.setDate(d30.getDate() - 30);
          if (created < d30) return false;
        } else if (datePreset === 'THIS_MONTH') {
          const monthStart = new Date();
          monthStart.setDate(1);
          monthStart.setHours(0, 0, 0, 0);
          if (created < monthStart) return false;
        }

        if (startDate) {
          const s = new Date(startDate);
          s.setHours(0, 0, 0, 0);
          if (created < s) return false;
        }
        if (endDate) {
          const e = new Date(endDate);
          e.setHours(23, 59, 59, 999);
          if (created > e) return false;
        }
      }

      // 11. Free-text Search
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const matchesSearch =
          (c.complaintId || '').toLowerCase().includes(term) ||
          (c.department || '').toLowerCase().includes(term) ||
          (c.location || '').toLowerCase().includes(term) ||
          (c.category || '').toLowerCase().includes(term) ||
          (c.requirement || '').toLowerCase().includes(term) ||
          getFindingText(c).toLowerCase().includes(term) ||
          getAssignedToName(c).toLowerCase().includes(term) ||
          (c.createdBy?.name || '').toLowerCase().includes(term) ||
          getRootCauseText(c).toLowerCase().includes(term);

        if (!matchesSearch) return false;
      }

      return true;
    });
  }, [
    complaints,
    statusFilter,
    riskFilter,
    departmentFilter,
    memberFilter,
    capStatusFilter,
    responsibleFilter,
    auditorFilter,
    agingFilter,
    repeatFilter,
    datePreset,
    startDate,
    endDate,
    searchTerm,
    consolidatedMembersList,
  ]);

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchTerm.trim()) count++;
    if (datePreset !== 'ALL' || startDate || endDate) count++;
    if (departmentFilter !== 'ALL') count++;
    if (memberFilter !== 'ALL') count++;
    if (statusFilter !== 'ALL') count++;
    if (riskFilter !== 'ALL') count++;
    if (capStatusFilter !== 'ALL') count++;
    if (responsibleFilter !== 'ALL') count++;
    if (auditorFilter !== 'ALL') count++;
    if (agingFilter !== 'ALL') count++;
    if (repeatFilter !== 'ALL') count++;
    return count;
  }, [
    searchTerm,
    datePreset,
    startDate,
    endDate,
    departmentFilter,
    memberFilter,
    statusFilter,
    riskFilter,
    capStatusFilter,
    responsibleFilter,
    auditorFilter,
    agingFilter,
    repeatFilter,
  ]);

  const hasActiveFilters = activeFilterCount > 0;

  const handleResetFilters = () => {
    setSearchTerm('');
    setDatePreset('ALL');
    setStartDate('');
    setEndDate('');
    setDepartmentFilter('ALL');
    setMemberFilter('ALL');
    setStatusFilter('ALL');
    setRiskFilter('ALL');
    setCapStatusFilter('ALL');
    setResponsibleFilter('ALL');
    setAuditorFilter('ALL');
    setAgingFilter('ALL');
    setRepeatFilter('ALL');
  };

  const datasetToExport =
    exportScope === 'ALL' && hasActiveFilters
      ? complaints
      : filteredComplaints;

  // ---------------------------------------------------------------------------
  // OVERALL AUDIT METRICS (Accurate calculation without duplicates)
  // ---------------------------------------------------------------------------
  const totalNC = complaints.length;
  const filteredCount = filteredComplaints.length;
  const openCount = filteredComplaints.filter((c) =>
    ['Open', 'Assigned', 'In Progress'].includes(c.status)
  ).length;
  const pendingCount = filteredComplaints.filter((c) =>
    ['CAP Submitted', 'Under Review', 'Under Verification', 'Rejected / Rework', 'Draft'].includes(c.status)
  ).length;
  const closedCount = filteredComplaints.filter((c) =>
    ['Closed', 'Verified'].includes(c.status)
  ).length;
  const overdueCount = filteredComplaints.filter((c) => {
    if (['Closed', 'Verified'].includes(c.status)) return false;
    return (
      c.deadlineTimestamp &&
      Date.now() > new Date(c.deadlineTimestamp).getTime()
    );
  }).length;
  const criticalCount = filteredComplaints.filter(
    (c) => (c.priority || c.riskSeverity || '').toUpperCase() === 'CRITICAL'
  ).length;
  const repeatCount = filteredComplaints.filter(
    (c) => getIssueFrequency(c) > 1
  ).length;
  const slaRate =
    filteredCount > 0
      ? Math.round(((filteredCount - overdueCount) / filteredCount) * 100)
      : 100;
  const overallCapRate =
    filteredCount > 0
      ? Math.round((closedCount / filteredCount) * 100)
      : 100;

  // ---------------------------------------------------------------------------
  // 1. DEPARTMENT-WISE NC METRICS (Requirement 1)
  // ---------------------------------------------------------------------------
  const departmentStatsList = useMemo(() => {
    return consolidatedDepartmentsList.map((dept) => {
      const deptComplaints = filteredComplaints.filter((c) =>
        isDeptMatch(c.department, dept.name)
      );
      const allDeptComplaints = complaints.filter((c) =>
        isDeptMatch(c.department, dept.name)
      );

      const dTotal = deptComplaints.length;
      const dOpen = deptComplaints.filter((c) =>
        ['Open', 'Assigned', 'In Progress'].includes(c.status)
      ).length;
      const dClosed = deptComplaints.filter((c) =>
        ['Closed', 'Verified'].includes(c.status)
      ).length;
      const dPending = deptComplaints.filter((c) =>
        ['CAP Submitted', 'Under Review', 'Under Verification', 'Rejected / Rework', 'Draft'].includes(c.status)
      ).length;
      const dOverdue = deptComplaints.filter((c) => {
        if (['Closed', 'Verified'].includes(c.status)) return false;
        return c.deadlineTimestamp && Date.now() > new Date(c.deadlineTimestamp).getTime();
      }).length;
      const dCritical = deptComplaints.filter(
        (c) => (c.priority || c.riskSeverity || '').toUpperCase() === 'CRITICAL'
      ).length;

      const dCapRate = dTotal > 0 ? Math.round((dClosed / dTotal) * 100) : 100;

      let dCapStatusLabel = 'No NCs Logged';
      let dCapStatusBadge = 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      if (dTotal > 0) {
        if (dClosed === dTotal) {
          dCapStatusLabel = '100% CAP Completed';
          dCapStatusBadge = 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
        } else if (dPending > 0) {
          dCapStatusLabel = `${dPending} CAP in Review`;
          dCapStatusBadge = 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800';
        } else {
          dCapStatusLabel = `${dOpen} Open Actions Required`;
          dCapStatusBadge = 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
        }
      }

      // Department members
      const deptMembers = consolidatedMembersList.filter((m) =>
        isDeptMatch(m.department, dept.name)
      );

      return {
        department: dept.name,
        code: dept.code,
        manager: dept.manager,
        headcount: dept.headcount,
        totalNC: dTotal,
        openNC: dOpen,
        closedNC: dClosed,
        pendingNC: dPending,
        overdueNC: dOverdue,
        criticalNC: dCritical,
        capRate: dCapRate,
        capStatusLabel: dCapStatusLabel,
        capStatusBadge: dCapStatusBadge,
        members: deptMembers,
        complaints: deptComplaints,
        allCount: allDeptComplaints.length,
      };
    });
  }, [consolidatedDepartmentsList, filteredComplaints, complaints, consolidatedMembersList]);

  // ---------------------------------------------------------------------------
  // 2. DEPARTMENT MEMBERS REPORT METRICS (Requirement 2)
  // ---------------------------------------------------------------------------
  const memberStatsList = useMemo(() => {
    return consolidatedMembersList.map((m) => {
      const memberComplaints = filteredComplaints.filter((c) =>
        isComplaintAssignedToMember(c, m)
      );
      const allMemberComplaints = complaints.filter((c) =>
        isComplaintAssignedToMember(c, m)
      );

      const mTotal = memberComplaints.length;
      const mOpen = memberComplaints.filter((c) =>
        ['Open', 'Assigned', 'In Progress'].includes(c.status)
      ).length;
      const mClosed = memberComplaints.filter((c) =>
        ['Closed', 'Verified'].includes(c.status)
      ).length;
      const mPending = memberComplaints.filter((c) =>
        ['CAP Submitted', 'Under Review', 'Under Verification', 'Rejected / Rework', 'Draft'].includes(c.status)
      ).length;
      const mOverdue = memberComplaints.filter((c) => {
        if (['Closed', 'Verified'].includes(c.status)) return false;
        return c.deadlineTimestamp && Date.now() > new Date(c.deadlineTimestamp).getTime();
      }).length;
      const mCritical = memberComplaints.filter(
        (c) => (c.priority || c.riskSeverity || '').toUpperCase() === 'CRITICAL'
      ).length;

      const mCapRate = mTotal > 0 ? Math.round((mClosed / mTotal) * 100) : 100;

      let mCapStatusLabel = 'Clear (0 NCs)';
      let mCapStatusBadge = 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700';
      if (mTotal > 0) {
        if (mClosed === mTotal) {
          mCapStatusLabel = '100% Completed';
          mCapStatusBadge = 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
        } else if (mPending > 0) {
          mCapStatusLabel = `${mPending} CAP in Review`;
          mCapStatusBadge = 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800';
        } else {
          mCapStatusLabel = `${mOpen} Open Action Items`;
          mCapStatusBadge = 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
        }
      }

      return {
        ...m,
        totalNC: mTotal,
        openNC: mOpen,
        closedNC: mClosed,
        pendingNC: mPending,
        overdueNC: mOverdue,
        criticalNC: mCritical,
        capRate: mCapRate,
        capStatusLabel: mCapStatusLabel,
        capStatusBadge: mCapStatusBadge,
        complaints: memberComplaints,
        allCount: allMemberComplaints.length,
      };
    });
  }, [consolidatedMembersList, filteredComplaints, complaints]);

  // Active Selected Member for Individual Details View
  const activeMember = useMemo(() => {
    if (selectedMemberId) {
      const found = memberStatsList.find((m) => m.id === selectedMemberId);
      if (found) return found;
    }
    // Default to first member with complaints, or first member overall
    const withNCs = memberStatsList.find((m) => m.totalNC > 0);
    return withNCs || memberStatsList[0] || null;
  }, [selectedMemberId, memberStatsList]);

  // NCs assigned to active selected member
  const activeMemberComplaints = useMemo(() => {
    if (!activeMember) return [];
    return activeMember.complaints || [];
  }, [activeMember]);

  // Navigation handlers
  const handleInspectDepartment = (deptName) => {
    setSelectedDeptDetail(deptName);
    setActiveReportTab('dept-report');
  };

  const handleInspectMember = (member) => {
    setSelectedMemberId(member.id);
    setActiveReportTab('member-detail');
  };

  // ---------------------------------------------------------------------------
  // DYNAMIC PDF & CSV EXPORTS (Dispatched based on Active Report Mode)
  // ---------------------------------------------------------------------------
  const handleExportPDF = () => {
    setDownloadingPDF(true);
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4',
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 36;
      const contentWidth = pageWidth - margin * 2;

      // Palette
      const brandDark = [15, 23, 42];
      const brandPrimary = [37, 99, 235];
      const brandMuted = [100, 116, 139];
      const bgLight = [248, 250, 252];
      const borderLine = [226, 232, 240];

      // Top Ribbon
      doc.setFillColor(...brandPrimary);
      doc.rect(0, 0, pageWidth, 48, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text('GARMENT QUALITY MANAGEMENT SYSTEM (QMS)', margin, 28);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text('Audit & Compliance Directorate • Official Record', pageWidth - margin, 28, { align: 'right' });

      // Title & Subtitle based on active tab
      doc.setTextColor(...brandDark);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);

      let reportTitle = 'Master Non-Conformance & CAP Audit Register';
      if (activeReportTab === 'dept-report') {
        reportTitle = selectedDeptDetail
          ? `Department Audit Report: ${selectedDeptDetail}`
          : 'Department-wise Non-Conformance & CAP Matrix';
      } else if (activeReportTab === 'members-report') {
        reportTitle = 'Department Members NC & CAP Accountability Report';
      } else if (activeReportTab === 'member-detail') {
        reportTitle = `Member NC Audit Dossier: ${activeMember ? activeMember.name : 'Individual Member'}`;
      }
      doc.text(reportTitle, margin, 78);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...brandMuted);
      const generatedDate = new Date().toLocaleString();
      const genUser = user
        ? `${user.name} (${user.employeeId || 'N/A'}) • ${user.department || 'Quality Department'}`
        : 'System Administrator';
      doc.text(`Generated By: ${genUser}   |   Execution Date: ${generatedDate}`, margin, 93);

      // Active filters summary
      const filterNotes = [];
      if (departmentFilter !== 'ALL') filterNotes.push(`Dept: ${departmentFilter}`);
      if (memberFilter !== 'ALL') filterNotes.push(`Member: ${activeMember?.name || memberFilter}`);
      if (statusFilter !== 'ALL') filterNotes.push(`Status: ${statusFilter}`);
      if (riskFilter !== 'ALL') filterNotes.push(`Risk: ${riskFilter}`);
      if (capStatusFilter !== 'ALL') filterNotes.push(`CAP: ${capStatusFilter}`);
      if (datePreset !== 'ALL') filterNotes.push(`Range: ${datePreset}`);

      const scopeText = filterNotes.length > 0
        ? `Filtered Scope: ${filterNotes.join(' • ')}`
        : 'Scope: Full Factory Quality Audit Dataset (Unrestricted)';
      doc.text(scopeText, margin, 105);

      let startY = 120;

      // -----------------------------------------------------------------------
      // TAB 2: DEPARTMENT-WISE REPORT PDF
      // -----------------------------------------------------------------------
      if (activeReportTab === 'dept-report') {
        const deptRows = departmentStatsList.map((d) => [
          d.department,
          d.manager || 'Line Head',
          d.totalNC,
          d.openNC,
          d.closedNC,
          d.pendingNC,
          d.overdueNC,
          `${d.capRate}%`,
          d.capStatusLabel,
        ]);

        autoTable(doc, {
          startY,
          head: [[
            'Department',
            'Manager / In-Charge',
            'Total NCs',
            'Open',
            'Closed',
            'Pending',
            'Overdue',
            'CAP Rate',
            'CAP Status',
          ]],
          body: deptRows,
          theme: 'grid',
          headStyles: {
            fillColor: [37, 99, 235],
            textColor: [255, 255, 255],
            fontSize: 8,
            fontStyle: 'bold',
          },
          styles: {
            fontSize: 7.5,
            cellPadding: 4,
          },
          columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 100 },
            2: { halign: 'center', fontStyle: 'bold' },
            3: { halign: 'center', textColor: [217, 119, 6] },
            4: { halign: 'center', textColor: [16, 185, 129] },
            5: { halign: 'center', textColor: [124, 58, 237] },
            6: { halign: 'center', textColor: [225, 29, 72] },
            7: { halign: 'center', fontStyle: 'bold' },
          },
        });

        // If department drilled down, also print its NCs
        if (selectedDeptDetail) {
          const deptObj = departmentStatsList.find((d) => d.department === selectedDeptDetail);
          if (deptObj && deptObj.complaints.length > 0) {
            const nextY = doc.lastAutoTable.finalY + 20;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(...brandDark);
            doc.text(`Non-Conformance Register for ${selectedDeptDetail}`, margin, nextY);

            const ncRows = deptObj.complaints.map((c) => [
              c.complaintId || 'NC-N/A',
              getFindingText(c).slice(0, 50),
              getAssignedToName(c),
              (c.priority || c.riskSeverity || 'MEDIUM').toUpperCase(),
              c.status,
              c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'N/A',
              c.actualCompletedAt ? new Date(c.actualCompletedAt).toLocaleDateString() : 'Pending',
            ]);

            autoTable(doc, {
              startY: nextY + 8,
              head: [['NC ID', 'Defect Finding', 'Assigned To', 'Risk', 'Status', 'Logged', 'Closed']],
              body: ncRows,
              theme: 'striped',
              headStyles: { fillColor: [15, 23, 42], fontSize: 7.5 },
              styles: { fontSize: 7, cellPadding: 3 },
            });
          }
        }

        doc.save(`Garment_QMS_Department_NC_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
      }
      // -----------------------------------------------------------------------
      // TAB 3: DEPARTMENT MEMBERS REPORT PDF
      // -----------------------------------------------------------------------
      else if (activeReportTab === 'members-report') {
        const memRows = memberStatsList.map((m) => [
          m.name,
          m.employeeId || 'N/A',
          m.department,
          m.designation || 'Supervisor',
          m.totalNC,
          m.openNC,
          m.closedNC,
          m.pendingNC,
          `${m.capRate}%`,
          m.capStatusLabel,
        ]);

        autoTable(doc, {
          startY,
          head: [[
            'Member Name',
            'Employee ID',
            'Department',
            'Designation',
            'Total NCs',
            'Open',
            'Closed',
            'Pending',
            'CAP Rate',
            'Accountability Status',
          ]],
          body: memRows,
          theme: 'grid',
          headStyles: {
            fillColor: [79, 70, 229],
            textColor: [255, 255, 255],
            fontSize: 8,
            fontStyle: 'bold',
          },
          styles: { fontSize: 7.5, cellPadding: 4 },
          columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 90 },
            4: { halign: 'center', fontStyle: 'bold' },
            5: { halign: 'center', textColor: [217, 119, 6] },
            6: { halign: 'center', textColor: [16, 185, 129] },
            7: { halign: 'center', textColor: [124, 58, 237] },
            8: { halign: 'center', fontStyle: 'bold' },
          },
        });

        doc.save(`Garment_QMS_Department_Members_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
      }
      // -----------------------------------------------------------------------
      // TAB 4: INDIVIDUAL MEMBER NC DETAILS PDF
      // -----------------------------------------------------------------------
      else if (activeReportTab === 'member-detail') {
        const targetMem = activeMember;
        const ncList = activeMemberComplaints;

        // Member Profile Card
        doc.setFillColor(...bgLight);
        doc.setDrawColor(...borderLine);
        doc.roundedRect(margin, startY, contentWidth, 44, 4, 4, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...brandDark);
        doc.text(`Member Profile: ${targetMem?.name || 'N/A'} [${targetMem?.employeeId || 'N/A'}]`, margin + 10, startY + 16);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...brandMuted);
        doc.text(
          `Dept: ${targetMem?.department || 'Production'}   •   Designation: ${targetMem?.designation || 'Supervisor'}   •   Contact: ${targetMem?.mobileNumber || 'N/A'}`,
          margin + 10,
          startY + 30
        );

        const kpiText = `Assigned NCs: ${targetMem?.totalNC || 0}   |   Open: ${targetMem?.openNC || 0}   |   Closed: ${targetMem?.closedNC || 0}   |   Pending: ${targetMem?.pendingNC || 0}   |   CAP Rate: ${targetMem?.capRate || 100}%`;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(37, 99, 235);
        doc.text(kpiText, pageWidth - margin - 10, startY + 23, { align: 'right' });

        let currentY = startY + 54;

        if (ncList.length === 0) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(9);
          doc.setTextColor(...brandMuted);
          doc.text('No Non-Conformances currently assigned to this member.', margin, currentY + 20);
        } else {
          ncList.forEach((c, idx) => {
            if (currentY > doc.internal.pageSize.getHeight() - 120) {
              doc.addPage();
              currentY = 40;
            }

            const isOverdue =
              c.status !== 'Closed' &&
              c.status !== 'Verified' &&
              c.deadlineTimestamp &&
              Date.now() > new Date(c.deadlineTimestamp).getTime();

            const cRisk = (c.priority || c.riskSeverity || 'MEDIUM').toUpperCase();
            const createdDateStr = c.createdAt ? new Date(c.createdAt).toLocaleString() : 'N/A';
            const closedDateStr = c.actualCompletedAt
              ? new Date(c.actualCompletedAt).toLocaleString()
              : (c.status === 'Closed' ? 'Closed & Verified' : 'Pending Closure');

            const ncTableData = [
              [
                { content: `NC RECORD #${idx + 1}: ${c.complaintId || 'NC-N/A'} • Status: ${c.status} • Risk: ${cRisk}`, colSpan: 2, styles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' } }
              ],
              ['Department & Location:', `${c.department || 'Production'} • ${c.location || 'Floor Station'}`],
              ['Defect Finding Description:', `${getFindingText(c)}`],
              ['Quality Requirement / Standard:', `${c.requirement || 'AQL 1.5 Workmanship Standard'}`],
              ['Creation Date & Auditor:', `Created: ${createdDateStr} by ${getAuditorName(c)}`],
              ['5-Why Root Cause:', `${getRootCauseText(c)}`],
              ['Immediate Containment Action:', `${getImmediateCorrectionText(c)}`],
              ['Permanent Corrective Action:', `${getCorrectiveActionText(c)}`],
              ['Preventive Recurrence Plan:', `${getPreventiveActionText(c)}`],
              ['Verification Method & Condition:', `${c.verificationMethod || 'Physical Re-inspection'} • Condition: ${isOverdue ? 'Overdue SLA Breach' : 'Within SLA Window'}`],
              ['Auditor Notes & Closure Date:', `Closure: ${closedDateStr} • Verification Readiness: ${c.cap?.verificationReadinessNotes || 'Normal QMS Procedure'}`],
              ['Before & After Photo Proof:', `Before Photo: ${c.beforePhoto ? 'Captured' : 'No Photo'} | After Photo: ${c.afterPhoto ? 'Verified Proof Attached' : 'Pending After Proof'}`]
            ];

            autoTable(doc, {
              startY: currentY,
              body: ncTableData,
              theme: 'grid',
              styles: { fontSize: 7, cellPadding: 2.5 },
              columnStyles: {
                0: { cellWidth: 140, fontStyle: 'bold', textColor: [51, 65, 85] },
                1: { cellWidth: contentWidth - 140, textColor: [15, 23, 42] },
              },
            });

            currentY = doc.lastAutoTable.finalY + 12;
          });
        }

        doc.save(`Garment_QMS_Member_${targetMem?.name || 'User'}_NC_Dossier_${new Date().toISOString().slice(0, 10)}.pdf`);
      }
      // -----------------------------------------------------------------------
      // TAB 1: MASTER AUDIT REGISTER PDF (Existing implementation intact)
      // -----------------------------------------------------------------------
      else {
        // Executive Metrics Scorecard Banner
        doc.setFillColor(...bgLight);
        doc.setDrawColor(...borderLine);
        doc.roundedRect(margin, 122, contentWidth, 48, 6, 6, 'FD');

        const kpis = [
          { label: 'NCs in Report', val: String(datasetToExport.length), col: brandDark },
          { label: 'Open / In Progress', val: String(openCount), col: [217, 119, 6] },
          { label: 'Under Review', val: String(pendingCount), col: [79, 70, 229] },
          { label: 'Overdue SLA', val: String(overdueCount), col: [225, 29, 72] },
          { label: 'Verified & Closed', val: String(closedCount), col: [16, 185, 129] },
          {
            label: 'SLA Adherence',
            val: slaRate !== null ? `${slaRate}%` : '—',
            col: [37, 99, 235],
          },
        ];

        const kpiColWidth = contentWidth / 6;
        kpis.forEach((kpi, idx) => {
          const colX = margin + idx * kpiColWidth;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(12);
          doc.setTextColor(...kpi.col);
          doc.text(kpi.val, colX + kpiColWidth / 2, 142, { align: 'center' });

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(...brandMuted);
          doc.text(kpi.label, colX + kpiColWidth / 2, 157, { align: 'center' });

          if (idx < kpis.length - 1) {
            doc.setDrawColor(...borderLine);
            doc.line(colX + kpiColWidth, 130, colX + kpiColWidth, 162);
          }
        });

        // Summary Table
        const tableRows = datasetToExport.map((c) => {
          const isOverdue =
            c.status !== 'Closed' &&
            c.status !== 'Verified' &&
            c.deadlineTimestamp &&
            Date.now() > new Date(c.deadlineTimestamp).getTime();

          const cRisk = (c.priority || c.riskSeverity || 'MEDIUM').toUpperCase();
          const findingSummary = getFindingText(c).slice(0, 45);

          return [
            c.complaintId || 'NC-N/A',
            c.department || 'Floor',
            cRisk,
            c.status,
            findingSummary,
            getAssignedToName(c),
            c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'N/A',
            isOverdue ? 'Overdue Breach' : 'Within SLA',
          ];
        });

        autoTable(doc, {
          startY: 182,
          head: [[
            'NC ID',
            'Dept',
            'Risk',
            'Status',
            'Finding Description',
            'Responsible Person',
            'Date',
            'SLA Condition',
          ]],
          body: tableRows,
          theme: 'grid',
          headStyles: {
            fillColor: [15, 23, 42],
            textColor: [255, 255, 255],
            fontSize: 7.5,
            fontStyle: 'bold',
          },
          styles: {
            fontSize: 7,
            cellPadding: 3,
          },
          columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 60 },
            1: { cellWidth: 60 },
            2: { cellWidth: 45 },
            3: { cellWidth: 55 },
            4: { cellWidth: 130 },
            5: { cellWidth: 75 },
            6: { cellWidth: 50 },
            7: { cellWidth: 65 },
          },
        });

        doc.save(`Garment_QMS_NC_and_CAP_Audit_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
      }
    } catch (err) {
      console.error('Failed to export PDF report:', err);
    } finally {
      setTimeout(() => setDownloadingPDF(false), 600);
    }
  };

  // ---------------------------------------------------------------------------
  // CSV EXPORT HANDLER (Dispatched dynamically based on active report mode)
  // ---------------------------------------------------------------------------
  const handleExportCSV = () => {
    setDownloadingCSV(true);
    try {
      let headers = [];
      let rows = [];
      let filename = 'Garment_QMS_Report.csv';

      if (activeReportTab === 'dept-report') {
        filename = `Garment_QMS_Department_NC_Summary_${new Date().toISOString().slice(0, 10)}.csv`;
        headers = [
          'Department Name',
          'Department Code',
          'Department Manager / In-Charge',
          'Factory Headcount',
          'Total NCs Raised',
          'Open / In Progress NCs',
          'Verified & Closed NCs',
          'Pending CAP Review NCs',
          'Overdue SLA Breaches',
          'Critical Risk NCs',
          'CAP Completion Rate (%)',
          'CAP Status Label',
        ];
        rows = departmentStatsList.map((d) => [
          `"${d.department}"`,
          `"${d.code || ''}"`,
          `"${d.manager || ''}"`,
          `"${d.headcount || 0}"`,
          `"${d.totalNC}"`,
          `"${d.openNC}"`,
          `"${d.closedNC}"`,
          `"${d.pendingNC}"`,
          `"${d.overdueNC}"`,
          `"${d.criticalNC}"`,
          `"${d.capRate}%"`,
          `"${d.capStatusLabel}"`,
        ]);
      } else if (activeReportTab === 'members-report') {
        filename = `Garment_QMS_Department_Members_Report_${new Date().toISOString().slice(0, 10)}.csv`;
        headers = [
          'Member Name',
          'Employee ID',
          'Assigned Department',
          'Designation',
          'User Role',
          'Contact Mobile Number',
          'Email Address',
          'Total NCs Assigned',
          'Open / In Progress NCs',
          'Closed & Verified NCs',
          'Pending CAP Review NCs',
          'Overdue SLA NCs',
          'CAP Completion Rate (%)',
          'Accountability Status',
        ];
        rows = memberStatsList.map((m) => [
          `"${m.name}"`,
          `"${m.employeeId || ''}"`,
          `"${m.department}"`,
          `"${m.designation || 'Supervisor'}"`,
          `"${m.role || 'ACTION_PERSON'}"`,
          `"${m.mobileNumber || ''}"`,
          `"${m.email || ''}"`,
          `"${m.totalNC}"`,
          `"${m.openNC}"`,
          `"${m.closedNC}"`,
          `"${m.pendingNC}"`,
          `"${m.overdueNC}"`,
          `"${m.capRate}%"`,
          `"${m.capStatusLabel}"`,
        ]);
      } else if (activeReportTab === 'member-detail') {
        const memName = activeMember ? activeMember.name.replace(/\s+/g, '_') : 'Member';
        filename = `Garment_QMS_Member_${memName}_NC_Register_${new Date().toISOString().slice(0, 10)}.csv`;
        headers = [
          'Non-Conformance ID',
          'Assigned Member Name',
          'Member Employee ID',
          'Department',
          'Plant Location',
          'Risk Severity',
          'Current Lifecycle Status',
          'Finding Description',
          'Quality Requirement / Standard',
          'NC Creation Date',
          'Auditor Name',
          '5-Why Root Cause',
          'Immediate Containment Action',
          'Permanent Corrective Action',
          'Preventive Recurrence Plan',
          'CAP Target Due Date',
          'Verification Method',
          'Auditor Readiness Notes',
          'Approved Closure Date',
          'Before Photo Status',
          'After Photo Status',
        ];
        rows = activeMemberComplaints.map((c) => [
          `"${c.complaintId || ''}"`,
          `"${activeMember?.name || getAssignedToName(c)}"`,
          `"${activeMember?.employeeId || c.assignedTo?.employeeId || ''}"`,
          `"${c.department || ''}"`,
          `"${c.location || ''}"`,
          `"${c.priority || c.riskSeverity || 'Medium'}"`,
          `"${c.status || 'Open'}"`,
          `"${getFindingText(c).replace(/"/g, '""')}"`,
          `"${(c.requirement || 'AQL 1.5 Standard').replace(/"/g, '""')}"`,
          `"${c.createdAt ? new Date(c.createdAt).toLocaleString() : ''}"`,
          `"${getAuditorName(c).replace(/"/g, '""')}"`,
          `"${getRootCauseText(c).replace(/"/g, '""')}"`,
          `"${getImmediateCorrectionText(c).replace(/"/g, '""')}"`,
          `"${getCorrectiveActionText(c).replace(/"/g, '""')}"`,
          `"${getPreventiveActionText(c).replace(/"/g, '""')}"`,
          `"${getCapTargetDate(c)}"`,
          `"${c.verificationMethod || 'Physical Re-inspection'}"`,
          `"${(c.cap?.verificationReadinessNotes || '').replace(/"/g, '""')}"`,
          `"${c.actualCompletedAt ? new Date(c.actualCompletedAt).toLocaleString() : 'Pending Closure'}"`,
          `"${c.beforePhoto ? 'Yes (Photo Attached)' : 'No'}"`,
          `"${c.afterPhoto ? 'Yes (Proof Attached)' : 'Pending'}"`,
        ]);
      } else {
        // Master Register CSV (all 33 columns intact)
        filename = `Garment_QMS_Master_Register_${new Date().toISOString().slice(0, 10)}.csv`;
        headers = [
          'Non-Conformance ID',
          'Lifecycle Status',
          'Risk Severity / Priority',
          'Department',
          'Plant Location & Line Station',
          'Defect Category',
          'Creation Timestamp',
          'Auditor Name',
          'Auditor Employee ID',
          'Defect Finding Description',
          'Quality Requirement',
          'Issue Occurrence Frequency',
          'Ticket Aging Duration',
          'Before Photo Attached Status',
          'Assigned To (Responsible for Resolving)',
          'Assigned Supervisor Employee ID',
          'Assigned Supervisor Designation',
          'SLA Target Duration (Hours)',
          'Target SLA Deadline Date',
          'SLA Condition Status',
          'CAP Requirement',
          'CAP Lifecycle Status',
          'Immediate Correction (Containment)',
          'Root Cause (5-Why Analysis)',
          'Corrective Action (Permanent Fix)',
          'Preventive Action Plan',
          'CAP Target Date',
          'After Proof Photo Evidence',
          'Approved Closure Date',
        ];

        rows = datasetToExport.map((c) => {
          const isOverdue =
            c.status !== 'Closed' &&
            c.status !== 'Verified' &&
            c.deadlineTimestamp &&
            Date.now() > new Date(c.deadlineTimestamp).getTime();

          return [
            `"${c.complaintId || ''}"`,
            `"${c.status || 'Open'}"`,
            `"${c.priority || c.riskSeverity || 'Medium'}"`,
            `"${c.department || ''}"`,
            `"${c.location || ''}"`,
            `"${c.category || ''}"`,
            `"${c.createdAt ? new Date(c.createdAt).toLocaleString() : ''}"`,
            `"${getAuditorName(c).replace(/"/g, '""')}"`,
            `"${c.createdBy?.employeeId || ''}"`,
            `"${getFindingText(c).replace(/"/g, '""')}"`,
            `"${(c.requirement || 'AQL 1.5 Standard').replace(/"/g, '""')}"`,
            `"${getIssueFrequency(c)}"`,
            `"${getTicketAgeLabel(c)}"`,
            `"${c.beforePhoto ? 'Yes (Photo Captured)' : 'No Photo'}"`,
            `"${getAssignedToName(c).replace(/"/g, '""')}"`,
            `"${c.assignedTo?.employeeId || ''}"`,
            `"${(c.assignedTo?.designation || '').replace(/"/g, '""')}"`,
            `"${c.deadlineHours || 24}"`,
            `"${c.deadlineTimestamp ? new Date(c.deadlineTimestamp).toLocaleString() : ''}"`,
            `"${isOverdue ? 'Overdue Breach' : 'Within SLA'}"`,
            `"${c.capRequired ? 'Mandatory CAP' : 'Direct Correction'}"`,
            `"${c.cap?.status || (c.status === 'Closed' ? 'VERIFIED_EFFECTIVE' : 'IN_PROGRESS')}"`,
            `"${getImmediateCorrectionText(c).replace(/"/g, '""')}"`,
            `"${getRootCauseText(c).replace(/"/g, '""')}"`,
            `"${getCorrectiveActionText(c).replace(/"/g, '""')}"`,
            `"${getPreventiveActionText(c).replace(/"/g, '""')}"`,
            `"${getCapTargetDate(c)}"`,
            `"${c.afterPhoto ? 'Yes (Proof Uploaded)' : 'Pending After Proof'}"`,
            `"${c.actualCompletedAt ? new Date(c.actualCompletedAt).toLocaleString() : 'Pending Closure'}"`,
          ];
        });
      }

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to export CSV report:', err);
    } finally {
      setTimeout(() => setDownloadingCSV(false), 500);
    }
  };

  // ---------------------------------------------------------------------------
  // RENDER INTERACTION
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* 1. Header Banner */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-cyan-400">
              <BarChart3 className="w-5 h-5" />
            </span>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              Compliance Audit &amp; CAP Analytical Reports
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
            Multi-dimensional audit reporting, department defect summaries, member-wise NC accountability, CAP root causes, and verification closure. Filter by date range, department, member, risk, and CAP status.
          </p>
        </div>

        {/* Download Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
          {hasActiveFilters && (
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setExportScope('FILTERED')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  exportScope === 'FILTERED'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-cyan-400 shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                }`}
                title="Export only the filtered dataset"
              >
                Filtered ({filteredCount})
              </button>
              <button
                type="button"
                onClick={() => setExportScope('ALL')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  exportScope === 'ALL'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-cyan-400 shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                }`}
                title="Export all database records"
              >
                All ({totalNC})
              </button>
            </div>
          )}

          <button
            type="button"
            id="btn-download-pdf-top"
            onClick={handleExportPDF}
            disabled={downloadingPDF}
            className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-600/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            title="Download PDF Audit Dossier"
          >
            <FileText className="w-4 h-4" />
            <span>
              {downloadingPDF
                ? 'Compiling PDF...'
                : activeReportTab === 'dept-report'
                ? `Export Dept PDF (${departmentStatsList.length})`
                : activeReportTab === 'members-report'
                ? `Export Members PDF (${memberStatsList.length})`
                : activeReportTab === 'member-detail'
                ? `Export Member Dossier (${activeMemberComplaints.length})`
                : `Export PDF (${datasetToExport.length})`}
            </span>
          </button>

          <button
            type="button"
            id="btn-download-csv-top"
            onClick={handleExportCSV}
            disabled={downloadingCSV}
            className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            title="Download CSV Master Register"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>
              {downloadingCSV
                ? 'Exporting CSV...'
                : activeReportTab === 'dept-report'
                ? 'Export Dept CSV'
                : activeReportTab === 'members-report'
                ? 'Export Members CSV'
                : activeReportTab === 'member-detail'
                ? 'Export Member CSV'
                : `Export CSV (${datasetToExport.length})`}
            </span>
          </button>
        </div>
      </div>

      {/* 2. Top-Level Mode Navigation Switcher (All 4 Core Report Types) */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80">
        <button
          type="button"
          onClick={() => setActiveReportTab('audit-register')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeReportTab === 'audit-register'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-cyan-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Master NC Register</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500">
            {filteredComplaints.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSelectedDeptDetail(null);
            setActiveReportTab('dept-report');
          }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeReportTab === 'dept-report'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-cyan-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Department-wise NC Report</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-cyan-300">
            {departmentStatsList.length} Depts
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveReportTab('members-report')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeReportTab === 'members-report'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-cyan-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Department Members Report</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-300">
            {memberStatsList.length} Members
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveReportTab('member-detail')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeReportTab === 'member-detail'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-cyan-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <User className="w-4 h-4" />
          <span>Individual Member NC Details</span>
          {activeMember && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-300">
              {activeMember.name.split(' ')[0]} ({activeMemberComplaints.length})
            </span>
          )}
        </button>
      </div>

      {/* 3. Global Multi-Dimensional Dropdown Filter Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-3.5 sm:p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-cyan-400">
              <SlidersHorizontal className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Advanced Filter Matrix
            </span>
            {hasActiveFilters && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white animate-pulse">
                {activeFilterCount} Active
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Filters</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowFiltersExpanded(!showFiltersExpanded)}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title={showFiltersExpanded ? 'Collapse Filters' : 'Expand Filters'}
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${
                  showFiltersExpanded ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>
        </div>

        {showFiltersExpanded && (
          <div className="p-4 sm:p-5 space-y-4">
            {/* Row 1: Dropdown Filters Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* 1. Date Range Preset */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-indigo-500" />
                    <span>Date Range</span>
                  </span>
                  {datePreset !== 'ALL' && (
                    <span className="text-[10px] text-indigo-600 dark:text-cyan-400 font-mono font-bold">Active</span>
                  )}
                </label>
                <select
                  value={datePreset}
                  onChange={(e) => setDatePreset(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:ring-2 focus:ring-indigo-500 cursor-pointer font-medium transition-colors ${
                    datePreset !== 'ALL'
                      ? 'bg-indigo-50/70 border-indigo-300 text-indigo-900 dark:bg-indigo-950/60 dark:border-indigo-700 dark:text-cyan-200'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <option value="ALL">All Time (Full History)</option>
                  <option value="TODAY">Today (Logged Today)</option>
                  <option value="7D">Past 7 Days</option>
                  <option value="30D">Past 30 Days</option>
                  <option value="THIS_MONTH">This Calendar Month</option>
                  <option value="CUSTOM">Custom Date Window...</option>
                </select>
              </div>

              {/* 2. Department Dropdown */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3 h-3 text-indigo-500" />
                    <span>Department</span>
                  </span>
                  {departmentFilter !== 'ALL' && (
                    <span className="text-[10px] text-indigo-600 dark:text-cyan-400 font-mono font-bold">Active</span>
                  )}
                </label>
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:ring-2 focus:ring-indigo-500 cursor-pointer font-medium transition-colors ${
                    departmentFilter !== 'ALL'
                      ? 'bg-indigo-50/70 border-indigo-300 text-indigo-900 dark:bg-indigo-950/60 dark:border-indigo-700 dark:text-cyan-200'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <option value="ALL">All Departments ({consolidatedDepartmentsList.length} Depts)</option>
                  {consolidatedDepartmentsList.map((dept) => (
                    <option key={dept.name} value={dept.name}>
                      {dept.name} ({departmentCounts[dept.name] || 0} NCs)
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Individual Member Filter Dropdown */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3 text-purple-500" />
                    <span>Member / Supervisor</span>
                  </span>
                  {memberFilter !== 'ALL' && (
                    <span className="text-[10px] text-purple-600 dark:text-purple-400 font-mono font-bold">Active</span>
                  )}
                </label>
                <select
                  value={memberFilter}
                  onChange={(e) => setMemberFilter(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:ring-2 focus:ring-indigo-500 cursor-pointer font-medium transition-colors ${
                    memberFilter !== 'ALL'
                      ? 'bg-purple-50/70 border-purple-300 text-purple-900 dark:bg-purple-950/60 dark:border-purple-700 dark:text-purple-200'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <option value="ALL">All Factory Members ({consolidatedMembersList.length})</option>
                  {consolidatedMembersList.map((m) => {
                    const count = complaints.filter((c) => isComplaintAssignedToMember(c, m)).length;
                    return (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.department} • {count} NCs)
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* 4. NC Lifecycle Status Dropdown */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    <span>NC Status</span>
                  </span>
                  {statusFilter !== 'ALL' && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-bold">Active</span>
                  )}
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:ring-2 focus:ring-indigo-500 cursor-pointer font-medium transition-colors ${
                    statusFilter !== 'ALL'
                      ? 'bg-emerald-50/70 border-emerald-300 text-emerald-900 dark:bg-emerald-950/60 dark:border-emerald-700 dark:text-emerald-200'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <option value="ALL">All Lifecycle Statuses</option>
                  <option value="OPEN">Open / Assigned / In Progress</option>
                  <option value="CAP_SUBMITTED">CAP Submitted</option>
                  <option value="UNDER_REVIEW">Under Review / Verification</option>
                  <option value="REWORK">Rejected / Rework</option>
                  <option value="CLOSED">Verified &amp; Closed Effective</option>
                  <option value="OVERDUE">🚨 Overdue SLA Breaches</option>
                </select>
              </div>

              {/* 5. Risk / Severity Dropdown */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-500" />
                    <span>Risk / Severity</span>
                  </span>
                  {riskFilter !== 'ALL' && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono font-bold">Active</span>
                  )}
                </label>
                <select
                  value={riskFilter}
                  onChange={(e) => setRiskFilter(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:ring-2 focus:ring-indigo-500 cursor-pointer font-medium transition-colors ${
                    riskFilter !== 'ALL'
                      ? 'bg-amber-50/70 border-amber-300 text-amber-900 dark:bg-amber-950/60 dark:border-amber-700 dark:text-amber-200'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <option value="ALL">All Risk Levels</option>
                  <option value="CRITICAL">🔥 CRITICAL (Shipment Risk / Line Stop)</option>
                  <option value="HIGH">⚠️ HIGH (AQL Failure Risk)</option>
                  <option value="MEDIUM">🔷 MEDIUM (Standard Rework)</option>
                  <option value="LOW">◽ LOW (Minor Observation)</option>
                </select>
              </div>

              {/* 6. CAP Status Dropdown */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-500" />
                    <span>CAP Status</span>
                  </span>
                  {capStatusFilter !== 'ALL' && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-bold">Active</span>
                  )}
                </label>
                <select
                  value={capStatusFilter}
                  onChange={(e) => setCapStatusFilter(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:ring-2 focus:ring-indigo-500 cursor-pointer font-medium transition-colors ${
                    capStatusFilter !== 'ALL'
                      ? 'bg-emerald-50/70 border-emerald-300 text-emerald-900 dark:bg-emerald-950/60 dark:border-emerald-700 dark:text-emerald-200'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <option value="ALL">All CAP Statuses</option>
                  <option value="CAP_COMPLETED">✅ CAP Completed &amp; Verified</option>
                  <option value="CAP_PENDING">⏳ CAP Submitted / Under Review</option>
                  <option value="CAP_REQUIRED_OPEN">⚠️ Mandatory CAP Pending Submission</option>
                  <option value="NO_CAP_DIRECT">◽ Direct Correction (No CAP Required)</option>
                </select>
              </div>

              {/* 7. Responsible Person Dropdown */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <UserCheck className="w-3 h-3 text-indigo-500" />
                    <span>Responsible Person</span>
                  </span>
                  {responsibleFilter !== 'ALL' && (
                    <span className="text-[10px] text-purple-600 dark:text-purple-400 font-mono font-bold">Active</span>
                  )}
                </label>
                <select
                  value={responsibleFilter}
                  onChange={(e) => setResponsibleFilter(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:ring-2 focus:ring-indigo-500 cursor-pointer font-medium transition-colors ${
                    responsibleFilter !== 'ALL'
                      ? 'bg-purple-50/70 border-purple-300 text-purple-900 dark:bg-purple-950/60 dark:border-purple-700 dark:text-purple-200'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <option value="ALL">All Responsible Resolvers ({responsibleList.length})</option>
                  {responsibleList.map((person) => (
                    <option key={person} value={person}>
                      {person}
                    </option>
                  ))}
                </select>
              </div>

              {/* 8. Auditor Dropdown */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-purple-500" />
                    <span>Auditor / Created By</span>
                  </span>
                  {auditorFilter !== 'ALL' && (
                    <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono font-bold">Active</span>
                  )}
                </label>
                <select
                  value={auditorFilter}
                  onChange={(e) => setAuditorFilter(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:ring-2 focus:ring-indigo-500 cursor-pointer font-medium transition-colors ${
                    auditorFilter !== 'ALL'
                      ? 'bg-indigo-50/70 border-indigo-300 text-indigo-900 dark:bg-indigo-950/60 dark:border-indigo-700 dark:text-cyan-200'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <option value="ALL">All Auditors ({auditorList.length})</option>
                  {auditorList.map((auditor) => (
                    <option key={auditor} value={auditor}>
                      {auditor}
                    </option>
                  ))}
                </select>
              </div>

              {/* 9. Ticket Aging Dropdown */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-blue-500" />
                    <span>Ticket Aging</span>
                  </span>
                  {agingFilter !== 'ALL' && (
                    <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-mono font-bold">Active</span>
                  )}
                </label>
                <select
                  value={agingFilter}
                  onChange={(e) => setAgingFilter(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:ring-2 focus:ring-indigo-500 cursor-pointer font-medium transition-colors ${
                    agingFilter !== 'ALL'
                      ? 'bg-cyan-50/70 border-cyan-300 text-cyan-900 dark:bg-cyan-950/60 dark:border-cyan-700 dark:text-cyan-200'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <option value="ALL">All Aging Durations</option>
                  <option value="FRESH">Fresh (&lt; 24 Hours)</option>
                  <option value="MODERATE">Moderate Aging (1 – 3 Days)</option>
                  <option value="HIGH">High Aging (3 – 7 Days)</option>
                  <option value="SEVERE">🚨 Severe Aging (&gt; 7 Days)</option>
                </select>
              </div>

              {/* 10. Defect Recurrence Dropdown */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Repeat className="w-3 h-3 text-purple-500" />
                    <span>Defect Recurrence</span>
                  </span>
                  {repeatFilter !== 'ALL' && (
                    <span className="text-[10px] text-purple-600 dark:text-purple-400 font-mono font-bold">Active</span>
                  )}
                </label>
                <select
                  value={repeatFilter}
                  onChange={(e) => setRepeatFilter(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:ring-2 focus:ring-indigo-500 cursor-pointer font-medium transition-colors ${
                    repeatFilter !== 'ALL'
                      ? 'bg-purple-50/70 border-purple-300 text-purple-900 dark:bg-purple-950/60 dark:border-purple-700 dark:text-purple-200'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <option value="ALL">All Defect Types</option>
                  <option value="REPEAT">🔁 Repeat NCs (Frequency ≥ 2)</option>
                  <option value="SINGLE">◽ First-Time / Single Defect</option>
                </select>
              </div>
            </div>

            {/* Custom Date Range Picker Row (shown if CUSTOM is active) */}
            {datePreset === 'CUSTOM' && (
              <div className="p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-800/80 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 dark:text-indigo-200 shrink-0">
                  <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-cyan-400" />
                  <span>Custom Date Window:</span>
                </div>
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      From:
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      To:
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                {(startDate || endDate) && (
                  <button
                    type="button"
                    onClick={() => {
                      setStartDate('');
                      setEndDate('');
                    }}
                    className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer shrink-0"
                  >
                    Clear Dates
                  </button>
                )}
              </div>
            )}

            {/* Active Filter Criteria Chips Strip */}
            {hasActiveFilters && (
              <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[11px] font-bold text-slate-400 mr-1 flex items-center gap-1">
                  <Filter className="w-3 h-3" />
                  <span>Active Filters:</span>
                </span>

                {searchTerm && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-cyan-300 border border-indigo-200 dark:border-indigo-800 text-[11px]">
                    <span>Search: "{searchTerm}"</span>
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="hover:text-indigo-900 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {departmentFilter !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[11px]">
                    <span>Dept: {departmentFilter}</span>
                    <button
                      type="button"
                      onClick={() => setDepartmentFilter('ALL')}
                      className="hover:text-blue-900 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {memberFilter !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-[11px]">
                    <span>
                      Member: {consolidatedMembersList.find((m) => m.id === memberFilter)?.name || memberFilter}
                    </span>
                    <button
                      type="button"
                      onClick={() => setMemberFilter('ALL')}
                      className="hover:text-purple-900 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {statusFilter !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px]">
                    <span>Status: {statusFilter}</span>
                    <button
                      type="button"
                      onClick={() => setStatusFilter('ALL')}
                      className="hover:text-emerald-900 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {riskFilter !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[11px]">
                    <span>Risk: {riskFilter}</span>
                    <button
                      type="button"
                      onClick={() => setRiskFilter('ALL')}
                      className="hover:text-amber-900 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {capStatusFilter !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px]">
                    <span>CAP: {capStatusFilter}</span>
                    <button
                      type="button"
                      onClick={() => setCapStatusFilter('ALL')}
                      className="hover:text-emerald-900 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer ml-1"
                >
                  Clear All
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* =======================================================================
          VIEW 1: MASTER AUDIT REGISTER (100% Preserved Existing Features)
          ======================================================================= */}
      {activeReportTab === 'audit-register' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Interactive KPI Overview Cards with Drill-Down Clicks */}
          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                Audit Scorecard &amp; 1-Click Drill-Down
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                Click any metric to filter records
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
              {/* CARD 1: Total NCs */}
              <div
                onClick={handleResetFilters}
                className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs hover:border-indigo-400 dark:hover:border-indigo-600 transition-all cursor-pointer group flex flex-col justify-between"
                title="Click to view all records (reset filters)"
              >
                <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-between">
                  <span>Total NCs</span>
                  <Layers className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                </div>
                <div className="text-xl font-black text-slate-900 dark:text-white font-mono my-1">
                  {filteredCount}
                  {hasActiveFilters && (
                    <span className="text-[10px] text-slate-400 font-normal ml-1">
                      /{totalNC}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-indigo-600 dark:text-cyan-400 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  <span>View All</span>
                  <ChevronRight className="w-2.5 h-2.5" />
                </div>
              </div>

              {/* CARD 2: Open / In Progress */}
              <div
                onClick={() => setStatusFilter('OPEN')}
                className={`p-3 rounded-xl bg-white dark:bg-slate-900 border shadow-2xs hover:border-amber-400 dark:hover:border-amber-600 transition-all cursor-pointer group flex flex-col justify-between ${
                  statusFilter === 'OPEN'
                    ? 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/20 dark:bg-amber-950/20'
                    : 'border-slate-200/90 dark:border-slate-800'
                }`}
                title="Drill down to Open and In Progress NCs"
              >
                <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-between">
                  <span>Open Actions</span>
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                </div>
                <div className="text-xl font-black text-amber-600 dark:text-amber-400 font-mono my-1">
                  {openCount}
                </div>
                <div className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  <span>Needs Fix</span>
                  <ChevronRight className="w-2.5 h-2.5" />
                </div>
              </div>

              {/* CARD 3: Under Review / Verification */}
              <div
                onClick={() => setStatusFilter('UNDER_REVIEW')}
                className={`p-3 rounded-xl bg-white dark:bg-slate-900 border shadow-2xs hover:border-purple-400 dark:hover:border-purple-600 transition-all cursor-pointer group flex flex-col justify-between ${
                  statusFilter === 'UNDER_REVIEW'
                    ? 'border-purple-500 ring-2 ring-purple-500/20 bg-purple-50/20 dark:bg-purple-950/20'
                    : 'border-slate-200/90 dark:border-slate-800'
                }`}
                title="Drill down to CAPs submitted and awaiting Auditor verification"
              >
                <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-between">
                  <span>Under Review</span>
                  <Clock className="w-3.5 h-3.5 text-purple-500" />
                </div>
                <div className="text-xl font-black text-purple-600 dark:text-purple-400 font-mono my-1">
                  {pendingCount}
                </div>
                <div className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  <span>Verify CAP</span>
                  <ChevronRight className="w-2.5 h-2.5" />
                </div>
              </div>

              {/* CARD 4: Overdue Breaches */}
              <div
                onClick={() => setStatusFilter('OVERDUE')}
                className={`p-3 rounded-xl bg-white dark:bg-slate-900 border shadow-2xs hover:border-rose-400 dark:hover:border-rose-600 transition-all cursor-pointer group flex flex-col justify-between ${
                  statusFilter === 'OVERDUE'
                    ? 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-50/20 dark:bg-rose-950/20'
                    : 'border-slate-200/90 dark:border-slate-800'
                }`}
                title="Drill down to NCs past SLA deadline"
              >
                <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-between">
                  <span>Overdue SLA</span>
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                </div>
                <div className="text-xl font-black text-rose-600 dark:text-rose-400 font-mono my-1">
                  {overdueCount}
                </div>
                <div className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  <span>Urgent Risk</span>
                  <ChevronRight className="w-2.5 h-2.5" />
                </div>
              </div>

              {/* CARD 5: Critical Risk */}
              <div
                onClick={() => setRiskFilter('CRITICAL')}
                className={`p-3 rounded-xl bg-white dark:bg-slate-900 border shadow-2xs hover:border-red-400 dark:hover:border-red-600 transition-all cursor-pointer group flex flex-col justify-between ${
                  riskFilter === 'CRITICAL'
                    ? 'border-red-500 ring-2 ring-red-500/20 bg-red-50/20 dark:bg-red-950/20'
                    : 'border-slate-200/90 dark:border-slate-800'
                }`}
                title="Drill down to Critical Severity Defect Findings"
              >
                <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-between">
                  <span>Critical Risk</span>
                  <Flame className="w-3.5 h-3.5 text-red-500" />
                </div>
                <div className="text-xl font-black text-red-600 dark:text-red-400 font-mono my-1">
                  {criticalCount}
                </div>
                <div className="text-[10px] text-red-600 dark:text-red-400 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  <span>Stop Line</span>
                  <ChevronRight className="w-2.5 h-2.5" />
                </div>
              </div>

              {/* CARD 6: Repeat Defect Recurrences */}
              <div
                onClick={() => setRepeatFilter('REPEAT')}
                className={`p-3 rounded-xl bg-white dark:bg-slate-900 border shadow-2xs hover:border-purple-400 dark:hover:border-purple-600 transition-all cursor-pointer group flex flex-col justify-between ${
                  repeatFilter === 'REPEAT'
                    ? 'border-purple-500 ring-2 ring-purple-500/20 bg-purple-50/20 dark:bg-purple-950/20'
                    : 'border-slate-200/90 dark:border-slate-800'
                }`}
                title="Drill down to Repeat Defects occurring more than once"
              >
                <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-between">
                  <span>Repeat NCs</span>
                  <Repeat className="w-3.5 h-3.5 text-purple-500" />
                </div>
                <div className="text-xl font-black text-purple-600 dark:text-purple-400 font-mono my-1">
                  {repeatCount}
                </div>
                <div className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  <span>Recurrence</span>
                  <ChevronRight className="w-2.5 h-2.5" />
                </div>
              </div>

              {/* CARD 7: Closed Effective */}
              <div
                onClick={() => setStatusFilter('CLOSED')}
                className={`p-3 rounded-xl bg-white dark:bg-slate-900 border shadow-2xs hover:border-emerald-400 dark:hover:border-emerald-600 transition-all cursor-pointer group flex flex-col justify-between ${
                  statusFilter === 'CLOSED'
                    ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/20 dark:bg-emerald-950/20'
                    : 'border-slate-200/90 dark:border-slate-800'
                }`}
                title="Drill down to fully Verified & Closed NCs"
              >
                <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-between">
                  <span>Closed &amp; Verified</span>
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
                </div>
                <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono my-1">
                  {closedCount}
                </div>
                <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  <span>100% Solved</span>
                  <ChevronRight className="w-2.5 h-2.5" />
                </div>
              </div>
            </div>
          </div>

          {/* Interactive A-to-Z Preview Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Interactive Audit Records &amp; Drill-Down</span>
                  <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                    {filteredComplaints.length} of {complaints.length} Records
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Click any record or "Inspect Lifecycle" to drill down into the 4-stage audit trail, root causes, and photos.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search NC ID, department, finding..."
                    className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 w-52 sm:w-64"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              {filteredComplaints.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-xs space-y-2">
                  <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-2">
                    <Search className="w-5 h-5" />
                  </div>
                  <p className="font-semibold text-slate-700 dark:text-slate-300">
                    No matching NC records found
                  </p>
                  <p className="text-slate-400 max-w-sm mx-auto">
                    No tickets match your active combination of filters.
                  </p>
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset All Filters</span>
                  </button>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-[11px] font-bold text-slate-600 dark:text-slate-400">
                      <th className="py-3 px-4">NC ID &amp; Location</th>
                      <th className="py-3 px-4">Issue Finding &amp; Recurrence</th>
                      <th className="py-3 px-4">Assigned Resolver</th>
                      <th className="py-3 px-4">Root Cause &amp; CAP Fix</th>
                      <th className="py-3 px-4">Timeline &amp; Aging</th>
                      <th className="py-3 px-4 text-center">Status &amp; Risk</th>
                      <th className="py-3 px-4 text-center">Drill-Down</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {filteredComplaints.map((c) => {
                      const isOverdue =
                        c.status !== 'Closed' &&
                        c.status !== 'Verified' &&
                        c.deadlineTimestamp &&
                        Date.now() > new Date(c.deadlineTimestamp).getTime();

                      const freq = getIssueFrequency(c);
                      const assignedName = getAssignedToName(c);
                      const rootCause = getRootCauseText(c);
                      const cRisk = (c.priority || c.riskSeverity || 'MEDIUM').toUpperCase();

                      return (
                        <tr
                          key={c._id || c.id || c.complaintId}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors group"
                        >
                          {/* 1. NC ID & Location */}
                          <td className="py-3.5 px-4 align-top">
                            <div className="font-mono font-bold text-indigo-600 dark:text-cyan-400 flex items-center gap-1">
                              <span>{c.complaintId || 'NC-N/A'}</span>
                              {cRisk === 'CRITICAL' && (
                                <span className="text-[10px] text-rose-500" title="Critical Risk">
                                  🔥
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-semibold text-slate-900 dark:text-white mt-0.5">
                              {c.department}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {c.location || 'Floor Station'}
                            </div>
                          </td>

                          {/* 2. Issue Finding & Recurrence */}
                          <td className="py-3.5 px-4 align-top max-w-xs">
                            <p className="text-[11px] text-slate-700 dark:text-slate-300 line-clamp-2">
                              {getFindingText(c)}
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                  freq > 1
                                    ? 'bg-purple-50 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                <Repeat className="w-3 h-3" />
                                <span>Occurred: {freq} time{freq > 1 ? 's' : ''}</span>
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-1">
                              Auditor: {getAuditorName(c)}
                            </div>
                          </td>

                          {/* 3. Assigned Resolver */}
                          <td className="py-3.5 px-4 align-top whitespace-nowrap">
                            <div className="font-bold text-slate-900 dark:text-slate-200">
                              {assignedName}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">
                              {c.assignedTo?.designation || 'Supervisor'}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">
                              {c.assignedTo?.mobileNumber || c.assignedTo?.employeeId || ''}
                            </div>
                          </td>

                          {/* 4. Root Cause & CAP Fix */}
                          <td className="py-3.5 px-4 align-top max-w-sm">
                            <div className="p-2 rounded-lg bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 text-[11px] mb-1">
                              <span className="font-bold text-amber-800 dark:text-amber-300 block text-[10px] uppercase tracking-wider">
                                5-Why Root Cause:
                              </span>
                              <span className="text-slate-700 dark:text-slate-300 line-clamp-2">
                                {rootCause}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-1">
                              <strong className="text-indigo-600 dark:text-cyan-400">Fix: </strong>
                              {c.cap?.correctiveAction || c.actionNotes || 'Pending CAP execution'}
                            </div>
                          </td>

                          {/* 5. Timeline & Aging */}
                          <td className="py-3.5 px-4 align-top whitespace-nowrap text-[11px]">
                            <div className="text-slate-500">
                              Logged: {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'N/A'}
                            </div>
                            <div className="text-slate-500 mt-0.5">
                              Target: {c.deadlineTimestamp ? new Date(c.deadlineTimestamp).toLocaleDateString() : 'N/A'}
                            </div>
                            <div className="mt-1 font-mono text-[10px]">
                              {isOverdue ? (
                                <span className="text-rose-600 dark:text-rose-400 font-bold">
                                  🚨 Overdue Breach
                                </span>
                              ) : (
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  Within SLA
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 6. Status & Risk */}
                          <td className="py-3.5 px-4 align-top text-center whitespace-nowrap">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                                c.status === 'Closed' || c.status === 'Verified'
                                  ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                  : c.status === 'CAP Submitted'
                                  ? 'bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                                  : 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                              }`}
                            >
                              {c.status}
                            </span>
                            <div className="mt-1 text-[10px] font-bold text-slate-500">
                              Risk: {cRisk}
                            </div>
                          </td>

                          {/* 7. Action: Drill Down */}
                          <td className="py-3.5 px-4 align-top text-center">
                            <button
                              type="button"
                              onClick={() => setDrilldownComplaint(c)}
                              className="px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-600 dark:text-cyan-400 font-bold text-[11px] transition-colors cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                              title="Inspect Full Defect & CAP Audit Trail"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Inspect</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =======================================================================
          VIEW 2: DEPARTMENT-WISE NC REPORT (Requirement 1)
          ======================================================================= */}
      {activeReportTab === 'dept-report' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Breadcrumb / Top Bar if a department is selected */}
          {selectedDeptDetail ? (
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedDeptDetail(null)}
                  className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>All Departments</span>
                </button>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-indigo-600" />
                    <span>{selectedDeptDetail} Detailed Audit Report</span>
                  </h2>
                  <p className="text-xs text-slate-500">
                    Comprehensive Non-Conformance breakdown, members roster, and root cause registry.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDepartmentFilter(selectedDeptDetail);
                    setActiveReportTab('members-report');
                  }}
                  className="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-cyan-400 font-bold text-xs hover:bg-indigo-100 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>View Department Members ({departmentStatsList.find(d => d.department === selectedDeptDetail)?.members.length || 0})</span>
                </button>
              </div>
            </div>
          ) : (
            /* Plant Department Summary Scorecard */
            <div>
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                  Factory Departments Quality Overview
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {consolidatedDepartmentsList.length} Monitored Production Units
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-500 block">Total Depts</span>
                  <div className="text-xl font-black text-slate-900 dark:text-white font-mono my-1">
                    {consolidatedDepartmentsList.length}
                  </div>
                  <span className="text-[10px] text-slate-400">Plant Divisions</span>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-500 block">Total NCs Raised</span>
                  <div className="text-xl font-black text-indigo-600 dark:text-cyan-400 font-mono my-1">
                    {filteredCount}
                  </div>
                  <span className="text-[10px] text-slate-400">In Current Filter</span>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-500 block">Open NCs</span>
                  <div className="text-xl font-black text-amber-600 dark:text-amber-400 font-mono my-1">
                    {openCount}
                  </div>
                  <span className="text-[10px] text-amber-500 font-semibold">Under Containment</span>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-500 block">Closed NCs</span>
                  <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono my-1">
                    {closedCount}
                  </div>
                  <span className="text-[10px] text-emerald-500 font-semibold">Verified Effective</span>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-500 block">Pending Review</span>
                  <div className="text-xl font-black text-purple-600 dark:text-purple-400 font-mono my-1">
                    {pendingCount}
                  </div>
                  <span className="text-[10px] text-purple-500 font-semibold">Awaiting Verification</span>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-500 block">Factory CAP Rate</span>
                  <div className="text-xl font-black text-indigo-600 dark:text-cyan-400 font-mono my-1">
                    {overallCapRate}%
                  </div>
                  <span className="text-[10px] text-slate-400">Target: ≥ 90%</span>
                </div>
              </div>
            </div>
          )}

          {/* If NOT drilled down: Department Matrix Grid & Table */}
          {!selectedDeptDetail ? (
            <div className="space-y-4">
              {/* Department Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {departmentStatsList.map((d) => (
                  <div
                    key={d.department}
                    onClick={() => handleInspectDepartment(d.department)}
                    className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs hover:border-indigo-500 dark:hover:border-indigo-500 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-cyan-400 group-hover:scale-105 transition-transform">
                            <Building2 className="w-4 h-4" />
                          </span>
                          <div>
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-cyan-400 transition-colors">
                              {d.department}
                            </h4>
                            <p className="text-[11px] text-slate-400 font-mono">
                              {d.manager ? `Head: ${d.manager}` : d.code ? `Code: ${d.code}` : 'Production Unit'}
                            </p>
                          </div>
                        </div>

                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${d.capStatusBadge}`}>
                          {d.capStatusLabel}
                        </span>
                      </div>

                      {/* Metrics bar */}
                      <div className="grid grid-cols-4 gap-1.5 my-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800 text-center">
                        <div>
                          <span className="text-[9px] uppercase font-bold text-slate-400 block">Total NCs</span>
                          <span className="text-sm font-black text-slate-900 dark:text-white font-mono">
                            {d.totalNC}
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] uppercase font-bold text-amber-500 block">Open</span>
                          <span className="text-sm font-black text-amber-600 dark:text-amber-400 font-mono">
                            {d.openNC}
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] uppercase font-bold text-emerald-500 block">Closed</span>
                          <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono">
                            {d.closedNC}
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] uppercase font-bold text-purple-500 block">Pending</span>
                          <span className="text-sm font-black text-purple-600 dark:text-purple-400 font-mono">
                            {d.pendingNC}
                          </span>
                        </div>
                      </div>

                      {/* CAP Completion progress bar */}
                      <div>
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="text-slate-500 font-semibold">CAP Completion Adherence:</span>
                          <span className="font-mono font-bold text-indigo-600 dark:text-cyan-400">{d.capRate}%</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${
                              d.capRate === 100
                                ? 'bg-emerald-500'
                                : d.capRate >= 60
                                ? 'bg-indigo-500'
                                : 'bg-amber-500'
                            }`}
                            style={{ width: `${d.capRate}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                      <span className="text-slate-400 text-[11px]">
                        {d.members.length} Registered Member{d.members.length === 1 ? '' : 's'}
                      </span>
                      <span className="text-indigo-600 dark:text-cyan-400 font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                        <span>Detailed Report</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Department Full Summary Table */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-indigo-500" />
                    <span>Department-wise Quality &amp; CAP Completion Matrix</span>
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">
                    Click any department row to view detailed report
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-[11px] font-bold text-slate-600 dark:text-slate-400">
                        <th className="py-3 px-4">Department Name</th>
                        <th className="py-3 px-4">Head / Manager</th>
                        <th className="py-3 px-4 text-center">Total NCs</th>
                        <th className="py-3 px-4 text-center">Open NCs</th>
                        <th className="py-3 px-4 text-center">Closed NCs</th>
                        <th className="py-3 px-4 text-center">Pending NCs</th>
                        <th className="py-3 px-4 text-center">Overdue</th>
                        <th className="py-3 px-4 text-center">CAP Rate</th>
                        <th className="py-3 px-4">CAP Status</th>
                        <th className="py-3 px-4 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {departmentStatsList.map((d) => (
                        <tr
                          key={d.department}
                          onClick={() => handleInspectDepartment(d.department)}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
                        >
                          <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-indigo-500" />
                              <span className="group-hover:text-indigo-600 dark:group-hover:text-cyan-400 transition-colors">
                                {d.department}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                            {d.manager || 'Production Line Head'}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-slate-900 dark:text-white">
                            {d.totalNC}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-amber-600 dark:text-amber-400">
                            {d.openNC}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {d.closedNC}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-purple-600 dark:text-purple-400">
                            {d.pendingNC}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-rose-600 dark:text-rose-400">
                            {d.overdueNC > 0 ? d.overdueNC : '—'}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-indigo-600 dark:text-cyan-400">
                            {d.capRate}%
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${d.capStatusBadge}`}>
                              {d.capStatusLabel}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleInspectDepartment(d.department);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-600 dark:text-cyan-400 font-bold text-[11px] transition-colors cursor-pointer"
                            >
                              View Report
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            /* DRILLED DOWN DEPARTMENT VIEW */
            (() => {
              const currentDept = departmentStatsList.find((d) => d.department === selectedDeptDetail);
              if (!currentDept) return null;

              return (
                <div className="space-y-5 animate-in fade-in duration-200">
                  {/* Department Overview Banner */}
                  <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Total NCs</span>
                        <span className="text-xl font-black text-slate-900 dark:text-white font-mono">
                          {currentDept.totalNC}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] uppercase font-bold text-amber-500 block">Open NCs</span>
                        <span className="text-xl font-black text-amber-600 dark:text-amber-400 font-mono">
                          {currentDept.openNC}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] uppercase font-bold text-emerald-500 block">Closed NCs</span>
                        <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                          {currentDept.closedNC}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] uppercase font-bold text-purple-500 block">Pending Review</span>
                        <span className="text-xl font-black text-purple-600 dark:text-purple-400 font-mono">
                          {currentDept.pendingNC}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] uppercase font-bold text-rose-500 block">Overdue Breaches</span>
                        <span className="text-xl font-black text-rose-600 dark:text-rose-400 font-mono">
                          {currentDept.overdueNC}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] uppercase font-bold text-indigo-500 block">CAP Rate</span>
                        <span className="text-xl font-black text-indigo-600 dark:text-cyan-400 font-mono">
                          {currentDept.capRate}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Section: Department Members Belonging to this Department */}
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
                    <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <Users className="w-4 h-4 text-purple-500" />
                          <span>{selectedDeptDetail} Members Roster &amp; Assigned NCs</span>
                        </h3>
                        <p className="text-xs text-slate-400">
                          Inspect individual line in-charges and their active defect resolution metrics.
                        </p>
                      </div>
                    </div>

                    {currentDept.members.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-500">
                        No members currently registered specifically under this department division.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
                        {currentDept.members.map((m) => {
                          const mStat = memberStatsList.find((x) => x.id === m.id) || m;
                          return (
                            <div
                              key={m.id}
                              onClick={() => handleInspectMember(m)}
                              className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 hover:border-indigo-400 transition-all cursor-pointer group flex flex-col justify-between"
                            >
                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-300 font-bold text-xs flex items-center justify-center">
                                      {m.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                      <h5 className="font-bold text-xs text-slate-900 dark:text-white group-hover:text-indigo-600 transition-colors">
                                        {m.name}
                                      </h5>
                                      <span className="text-[10px] text-slate-400 font-mono">
                                        {m.employeeId || 'ID: N/A'} • {m.designation || 'Supervisor'}
                                      </span>
                                    </div>
                                  </div>
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${mStat.capStatusBadge}`}>
                                    {mStat.capRate}%
                                  </span>
                                </div>

                                <div className="grid grid-cols-3 gap-1 my-2 text-center text-[10px] py-1.5 px-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800 font-mono">
                                  <div>
                                    <span className="text-slate-400 block text-[9px]">Total NC</span>
                                    <span className="font-bold text-slate-900 dark:text-white">{mStat.totalNC}</span>
                                  </div>
                                  <div>
                                    <span className="text-amber-500 block text-[9px]">Open</span>
                                    <span className="font-bold text-amber-600 dark:text-amber-400">{mStat.openNC}</span>
                                  </div>
                                  <div>
                                    <span className="text-emerald-500 block text-[9px]">Closed</span>
                                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{mStat.closedNC}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-[11px]">
                                <span className="text-slate-400">{mStat.pendingNC} In Review</span>
                                <span className="text-indigo-600 dark:text-cyan-400 font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                                  <span>Inspect NCs</span>
                                  <ChevronRight className="w-3 h-3" />
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Section: Non-Conformance Register for this Department */}
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
                    <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <FileCheck className="w-4 h-4 text-emerald-500" />
                        <span>{selectedDeptDetail} Active Defect Register ({currentDept.complaints.length} Records)</span>
                      </h3>
                      <button
                        type="button"
                        onClick={() => setSelectedDeptDetail(null)}
                        className="text-xs text-indigo-600 hover:underline cursor-pointer"
                      >
                        Back to All Departments
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      {currentDept.complaints.length === 0 ? (
                        <div className="p-8 text-center text-xs text-slate-500">
                          No non-conformances matching current filters logged for {selectedDeptDetail}.
                        </div>
                      ) : (
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-[11px] font-bold text-slate-600 dark:text-slate-400">
                              <th className="py-3 px-4">NC ID</th>
                              <th className="py-3 px-4">Defect Finding &amp; Requirement</th>
                              <th className="py-3 px-4">Assigned Member</th>
                              <th className="py-3 px-4">Severity</th>
                              <th className="py-3 px-4">Status</th>
                              <th className="py-3 px-4">Target Date</th>
                              <th className="py-3 px-4 text-center">Inspect</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                            {currentDept.complaints.map((c) => (
                              <tr key={c._id || c.id || c.complaintId} className="hover:bg-slate-50/70 transition-colors">
                                <td className="py-3 px-4 font-mono font-bold text-indigo-600 dark:text-cyan-400">
                                  {c.complaintId}
                                </td>
                                <td className="py-3 px-4 max-w-sm">
                                  <div className="font-semibold text-slate-900 dark:text-white">
                                    {getFindingText(c)}
                                  </div>
                                  <div className="text-[10px] text-slate-400 mt-0.5">
                                    Standard: {c.requirement || 'AQL 1.5 Workmanship Standard'}
                                  </div>
                                </td>
                                <td className="py-3 px-4 font-medium text-slate-700 dark:text-slate-300">
                                  {getAssignedToName(c)}
                                </td>
                                <td className="py-3 px-4">
                                  <span className="font-bold text-slate-700 dark:text-slate-300">
                                    {(c.priority || c.riskSeverity || 'MEDIUM').toUpperCase()}
                                  </span>
                                </td>
                                <td className="py-3 px-4">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                    {c.status}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-slate-500">
                                  {getCapTargetDate(c)}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <button
                                    type="button"
                                    onClick={() => setDrilldownComplaint(c)}
                                    className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-cyan-400 font-bold text-[11px] hover:bg-indigo-100 cursor-pointer"
                                  >
                                    Inspect
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* =======================================================================
          VIEW 3: DEPARTMENT MEMBERS REPORT (Requirement 2)
          ======================================================================= */}
      {activeReportTab === 'members-report' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Members Filter & Search Header */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-600" />
                <span>Department Members NC Accountability Report</span>
              </h2>
              <p className="text-xs text-slate-500">
                Displaying all members across factory departments with their individual assigned NCs, resolution rates, and CAP progress.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={memberSearchQuery}
                  onChange={(e) => setMemberSearchQuery(e.target.value)}
                  placeholder="Filter member name or ID..."
                  className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 w-48 sm:w-60"
                />
              </div>
            </div>
          </div>

          {/* Members Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {memberStatsList
              .filter((m) => {
                if (!memberSearchQuery.trim()) return true;
                const q = memberSearchQuery.toLowerCase().trim();
                return (
                  m.name.toLowerCase().includes(q) ||
                  (m.employeeId || '').toLowerCase().includes(q) ||
                  m.department.toLowerCase().includes(q) ||
                  (m.designation || '').toLowerCase().includes(q)
                );
              })
              .map((m) => (
                <div
                  key={m.id}
                  onClick={() => handleInspectMember(m)}
                  className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs hover:border-purple-500 dark:hover:border-purple-500 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
                >
                  <div>
                    {/* Member Header */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-300 font-bold text-sm flex items-center justify-center shrink-0">
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-purple-600 transition-colors">
                            {m.name}
                          </h4>
                          <span className="text-[11px] text-slate-500 font-mono block">
                            {m.employeeId || 'ID: N/A'} • {m.department}
                          </span>
                        </div>
                      </div>

                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${m.capStatusBadge}`}>
                        {m.capStatusLabel}
                      </span>
                    </div>

                    {/* Member Meta */}
                    <div className="text-[11px] text-slate-600 dark:text-slate-400 mb-3 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Briefcase className="w-3 h-3 text-slate-400" />
                        <span>{m.designation || 'Production Supervisor'}</span>
                      </span>
                      {m.mobileNumber && (
                        <span className="font-mono text-slate-400 text-[10px]">
                          {m.mobileNumber}
                        </span>
                      )}
                    </div>

                    {/* KPI Metrics Box */}
                    <div className="grid grid-cols-4 gap-1.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800 text-center font-mono">
                      <div>
                        <span className="text-[9px] uppercase font-bold text-slate-400 block">Total NC</span>
                        <span className="text-sm font-black text-slate-900 dark:text-white">
                          {m.totalNC}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] uppercase font-bold text-amber-500 block">Open</span>
                        <span className="text-sm font-black text-amber-600 dark:text-amber-400">
                          {m.openNC}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] uppercase font-bold text-emerald-500 block">Closed</span>
                        <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                          {m.closedNC}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] uppercase font-bold text-purple-500 block">Pending</span>
                        <span className="text-sm font-black text-purple-600 dark:text-purple-400">
                          {m.pendingNC}
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-slate-500 font-semibold">CAP Completion Rate:</span>
                        <span className="font-mono font-bold text-purple-600 dark:text-purple-400">{m.capRate}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ${
                            m.capRate === 100
                              ? 'bg-emerald-500'
                              : m.capRate >= 60
                              ? 'bg-purple-500'
                              : 'bg-amber-500'
                          }`}
                          style={{ width: `${m.capRate}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-400 text-[11px]">
                      {m.overdueNC > 0 ? (
                        <span className="text-rose-500 font-bold">🚨 {m.overdueNC} Overdue</span>
                      ) : (
                        <span className="text-emerald-600 font-medium">SLA Compliant</span>
                      )}
                    </span>
                    <span className="text-purple-600 dark:text-purple-400 font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                      <span>Inspect NCs &amp; Photos</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              ))}
          </div>

          {/* Members Table View */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-500" />
                <span>Department Members Accountability Register</span>
              </h3>
              <span className="text-xs text-slate-400 font-mono">
                Click any row to drill down into member's individual NC dossier
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-[11px] font-bold text-slate-600 dark:text-slate-400">
                    <th className="py-3 px-4">Member Name</th>
                    <th className="py-3 px-4">Employee ID</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Designation</th>
                    <th className="py-3 px-4 text-center">Total NCs</th>
                    <th className="py-3 px-4 text-center">Open NCs</th>
                    <th className="py-3 px-4 text-center">Closed NCs</th>
                    <th className="py-3 px-4 text-center">Pending NCs</th>
                    <th className="py-3 px-4 text-center">CAP Rate</th>
                    <th className="py-3 px-4">Accountability Status</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {memberStatsList.map((m) => (
                    <tr
                      key={m.id}
                      onClick={() => handleInspectMember(m)}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
                    >
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-purple-500" />
                          <span className="group-hover:text-purple-600 transition-colors">
                            {m.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500">
                        {m.employeeId || 'N/A'}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-700 dark:text-slate-300">
                        {m.department}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {m.designation || 'Supervisor'}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-slate-900 dark:text-white">
                        {m.totalNC}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-amber-600 dark:text-amber-400">
                        {m.openNC}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {m.closedNC}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-purple-600 dark:text-purple-400">
                        {m.pendingNC}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-purple-600 dark:text-purple-400">
                        {m.capRate}%
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${m.capStatusBadge}`}>
                          {m.capStatusLabel}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleInspectMember(m);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 text-purple-600 dark:text-purple-300 font-bold text-[11px] transition-colors cursor-pointer"
                        >
                          Inspect NCs
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =======================================================================
          VIEW 4: INDIVIDUAL MEMBER NC DETAILS (Requirement 3)
          ======================================================================= */}
      {activeReportTab === 'member-detail' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Top Member Selector & Profile Banner */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                  Individual Member NC Audit Dossier
                </span>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <User className="w-5 h-5 text-indigo-600" />
                  <span>{activeMember ? activeMember.name : 'Select Member'}</span>
                  {activeMember?.employeeId && (
                    <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {activeMember.employeeId}
                    </span>
                  )}
                </h2>
              </div>

              {/* Member Selector Dropdown */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                  Switch Member:
                </label>
                <select
                  value={activeMember?.id || ''}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-medium cursor-pointer text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500"
                >
                  {memberStatsList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.department} • {m.totalNC} NCs)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Member Profile KPI Strip */}
            {activeMember && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800 text-center font-mono">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Department</span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate block">
                    {activeMember.department}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Total Assigned NCs</span>
                  <span className="text-lg font-black text-slate-900 dark:text-white">
                    {activeMember.totalNC}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800">
                  <span className="text-[9px] uppercase font-bold text-amber-500 block">Open NCs</span>
                  <span className="text-lg font-black text-amber-600 dark:text-amber-400">
                    {activeMember.openNC}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800">
                  <span className="text-[9px] uppercase font-bold text-emerald-500 block">Closed NCs</span>
                  <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                    {activeMember.closedNC}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800">
                  <span className="text-[9px] uppercase font-bold text-purple-500 block">Pending Review</span>
                  <span className="text-lg font-black text-purple-600 dark:text-purple-400">
                    {activeMember.pendingNC}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800">
                  <span className="text-[9px] uppercase font-bold text-indigo-500 block">CAP Completion Rate</span>
                  <span className="text-lg font-black text-indigo-600 dark:text-cyan-400">
                    {activeMember.capRate}%
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* NC Cards List for Selected Member */}
          {activeMemberComplaints.length === 0 ? (
            <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                <CheckCircle className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                Clean Quality Record
              </h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No non-conformances are currently associated with or assigned to {activeMember?.name}.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-indigo-500" />
                  <span>Associated Non-Conformances ({activeMemberComplaints.length} Records)</span>
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Displaying full finding, CAP, corrective actions, and photo evidence
                </span>
              </div>

              {activeMemberComplaints.map((c, idx) => {
                const isOverdue =
                  c.status !== 'Closed' &&
                  c.status !== 'Verified' &&
                  c.deadlineTimestamp &&
                  Date.now() > new Date(c.deadlineTimestamp).getTime();

                const cRisk = (c.priority || c.riskSeverity || 'MEDIUM').toUpperCase();
                const rootCause = getRootCauseText(c);
                const immediateAction = getImmediateCorrectionText(c);
                const correctiveAction = getCorrectiveActionText(c);
                const preventiveAction = getPreventiveActionText(c);
                const createdDateStr = c.createdAt ? new Date(c.createdAt).toLocaleString() : 'N/A';
                const closureDateStr = c.actualCompletedAt
                  ? new Date(c.actualCompletedAt).toLocaleString()
                  : (c.status === 'Closed' ? 'Verified Effective' : 'Pending Closure');

                return (
                  <div
                    key={c._id || c.id || c.complaintId}
                    className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-4 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all"
                  >
                    {/* Header Ribbon of NC */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2.5">
                        <span className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950 font-mono font-black text-xs text-indigo-600 dark:text-cyan-400">
                          {c.complaintId || `NC-#${idx + 1}`}
                        </span>
                        <div>
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {c.department} • {c.location || 'Floor Station'}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono block">
                            Logged: {createdDateStr} by {getAuditorName(c)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            cRisk === 'CRITICAL'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : cRisk === 'HIGH'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}
                        >
                          Risk: {cRisk}
                        </span>

                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            c.status === 'Closed' || c.status === 'Verified'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : c.status === 'CAP Submitted'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {c.status}
                        </span>

                        {isOverdue && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white animate-pulse">
                            Overdue
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Stage 1: Defect Finding Description & Quality Requirement */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                          Defect Finding Description
                        </span>
                        <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
                          {getFindingText(c)}
                        </p>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                          Quality Requirement / Standard Clause
                        </span>
                        <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
                          {c.requirement || 'AQL 1.5 Workmanship Standard & Factory Quality Protocol'}
                        </p>
                        <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                          Category: {c.category || 'Workmanship Non-Conformance'}
                        </span>
                      </div>
                    </div>

                    {/* Stage 2: CAP 5-Why Root Cause, Containment & Corrective Action */}
                    <div className="p-3.5 rounded-xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>CAP Submission Details &amp; Root Cause Analysis</span>
                        </span>
                        <span className="text-[10px] font-mono text-amber-700 dark:text-amber-400">
                          Target Date: {getCapTargetDate(c)}
                        </span>
                      </div>

                      <div className="text-xs">
                        <strong className="text-amber-900 dark:text-amber-300 block mb-0.5">
                          5-Why Root Cause of Issue:
                        </strong>
                        <p className="text-slate-800 dark:text-slate-200 leading-relaxed">
                          {rootCause}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-amber-200/40 dark:border-amber-800/40">
                        <div className="text-xs">
                          <strong className="text-slate-700 dark:text-slate-300 block mb-0.5">
                            Immediate Containment Action:
                          </strong>
                          <p className="text-slate-600 dark:text-slate-400">
                            {immediateAction}
                          </p>
                        </div>
                        <div className="text-xs">
                          <strong className="text-slate-700 dark:text-slate-300 block mb-0.5">
                            Permanent Corrective Action:
                          </strong>
                          <p className="text-slate-600 dark:text-slate-400">
                            {correctiveAction}
                          </p>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-amber-200/40 dark:border-amber-800/40 text-xs">
                        <strong className="text-slate-700 dark:text-slate-300 block mb-0.5">
                          Preventive Action Recurrence Plan:
                        </strong>
                        <p className="text-slate-600 dark:text-slate-400">
                          {preventiveAction}
                        </p>
                      </div>
                    </div>

                    {/* Stage 3: Verification Details & Closure */}
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                          Verification Method
                        </span>
                        <p className="font-semibold text-slate-800 dark:text-slate-200">
                          {c.verificationMethod || 'Physical Floor Re-inspection'}
                        </p>
                      </div>

                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                          Auditor Verification Notes
                        </span>
                        <p className="text-slate-600 dark:text-slate-400 truncate">
                          {c.cap?.verificationReadinessNotes || c.feedbackRemarks || 'Standard QMS verification'}
                        </p>
                      </div>

                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                          Closure Date
                        </span>
                        <p className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                          {closureDateStr}
                        </p>
                      </div>
                    </div>

                    {/* Stage 4: Before & After Photos Evidence with Lightbox Zoom */}
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <Camera className="w-3.5 h-3.5 text-indigo-500" />
                          <span>Photo Verification Evidence (Before vs After)</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          Click any photo to zoom &amp; inspect
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Before Photo */}
                        <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1 flex items-center justify-between">
                            <span>Before Photo (Defect Raised)</span>
                            <span className="text-rose-500 font-mono">Auditor Proof</span>
                          </span>
                          {c.beforePhoto ? (
                            <div
                              onClick={() =>
                                setLightboxPhoto({
                                  url: c.beforePhoto,
                                  title: `Before Photo: ${c.complaintId}`,
                                  subtitle: `Captured Defect Finding: ${getFindingText(c)}`,
                                })
                              }
                              className="relative group rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 cursor-pointer h-40 bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
                            >
                              <img
                                src={c.beforePhoto}
                                alt="Before Defect"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1">
                                <ZoomIn className="w-4 h-4" />
                                <span>Click to Enlarge</span>
                              </div>
                            </div>
                          ) : (
                            <div className="h-40 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-slate-400 text-xs">
                              <Camera className="w-5 h-5 mb-1 opacity-50" />
                              <span>No Before Photo Attached</span>
                            </div>
                          )}
                        </div>

                        {/* After Photo */}
                        <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1 flex items-center justify-between">
                            <span>After Photo (CAP Rectification Proof)</span>
                            <span className="text-emerald-500 font-mono">Supervisor Proof</span>
                          </span>
                          {c.afterPhoto ? (
                            <div
                              onClick={() =>
                                setLightboxPhoto({
                                  url: c.afterPhoto,
                                  title: `After Photo: ${c.complaintId}`,
                                  subtitle: `CAP Rectification Verification: ${c.status}`,
                                })
                              }
                              className="relative group rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 cursor-pointer h-40 bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
                            >
                              <img
                                src={c.afterPhoto}
                                alt="After CAP Rectification"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1">
                                <ZoomIn className="w-4 h-4" />
                                <span>Click to Enlarge</span>
                              </div>
                            </div>
                          ) : (
                            <div className="h-40 rounded-lg border border-dashed border-amber-200 dark:border-amber-900/60 bg-amber-50/30 dark:bg-amber-950/10 flex flex-col items-center justify-center text-amber-700 dark:text-amber-400 text-xs p-4 text-center">
                              <Clock className="w-5 h-5 mb-1 opacity-70" />
                              <span className="font-semibold">After Proof Pending</span>
                              <span className="text-[10px] text-slate-400 mt-0.5">
                                Supervisor has not yet uploaded corrective action photo.
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Drill-down Full Lifecycle Button */}
                    <div className="flex items-center justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => setDrilldownComplaint(c)}
                        className="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-600 dark:text-cyan-400 font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Inspect Full Audit Lifecycle Modal</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =======================================================================
          LIGHTBOX PHOTO MODAL (High-Resolution Zoom Modal)
          ======================================================================= */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setLightboxPhoto(null)}
        >
          <div
            className="relative max-w-4xl w-full max-h-[92vh] bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3.5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Camera className="w-4 h-4 text-indigo-400" />
                  <span>{lightboxPhoto.title}</span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">{lightboxPhoto.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setLightboxPhoto(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 flex items-center justify-center overflow-auto max-h-[78vh] bg-black/60">
              <img
                src={lightboxPhoto.url}
                alt={lightboxPhoto.title}
                className="max-w-full max-h-[74vh] object-contain rounded-lg shadow-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* =======================================================================
          LIFECYCLE DRILL-DOWN MODAL (100% Preserved Existing Modal)
          ======================================================================= */}
      {drilldownComplaint && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200"
          onClick={() => setDrilldownComplaint(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-3xl w-full p-6 space-y-5 my-8 max-h-[90vh] overflow-y-auto text-left"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-sm font-black text-indigo-600 dark:text-cyan-400 bg-indigo-50 dark:bg-indigo-950 px-2.5 py-1 rounded-lg">
                    {drilldownComplaint.complaintId}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      drilldownComplaint.status === 'Closed' ||
                      drilldownComplaint.status === 'Verified'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {drilldownComplaint.status}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
                    Risk: {(drilldownComplaint.priority || drilldownComplaint.riskSeverity || 'MEDIUM').toUpperCase()}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1">
                  {getFindingText(drilldownComplaint)}
                </h3>
                <p className="text-xs text-slate-500">
                  {drilldownComplaint.department} • {drilldownComplaint.location} • Category: {drilldownComplaint.category}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setDrilldownComplaint(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stage 1: Finding & Occurrence Frequency */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Occurrence Frequency &amp; Recurrence
                </span>
                <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Repeat className="w-4 h-4 text-purple-500" />
                  <span>Occurred {getIssueFrequency(drilldownComplaint)} time(s)</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Standard: {drilldownComplaint.requirement || 'AQL 1.5 Workmanship Standard'}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Auditor Audit Origin
                </span>
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  Auditor: {getAuditorName(drilldownComplaint)}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Logged: {drilldownComplaint.createdAt ? new Date(drilldownComplaint.createdAt).toLocaleString() : 'N/A'}
                </div>
              </div>
            </div>

            {/* Stage 2: Assignment & SLA */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Responsible In-Charge (Resolver)
                </span>
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  {getAssignedToName(drilldownComplaint)}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Designation: {drilldownComplaint.assignedTo?.designation || 'Supervisor'}
                </div>
                <div className="text-[11px] font-mono text-slate-500">
                  Mobile: {drilldownComplaint.assignedTo?.mobileNumber || 'N/A'}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  SLA Timeline &amp; Aging
                </span>
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  Target: {drilldownComplaint.deadlineTimestamp ? new Date(drilldownComplaint.deadlineTimestamp).toLocaleString() : 'N/A'}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Resolution Window: {drilldownComplaint.deadlineHours || 24} Hours
                </div>
                <div className="text-[11px] font-mono text-indigo-600 dark:text-cyan-400 mt-0.5">
                  Current Aging: {getTicketAgeLabel(drilldownComplaint)}
                </div>
              </div>
            </div>

            {/* Stage 3: Root Cause & CAP Directives */}
            <div className="p-4 rounded-2xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 space-y-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 block">
                Stage 3: 5-Why Root Cause &amp; CAP Corrective Actions
              </span>
              <div className="text-xs">
                <strong className="text-amber-900 dark:text-amber-300 block mb-0.5">
                  Root Cause of the Issue:
                </strong>
                <p className="text-slate-800 dark:text-slate-200">
                  {getRootCauseText(drilldownComplaint)}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-amber-200/40 dark:border-amber-900/30">
                <div className="text-xs">
                  <strong className="text-slate-700 dark:text-slate-300 block mb-0.5">
                    Immediate Containment:
                  </strong>
                  <p className="text-slate-600 dark:text-slate-400">
                    {getImmediateCorrectionText(drilldownComplaint)}
                  </p>
                </div>
                <div className="text-xs">
                  <strong className="text-slate-700 dark:text-slate-300 block mb-0.5">
                    Permanent Corrective Fix:
                  </strong>
                  <p className="text-slate-600 dark:text-slate-400">
                    {getCorrectiveActionText(drilldownComplaint)}
                  </p>
                </div>
              </div>
            </div>

            {/* Photos & Evidence preview */}
            {(drilldownComplaint.beforePhoto || drilldownComplaint.afterPhoto) && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 block">
                  Photo Evidence Verification
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {drilldownComplaint.beforePhoto && (
                    <div>
                      <span className="text-[11px] font-semibold text-slate-500 block mb-1">
                        Before Photo (Defect Captured by Auditor):
                      </span>
                      <img
                        src={drilldownComplaint.beforePhoto}
                        alt="Before defect"
                        onClick={() =>
                          setLightboxPhoto({
                            url: drilldownComplaint.beforePhoto,
                            title: `Before Photo: ${drilldownComplaint.complaintId}`,
                            subtitle: getFindingText(drilldownComplaint),
                          })
                        }
                        className="w-full h-36 object-cover rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer hover:opacity-90 transition-opacity"
                      />
                    </div>
                  )}
                  {drilldownComplaint.afterPhoto && (
                    <div>
                      <span className="text-[11px] font-semibold text-slate-500 block mb-1">
                        After Photo (CAP Rectification Proof):
                      </span>
                      <img
                        src={drilldownComplaint.afterPhoto}
                        alt="After defect"
                        onClick={() =>
                          setLightboxPhoto({
                            url: drilldownComplaint.afterPhoto,
                            title: `After Photo: ${drilldownComplaint.complaintId}`,
                            subtitle: `Rectification Status: ${drilldownComplaint.status}`,
                          })
                        }
                        className="w-full h-36 object-cover rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer hover:opacity-90 transition-opacity"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              {onViewDetails ? (
                <button
                  type="button"
                  onClick={() => {
                    const target = drilldownComplaint;
                    setDrilldownComplaint(null);
                    onViewDetails(target);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Full QMS Audit Workbench</span>
                </button>
              ) : onNavigateNC ? (
                <button
                  type="button"
                  onClick={() => {
                    const id = drilldownComplaint.complaintId;
                    setDrilldownComplaint(null);
                    onNavigateNC('all', id);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>View in NC/CAP Register</span>
                </button>
              ) : <div />}

              <button
                type="button"
                onClick={() => setDrilldownComplaint(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors cursor-pointer"
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

export default ReportsView;
