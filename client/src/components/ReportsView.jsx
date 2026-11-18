import React, { useState, useMemo, useEffect } from 'react';
import { DEFECT_CATEGORIES } from './NewComplaintModal';
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
  Tag,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '../context/AuthContext';
import { useUnit } from '../context/UnitContext';
import { drawNCWithPhotos, generateSingleNCPdf } from '../utils/ncPdfGenerator';
import { ExportColumnsModal } from './ExportColumnsModal';
// Pure NC/CAPA Report - no external mock collections

export const ReportsView = ({
  complaints = [],
  departmentData = null,
  onViewDetails = null,
  onNavigateNC = null,
  initialTab = 'audit-register',
  initialCategory = null,
}) => {
  const { user } = useAuth();
  const { units, activeUnitId, isCompanyAdmin, canSwitchUnits } = useUnit();
  const [downloadingCSV, setDownloadingCSV] = useState(false);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportModalFormat, setExportModalFormat] = useState('CSV');

  // ---------------------------------------------------------------------------
  // REPORT VIEW NAVIGATION MODES (Preserving Master Register & Adding Modes)
  // ---------------------------------------------------------------------------
  // 'audit-register': Master NC Report (KPI Scorecard, Filter Bar, Charts, Table)
  // 'dept-report': Department-wise NC Report (Total NCs, Open/Closed/Pending, CAP Status, Drilldown)
  // 'category-report': Defect Category-wise Report (Summary Scorecards, Category Matrix, Category Defect Register)
  // 'members-report': Department Members Report (Roster, Assigned NCs, Open/Closed/Pending, CAP Status)
  // 'member-detail': Individual Member NC Details (NC ID, Finding, Requirement, CAP 5-Why, Photos, Verification)
  const [activeReportTab, setActiveReportTab] = useState(initialTab || 'audit-register');
  const [selectedDeptDetail, setSelectedDeptDetail] = useState(null);
  const [selectedCategoryDetail, setSelectedCategoryDetail] = useState(initialCategory || null);
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  useEffect(() => {
    if (initialTab) {
      setActiveReportTab(initialTab);
    }
    if (initialCategory) {
      setSelectedCategoryDetail(initialCategory);
      setActiveReportTab('category-report');
    }
  }, [initialTab, initialCategory]);

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

  // 3.5 Defect Category Filter
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // 4. Individual Member Filter
  const [memberFilter, setMemberFilter] = useState('ALL');

  // 5. NC Status Filter
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'OPEN' | 'CAP_SUBMITTED' | 'UNDER_REVIEW' | 'CLOSED' | 'OVERDUE'

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

  // 10. Reject & Rework Filter
  const [reworkFilter, setReworkFilter] = useState('ALL'); // 'ALL' | 'REWORK_ONLY' | 'AWAITING_REWORK' | 'REWORK_IN_REVIEW' | 'REWORK_RESOLVED' | 'NO_REWORK'

  // 11. Record Status Filter ('ALL' | 'ACTIVE' | 'DELETED')
  const [recordStatusFilter, setRecordStatusFilter] = useState('ALL');

  // 12. Unit Filter ('UNIT-1', 'UNIT-2', or 'BOTH')
  const [unitFilter, setUnitFilter] = useState(() => (activeUnitId === 'UNIT-2' ? 'UNIT-2' : (activeUnitId === 'BOTH' ? 'BOTH' : 'UNIT-1')));

  useEffect(() => {
    if (activeUnitId === 'UNIT-1' || activeUnitId === 'UNIT-2' || activeUnitId === 'BOTH' || activeUnitId === 'ALL') {
      setUnitFilter(activeUnitId);
    }
  }, [activeUnitId]);

  // 13. Export Scope & Drill-Down Modal State
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
      '—'
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
    return (c.department ? `${c.department} Non-Conformance` : 'Quality Defect').trim().toLowerCase();
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
      'Pending'
    );
  };

  const getRootCauseText = (c) => {
    return (
      c.cap?.rootCause ||
      c.feedbackRemarks ||
      c.actionNotes ||
      'Pending'
    );
  };

  const getCorrectiveActionText = (c) => {
    return (
      c.cap?.correctiveAction ||
      c.actionNotes ||
      'Pending'
    );
  };

  const getPreventiveActionText = (c) => {
    return (
      c.cap?.preventiveAction ||
      'Pending'
    );
  };

  const getDefectCategory = (c) => {
    return (c?.defectCategory || c?.category || 'Workplace Safety').trim();
  };

  const allDefectCategories = useMemo(() => {
    const list = [...DEFECT_CATEGORIES];
    (complaints || []).forEach((c) => {
      const cat = (c?.defectCategory || c?.category || '').trim();
      if (cat && !list.includes(cat)) {
        list.push(cat);
      }
    });
    return list;
  }, [complaints]);

  const categoryCounts = useMemo(() => {
    const counts = {};
    (complaints || []).forEach((c) => {
      const cat = getDefectCategory(c);
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [complaints]);

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
    return c.assignedTo?.name || 'Unassigned';
  };

  const getResponsiblePerson = (c) => {
    return getAssignedToName(c);
  };

  const getAuditorName = (c) => {
    return c.createdBy?.name || '—';
  };

  const getCapTargetDate = (c) => {
    if (c.cap?.targetDate) return new Date(c.cap.targetDate).toLocaleDateString();
    if (c.deadlineTimestamp)
      return new Date(c.deadlineTimestamp).toLocaleDateString();
    return '—';
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

  // Rejection & Rework Data Helpers
  const isRejectRework = (c) => {
    if (!c) return false;
    if (['Rejected / Rework', 'Rejected / Sent Back'].includes(c.status)) return true;
    if (c.cap?.status === 'REJECTED') return true;
    if (c.rejectionReason && c.rejectionReason.trim()) return true;
    if (c.timeline && Array.isArray(c.timeline)) {
      return c.timeline.some(
        (t) => t.action === 'REJECTED' || (t.notes && t.notes.toLowerCase().includes('reject'))
      );
    }
    return false;
  };

  const reworkStats = useMemo(() => {
    const totalRework = complaints.filter(isRejectRework).length;
    const awaiting = complaints.filter((c) =>
      ['Rejected / Rework', 'Rejected / Sent Back'].includes(c.status)
    ).length;
    const inReview = complaints.filter(
      (c) =>
        isRejectRework(c) &&
        ['CAP Submitted', 'Under Review', 'Under Verification'].includes(c.status)
    ).length;
    const resolved = complaints.filter(
      (c) => isRejectRework(c) && ['Closed', 'Verified'].includes(c.status)
    ).length;
    return {
      total: totalRework,
      awaiting,
      inReview,
      resolved,
    };
  }, [complaints]);

  const getRejectionReasonText = (c) => {
    if (c.rejectionReason && c.rejectionReason.trim()) return c.rejectionReason.trim();
    if (c.cap?.rejectionReason && c.cap.rejectionReason.trim()) return c.cap.rejectionReason.trim();
    if (c.timeline && Array.isArray(c.timeline)) {
      const rejEntry = [...c.timeline].reverse().find(
        (t) => t.action === 'REJECTED' || (t.notes && t.notes.toLowerCase().includes('reject'))
      );
      if (rejEntry?.notes) {
        return rejEntry.notes.replace(/^Audit rejected resolution and returned to line for rework\.\s*Reason:\s*/i, '');
      }
    }
    if (['Rejected / Rework', 'Rejected / Sent Back'].includes(c.status)) {
      return c.feedbackRemarks || 'Auditor rejected resolution and returned to floor for rework.';
    }
    return 'Auditor returned non-conformance for rework.';
  };

  const getRejectionAuditor = (c) => {
    if (c.timeline && Array.isArray(c.timeline)) {
      const rejEntry = [...c.timeline].reverse().find((t) => t.action === 'REJECTED');
      if (rejEntry?.performedBy?.name) return rejEntry.performedBy.name;
    }
    return c.createdBy?.name || 'Quality Auditor';
  };

  const getRejectionTimestamp = (c) => {
    if (c.timeline && Array.isArray(c.timeline)) {
      const rejEntry = [...c.timeline].reverse().find((t) => t.action === 'REJECTED');
      if (rejEntry?.timestamp) return new Date(rejEntry.timestamp).toLocaleDateString();
    }
    return c.updatedAt ? new Date(c.updatedAt).toLocaleDateString() : 'N/A';
  };

  // ---------------------------------------------------------------------------
  // LIVE NC / CAPA MASTER DATASETS (Extracted Strictly from Complaints Dataset)
  // ---------------------------------------------------------------------------
  // 1. Departments extracted strictly from actual NC / CAPA complaints
  const consolidatedDepartmentsList = useMemo(() => {
    const deptMap = new Map();

    (complaints || []).forEach((c) => {
      const deptName = (c.department || '').trim();
      if (deptName) {
        const key = norm(deptName);
        if (!deptMap.has(key)) {
          deptMap.set(key, {
            name: deptName,
            code: c.departmentCode || '',
            manager: c.departmentHead || c.manager || '',
          });
        }
      }
    });

    return Array.from(deptMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [complaints]);

  // 2. Members/Resolvers extracted strictly from actual NC / CAPA complaints
  const consolidatedMembersList = useMemo(() => {
    const memberMap = new Map();

    (complaints || []).forEach((c) => {
      // Check assignedTo
      const a = c.assignedTo;
      if (a) {
        const name = typeof a === 'object' ? (a.name || '').trim() : String(a).trim();
        if (name && name.toLowerCase() !== 'unassigned') {
          const key = norm(name);
          if (!memberMap.has(key)) {
            memberMap.set(key, {
              id: (typeof a === 'object' && (a.userId || a.employeeId || a._id || a.id)) || `mem-${name}`,
              employeeId: typeof a === 'object' ? a.employeeId || '' : '',
              name: name,
              department: (typeof a === 'object' && a.department) || c.department || '',
              designation: typeof a === 'object' ? a.designation || '' : '',
              role: typeof a === 'object' ? a.role || '' : '',
              mobileNumber: typeof a === 'object' ? a.mobileNumber || '' : '',
              email: typeof a === 'object' ? a.email || '' : '',
            });
          } else {
            const existing = memberMap.get(key);
            if (!existing.employeeId && typeof a === 'object' && a.employeeId) existing.employeeId = a.employeeId;
            if (!existing.department && typeof a === 'object' && a.department) existing.department = a.department;
            if (!existing.designation && typeof a === 'object' && a.designation) existing.designation = a.designation;
            if (!existing.mobileNumber && typeof a === 'object' && a.mobileNumber) existing.mobileNumber = a.mobileNumber;
          }
        }
      }

      // Check cap.responsiblePerson
      if (c.cap?.responsiblePerson) {
        const rp = c.cap.responsiblePerson;
        const rpName = typeof rp === 'object' ? (rp.name || '').trim() : String(rp).trim();
        if (rpName && rpName.toLowerCase() !== 'unassigned') {
          const key = norm(rpName);
          if (!memberMap.has(key)) {
            memberMap.set(key, {
              id: (typeof rp === 'object' && (rp.userId || rp.employeeId || rp._id || rp.id)) || `mem-${rpName}`,
              employeeId: typeof rp === 'object' ? rp.employeeId || '' : '',
              name: rpName,
              department: (typeof rp === 'object' && rp.department) || c.department || '',
              designation: typeof rp === 'object' ? rp.designation || '' : '',
              role: typeof rp === 'object' ? rp.role || '' : '',
              mobileNumber: typeof rp === 'object' ? rp.mobileNumber || '' : '',
              email: typeof rp === 'object' ? rp.email || '' : '',
            });
          }
        }
      }
    });

    return Array.from(memberMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [complaints]);

  // Helper: Match complaint to member
  const isComplaintAssignedToMember = (c, member) => {
    if (!member || !c) return false;
    const mId = String(member.id || member._id || '');
    const mEmp = member.employeeId ? norm(member.employeeId) : '';
    const mName = member.name ? norm(member.name) : '';

    if (c.assignedTo) {
      const cUid = String(c.assignedTo.userId || c.assignedTo.id || c.assignedTo._id || '');
      if (mId && cUid && cUid === mId) return true;
      if (mEmp && c.assignedTo.employeeId && norm(c.assignedTo.employeeId) === mEmp) return true;
      if (mName && c.assignedTo.name && norm(c.assignedTo.name) === mName) return true;
      if (typeof c.assignedTo === 'string' && mName && norm(c.assignedTo) === mName) return true;
    }

    const resolvedName = norm(getAssignedToName(c));
    if (mName && resolvedName === mName) return true;

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
      if (name && name !== 'Unassigned') {
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
      // 0. Record Status Filter (All Records / Active NC / Deleted NC)
      if (recordStatusFilter === 'ACTIVE' && c.isDeleted) return false;
      if (recordStatusFilter === 'DELETED' && !c.isDeleted) return false;

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
        if (
          statusFilter === 'REWORK' &&
          !['Rejected / Rework', 'Rejected / Sent Back'].includes(c.status)
        )
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

      // 3.5 Defect Category Filter
      if (categoryFilter !== 'ALL') {
        if (norm(getDefectCategory(c)) !== norm(categoryFilter)) return false;
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

      // 10. Reject & Rework Filter
      if (reworkFilter !== 'ALL') {
        const isRework = isRejectRework(c);
        if (reworkFilter === 'REWORK_ONLY' && !isRework) return false;
        if (
          reworkFilter === 'AWAITING_REWORK' &&
          !['Rejected / Rework', 'Rejected / Sent Back'].includes(c.status)
        )
          return false;
        if (
          reworkFilter === 'REWORK_IN_REVIEW' &&
          !(
            isRework &&
            ['CAP Submitted', 'Under Review', 'Under Verification'].includes(
              c.status
            )
          )
        )
          return false;
        if (
          reworkFilter === 'REWORK_RESOLVED' &&
          !(isRework && ['Closed', 'Verified'].includes(c.status))
        )
          return false;
        if (reworkFilter === 'NO_REWORK' && isRework) return false;
      }

      // 11. Date Range Filter
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
          (c.requirement || '').toLowerCase().includes(term) ||
          getFindingText(c).toLowerCase().includes(term) ||
          getAssignedToName(c).toLowerCase().includes(term) ||
          (c.createdBy?.name || '').toLowerCase().includes(term) ||
          getRootCauseText(c).toLowerCase().includes(term);

        if (!matchesSearch) return false;
      }

      // 12. Unit Filter (Unit 1, Unit 2, or Both Units)
      const cUnit = c.unitId || 'UNIT-1';
      if (unitFilter !== 'ALL' && unitFilter !== 'BOTH' && cUnit !== unitFilter) return false;

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
    reworkFilter,
    recordStatusFilter,
    unitFilter,
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
    if (categoryFilter !== 'ALL') count++;
    if (memberFilter !== 'ALL') count++;
    if (statusFilter !== 'ALL') count++;
    if (riskFilter !== 'ALL') count++;
    if (capStatusFilter !== 'ALL') count++;
    if (responsibleFilter !== 'ALL') count++;
    if (auditorFilter !== 'ALL') count++;
    if (agingFilter !== 'ALL') count++;
    if (repeatFilter !== 'ALL') count++;
    if (reworkFilter !== 'ALL') count++;
    if (recordStatusFilter !== 'ALL') count++;
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
    reworkFilter,
    recordStatusFilter,
  ]);

  const hasActiveFilters = activeFilterCount > 0;

  const handleResetFilters = () => {
    setSearchTerm('');
    setDatePreset('ALL');
    setStartDate('');
    setEndDate('');
    setDepartmentFilter('ALL');
    setCategoryFilter('ALL');
    setSelectedCategoryDetail(null);
    setMemberFilter('ALL');
    setStatusFilter('ALL');
    setRiskFilter('ALL');
    setCapStatusFilter('ALL');
    setResponsibleFilter('ALL');
    setAuditorFilter('ALL');
    setAgingFilter('ALL');
    setRepeatFilter('ALL');
    setReworkFilter('ALL');
    setRecordStatusFilter('ALL');
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
  const activeCount = complaints.filter((c) => !c.isDeleted).length;
  const deletedCount = complaints.filter((c) => c.isDeleted).length;
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
      : 0;
  const overallCapRate =
    filteredCount > 0
      ? Math.round((closedCount / filteredCount) * 100)
      : 0;

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

      const dCapRate = dTotal > 0 ? Math.round((dClosed / dTotal) * 100) : 0;

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

      const mCapRate = mTotal > 0 ? Math.round((mClosed / mTotal) * 100) : 0;

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
  // 3. DEFECT CATEGORIES SUMMARY LIST
  // ---------------------------------------------------------------------------
  const categoryStatsList = useMemo(() => {
    return allDefectCategories.map((category) => {
      const catComplaints = filteredComplaints.filter((c) =>
        norm(getDefectCategory(c)) === norm(category)
      );
      const totalNC = catComplaints.length;
      const criticalNC = catComplaints.filter(
        (c) => (c.priority || c.riskSeverity || '').toUpperCase() === 'CRITICAL'
      ).length;
      const majorNC = catComplaints.filter(
        (c) =>
          (c.priority || c.riskSeverity || '').toUpperCase() === 'HIGH' ||
          (c.priority || c.riskSeverity || '').toUpperCase() === 'MAJOR'
      ).length;
      const minorNC = catComplaints.filter(
        (c) =>
          (c.priority || c.riskSeverity || '').toUpperCase() === 'MEDIUM' ||
          (c.priority || c.riskSeverity || '').toUpperCase() === 'LOW' ||
          (c.priority || c.riskSeverity || '').toUpperCase() === 'MINOR'
      ).length;
      const observationNC = catComplaints.filter(
        (c) => (c.priority || c.riskSeverity || '').toUpperCase() === 'OBSERVATION'
      ).length;
      const openNC = catComplaints.filter((c) =>
        ['Open', 'Assigned', 'In Progress'].includes(c.status)
      ).length;
      const pendingNC = catComplaints.filter((c) =>
        ['CAP Submitted', 'Under Review', 'Under Verification', 'Rejected / Rework', 'Draft'].includes(c.status)
      ).length;
      const closedNC = catComplaints.filter((c) =>
        ['Closed', 'Verified'].includes(c.status)
      ).length;
      const overdueNC = catComplaints.filter((c) => {
        if (['Closed', 'Verified'].includes(c.status)) return false;
        return c.deadlineTimestamp && Date.now() > new Date(c.deadlineTimestamp).getTime();
      }).length;

      const capRate = totalNC > 0 ? Math.round((closedNC / totalNC) * 100) : 0;
      const depts = Array.from(new Set(catComplaints.map((c) => c.department).filter(Boolean)));
      const departmentsSummary = depts.length > 0 ? depts.join(', ') : 'None';

      let statusLabel = 'Clear';
      if (totalNC > 0) {
        if (closedNC === totalNC) statusLabel = '100% Resolved';
        else if (overdueNC > 0) statusLabel = `${overdueNC} Overdue Breaches`;
        else if (pendingNC > 0) statusLabel = `${pendingNC} In Review`;
        else statusLabel = `${openNC} Open Defect Actions`;
      }

      return {
        category,
        totalNC,
        criticalNC,
        majorNC,
        minorNC,
        observationNC,
        openNC,
        pendingNC,
        closedNC,
        overdueNC,
        capRate,
        departments: depts,
        departmentsSummary,
        statusLabel,
        complaints: catComplaints,
      };
    });
  }, [allDefectCategories, filteredComplaints]);

  // ---------------------------------------------------------------------------
  // EXPORT COLUMNS DEFINITIONS & PRESETS (For Dynamic CSV & PDF Export Checklist)
  // ---------------------------------------------------------------------------
  const { currentAvailableColumns, currentPresets, currentReportTitle, currentDatasetCount } = useMemo(() => {
    if (activeReportTab === 'dept-report') {
      return {
        currentReportTitle: 'Department Summary',
        currentDatasetCount: departmentStatsList.length,
        currentAvailableColumns: [
          { id: 'department', label: 'Department Name', category: 'General', default: true, getValue: (d) => d.department },
          { id: 'code', label: 'Department Code', category: 'General', default: false, getValue: (d) => d.code || '' },
          { id: 'manager', label: 'Department Manager / Person', category: 'General', default: true, getValue: (d) => d.manager || '—' },
          { id: 'headcount', label: 'Factory Headcount', category: 'General', default: false, getValue: (d) => String(d.headcount || 0) },
          { id: 'totalNC', label: 'Total NCs Raised', category: 'Metrics', default: true, getValue: (d) => String(d.totalNC) },
          { id: 'openNC', label: 'Open / In Progress NCs', category: 'Metrics', default: true, getValue: (d) => String(d.openNC) },
          { id: 'closedNC', label: 'Verified & Closed NCs', category: 'Metrics', default: true, getValue: (d) => String(d.closedNC) },
          { id: 'pendingNC', label: 'Pending CAP Review NCs', category: 'Metrics', default: true, getValue: (d) => String(d.pendingNC) },
          { id: 'overdueNC', label: 'Overdue SLA Breaches', category: 'Metrics', default: true, getValue: (d) => String(d.overdueNC) },
          { id: 'criticalNC', label: 'Critical Risk NCs', category: 'Metrics', default: false, getValue: (d) => String(d.criticalNC) },
          { id: 'capRate', label: 'CAP Completion Rate (%)', category: 'Performance', default: true, getValue: (d) => `${d.capRate}%` },
          { id: 'capStatusLabel', label: 'CAP Status Label', category: 'Performance', default: true, getValue: (d) => d.capStatusLabel },
        ],
        currentPresets: [
          { id: 'essential', label: 'Essential Metrics', columns: ['department', 'manager', 'totalNC', 'openNC', 'closedNC', 'capRate'] },
          { id: 'full', label: 'Complete Department Matrix', columns: ['department', 'code', 'manager', 'headcount', 'totalNC', 'openNC', 'closedNC', 'pendingNC', 'overdueNC', 'criticalNC', 'capRate', 'capStatusLabel'] },
        ],
      };
    }

    if (activeReportTab === 'category-report') {
      if (selectedCategoryDetail) {
        const currentCat = categoryStatsList.find((cat) => norm(cat.category) === norm(selectedCategoryDetail));
        const catComplaints = currentCat ? currentCat.complaints : [];
        return {
          currentReportTitle: `Defect Category: ${selectedCategoryDetail}`,
          currentDatasetCount: catComplaints.length,
          currentAvailableColumns: [
            { id: 'complaintId', label: 'NC ID', category: 'Basic Details', default: true, getValue: (c) => c.complaintId || '' },
            { id: 'category', label: 'Defect Category', category: 'Basic Details', default: true, getValue: (c) => getDefectCategory(c) },
            { id: 'department', label: 'Department', category: 'Basic Details', default: true, getValue: (c) => c.department || '' },
            { id: 'plantUnit', label: 'Plant Unit', category: 'Basic Details', default: false, getValue: (c) => c.unitName || (c.unitId === 'UNIT-2' ? 'Unit 2' : 'Unit 1') },
            { id: 'priority', label: 'Risk Severity', category: 'Basic Details', default: true, getValue: (c) => (c.priority || c.riskSeverity || 'MEDIUM').toUpperCase() },
            { id: 'status', label: 'Lifecycle Status', category: 'Basic Details', default: true, getValue: (c) => c.status || '' },
            { id: 'findingDescription', label: 'Finding Description', category: 'Finding Details', default: true, getValue: (c) => getFindingText(c), getPdfValue: (c) => getFindingText(c).slice(0, 45) },
            { id: 'assignedTo', label: 'Assigned Resolver', category: 'Auditor & Ownership', default: true, getValue: (c) => getAssignedToName(c) },
            { id: 'createdAt', label: 'Logged Date', category: 'Dates & SLA', default: true, getValue: (c) => c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '' },
            { id: 'deadlineTimestamp', label: 'Target Due Date', category: 'Dates & SLA', default: false, getValue: (c) => c.deadlineTimestamp ? new Date(c.deadlineTimestamp).toLocaleDateString() : '' },
            { id: 'immediateCorrection', label: 'Immediate Correction', category: 'CAPA & Root Cause', default: false, getValue: (c) => getImmediateCorrectionText(c) },
            { id: 'rootCause', label: 'Root Cause', category: 'CAPA & Root Cause', default: false, getValue: (c) => getRootCauseText(c) },
            { id: 'correctiveAction', label: 'Corrective Action (CAPA)', category: 'CAPA & Root Cause', default: false, getValue: (c) => getCorrectiveActionText(c) },
            { id: 'preventiveAction', label: 'Preventive Action', category: 'CAPA & Root Cause', default: false, getValue: (c) => getPreventiveActionText(c) },
            { id: 'actualCompletedAt', label: 'Closed Date', category: 'Dates & SLA', default: false, getValue: (c) => c.actualCompletedAt ? new Date(c.actualCompletedAt).toLocaleDateString() : '' },
          ],
          currentPresets: [
            { id: 'cat-summary', label: 'Core Summary', columns: ['complaintId', 'category', 'department', 'priority', 'status', 'findingDescription', 'assignedTo'] },
            { id: 'cat-capa', label: 'CAPA Details', columns: ['complaintId', 'findingDescription', 'immediateCorrection', 'rootCause', 'correctiveAction', 'preventiveAction'] },
          ],
        };
      }

      return {
        currentReportTitle: 'Defect Category Matrix',
        currentDatasetCount: categoryStatsList.length,
        currentAvailableColumns: [
          { id: 'category', label: 'Defect Category', category: 'General', default: true, getValue: (cat) => cat.category },
          { id: 'totalNC', label: 'Total NCs Raised', category: 'Volume', default: true, getValue: (cat) => String(cat.totalNC) },
          { id: 'criticalNC', label: 'Critical Risk NCs', category: 'Severity', default: true, getValue: (cat) => String(cat.criticalNC) },
          { id: 'majorNC', label: 'Major Risk NCs', category: 'Severity', default: false, getValue: (cat) => String(cat.majorNC) },
          { id: 'minorNC', label: 'Minor Risk NCs', category: 'Severity', default: false, getValue: (cat) => String(cat.minorNC) },
          { id: 'observationNC', label: 'Observation NCs', category: 'Severity', default: false, getValue: (cat) => String(cat.observationNC) },
          { id: 'openNC', label: 'Open NCs', category: 'Status', default: true, getValue: (cat) => String(cat.openNC) },
          { id: 'pendingNC', label: 'CAPA Under Review', category: 'Status', default: true, getValue: (cat) => String(cat.pendingNC) },
          { id: 'closedNC', label: 'Verified & Closed NCs', category: 'Status', default: true, getValue: (cat) => String(cat.closedNC) },
          { id: 'overdueNC', label: 'Overdue SLA Breaches', category: 'Status', default: true, getValue: (cat) => String(cat.overdueNC) },
          { id: 'capRate', label: 'Resolution Rate (%)', category: 'Performance', default: true, getValue: (cat) => `${cat.capRate}%` },
          { id: 'departmentsSummary', label: 'Affected Departments', category: 'General', default: true, getValue: (cat) => cat.departmentsSummary || '' },
          { id: 'statusLabel', label: 'Status Label', category: 'Performance', default: false, getValue: (cat) => cat.statusLabel },
        ],
        currentPresets: [
          { id: 'cat-essential', label: 'Key Overview', columns: ['category', 'totalNC', 'criticalNC', 'openNC', 'closedNC', 'capRate'] },
          { id: 'cat-full', label: 'Full Category Matrix', columns: ['category', 'totalNC', 'criticalNC', 'majorNC', 'minorNC', 'openNC', 'pendingNC', 'closedNC', 'overdueNC', 'capRate', 'departmentsSummary'] },
        ],
      };
    }

    if (activeReportTab === 'members-report') {
      return {
        currentReportTitle: 'Department Members Report',
        currentDatasetCount: memberStatsList.length,
        currentAvailableColumns: [
          { id: 'name', label: 'Member Name', category: 'Profile', default: true, getValue: (m) => m.name },
          { id: 'employeeId', label: 'Employee ID', category: 'Profile', default: true, getValue: (m) => m.employeeId || '' },
          { id: 'department', label: 'Assigned Department', category: 'Profile', default: true, getValue: (m) => m.department },
          { id: 'designation', label: 'Designation', category: 'Profile', default: true, getValue: (m) => m.designation || '—' },
          { id: 'role', label: 'User Role', category: 'Profile', default: false, getValue: (m) => m.role || 'ACTION_PERSON' },
          { id: 'mobileNumber', label: 'Contact Mobile Number', category: 'Contact', default: false, getValue: (m) => m.mobileNumber || '' },
          { id: 'email', label: 'Email Address', category: 'Contact', default: false, getValue: (m) => m.email || '' },
          { id: 'totalNC', label: 'Total NCs Assigned', category: 'Metrics', default: true, getValue: (m) => String(m.totalNC) },
          { id: 'openNC', label: 'Open / In Progress NCs', category: 'Metrics', default: true, getValue: (m) => String(m.openNC) },
          { id: 'closedNC', label: 'Closed & Verified NCs', category: 'Metrics', default: true, getValue: (m) => String(m.closedNC) },
          { id: 'pendingNC', label: 'Pending CAP Review NCs', category: 'Metrics', default: true, getValue: (m) => String(m.pendingNC) },
          { id: 'overdueNC', label: 'Overdue SLA NCs', category: 'Metrics', default: true, getValue: (m) => String(m.overdueNC) },
          { id: 'capRate', label: 'CAP Completion Rate (%)', category: 'Performance', default: true, getValue: (m) => `${m.capRate}%` },
          { id: 'capStatusLabel', label: 'Accountability Status', category: 'Performance', default: true, getValue: (m) => m.capStatusLabel },
        ],
        currentPresets: [
          { id: 'mem-core', label: 'Member Core', columns: ['name', 'employeeId', 'department', 'designation', 'totalNC', 'openNC', 'closedNC', 'capRate'] },
          { id: 'mem-full', label: 'All Member Details', columns: ['name', 'employeeId', 'department', 'designation', 'role', 'mobileNumber', 'email', 'totalNC', 'openNC', 'closedNC', 'pendingNC', 'overdueNC', 'capRate', 'capStatusLabel'] },
        ],
      };
    }

    if (activeReportTab === 'member-detail') {
      return {
        currentReportTitle: `Member Dossier: ${activeMember ? activeMember.name : 'Individual'}`,
        currentDatasetCount: activeMemberComplaints.length,
        currentAvailableColumns: [
          { id: 'complaintId', label: 'Non-Conformance ID', category: 'Basic Details', default: true, getValue: (c) => c.complaintId || '' },
          { id: 'assignedName', label: 'Assigned Member Name', category: 'Basic Details', default: false, getValue: (c) => activeMember?.name || getAssignedToName(c) },
          { id: 'assignedEmpId', label: 'Member Employee ID', category: 'Basic Details', default: false, getValue: (c) => activeMember?.employeeId || c.assignedTo?.employeeId || '' },
          { id: 'department', label: 'Department', category: 'Basic Details', default: true, getValue: (c) => c.department || '' },
          { id: 'location', label: 'Plant Location', category: 'Basic Details', default: false, getValue: (c) => c.location || '' },
          { id: 'priority', label: 'Risk Severity', category: 'Basic Details', default: true, getValue: (c) => c.priority || c.riskSeverity || 'Medium' },
          { id: 'status', label: 'Current Lifecycle Status', category: 'Basic Details', default: true, getValue: (c) => c.status || 'Open' },
          { id: 'findingDescription', label: 'Finding Description', category: 'Finding Details', default: true, getValue: (c) => getFindingText(c), getPdfValue: (c) => getFindingText(c).slice(0, 45) },
          { id: 'requirement', label: 'Quality Requirement / Standard', category: 'Finding Details', default: false, getValue: (c) => c.requirement || '—' },
          { id: 'createdAt', label: 'NC Creation Date', category: 'Dates & SLA', default: true, getValue: (c) => c.createdAt ? new Date(c.createdAt).toLocaleString() : '', getPdfValue: (c) => c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '' },
          { id: 'auditorName', label: 'Auditor Name', category: 'Auditor & Ownership', default: false, getValue: (c) => getAuditorName(c) },
          { id: 'rootCause', label: '5-Why Root Cause', category: 'CAPA & Root Cause', default: false, getValue: (c) => getRootCauseText(c) },
          { id: 'immediateCorrection', label: 'Immediate Containment Action', category: 'CAPA & Root Cause', default: false, getValue: (c) => getImmediateCorrectionText(c) },
          { id: 'correctiveAction', label: 'Permanent Corrective Action', category: 'CAPA & Root Cause', default: false, getValue: (c) => getCorrectiveActionText(c) },
          { id: 'preventiveAction', label: 'Preventive Recurrence Plan', category: 'CAPA & Root Cause', default: false, getValue: (c) => getPreventiveActionText(c) },
          { id: 'capTargetDate', label: 'CAP Target Due Date', category: 'Dates & SLA', default: false, getValue: (c) => getCapTargetDate(c) },
          { id: 'verificationMethod', label: 'Verification Method', category: 'Verification & Evidence', default: false, getValue: (c) => c.verificationMethod || '—' },
          { id: 'verificationReadinessNotes', label: 'Auditor Readiness Notes', category: 'Verification & Evidence', default: false, getValue: (c) => c.cap?.verificationReadinessNotes || '' },
          { id: 'actualCompletedAt', label: 'Approved Closure Date', category: 'Dates & SLA', default: true, getValue: (c) => c.actualCompletedAt ? new Date(c.actualCompletedAt).toLocaleString() : 'Pending Closure', getPdfValue: (c) => c.actualCompletedAt ? new Date(c.actualCompletedAt).toLocaleDateString() : 'Pending' },
          { id: 'beforePhoto', label: 'Before Photo Status', category: 'Verification & Evidence', default: false, getValue: (c) => c.beforePhoto ? 'Yes (Photo Attached)' : 'No' },
          { id: 'afterPhoto', label: 'After Photo Status', category: 'Verification & Evidence', default: false, getValue: (c) => c.afterPhoto ? 'Yes (Proof Attached)' : 'Pending' },
        ],
        currentPresets: [
          { id: 'dossier-core', label: 'Core Register', columns: ['complaintId', 'department', 'priority', 'status', 'findingDescription', 'createdAt', 'actualCompletedAt'] },
          { id: 'dossier-capa', label: 'CAPA Root Cause', columns: ['complaintId', 'findingDescription', 'rootCause', 'immediateCorrection', 'correctiveAction', 'preventiveAction', 'capTargetDate'] },
        ],
      };
    }

    // Default: audit-register (Master Register)
    return {
      currentReportTitle: 'Master Non-Conformance Register',
      currentDatasetCount: datasetToExport.length,
      currentAvailableColumns: [
        { id: 'complaintId', label: 'Non-Conformance ID', category: 'Basic Details', default: true, getValue: (c) => c.complaintId || 'NC-N/A' },
        { id: 'recordStatus', label: 'Record Status', category: 'Basic Details', default: false, getValue: (c) => (c.isDeleted ? 'Deleted NC' : 'Active NC') },
        { id: 'status', label: 'Lifecycle Status', category: 'Basic Details', default: true, getValue: (c) => (c.isDeleted ? `Deleted (${c.status})` : c.status || 'Open') },
        { id: 'priority', label: 'Risk Severity / Priority', category: 'Basic Details', default: true, getValue: (c) => (c.priority || c.riskSeverity || 'MEDIUM').toUpperCase() },
        { id: 'department', label: 'Department', category: 'Basic Details', default: true, getValue: (c) => c.department || '—' },
        { id: 'location', label: 'Plant Location / Station', category: 'Basic Details', default: false, getValue: (c) => c.location || '—' },
        { id: 'unit', label: 'Factory Unit', category: 'Basic Details', default: false, getValue: (c) => c.unitName || (c.unitId === 'UNIT-2' ? 'Unit 2' : 'Unit 1') },
        { id: 'defectCategory', label: 'Defect Category', category: 'Basic Details', default: false, getValue: (c) => getDefectCategory(c) },
        { id: 'findingDescription', label: 'Defect Finding Description', category: 'Finding Details', default: true, getValue: (c) => getFindingText(c), getPdfValue: (c) => getFindingText(c).slice(0, 45) },
        { id: 'requirement', label: 'Quality Requirement', category: 'Finding Details', default: false, getValue: (c) => c.requirement || '—' },
        { id: 'issueFrequency', label: 'Issue Occurrence Frequency', category: 'Finding Details', default: false, getValue: (c) => String(getIssueFrequency(c)) },
        { id: 'ticketAging', label: 'Ticket Aging Duration', category: 'Dates & SLA', default: false, getValue: (c) => getTicketAgeLabel(c) },
        { id: 'createdAt', label: 'Creation Timestamp', category: 'Dates & SLA', default: true, getValue: (c) => (c.createdAt ? new Date(c.createdAt).toLocaleString() : 'N/A'), getPdfValue: (c) => (c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'N/A') },
        { id: 'deadlineTimestamp', label: 'Target SLA Deadline Date', category: 'Dates & SLA', default: false, getValue: (c) => (c.deadlineTimestamp ? new Date(c.deadlineTimestamp).toLocaleString() : '—'), getPdfValue: (c) => (c.deadlineTimestamp ? new Date(c.deadlineTimestamp).toLocaleDateString() : '—') },
        { id: 'deadlineHours', label: 'SLA Target Duration (Hours)', category: 'Dates & SLA', default: false, getValue: (c) => String(c.deadlineHours || 24) },
        {
          id: 'slaCondition',
          label: 'SLA Condition Status',
          category: 'Dates & SLA',
          default: true,
          getValue: (c) => {
            const isOverdue = c.status !== 'Closed' && c.status !== 'Verified' && c.deadlineTimestamp && Date.now() > new Date(c.deadlineTimestamp).getTime();
            return isOverdue ? 'Overdue Breach' : 'Within SLA';
          },
        },
        { id: 'assignedTo', label: 'Assigned To (Responsible)', category: 'Auditor & Ownership', default: true, getValue: (c) => getAssignedToName(c) },
        { id: 'assignedEmpId', label: 'Assigned Supervisor Employee ID', category: 'Auditor & Ownership', default: false, getValue: (c) => c.assignedTo?.employeeId || '' },
        { id: 'assignedDesignation', label: 'Assigned Supervisor Designation', category: 'Auditor & Ownership', default: false, getValue: (c) => c.assignedTo?.designation || '' },
        { id: 'auditorName', label: 'Auditor Name', category: 'Auditor & Ownership', default: false, getValue: (c) => getAuditorName(c) },
        { id: 'auditorEmpId', label: 'Auditor Employee ID', category: 'Auditor & Ownership', default: false, getValue: (c) => c.createdBy?.employeeId || '' },
        { id: 'capRequired', label: 'CAP Requirement', category: 'CAPA & Root Cause', default: false, getValue: (c) => (c.capRequired ? 'Mandatory CAP' : 'Direct Correction') },
        { id: 'capStatus', label: 'CAP Lifecycle Status', category: 'CAPA & Root Cause', default: false, getValue: (c) => c.cap?.status || (c.status === 'Closed' ? 'VERIFIED_EFFECTIVE' : 'IN_PROGRESS') },
        { id: 'immediateCorrection', label: 'Immediate Correction (Containment)', category: 'CAPA & Root Cause', default: false, getValue: (c) => getImmediateCorrectionText(c) },
        { id: 'rootCause', label: 'Root Cause (5-Why Analysis)', category: 'CAPA & Root Cause', default: false, getValue: (c) => getRootCauseText(c) },
        { id: 'correctiveAction', label: 'Corrective Action (Permanent Fix)', category: 'CAPA & Root Cause', default: false, getValue: (c) => getCorrectiveActionText(c) },
        { id: 'preventiveAction', label: 'Preventive Action Plan', category: 'CAPA & Root Cause', default: false, getValue: (c) => getPreventiveActionText(c) },
        { id: 'capTargetDate', label: 'CAP Target Date', category: 'CAPA & Root Cause', default: false, getValue: (c) => getCapTargetDate(c) },
        { id: 'beforePhoto', label: 'Before Photo Attached Status', category: 'Verification & Evidence', default: false, getValue: (c) => (c.beforePhoto ? 'Yes (Photo Captured)' : 'No Photo') },
        { id: 'afterPhoto', label: 'After Proof Photo Evidence', category: 'Verification & Evidence', default: false, getValue: (c) => (c.afterPhoto ? 'Yes (Proof Uploaded)' : 'Pending After Proof') },
        { id: 'actualCompletedAt', label: 'Approved Closure Date', category: 'Verification & Evidence', default: false, getValue: (c) => (c.actualCompletedAt ? new Date(c.actualCompletedAt).toLocaleString() : 'Pending Closure'), getPdfValue: (c) => (c.actualCompletedAt ? new Date(c.actualCompletedAt).toLocaleDateString() : 'Pending') },
        { id: 'deletedAt', label: 'Deleted Timestamp', category: 'Audit Log', default: false, getValue: (c) => (c.deletedAt ? new Date(c.deletedAt).toLocaleString() : ''), getPdfValue: (c) => (c.deletedAt ? new Date(c.deletedAt).toLocaleDateString() : '') },
        { id: 'deletedBy', label: 'Deleted By', category: 'Audit Log', default: false, getValue: (c) => (typeof c.deletedBy === 'object' ? c.deletedBy?.name : (c.deletedBy || '')) },
      ],
      currentPresets: [
        {
          id: 'master-core',
          label: 'Core Summary (8 cols)',
          columns: ['complaintId', 'department', 'priority', 'status', 'findingDescription', 'assignedTo', 'createdAt', 'slaCondition'],
        },
        {
          id: 'master-capa',
          label: 'CAPA & Root Cause (8 cols)',
          columns: ['complaintId', 'findingDescription', 'immediateCorrection', 'rootCause', 'correctiveAction', 'preventiveAction', 'capTargetDate', 'capStatus'],
        },
        {
          id: 'master-sla',
          label: 'SLA & Timelines (8 cols)',
          columns: ['complaintId', 'department', 'status', 'createdAt', 'deadlineTimestamp', 'deadlineHours', 'slaCondition', 'actualCompletedAt'],
        },
        {
          id: 'master-ownership',
          label: 'Auditor & Ownership (8 cols)',
          columns: ['complaintId', 'department', 'auditorName', 'auditorEmpId', 'assignedTo', 'assignedEmpId', 'assignedDesignation', 'status'],
        },
      ],
    };
  }, [
    activeReportTab,
    selectedDeptDetail,
    selectedCategoryDetail,
    departmentStatsList,
    categoryStatsList,
    memberStatsList,
    activeMember,
    activeMemberComplaints,
    datasetToExport,
  ]);

  // Open Export Checklist Modal
  const handleOpenExportModal = (targetFormat = 'CSV') => {
    setExportModalFormat(targetFormat);
    setIsExportModalOpen(true);
  };

  // Execute export with customized columns
  const handleExecuteExport = async ({ format: targetFormat, selectedColumnIds, includePhotos }) => {
    setIsExportModalOpen(false);
    if (targetFormat === 'PDF') {
      await handleExportPDF({ selectedColumnIds, includePhotos });
    } else {
      handleExportCSV({ selectedColumnIds });
    }
  };

  // ---------------------------------------------------------------------------
  // DYNAMIC PDF EXPORT (With Column Selection Checklist)
  // ---------------------------------------------------------------------------
  const handleExportPDF = async (options = {}) => {
    setDownloadingPDF(true);
    try {
      const selectedColumnIds = options.selectedColumnIds;
      const includePhotos = options.includePhotos !== false;

      let selectedCols = currentAvailableColumns;
      if (Array.isArray(selectedColumnIds) && selectedColumnIds.length > 0) {
        selectedCols = currentAvailableColumns.filter((col) => selectedColumnIds.includes(col.id));
      }
      if (selectedCols.length === 0) {
        selectedCols = currentAvailableColumns;
      }

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

      let reportTitle = 'Master Non-Conformance & CAPA Audit Register';
      if (activeReportTab === 'dept-report') {
        reportTitle = selectedDeptDetail
          ? `Department Audit Report: ${selectedDeptDetail}`
          : 'Department-wise Non-Conformance & CAPA Matrix';
      } else if (activeReportTab === 'category-report') {
        reportTitle = selectedCategoryDetail
          ? `Defect Category Audit Report: ${selectedCategoryDetail}`
          : 'Category-wise Defect & CAPA Performance Register';
      } else if (activeReportTab === 'members-report') {
        reportTitle = 'Department Members NC & CAPA Accountability Report';
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
      if (categoryFilter !== 'ALL') filterNotes.push(`Category: ${categoryFilter}`);
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
        const deptRows = departmentStatsList.map((d) =>
          selectedCols.map((col) => (col.getPdfValue ? col.getPdfValue(d) : col.getValue(d)))
        );

        autoTable(doc, {
          startY,
          head: [selectedCols.map((c) => c.label)],
          body: deptRows,
          theme: 'grid',
          headStyles: {
            fillColor: [37, 99, 235],
            textColor: [255, 255, 255],
            fontSize: selectedCols.length > 8 ? 6.5 : 8,
            fontStyle: 'bold',
          },
          styles: {
            fontSize: selectedCols.length > 8 ? 6 : 7.5,
            cellPadding: 4,
          },
        });

        // If department drilled down or filtered, print its NC register and photo evidence
        const targetDept = selectedDeptDetail || (departmentFilter !== 'ALL' ? departmentFilter : null);
        const deptObj = targetDept ? departmentStatsList.find((d) => norm(d.department) === norm(targetDept)) : null;
        const ncListToDraw = deptObj ? deptObj.complaints : (datasetToExport.length > 0 ? datasetToExport : []);

        if (ncListToDraw.length > 0) {
          const nextY = doc.lastAutoTable.finalY + 20;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.setTextColor(...brandDark);
          doc.text(`Non-Conformance Register for ${targetDept || 'Department'}`, margin, nextY);

          const ncRows = ncListToDraw.map((c) => [
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

          // Detailed photographic evidence for department NCs
          if (includePhotos) {
            doc.addPage();
            let deptPhotoY = margin + 15;
            doc.setFillColor(...brandPrimary);
            doc.roundedRect(margin, deptPhotoY, contentWidth, 24, 4, 4, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(255, 255, 255);
            doc.text(`Photographic Defect & Corrective Verification Evidence (${targetDept || 'Department'})`, margin + 10, deptPhotoY + 16);
            deptPhotoY += 34;

            for (let idx = 0; idx < ncListToDraw.length; idx++) {
              const c = ncListToDraw[idx];
              deptPhotoY = await drawNCWithPhotos(doc, c, deptPhotoY, pageWidth, margin, contentWidth, idx);
            }
          }
        }

        doc.save(`Garment_QMS_Department_NC_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
      }
      // -----------------------------------------------------------------------
      // TAB: DEFECT CATEGORY WISE REPORT PDF
      // -----------------------------------------------------------------------
      else if (activeReportTab === 'category-report') {
        if (selectedCategoryDetail) {
          const currentCat = categoryStatsList.find((cat) => norm(cat.category) === norm(selectedCategoryDetail));
          const catComplaints = currentCat ? currentCat.complaints : [];
          const catRows = catComplaints.map((c) =>
            selectedCols.map((col) => (col.getPdfValue ? col.getPdfValue(c) : col.getValue(c)))
          );

          autoTable(doc, {
            startY,
            head: [selectedCols.map((c) => c.label)],
            body: catRows,
            theme: 'grid',
            headStyles: {
              fillColor: [217, 119, 6],
              textColor: [255, 255, 255],
              fontSize: selectedCols.length > 8 ? 6.5 : 7.5,
              fontStyle: 'bold',
            },
            styles: { fontSize: selectedCols.length > 8 ? 6 : 7, cellPadding: 3.5 },
          });

          if (includePhotos && catComplaints.length > 0) {
            doc.addPage();
            let catPhotoY = margin + 15;
            doc.setFillColor(...brandPrimary);
            doc.roundedRect(margin, catPhotoY, contentWidth, 24, 4, 4, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(255, 255, 255);
            doc.text(`Photographic Defect & Corrective Verification Evidence (${selectedCategoryDetail})`, margin + 10, catPhotoY + 16);
            catPhotoY += 34;

            for (let idx = 0; idx < catComplaints.length; idx++) {
              const c = catComplaints[idx];
              catPhotoY = await drawNCWithPhotos(doc, c, catPhotoY, pageWidth, margin, contentWidth, idx);
            }
          }
        } else {
          const catRows = categoryStatsList.map((cat, idx) =>
            selectedCols.map((col) => {
              if (col.id === 'index') return String(idx + 1);
              return col.getPdfValue ? col.getPdfValue(cat) : col.getValue(cat);
            })
          );

          autoTable(doc, {
            startY,
            head: [selectedCols.map((c) => c.label)],
            body: catRows,
            theme: 'grid',
            headStyles: {
              fillColor: [217, 119, 6],
              textColor: [255, 255, 255],
              fontSize: selectedCols.length > 8 ? 6.5 : 7.5,
              fontStyle: 'bold',
            },
            styles: { fontSize: selectedCols.length > 8 ? 6 : 7, cellPadding: 3.5 },
          });
        }

        doc.save(`Garment_QMS_Defect_Category_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
      }
      // -----------------------------------------------------------------------
      // TAB 3: DEPARTMENT MEMBERS REPORT PDF
      // -----------------------------------------------------------------------
      else if (activeReportTab === 'members-report') {
        const memRows = memberStatsList.map((m) =>
          selectedCols.map((col) => (col.getPdfValue ? col.getPdfValue(m) : col.getValue(m)))
        );

        autoTable(doc, {
          startY,
          head: [selectedCols.map((c) => c.label)],
          body: memRows,
          theme: 'grid',
          headStyles: {
            fillColor: [79, 70, 229],
            textColor: [255, 255, 255],
            fontSize: selectedCols.length > 8 ? 6.5 : 8,
            fontStyle: 'bold',
          },
          styles: { fontSize: selectedCols.length > 8 ? 6 : 7.5, cellPadding: 4 },
        });

        if (includePhotos && datasetToExport.length > 0) {
          doc.addPage();
          let memPhotoY = margin + 15;
          doc.setFillColor(...brandPrimary);
          doc.roundedRect(margin, memPhotoY, contentWidth, 24, 4, 4, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(255, 255, 255);
          doc.text('Member Non-Conformance Defect & Corrective Photographic Verification Dossier', margin + 10, memPhotoY + 16);
          memPhotoY += 34;

          for (let idx = 0; idx < datasetToExport.length; idx++) {
            const c = datasetToExport[idx];
            memPhotoY = await drawNCWithPhotos(doc, c, memPhotoY, pageWidth, margin, contentWidth, idx);
          }
        }

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
          `Dept: ${targetMem?.department || '—'}   •   Designation: ${targetMem?.designation || '—'}   •   Contact: ${targetMem?.mobileNumber || '—'}`,
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
          const memberNcRows = ncList.map((c) =>
            selectedCols.map((col) => (col.getPdfValue ? col.getPdfValue(c) : col.getValue(c)))
          );

          autoTable(doc, {
            startY: currentY,
            head: [selectedCols.map((c) => c.label)],
            body: memberNcRows,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: 'bold' },
            styles: { fontSize: 7, cellPadding: 3 },
          });

          if (includePhotos) {
            doc.addPage();
            let photoY = margin + 15;
            for (let idx = 0; idx < ncList.length; idx++) {
              const c = ncList[idx];
              photoY = await drawNCWithPhotos(doc, c, photoY, pageWidth, margin, contentWidth, idx);
            }
          }
        }

        doc.save(`Garment_QMS_Member_${targetMem?.name || 'User'}_NC_Dossier_${new Date().toISOString().slice(0, 10)}.pdf`);
      }
      // -----------------------------------------------------------------------
      // TAB 1: MASTER AUDIT REGISTER PDF (With Custom Selected Columns)
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

        // Summary Table with Selected Columns
        const tableRows = datasetToExport.map((c) =>
          selectedCols.map((col) => {
            if (col.getPdfValue) return col.getPdfValue(c);
            const val = col.getValue(c);
            return typeof val === 'string' && val.length > 55 ? `${val.slice(0, 55)}...` : val;
          })
        );

        autoTable(doc, {
          startY: 182,
          head: [selectedCols.map((c) => c.label)],
          body: tableRows,
          theme: 'grid',
          headStyles: {
            fillColor: [15, 23, 42],
            textColor: [255, 255, 255],
            fontSize: selectedCols.length > 8 ? 6.5 : 7.5,
            fontStyle: 'bold',
          },
          styles: {
            fontSize: selectedCols.length > 8 ? 6 : 7,
            cellPadding: selectedCols.length > 8 ? 2.5 : 3.5,
          },
        });

        // -----------------------------------------------------------------------
        // PHOTOGRAPHIC EVIDENCE & NC DOSSIER SECTION (Before & After Photos)
        // -----------------------------------------------------------------------
        if (includePhotos && datasetToExport.length > 0) {
          doc.addPage();
          let photoSectionY = margin + 15;

          // Section Title Banner
          doc.setFillColor(...brandPrimary);
          doc.roundedRect(margin, photoSectionY, contentWidth, 24, 4, 4, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(255, 255, 255);
          doc.text('NC Defect Photographic Evidence & Corrective Verification (Before & After Photos)', margin + 10, photoSectionY + 16);
          photoSectionY += 34;

          for (let idx = 0; idx < datasetToExport.length; idx++) {
            const c = datasetToExport[idx];
            photoSectionY = await drawNCWithPhotos(doc, c, photoSectionY, pageWidth, margin, contentWidth, idx);
          }
        }

        doc.save(`Garment_QMS_NC_and_CAP_Audit_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
      }
    } catch (err) {
      console.error('Failed to export PDF report:', err);
    } finally {
      setTimeout(() => setDownloadingPDF(false), 600);
    }
  };

  // ---------------------------------------------------------------------------
  // CSV EXPORT HANDLER (With Column Selection Checklist)
  // ---------------------------------------------------------------------------
  const handleExportCSV = (options = {}) => {
    setDownloadingCSV(true);
    try {
      const selectedColumnIds = options.selectedColumnIds;
      let selectedCols = currentAvailableColumns;
      if (Array.isArray(selectedColumnIds) && selectedColumnIds.length > 0) {
        selectedCols = currentAvailableColumns.filter((col) => selectedColumnIds.includes(col.id));
      }
      if (selectedCols.length === 0) {
        selectedCols = currentAvailableColumns;
      }

      let filename = 'Garment_QMS_Report.csv';
      let dataRows = [];

      if (activeReportTab === 'dept-report') {
        filename = `Garment_QMS_Department_NC_Summary_${new Date().toISOString().slice(0, 10)}.csv`;
        dataRows = departmentStatsList;
      } else if (activeReportTab === 'category-report') {
        if (selectedCategoryDetail) {
          const safeName = selectedCategoryDetail.replace(/[^a-zA-Z0-9]/g, '_');
          filename = `Garment_QMS_Category_${safeName}_NC_Report_${new Date().toISOString().slice(0, 10)}.csv`;
          const currentCat = categoryStatsList.find((cat) => norm(cat.category) === norm(selectedCategoryDetail));
          dataRows = currentCat ? currentCat.complaints : [];
        } else {
          filename = `Garment_QMS_Defect_Category_Summary_${new Date().toISOString().slice(0, 10)}.csv`;
          dataRows = categoryStatsList;
        }
      } else if (activeReportTab === 'members-report') {
        filename = `Garment_QMS_Department_Members_Report_${new Date().toISOString().slice(0, 10)}.csv`;
        dataRows = memberStatsList;
      } else if (activeReportTab === 'member-detail') {
        const memName = activeMember ? activeMember.name.replace(/\s+/g, '_') : 'Member';
        filename = `Garment_QMS_Member_${memName}_NC_Register_${new Date().toISOString().slice(0, 10)}.csv`;
        dataRows = activeMemberComplaints;
      } else {
        filename = `Garment_QMS_Master_Register_${new Date().toISOString().slice(0, 10)}.csv`;
        dataRows = datasetToExport;
      }

      const headers = selectedCols.map((c) => c.label);
      const rows = dataRows.map((item) =>
        selectedCols.map((col) => {
          const val = col.getValue ? col.getValue(item) : '';
          return `"${String(val ?? '').replace(/"/g, '""')}"`;
        })
      );

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
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* 1. Top Header Banner */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-cyan-400">
              <BarChart3 className="w-5 h-5" />
            </span>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              Compliance Audit &amp; CAPA Analytical Reports
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
            Detailed Non-Conformance Registers, Department Quality Summaries &amp; Member Accountability Records in structured high-density table format.
          </p>
        </div>

        {/* Download Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {hasActiveFilters && (
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setExportScope('FILTERED')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${exportScope === 'FILTERED'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-cyan-400 shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                  }`}
              >
                Filtered ({filteredCount})
              </button>
              <button
                type="button"
                onClick={() => setExportScope('ALL')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${exportScope === 'ALL'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-cyan-400 shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                  }`}
              >
                All ({totalNC})
              </button>
            </div>
          )}

          <button
            type="button"
            id="btn-download-pdf-top"
            onClick={() => handleOpenExportModal('PDF')}
            disabled={downloadingPDF}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            title="Configure columns & download PDF Audit Report"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>
              {downloadingPDF
                ? 'Compiling PDF...'
                : activeReportTab === 'category-report'
                  ? `Export Category PDF (${selectedCategoryDetail ? (categoryStatsList.find((c) => norm(c.category) === norm(selectedCategoryDetail))?.complaints.length || 0) : categoryStatsList.length})`
                  : activeReportTab === 'dept-report'
                    ? `Export Dept PDF (${departmentStatsList.length})`
                    : activeReportTab === 'members-report'
                      ? `Export Members PDF (${memberStatsList.length})`
                      : activeReportTab === 'member-detail'
                        ? `Export Dossier PDF (${activeMemberComplaints.length})`
                        : `Export PDF (${datasetToExport.length})`}
            </span>
          </button>

          <button
            type="button"
            id="btn-download-csv-top"
            onClick={() => handleOpenExportModal('CSV')}
            disabled={downloadingCSV}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            title="Configure columns & download CSV Spreadsheet"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>
              {downloadingCSV
                ? 'Exporting CSV...'
                : activeReportTab === 'category-report'
                  ? 'Export Category CSV'
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

      {/* 2. Top-Level Mode Navigation Switcher */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80">
        <button
          type="button"
          onClick={() => setActiveReportTab('audit-register')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeReportTab === 'audit-register'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-cyan-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
        >
          <Layers className="w-4 h-4" />
          <span>Master NC Report</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500">
            {filteredComplaints.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSelectedDeptDetail(null);
            setActiveReportTab('dept-report');
          }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeReportTab === 'dept-report'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-cyan-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Department-wise NC Report</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-cyan-300">
            {departmentStatsList.length} Depts
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveReportTab('members-report')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeReportTab === 'members-report'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-cyan-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
        >
          <Users className="w-4 h-4" />
          <span>Department Members Report</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-300">
            {memberStatsList.length} Members
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveReportTab('member-detail')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeReportTab === 'member-detail'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-cyan-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
        >
          <User className="w-4 h-4" />
          <span>Individual Member NC Details</span>
          {activeMember && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-300">
              {activeMember.name.split(' ')[0]} ({activeMemberComplaints.length})
            </span>
          )}
        </button>
      </div>

      {/* 3. Streamlined Clean Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs p-3.5 sm:p-4 space-y-3">
        {/* Primary Filter Row */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search NC ID, finding, resolver, department..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Unit Filter (Unit 1, Unit 2, or Both Units) */}
          <select
            id="filter-unit-reports"
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            disabled={!isCompanyAdmin && !canSwitchUnits && Boolean(user?.unitId)}
            className="px-3 py-1.5 text-xs rounded-xl border border-indigo-300 font-bold cursor-pointer transition-colors bg-indigo-50/90 text-indigo-900 dark:bg-indigo-950/70 dark:border-indigo-700 dark:text-cyan-200"
            title="Filter by Factory Plant Unit"
          >
            <option value="UNIT-1">📍 Unit 1</option>
            <option value="UNIT-2">📍 Unit 2</option>
            {(isCompanyAdmin || canSwitchUnits) && (
              <option value="BOTH">🏢 Both Units</option>
            )}
          </select>

          {/* Record Status Filter */}
          <select
            id="filter-record-status"
            value={recordStatusFilter}
            onChange={(e) => setRecordStatusFilter(e.target.value)}
            className={`px-3 py-1.5 text-xs rounded-xl border font-medium cursor-pointer transition-colors ${recordStatusFilter !== 'ALL'
                ? 'bg-rose-50/90 border-rose-300 text-rose-900 dark:bg-rose-950/70 dark:border-rose-700 dark:text-rose-200 font-bold'
                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            title="Filter by Record Status (All Records, Active NC, Deleted NC)"
          >
            <option value="ALL">Record Status: All Records ({complaints.length})</option>
            <option value="ACTIVE">Record Status: Active NC ({activeCount})</option>
            <option value="DELETED">Record Status: Deleted NC ({deletedCount})</option>
          </select>

          {/* Defect Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className={`px-3 py-1.5 text-xs rounded-xl border font-medium cursor-pointer transition-colors ${categoryFilter !== 'ALL'
                ? 'bg-amber-50/70 border-amber-300 text-amber-900 dark:bg-amber-950/60 dark:border-amber-700 dark:text-amber-200 font-bold'
                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            title="Filter by Defect Category"
          >
            <option value="ALL">All Categories ({allDefectCategories.length})</option>
            {allDefectCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat} ({categoryCounts[cat] || 0} NCs)
              </option>
            ))}
          </select>

          {/* Department Filter */}
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className={`px-3 py-1.5 text-xs rounded-xl border font-medium cursor-pointer transition-colors ${departmentFilter !== 'ALL'
                ? 'bg-indigo-50/70 border-indigo-300 text-indigo-900 dark:bg-indigo-950/60 dark:border-indigo-700 dark:text-cyan-200 font-bold'
                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
              }`}
          >
            <option value="ALL">All Departments ({consolidatedDepartmentsList.length})</option>
            {consolidatedDepartmentsList.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name} ({departmentCounts[d.name] || 0} NCs)
              </option>
            ))}
          </select>

          {/* Member Filter */}
          <select
            value={memberFilter}
            onChange={(e) => {
              const val = e.target.value;
              setMemberFilter(val);
              if (val !== 'ALL') setSelectedMemberId(val);
            }}
            className={`px-3 py-1.5 text-xs rounded-xl border font-medium cursor-pointer transition-colors ${memberFilter !== 'ALL'
                ? 'bg-purple-50/70 border-purple-300 text-purple-900 dark:bg-purple-950/60 dark:border-purple-700 dark:text-purple-200 font-bold'
                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
              }`}
          >
            <option value="ALL">All Members ({consolidatedMembersList.length})</option>
            {consolidatedMembersList.map((m) => {
              const count = complaints.filter((c) => isComplaintAssignedToMember(c, m)).length;
              return (
                <option key={m.id} value={m.id}>
                  {m.name} ({count} NCs)
                </option>
              );
            })}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`px-3 py-1.5 text-xs rounded-xl border font-medium cursor-pointer transition-colors ${statusFilter !== 'ALL'
                ? 'bg-emerald-50/70 border-emerald-300 text-emerald-900 dark:bg-emerald-950/60 dark:border-emerald-700 dark:text-emerald-200 font-bold'
                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
              }`}
          >
            <option value="ALL">All Statuses</option>
            <option value="OPEN">Open Actions</option>
            <option value="CAP_SUBMITTED">CAP Submitted</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="REWORK">Rejected / Rework</option>
            <option value="CLOSED">Verified &amp; Closed</option>
            <option value="OVERDUE">Overdue SLA Breaches</option>
          </select>

          {/* Reject & Rework Dedicated Filter */}
          <select
            value={reworkFilter}
            onChange={(e) => setReworkFilter(e.target.value)}
            className={`px-3 py-1.5 text-xs rounded-xl border font-medium cursor-pointer transition-colors ${reworkFilter !== 'ALL'
                ? 'bg-rose-50/90 border-rose-300 text-rose-900 dark:bg-rose-950/70 dark:border-rose-700 dark:text-rose-200 font-bold'
                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            title="Filter by Reject &amp; Rework Status"
          >
            <option value="ALL">Reject &amp; Rework: All</option>
            <option value="REWORK_ONLY">Reject &amp; Rework ({reworkStats.total})</option>
            <option value="AWAITING_REWORK">Awaiting Floor Rework ({reworkStats.awaiting})</option>
            <option value="REWORK_IN_REVIEW">Rework Under Review ({reworkStats.inReview})</option>
            <option value="REWORK_RESOLVED">Resolved Rework ({reworkStats.resolved})</option>
            <option value="NO_REWORK">Standard NCs Only</option>
          </select>

          {/* Risk Severity */}
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className={`px-3 py-1.5 text-xs rounded-xl border font-medium cursor-pointer transition-colors ${riskFilter !== 'ALL'
                ? 'bg-amber-50/70 border-amber-300 text-amber-900 dark:bg-amber-950/60 dark:border-amber-700 dark:text-amber-200 font-bold'
                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
              }`}
          >
            <option value="ALL">All Risks</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          {/* Date Preset */}
          <select
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value)}
            className={`px-3 py-1.5 text-xs rounded-xl border font-medium cursor-pointer transition-colors ${datePreset !== 'ALL'
                ? 'bg-indigo-50/70 border-indigo-300 text-indigo-900 dark:bg-indigo-950/60 dark:border-indigo-700 dark:text-cyan-200 font-bold'
                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
              }`}
          >
            <option value="ALL">All Time</option>
            <option value="TODAY">Today</option>
            <option value="7D">Past 7 Days</option>
            <option value="30D">Past 30 Days</option>
            <option value="THIS_MONTH">This Month</option>
            <option value="CUSTOM">Custom Range...</option>
          </select>

          {/* More Filters Toggle */}
          <button
            type="button"
            onClick={() => setShowFiltersExpanded(!showFiltersExpanded)}
            className={`px-2.5 py-1.5 text-xs rounded-xl border font-medium flex items-center gap-1 transition-colors cursor-pointer ${showFiltersExpanded
                ? 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white font-bold'
                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            title="More filter parameters"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>More</span>
          </button>

          {/* Reset Filters */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-2.5 py-1.5 text-xs rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 font-bold flex items-center gap-1 transition-colors cursor-pointer"
              title="Reset all active filters"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset ({activeFilterCount})</span>
            </button>
          )}
        </div>

        {/* Secondary Row for More Filters (Expanded or Custom Date) */}
        {(showFiltersExpanded || datePreset === 'CUSTOM') && (
          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2.5">
            {/* CAP Status */}
            <select
              value={capStatusFilter}
              onChange={(e) => setCapStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-xl border bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              <option value="ALL">All CAP Statuses</option>
              <option value="CAP_COMPLETED">CAP Completed &amp; Verified</option>
              <option value="CAP_PENDING">CAP Under Review</option>
              <option value="CAP_REQUIRED_OPEN">Mandatory CAP Pending</option>
              <option value="NO_CAP_DIRECT">Direct Correction</option>
            </select>

            {/* Responsible Resolver */}
            <select
              value={responsibleFilter}
              onChange={(e) => setResponsibleFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-xl border bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              <option value="ALL">All Resolvers ({responsibleList.length})</option>
              {responsibleList.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            {/* Auditor */}
            <select
              value={auditorFilter}
              onChange={(e) => setAuditorFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-xl border bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              <option value="ALL">All Auditors ({auditorList.length})</option>
              {auditorList.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>

            {/* Aging */}
            <select
              value={agingFilter}
              onChange={(e) => setAgingFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-xl border bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              <option value="ALL">All Aging</option>
              <option value="FRESH">Fresh (&lt; 24h)</option>
              <option value="MODERATE">Moderate (1–3d)</option>
              <option value="HIGH">High (3–7d)</option>
              <option value="SEVERE">Severe (&gt; 7d)</option>
            </select>

            {/* Recurrence */}
            <select
              value={repeatFilter}
              onChange={(e) => setRepeatFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-xl border bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              <option value="ALL">All Recurrence</option>
              <option value="REPEAT">Repeat NCs (≥ 2)</option>
              <option value="SINGLE">Single Defect</option>
            </select>

            {/* Custom Dates if CUSTOM is active */}
            {datePreset === 'CUSTOM' && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500 font-medium">From:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-2 py-1 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
                />
                <span className="text-slate-500 font-medium">To:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-2 py-1 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* =======================================================================
          VIEW 1: MASTER AUDIT REGISTER (Clean Detailed Table Format)
          ======================================================================= */}
      {activeReportTab === 'audit-register' && (
        <div className="space-y-3 animate-in fade-in duration-200">
          {/* Quick Metrics KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <div
              onClick={handleResetFilters}
              className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs hover:border-indigo-400 cursor-pointer transition-all flex items-center justify-between"
              title="Click to reset filters and view all records"
            >
              <div>
                <span className="text-[10px] font-semibold text-slate-400 block">Total NCs</span>
                <span className="text-base font-black text-slate-900 dark:text-white font-mono">
                  {filteredCount}
                  {hasActiveFilters && (
                    <span className="text-[10px] text-slate-400 font-normal ml-1">/{totalNC}</span>
                  )}
                </span>
              </div>
              <Layers className="w-4 h-4 text-indigo-500 opacity-80" />
            </div>

            <div
              onClick={() => setStatusFilter('OPEN')}
              className={`p-2.5 rounded-xl bg-white dark:bg-slate-900 border shadow-2xs hover:border-amber-400 cursor-pointer transition-all flex items-center justify-between ${statusFilter === 'OPEN' ? 'border-amber-500 ring-1 ring-amber-500/30 bg-amber-50/20' : 'border-slate-200/90 dark:border-slate-800'
                }`}
              title="Filter by Open NCs"
            >
              <div>
                <span className="text-[10px] font-semibold text-slate-400 block">Open Actions</span>
                <span className="text-base font-black text-amber-600 dark:text-amber-400 font-mono">
                  {openCount}
                </span>
              </div>
              <AlertCircle className="w-4 h-4 text-amber-500 opacity-80" />
            </div>

            <div
              onClick={() => setStatusFilter('UNDER_REVIEW')}
              className={`p-2.5 rounded-xl bg-white dark:bg-slate-900 border shadow-2xs hover:border-purple-400 cursor-pointer transition-all flex items-center justify-between ${statusFilter === 'UNDER_REVIEW' ? 'border-purple-500 ring-1 ring-purple-500/30 bg-purple-50/20' : 'border-slate-200/90 dark:border-slate-800'
                }`}
              title="Filter by Under Review NCs"
            >
              <div>
                <span className="text-[10px] font-semibold text-slate-400 block">Under Review</span>
                <span className="text-base font-black text-purple-600 dark:text-purple-400 font-mono">
                  {pendingCount}
                </span>
              </div>
              <Clock className="w-4 h-4 text-purple-500 opacity-80" />
            </div>

            <div
              onClick={() => setStatusFilter('CLOSED')}
              className={`p-2.5 rounded-xl bg-white dark:bg-slate-900 border shadow-2xs hover:border-emerald-400 cursor-pointer transition-all flex items-center justify-between ${statusFilter === 'CLOSED' ? 'border-emerald-500 ring-1 ring-emerald-500/30 bg-emerald-50/20' : 'border-slate-200/90 dark:border-slate-800'
                }`}
              title="Filter by Closed & Verified NCs"
            >
              <div>
                <span className="text-[10px] font-semibold text-slate-400 block">Closed &amp; Verified</span>
                <span className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                  {closedCount}
                </span>
              </div>
              <CheckCheck className="w-4 h-4 text-emerald-500 opacity-80" />
            </div>

            <div
              onClick={() => setStatusFilter('OVERDUE')}
              className={`p-2.5 rounded-xl bg-white dark:bg-slate-900 border shadow-2xs hover:border-rose-400 cursor-pointer transition-all flex items-center justify-between ${statusFilter === 'OVERDUE' ? 'border-rose-500 ring-1 ring-rose-500/30 bg-rose-50/20' : 'border-slate-200/90 dark:border-slate-800'
                }`}
              title="Filter by Overdue SLA NCs"
            >
              <div>
                <span className="text-[10px] font-semibold text-slate-400 block">Overdue SLA</span>
                <span className="text-base font-black text-rose-600 dark:text-rose-400 font-mono">
                  {overdueCount}
                </span>
              </div>
              <AlertTriangle className="w-4 h-4 text-rose-500 opacity-80" />
            </div>

            <div
              onClick={() => setRiskFilter('CRITICAL')}
              className={`p-2.5 rounded-xl bg-white dark:bg-slate-900 border shadow-2xs hover:border-red-400 cursor-pointer transition-all flex items-center justify-between ${riskFilter === 'CRITICAL' ? 'border-red-500 ring-1 ring-red-500/30 bg-red-50/20' : 'border-slate-200/90 dark:border-slate-800'
                }`}
              title="Filter by Critical Risk NCs"
            >
              <div>
                <span className="text-[10px] font-semibold text-slate-400 block">Critical Risk</span>
                <span className="text-base font-black text-red-600 dark:text-red-400 font-mono">
                  {criticalCount}
                </span>
              </div>
              <Flame className="w-4 h-4 text-red-500 opacity-80" />
            </div>
          </div>

          {/* Master Non-Conformance Detailed Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Master Non-Conformance Register</span>
                  <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                    {filteredComplaints.length} Records
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Comprehensive audit trail with root causes, CAP execution, SLAs, and resolution statuses.
                </p>
              </div>

              <span className="text-[11px] font-mono text-slate-400">
                Click "Inspect" for photos &amp; lifecycle trail
              </span>
            </div>

            <div className="overflow-x-auto">
              {filteredComplaints.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-xs space-y-2">
                  <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-2">
                    <Search className="w-5 h-5" />
                  </div>
                  <p className="font-semibold text-slate-700 dark:text-slate-300">
                    No matching non-conformance records found
                  </p>
                  <p className="text-slate-400 max-w-sm mx-auto">
                    Try adjusting or resetting your filter criteria to view records.
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
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/70 text-[11px] font-bold text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      <th className="py-2.5 px-3 text-center w-10">#</th>
                      <th className="py-2.5 px-3">NC ID</th>
                      <th className="py-2.5 px-3">Date Logged</th>
                      <th className="py-2.5 px-3">Department &amp; Line</th>
                      <th className="py-2.5 px-3">Defect Finding</th>
                      <th className="py-2.5 px-3">Assigned Resolver</th>
                      <th className="py-2.5 px-3">5-Why Root Cause</th>
                      <th className="py-2.5 px-3">CAP Corrective Action</th>
                      <th className="py-2.5 px-3">Target Due &amp; SLA</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-center">Risk</th>
                      <th className="py-2.5 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {filteredComplaints.map((c, idx) => {
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
                          key={c._id || c.id || c.complaintId || idx}
                          className={`transition-colors group ${c.isDeleted
                              ? 'bg-rose-50/40 dark:bg-rose-950/20 hover:bg-rose-50/70 dark:hover:bg-rose-950/40'
                              : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                            }`}
                        >
                          {/* 1. # */}
                          <td className="py-3 px-3 text-center font-mono text-slate-400 text-[11px] align-top">
                            {idx + 1}
                          </td>

                          {/* 2. NC ID */}
                          <td className="py-3 px-3 align-top whitespace-nowrap">
                            <span className="font-mono font-bold text-indigo-600 dark:text-cyan-400 block">
                              {c.complaintId || 'NC-N/A'}
                            </span>
                            {c.isDeleted && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 mt-0.5">
                                Deleted Record
                              </span>
                            )}
                            {freq > 1 && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-purple-600 dark:text-purple-400 mt-0.5 block">
                                <Repeat className="w-2.5 h-2.5" />
                                <span>Repeat ({freq}x)</span>
                              </span>
                            )}
                          </td>

                          {/* 3. Date Logged */}
                          <td className="py-3 px-3 align-top whitespace-nowrap text-slate-600 dark:text-slate-400">
                            <div>{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'N/A'}</div>
                            {c.isDeleted && (
                              <div className="mt-1 pt-1 border-t border-rose-200/60 dark:border-rose-900/40 text-[10px] text-rose-600 dark:text-rose-400">
                                <div className="font-semibold">Deleted: {c.deletedAt ? new Date(c.deletedAt).toLocaleDateString() : 'N/A'}</div>
                                <div className="truncate max-w-[120px]" title={typeof c.deletedBy === 'object' ? c.deletedBy?.name : (c.deletedBy || 'System')}>
                                  By: {typeof c.deletedBy === 'object' ? c.deletedBy?.name : (c.deletedBy || 'System')}
                                </div>
                              </div>
                            )}
                          </td>

                          {/* 4. Department & Line */}
                          <td className="py-3 px-3 align-top whitespace-nowrap">
                            <div className="font-semibold text-slate-900 dark:text-white">
                              {c.department || '—'}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {c.location || '—'}
                            </div>
                            <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60 mt-1">
                              <Tag className="w-2.5 h-2.5 text-amber-500" />
                              <span>{getDefectCategory(c)}</span>
                            </span>
                          </td>

                          {/* 5. Defect Finding */}
                          <td className="py-3 px-3 align-top max-w-xs">
                            <p className="text-slate-800 dark:text-slate-200 line-clamp-2 leading-snug">
                              {getFindingText(c)}
                            </p>
                          </td>

                          {/* 6. Assigned Resolver */}
                          <td className="py-3 px-3 align-top whitespace-nowrap">
                            <div className="font-bold text-slate-900 dark:text-white">
                              {assignedName}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {c.assignedTo?.designation || '—'}
                            </div>
                            {c.assignedTo?.mobileNumber && (
                              <div className="text-[10px] font-mono text-slate-400">
                                {c.assignedTo.mobileNumber}
                              </div>
                            )}
                          </td>

                          {/* 7. 5-Why Root Cause */}
                          <td className="py-3 px-3 align-top max-w-xs">
                            <p className="text-slate-700 dark:text-slate-300 line-clamp-2 leading-snug">
                              {rootCause}
                            </p>
                          </td>

                          {/* 8. CAP Corrective Action */}
                          <td className="py-3 px-3 align-top max-w-xs">
                            <p className="text-slate-700 dark:text-slate-300 line-clamp-2 leading-snug">
                              {c.cap?.correctiveAction || c.actionNotes || 'Pending'}
                            </p>
                          </td>

                          {/* 9. Target Due & SLA */}
                          <td className="py-3 px-3 align-top whitespace-nowrap">
                            <div className="text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                              {c.deadlineTimestamp ? new Date(c.deadlineTimestamp).toLocaleDateString() : 'N/A'}
                            </div>
                            <div className="mt-0.5">
                              {isOverdue ? (
                                <span className="inline-block px-1.5 py-0.2 rounded-md text-[9px] font-bold bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                                  Overdue
                                </span>
                              ) : (
                                <span className="inline-block px-1.5 py-0.2 rounded-md text-[9px] font-bold bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                  Within SLA
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 10. Status */}
                          <td className="py-3 px-3 align-top text-center whitespace-nowrap">
                            {c.isDeleted ? (
                              <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800">
                                Deleted ({c.status})
                              </span>
                            ) : (
                              <span
                                className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border ${c.status === 'Closed' || c.status === 'Verified'
                                    ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                    : c.status === 'CAP Submitted'
                                      ? 'bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                                      : 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                                  }`}
                              >
                                {c.status}
                              </span>
                            )}
                          </td>

                          {/* 11. Risk */}
                          <td className="py-3 px-3 align-top text-center whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${cRisk === 'CRITICAL'
                                  ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                                  : cRisk === 'HIGH'
                                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                }`}
                            >
                              {cRisk}
                            </span>
                          </td>

                          {/* 12. Actions */}
                          <td className="py-3 px-3 align-top text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setDrilldownComplaint(c)}
                              className="px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-600 dark:text-cyan-400 font-bold text-[11px] transition-colors cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                              title="Inspect Defect &amp; CAP Audit Trail"
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

            {/* Table Footer Count Info */}
            <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex items-center justify-between text-xs text-slate-500">
              <span>Showing {filteredComplaints.length} of {complaints.length} total non-conformances</span>
              <span className="font-mono text-[11px]">Factory Quality Audit Register</span>
            </div>
          </div>
        </div>
      )}

      {/* =======================================================================
          VIEW 2: DEPARTMENT-WISE NC REPORT (Clean Detailed Table Format)
          ======================================================================= */}
      {activeReportTab === 'dept-report' && (
        <div className="space-y-3 animate-in fade-in duration-200">
          {/* Breadcrumb if a specific department is inspected */}
          {selectedDeptDetail ? (
            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
                      <span>{selectedDeptDetail} Detailed Audit Register</span>
                    </h2>
                    <p className="text-xs text-slate-500">
                      All non-conformances, root cause findings, and CAP records logged for this department.
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
                    className="px-3 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-300 font-bold text-xs hover:bg-purple-100 transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>View Department Members</span>
                  </button>
                </div>
              </div>

              {/* Department Specific Non-Conformance Table */}
              {(() => {
                const currentDept = departmentStatsList.find((d) => d.department === selectedDeptDetail);
                const deptComplaints = currentDept ? currentDept.complaints : [];

                return (
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
                    <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span>{selectedDeptDetail} Non-Conformance Records</span>
                        <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                          {deptComplaints.length} Records
                        </span>
                      </h3>
                      <span className="text-xs text-slate-400 font-mono">
                        CAP Completion Rate: {currentDept ? currentDept.capRate : 0}%
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      {deptComplaints.length === 0 ? (
                        <div className="p-12 text-center text-slate-500 text-xs">
                          No non-conformance records found for this department.
                        </div>
                      ) : (
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/70 text-[11px] font-bold text-slate-600 dark:text-slate-400 whitespace-nowrap">
                              <th className="py-2.5 px-3 text-center w-10">#</th>
                              <th className="py-2.5 px-3">NC ID</th>
                              <th className="py-2.5 px-3">Date Logged</th>
                              <th className="py-2.5 px-3">Station / Line</th>
                              <th className="py-2.5 px-3">Finding Description</th>
                              <th className="py-2.5 px-3">Assigned Resolver</th>
                              <th className="py-2.5 px-3">5-Why Root Cause</th>
                              <th className="py-2.5 px-3">Corrective Action (CAPA)</th>
                              <th className="py-2.5 px-3">Target Due</th>
                              <th className="py-2.5 px-3 text-center">Status</th>
                              <th className="py-2.5 px-3 text-center">Risk</th>
                              <th className="py-2.5 px-3 text-center">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                            {deptComplaints.map((c, idx) => (
                              <tr
                                key={c._id || c.id || c.complaintId || idx}
                                className={`transition-colors ${c.isDeleted
                                    ? 'bg-rose-50/40 dark:bg-rose-950/20 hover:bg-rose-50/70 dark:hover:bg-rose-950/40'
                                    : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                                  }`}
                              >
                                <td className="py-3 px-3 text-center font-mono text-slate-400 text-[11px] align-top">
                                  {idx + 1}
                                </td>
                                <td className="py-3 px-3 align-top font-mono font-bold text-indigo-600 dark:text-cyan-400 whitespace-nowrap">
                                  <div>{c.complaintId || 'NC-N/A'}</div>
                                  {c.isDeleted && (
                                    <span className="inline-block text-[9px] font-black uppercase text-rose-600 dark:text-rose-400 mt-0.5">
                                      Deleted
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-3 align-top whitespace-nowrap text-slate-600 dark:text-slate-400">
                                  <div>{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'N/A'}</div>
                                  {c.isDeleted && (
                                    <div className="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5">
                                      Del: {c.deletedAt ? new Date(c.deletedAt).toLocaleDateString() : 'N/A'}
                                    </div>
                                  )}
                                </td>
                                <td className="py-3 px-3 align-top whitespace-nowrap text-slate-700 dark:text-slate-300">
                                  {c.location || '—'}
                                </td>
                                <td className="py-3 px-3 align-top max-w-xs">
                                  <p className="text-slate-800 dark:text-slate-200 line-clamp-2 leading-snug">
                                    {getFindingText(c)}
                                  </p>
                                </td>
                                <td className="py-3 px-3 align-top whitespace-nowrap font-medium text-slate-900 dark:text-white">
                                  {getAssignedToName(c)}
                                </td>
                                <td className="py-3 px-3 align-top max-w-xs text-slate-700 dark:text-slate-300">
                                  <p className="line-clamp-2 leading-snug">{getRootCauseText(c)}</p>
                                </td>
                                <td className="py-3 px-3 align-top max-w-xs text-slate-700 dark:text-slate-300">
                                  <p className="line-clamp-2 leading-snug">
                                    {c.cap?.correctiveAction || c.actionNotes || 'Pending'}
                                  </p>
                                </td>
                                <td className="py-3 px-3 align-top whitespace-nowrap font-mono text-[11px] text-slate-600 dark:text-slate-400">
                                  {c.deadlineTimestamp ? new Date(c.deadlineTimestamp).toLocaleDateString() : 'N/A'}
                                </td>
                                <td className="py-3 px-3 align-top text-center whitespace-nowrap">
                                  {c.isDeleted ? (
                                    <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800">
                                      Deleted ({c.status})
                                    </span>
                                  ) : (
                                    <span
                                      className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border ${c.status === 'Closed' || c.status === 'Verified'
                                          ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                          : 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                                        }`}
                                    >
                                      {c.status}
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-3 align-top text-center whitespace-nowrap">
                                  <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                    {(c.priority || c.riskSeverity || 'MEDIUM').toUpperCase()}
                                  </span>
                                </td>
                                <td className="py-3 px-3 align-top text-center whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => setDrilldownComplaint(c)}
                                    className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-600 dark:text-cyan-400 font-bold text-[11px] transition-colors cursor-pointer inline-flex items-center gap-1"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>Inspect</span>
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            /* All Factory Departments Overview Table */
            <div className="space-y-3">
              {/* Plant Department Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 block">Total Depts</span>
                  <div className="text-base font-black text-slate-900 dark:text-white font-mono">
                    {consolidatedDepartmentsList.length}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 block">Total NCs Raised</span>
                  <div className="text-base font-black text-indigo-600 dark:text-cyan-400 font-mono">
                    {filteredCount}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 block">Open Actions</span>
                  <div className="text-base font-black text-amber-600 dark:text-amber-400 font-mono">
                    {openCount}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 block">Closed Effective</span>
                  <div className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                    {closedCount}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 block">Under Review</span>
                  <div className="text-base font-black text-purple-600 dark:text-purple-400 font-mono">
                    {pendingCount}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 block">Plant CAPA Adherence</span>
                  <div className="text-base font-black text-indigo-600 dark:text-cyan-400 font-mono">
                    {overallCapRate}%
                  </div>
                </div>
              </div>

              {/* Department Table */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
                <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-indigo-500" />
                    <span>Department-wise Quality &amp; CAPA Performance Matrix</span>
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">
                    {departmentStatsList.length} Operating Departments
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/70 text-[11px] font-bold text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        <th className="py-2.5 px-3 text-center w-10">#</th>
                        <th className="py-2.5 px-3">Department Name</th>
                        <th className="py-2.5 px-3">Head / Responsible Person</th>
                        <th className="py-2.5 px-3 text-center">Total NCs</th>
                        <th className="py-2.5 px-3 text-center">Open</th>
                        <th className="py-2.5 px-3 text-center">Review</th>
                        <th className="py-2.5 px-3 text-center">Closed</th>
                        <th className="py-2.5 px-3 text-center">Overdue</th>
                        <th className="py-2.5 px-3 text-center w-36">CAPA Adherence</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                        <th className="py-2.5 px-3 text-center">Members</th>
                        <th className="py-2.5 px-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {departmentStatsList.map((d, idx) => (
                        <tr
                          key={d.department}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors group"
                        >
                          <td className="py-3 px-3 text-center font-mono text-slate-400 text-[11px]">
                            {idx + 1}
                          </td>

                          <td className="py-3 px-3 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                            <span className="group-hover:text-indigo-600 dark:group-hover:text-cyan-400 transition-colors">
                              {d.department}
                            </span>
                            {d.code && (
                              <span className="text-[10px] text-slate-400 font-mono ml-1.5 font-normal">
                                ({d.code})
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            {d.manager || '—'}
                          </td>

                          <td className="py-3 px-3 text-center font-mono font-bold text-slate-900 dark:text-white">
                            {d.totalNC}
                          </td>

                          <td className="py-3 px-3 text-center font-mono font-bold text-amber-600 dark:text-amber-400">
                            {d.openNC}
                          </td>

                          <td className="py-3 px-3 text-center font-mono font-bold text-purple-600 dark:text-purple-400">
                            {d.pendingNC}
                          </td>

                          <td className="py-3 px-3 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {d.closedNC}
                          </td>

                          <td className="py-3 px-3 text-center font-mono font-bold text-rose-600 dark:text-rose-400">
                            {d.overdueNC > 0 ? d.overdueNC : '—'}
                          </td>

                          <td className="py-3 px-3 text-center">
                            <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                              <span className="font-bold text-indigo-600 dark:text-cyan-400">{d.capRate}%</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div
                                className={`h-full transition-all duration-300 ${d.capRate === 100
                                    ? 'bg-emerald-500'
                                    : d.capRate >= 60
                                      ? 'bg-indigo-500'
                                      : 'bg-amber-500'
                                  }`}
                                style={{ width: `${d.capRate}%` }}
                              />
                            </div>
                          </td>

                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${d.capStatusBadge}`}>
                              {d.capStatusLabel}
                            </span>
                          </td>

                          <td className="py-3 px-3 text-center font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-bold">
                              {d.members.length} Staff
                            </span>
                          </td>

                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleInspectDepartment(d.department)}
                                className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-600 dark:text-cyan-400 font-bold text-[11px] transition-colors cursor-pointer"
                                title="View this department's detailed NCs"
                              >
                                View NCs
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDepartmentFilter(d.department);
                                  setActiveReportTab('members-report');
                                }}
                                className="px-2 py-1 rounded-lg bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 text-purple-600 dark:text-purple-400 font-bold text-[11px] transition-colors cursor-pointer"
                                title="View department members"
                              >
                                Members
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex items-center justify-between text-xs text-slate-500">
                  <span>Factory Department Quality Summary</span>
                  <span className="font-mono text-[11px]">Total Monitored Units: {departmentStatsList.length}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =======================================================================
          VIEW 3: DEPARTMENT MEMBERS REPORT (Clean Detailed Table Format)
          ======================================================================= */}
      {activeReportTab === 'members-report' && (
        <div className="space-y-3 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
            {/* Header Toolbar */}
            <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-600" />
                  <span>Department Members NC Accountability Report</span>
                  <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                    {memberStatsList.length} Members
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Individual resolver accountability, open non-conformances, and CAPA adherence rates.
                </p>
              </div>

              {/* Member Search Box */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={memberSearchQuery}
                  onChange={(e) => setMemberSearchQuery(e.target.value)}
                  placeholder="Filter member name, ID, department..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
            </div>

            {/* Members Accountability Table */}
            <div className="overflow-x-auto">
              {(() => {
                const filteredMembers = memberStatsList.filter((m) => {
                  if (!memberSearchQuery.trim()) return true;
                  const q = memberSearchQuery.toLowerCase().trim();
                  return (
                    m.name.toLowerCase().includes(q) ||
                    (m.employeeId || '').toLowerCase().includes(q) ||
                    m.department.toLowerCase().includes(q) ||
                    (m.designation || '').toLowerCase().includes(q)
                  );
                });

                if (filteredMembers.length === 0) {
                  return (
                    <div className="p-12 text-center text-slate-500 text-xs">
                      No members match the query "{memberSearchQuery}".
                    </div>
                  );
                }

                return (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/70 text-[11px] font-bold text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        <th className="py-2.5 px-3 text-center w-10">#</th>
                        <th className="py-2.5 px-3">Member Name</th>
                        <th className="py-2.5 px-3">Employee ID</th>
                        <th className="py-2.5 px-3">Department</th>
                        <th className="py-2.5 px-3">Designation</th>
                        <th className="py-2.5 px-3 text-center">Assigned NCs</th>
                        <th className="py-2.5 px-3 text-center">Open</th>
                        <th className="py-2.5 px-3 text-center">Review</th>
                        <th className="py-2.5 px-3 text-center">Closed</th>
                        <th className="py-2.5 px-3 text-center">Overdue</th>
                        <th className="py-2.5 px-3 text-center w-36">CAPA Adherence</th>
                        <th className="py-2.5 px-3">Contact</th>
                        <th className="py-2.5 px-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {filteredMembers.map((m, idx) => (
                        <tr
                          key={m.id || idx}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors group"
                        >
                          <td className="py-3 px-3 text-center font-mono text-slate-400 text-[11px]">
                            {idx + 1}
                          </td>

                          <td className="py-3 px-3 align-middle whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 font-bold text-xs flex items-center justify-center shrink-0">
                                {m.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-bold text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                                {m.name}
                              </span>
                            </div>
                          </td>

                          <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            {m.employeeId || '—'}
                          </td>

                          <td className="py-3 px-3 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                            {m.department}
                          </td>

                          <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                            {m.designation || '—'}
                          </td>

                          <td className="py-3 px-3 text-center font-mono font-bold text-slate-900 dark:text-white">
                            {m.totalNC}
                          </td>

                          <td className="py-3 px-3 text-center font-mono font-bold text-amber-600 dark:text-amber-400">
                            {m.openNC}
                          </td>

                          <td className="py-3 px-3 text-center font-mono font-bold text-purple-600 dark:text-purple-400">
                            {m.pendingNC}
                          </td>

                          <td className="py-3 px-3 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {m.closedNC}
                          </td>

                          <td className="py-3 px-3 text-center font-mono font-bold text-rose-600 dark:text-rose-400">
                            {m.overdueNC > 0 ? m.overdueNC : '—'}
                          </td>

                          <td className="py-3 px-3 text-center">
                            <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                              <span className="font-bold text-purple-600 dark:text-purple-400">{m.capRate}%</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div
                                className={`h-full transition-all duration-300 ${m.capRate === 100
                                    ? 'bg-emerald-500'
                                    : m.capRate >= 60
                                      ? 'bg-purple-500'
                                      : 'bg-amber-500'
                                  }`}
                                style={{ width: `${m.capRate}%` }}
                              />
                            </div>
                          </td>

                          <td className="py-3 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                            {m.mobileNumber || m.email || '—'}
                          </td>

                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleInspectMember(m)}
                              className="px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 text-purple-600 dark:text-purple-300 font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1 mx-auto"
                              title="View this member's detailed NC dossier"
                            >
                              <span>View Dossier</span>
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>

            <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex items-center justify-between text-xs text-slate-500">
              <span>Member Quality Accountability Register</span>
              <span className="font-mono text-[11px]">{memberStatsList.length} Team Members Tracked</span>
            </div>
          </div>
        </div>
      )}

      {/* =======================================================================
          VIEW 4: INDIVIDUAL MEMBER NC DETAILS (Clean Detailed Table Format)
          ======================================================================= */}
      {activeReportTab === 'member-detail' && (
        <div className="space-y-3 animate-in fade-in duration-200">
          {/* Member Profile Compact Strip */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-cyan-300 font-bold text-base flex items-center justify-center shrink-0">
                {activeMember ? activeMember.name.charAt(0).toUpperCase() : 'M'}
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>{activeMember ? activeMember.name : 'Select Member'}</span>
                  {activeMember?.employeeId && (
                    <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {activeMember.employeeId}
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-500">
                  {activeMember?.department || '—'} • {activeMember?.designation || '—'} • {activeMember?.mobileNumber || '—'}
                </p>
              </div>
            </div>

            {/* Member Switcher Dropdown & Inline Stats */}
            <div className="flex flex-wrap items-center gap-3">
              {activeMember && (
                <div className="flex items-center gap-2 font-mono text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span>Total: <strong>{activeMember.totalNC}</strong></span>
                  <span>•</span>
                  <span className="text-amber-600">Open: <strong>{activeMember.openNC}</strong></span>
                  <span>•</span>
                  <span className="text-emerald-600">Closed: <strong>{activeMember.closedNC}</strong></span>
                  <span>•</span>
                  <span className="text-indigo-600">CAP: <strong>{activeMember.capRate}%</strong></span>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400 font-medium">Switch:</span>
                <select
                  value={activeMember?.id || ''}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-medium cursor-pointer text-slate-800 dark:text-slate-200"
                >
                  {memberStatsList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.department} • {m.totalNC} NCs)
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Member Associated Non-Conformance Detailed Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-500" />
                <span>Associated Non-Conformances ({activeMemberComplaints.length} Records)</span>
              </h3>
              <span className="text-xs text-slate-400 font-mono">
                Assigned to {activeMember?.name || 'Member'}
              </span>
            </div>

            <div className="overflow-x-auto">
              {activeMemberComplaints.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-xs space-y-1">
                  <CheckCircle className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
                  <p className="font-bold text-slate-700 dark:text-slate-300">Clean Quality Record</p>
                  <p className="text-slate-400">
                    No non-conformances are currently assigned to {activeMember?.name}.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/70 text-[11px] font-bold text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      <th className="py-2.5 px-3 text-center w-10">#</th>
                      <th className="py-2.5 px-3">NC ID</th>
                      <th className="py-2.5 px-3">Date Logged</th>
                      <th className="py-2.5 px-3">Location / Station</th>
                      <th className="py-2.5 px-3">Finding Description</th>
                      <th className="py-2.5 px-3">Immediate Containment</th>
                      <th className="py-2.5 px-3">5-Why Root Cause</th>
                      <th className="py-2.5 px-3">Corrective Action (CAPA)</th>
                      <th className="py-2.5 px-3">Target Due</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-center">Risk</th>
                      <th className="py-2.5 px-3 text-center">Photos</th>
                      <th className="py-2.5 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {activeMemberComplaints.map((c, idx) => (
                      <tr
                        key={c._id || c.id || c.complaintId || idx}
                        className={`transition-colors ${c.isDeleted
                            ? 'bg-rose-50/40 dark:bg-rose-950/20 hover:bg-rose-50/70 dark:hover:bg-rose-950/40'
                            : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                          }`}
                      >
                        <td className="py-3 px-3 text-center font-mono text-slate-400 text-[11px] align-top">
                          {idx + 1}
                        </td>

                        <td className="py-3 px-3 align-top font-mono font-bold text-indigo-600 dark:text-cyan-400 whitespace-nowrap">
                          <div>{c.complaintId || 'NC-N/A'}</div>
                          {c.isDeleted && (
                            <span className="inline-block text-[9px] font-black uppercase text-rose-600 dark:text-rose-400 mt-0.5">
                              Deleted
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 align-top whitespace-nowrap text-slate-600 dark:text-slate-400">
                          <div>{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'N/A'}</div>
                          {c.isDeleted && (
                            <div className="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5">
                              Del: {c.deletedAt ? new Date(c.deletedAt).toLocaleDateString() : 'N/A'}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-3 align-top whitespace-nowrap text-slate-700 dark:text-slate-300">
                          {c.location || '—'}
                        </td>

                        <td className="py-3 px-3 align-top max-w-xs">
                          <p className="text-slate-800 dark:text-slate-200 line-clamp-2 leading-snug">
                            {getFindingText(c)}
                          </p>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Standard: {c.requirement || '—'}
                          </span>
                        </td>

                        <td className="py-3 px-3 align-top max-w-xs text-slate-700 dark:text-slate-300">
                          <p className="line-clamp-2 leading-snug">
                            {getImmediateCorrectionText(c)}
                          </p>
                        </td>

                        <td className="py-3 px-3 align-top max-w-xs text-slate-700 dark:text-slate-300">
                          <p className="line-clamp-2 leading-snug">
                            {getRootCauseText(c)}
                          </p>
                        </td>

                        <td className="py-3 px-3 align-top max-w-xs text-slate-700 dark:text-slate-300">
                          <p className="line-clamp-2 leading-snug">
                            {getCorrectiveActionText(c)}
                          </p>
                        </td>

                        <td className="py-3 px-3 align-top whitespace-nowrap font-mono text-[11px] text-slate-600 dark:text-slate-400">
                          {c.deadlineTimestamp ? new Date(c.deadlineTimestamp).toLocaleDateString() : 'N/A'}
                        </td>

                        <td className="py-3 px-3 align-top text-center whitespace-nowrap">
                          {c.isDeleted ? (
                            <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800">
                              Deleted ({c.status})
                            </span>
                          ) : (
                            <span
                              className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border ${c.status === 'Closed' || c.status === 'Verified'
                                  ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                  : 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                                }`}
                            >
                              {c.status}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 align-top text-center whitespace-nowrap">
                          <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {(c.priority || c.riskSeverity || 'MEDIUM').toUpperCase()}
                          </span>
                        </td>

                        <td className="py-3 px-3 align-top text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            {c.beforePhoto && (
                              <button
                                type="button"
                                onClick={() =>
                                  setLightboxPhoto({
                                    url: c.beforePhoto,
                                    title: `Before Photo: ${c.complaintId}`,
                                    subtitle: getFindingText(c),
                                  })
                                }
                                className="p-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 cursor-pointer"
                                title="View Before Defect Photo"
                              >
                                <Camera className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {c.afterPhoto && (
                              <button
                                type="button"
                                onClick={() =>
                                  setLightboxPhoto({
                                    url: c.afterPhoto,
                                    title: `After Photo: ${c.complaintId}`,
                                    subtitle: `Rectification: ${c.status}`,
                                  })
                                }
                                className="p-1 rounded bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-600 dark:text-emerald-400 cursor-pointer"
                                title="View After Rectification Photo"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {!c.beforePhoto && !c.afterPhoto && (
                              <span className="text-[10px] text-slate-400 font-mono">—</span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-3 align-top text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setDrilldownComplaint(c)}
                            className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-600 dark:text-cyan-400 font-bold text-[11px] transition-colors cursor-pointer inline-flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Inspect</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex items-center justify-between text-xs text-slate-500">
              <span>Member Dossier Audit Register</span>
              <span className="font-mono text-[11px]">{activeMemberComplaints.length} Records Assigned</span>
            </div>
          </div>
        </div>
      )}

      {/* =======================================================================
          VIEW 5: DEFECT CATEGORY WISE REPORT (Matrix & Drilldown)
          ======================================================================= */}
      {activeReportTab === 'category-report' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Breadcrumb if a specific category is inspected */}
          {selectedCategoryDetail ? (
            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryDetail(null)}
                    className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>All Defect Categories</span>
                  </button>
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Tag className="w-4 h-4 text-amber-500" />
                      <span>{selectedCategoryDetail} Detailed Defect Register</span>
                    </h2>
                    <p className="text-xs text-slate-500">
                      All non-conformances, 5-Why root causes, affected departments, and CAPA corrective records logged under this category.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (onNavigateNC) {
                        onNavigateNC('all', selectedCategoryDetail);
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-bold text-xs hover:bg-amber-100 transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open in NC/CAPA Register</span>
                  </button>
                </div>
              </div>

              {/* Category Specific Non-Conformance Table */}
              {(() => {
                const currentCat = categoryStatsList.find(
                  (c) => norm(c.category) === norm(selectedCategoryDetail)
                );
                const catComplaints = currentCat ? currentCat.complaints : [];

                return (
                  <div className="space-y-3">
                    {/* Category Stat Summary Chips */}
                    {currentCat && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                        <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                          <span className="text-[10px] font-semibold text-slate-400 block uppercase tracking-wider">Total Defect NCs</span>
                          <div className="text-lg font-black text-slate-900 dark:text-white font-mono mt-0.5">{currentCat.totalNC}</div>
                        </div>
                        <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                          <span className="text-[10px] font-semibold text-rose-500 block uppercase tracking-wider">Critical Risk</span>
                          <div className="text-lg font-black text-rose-600 dark:text-rose-400 font-mono mt-0.5">{currentCat.criticalNC}</div>
                        </div>
                        <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                          <span className="text-[10px] font-semibold text-amber-500 block uppercase tracking-wider">Active Open</span>
                          <div className="text-lg font-black text-amber-600 dark:text-amber-400 font-mono mt-0.5">{currentCat.openNC}</div>
                        </div>
                        <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                          <span className="text-[10px] font-semibold text-purple-500 block uppercase tracking-wider">In Review</span>
                          <div className="text-lg font-black text-purple-600 dark:text-purple-400 font-mono mt-0.5">{currentCat.pendingNC}</div>
                        </div>
                        <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                          <span className="text-[10px] font-semibold text-emerald-500 block uppercase tracking-wider">Verified / Closed</span>
                          <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">{currentCat.closedNC}</div>
                        </div>
                        <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                          <span className="text-[10px] font-semibold text-rose-500 block uppercase tracking-wider">Overdue Breaches</span>
                          <div className="text-lg font-black text-rose-600 dark:text-rose-400 font-mono mt-0.5">{currentCat.overdueNC}</div>
                        </div>
                        <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                          <span className="text-[10px] font-semibold text-indigo-500 block uppercase tracking-wider">Resolution Rate</span>
                          <div className="text-lg font-black text-indigo-600 dark:text-cyan-400 font-mono mt-0.5">{currentCat.capRate}%</div>
                        </div>
                      </div>
                    )}

                    {/* Affected Departments Chips */}
                    {currentCat && currentCat.departments.length > 0 && (
                      <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                          <span>Affected Departments:</span>
                        </span>
                        {currentCat.departments.map((d) => (
                          <span
                            key={d.name}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                          >
                            <span>{d.name}</span>
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-amber-500 text-white">
                              {d.count}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
                      <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <Tag className="w-4 h-4 text-amber-500" />
                          <span>{selectedCategoryDetail} Non-Conformance Records</span>
                          <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                            {catComplaints.length} Records
                          </span>
                        </h3>
                        <span className="text-xs text-slate-400 font-mono">
                          CAPA Completion Rate: {currentCat ? currentCat.capRate : 0}%
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        {catComplaints.length === 0 ? (
                          <div className="p-12 text-center text-slate-500 text-xs">
                            No non-conformance records found for this defect category.
                          </div>
                        ) : (
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/70 text-[11px] font-bold text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                <th className="py-2.5 px-3 text-center w-10">#</th>
                                <th className="py-2.5 px-3">NC ID</th>
                                <th className="py-2.5 px-3">Date Logged</th>
                                <th className="py-2.5 px-3">Plant Unit</th>
                                <th className="py-2.5 px-3">Department &amp; Line</th>
                                <th className="py-2.5 px-3">Finding Description</th>
                                <th className="py-2.5 px-3">Assigned Resolver</th>
                                <th className="py-2.5 px-3">5-Why Root Cause</th>
                                <th className="py-2.5 px-3">Corrective Action (CAPA)</th>
                                <th className="py-2.5 px-3">Target Due</th>
                                <th className="py-2.5 px-3 text-center">Status</th>
                                <th className="py-2.5 px-3 text-center">Risk</th>
                                <th className="py-2.5 px-3 text-center">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                              {catComplaints.map((c, idx) => {
                                const isOverdue =
                                  c.status !== 'Closed' &&
                                  c.status !== 'Verified' &&
                                  c.deadlineTimestamp &&
                                  Date.now() > new Date(c.deadlineTimestamp).getTime();

                                return (
                                  <tr
                                    key={c._id || c.id || c.complaintId || idx}
                                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors group"
                                  >
                                    <td className="py-3 px-3 text-center font-mono text-slate-400 text-[11px] align-top">
                                      {idx + 1}
                                    </td>
                                    <td className="py-3 px-3 align-top whitespace-nowrap">
                                      <span className="font-mono font-bold text-indigo-600 dark:text-cyan-400 block">
                                        {c.complaintId || 'NC-N/A'}
                                      </span>
                                    </td>
                                    <td className="py-3 px-3 align-top whitespace-nowrap text-slate-600 dark:text-slate-400">
                                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'N/A'}
                                    </td>
                                    <td className="py-3 px-3 align-top whitespace-nowrap">
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                        {c.unitName || (c.unitId === 'UNIT-2' ? 'Unit 2' : 'Unit 1')}
                                      </span>
                                    </td>
                                    <td className="py-3 px-3 align-top whitespace-nowrap">
                                      <div className="font-semibold text-slate-900 dark:text-white">
                                        {c.department || '—'}
                                      </div>
                                      <div className="text-[10px] text-slate-400 font-mono">
                                        {c.location || '—'}
                                      </div>
                                    </td>
                                    <td className="py-3 px-3 align-top max-w-xs">
                                      <p className="text-slate-800 dark:text-slate-200 line-clamp-2 leading-snug">
                                        {getFindingText(c)}
                                      </p>
                                    </td>
                                    <td className="py-3 px-3 align-top whitespace-nowrap">
                                      <div className="font-bold text-slate-900 dark:text-white">
                                        {getAssignedToName(c)}
                                      </div>
                                      <div className="text-[10px] text-slate-400">
                                        {c.assignedTo?.designation || '—'}
                                      </div>
                                    </td>
                                    <td className="py-3 px-3 align-top max-w-xs text-slate-600 dark:text-slate-400">
                                      <span className="line-clamp-2">{getRootCauseText(c)}</span>
                                    </td>
                                    <td className="py-3 px-3 align-top max-w-xs text-slate-600 dark:text-slate-400">
                                      <span className="line-clamp-2">{getCorrectiveActionText(c)}</span>
                                    </td>
                                    <td className="py-3 px-3 align-top whitespace-nowrap">
                                      <div className="font-mono text-slate-700 dark:text-slate-300">
                                        {c.deadlineTimestamp ? new Date(c.deadlineTimestamp).toLocaleDateString() : '—'}
                                      </div>
                                      {isOverdue && (
                                        <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400 animate-pulse">
                                          ⚠ Overdue
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-3 px-3 align-top text-center whitespace-nowrap">
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                        {c.status}
                                      </span>
                                    </td>
                                    <td className="py-3 px-3 align-top text-center whitespace-nowrap">
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${(c.priority || c.riskSeverity || '').toUpperCase() === 'CRITICAL'
                                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300'
                                          : (c.priority || c.riskSeverity || '').toUpperCase() === 'HIGH'
                                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300'
                                            : 'bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300'
                                        }`}>
                                        {(c.priority || c.riskSeverity || 'MEDIUM').toUpperCase()}
                                      </span>
                                    </td>
                                    <td className="py-3 px-3 align-top text-center whitespace-nowrap">
                                      <div className="flex items-center justify-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() => setDrilldownComplaint(c)}
                                          className="p-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                                          title="Inspect Defect Finding"
                                        >
                                          <Eye className="w-3.5 h-3.5" />
                                        </button>
                                        {onViewDetails && (
                                          <button
                                            type="button"
                                            onClick={() => onViewDetails(c)}
                                            className="p-1 rounded bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-600 dark:text-cyan-400 transition-colors cursor-pointer"
                                            title="View Full NC Dossier"
                                          >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>

                      <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex items-center justify-between text-xs text-slate-500">
                        <span>Defect Category Records Register</span>
                        <span className="font-mono text-[11px]">{catComplaints.length} Records</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Category Overview Summary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 block uppercase tracking-wider">Defect Categories</span>
                  <div className="text-xl font-black text-slate-900 dark:text-white font-mono mt-0.5">
                    {categoryKpiStats.totalCategories}
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    {categoryKpiStats.categoriesWithDefects} with active defects
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                  <span className="text-[10px] font-semibold text-amber-500 block uppercase tracking-wider">Leading Category</span>
                  <div className="text-sm font-bold text-amber-600 dark:text-amber-400 truncate mt-0.5" title={categoryKpiStats.topCategory?.category || 'None'}>
                    {categoryKpiStats.topCategory?.category || 'None'}
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    {categoryKpiStats.topCategory ? `${categoryKpiStats.topCategory.totalNC} NCs (${categoryKpiStats.topCategoryPercent}% of total)` : 'No defects logged'}
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                  <span className="text-[10px] font-semibold text-rose-500 block uppercase tracking-wider">High Risk Defects</span>
                  <div className="text-xl font-black text-rose-600 dark:text-rose-400 font-mono mt-0.5">
                    {categoryKpiStats.totalHighRisk}
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Critical &amp; Major categories
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                  <span className="text-[10px] font-semibold text-emerald-500 block uppercase tracking-wider">Plant Resolution Rate</span>
                  <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                    {overallCapRate}%
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    {closedCount} of {filteredCount} resolved
                  </span>
                </div>
              </div>

              {/* Defect Category Performance Matrix Table */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
                <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Tag className="w-4 h-4 text-amber-500" />
                    <span>Defect Category Performance &amp; Compliance Matrix</span>
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">
                    {categoryStatsList.length} Categories Monitored
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/70 text-[11px] font-bold text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        <th className="py-2.5 px-3 text-center w-10">#</th>
                        <th className="py-2.5 px-3">Defect Category</th>
                        <th className="py-2.5 px-3 text-center">Total NCs</th>
                        <th className="py-2.5 px-3 text-center">Critical</th>
                        <th className="py-2.5 px-3 text-center">Major</th>
                        <th className="py-2.5 px-3 text-center">Open</th>
                        <th className="py-2.5 px-3 text-center">In Review</th>
                        <th className="py-2.5 px-3 text-center">Closed</th>
                        <th className="py-2.5 px-3 text-center">Overdue</th>
                        <th className="py-2.5 px-3">Affected Departments</th>
                        <th className="py-2.5 px-3 text-center w-36">Resolution Rate</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                        <th className="py-2.5 px-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {categoryStatsList.map((cat, idx) => (
                        <tr
                          key={cat.category}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors group cursor-pointer"
                          onClick={() => setSelectedCategoryDetail(cat.category)}
                        >
                          <td className="py-3 px-3 text-center font-mono text-slate-400 text-[11px]">
                            {idx + 1}
                          </td>

                          <td className="py-3 px-3 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                                <Tag className="w-3.5 h-3.5" />
                              </span>
                              <span className="group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                                {cat.category}
                              </span>
                            </div>
                          </td>

                          <td className="py-3 px-3 text-center font-mono font-bold text-slate-900 dark:text-white">
                            {cat.totalNC}
                          </td>

                          <td className="py-3 px-3 text-center font-mono font-bold text-rose-600 dark:text-rose-400">
                            {cat.criticalNC > 0 ? cat.criticalNC : '—'}
                          </td>

                          <td className="py-3 px-3 text-center font-mono font-bold text-amber-600 dark:text-amber-400">
                            {cat.majorNC > 0 ? cat.majorNC : '—'}
                          </td>

                          <td className="py-3 px-3 text-center font-mono font-bold text-amber-600 dark:text-amber-400">
                            {cat.openNC}
                          </td>

                          <td className="py-3 px-3 text-center font-mono font-bold text-purple-600 dark:text-purple-400">
                            {cat.pendingNC}
                          </td>

                          <td className="py-3 px-3 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {cat.closedNC}
                          </td>

                          <td className="py-3 px-3 text-center font-mono font-bold text-rose-600 dark:text-rose-400">
                            {cat.overdueNC > 0 ? cat.overdueNC : '—'}
                          </td>

                          <td className="py-3 px-3 text-slate-600 dark:text-slate-400 text-[11px] max-w-xs">
                            {cat.departments.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {cat.departments.slice(0, 2).map((d) => (
                                  <span
                                    key={d.name}
                                    className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px]"
                                  >
                                    {d.name} ({d.count})
                                  </span>
                                ))}
                                {cat.departments.length > 2 && (
                                  <span className="text-[10px] text-slate-400">
                                    +{cat.departments.length - 2} more
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                              <span className="font-bold text-amber-600 dark:text-amber-400">{cat.capRate}%</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div
                                className={`h-full transition-all duration-300 ${cat.capRate === 100
                                    ? 'bg-emerald-500'
                                    : cat.capRate >= 60
                                      ? 'bg-amber-500'
                                      : 'bg-rose-500'
                                  }`}
                                style={{ width: `${cat.capRate}%` }}
                              />
                            </div>
                          </td>

                          <td className="py-3 px-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${cat.statusBadge}`}>
                              {cat.statusLabel}
                            </span>
                          </td>

                          <td className="py-3 px-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setSelectedCategoryDetail(cat.category)}
                                className="px-2.5 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1"
                                title="Inspect category records"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Inspect</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (onNavigateNC) {
                                    onNavigateNC('all', cat.category);
                                  }
                                }}
                                className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                                title="View in NC/CAPA Register"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex items-center justify-between text-xs text-slate-500">
                  <span>Defect Category Performance Register</span>
                  <span className="font-mono text-[11px]">{categoryStatsList.length} Categories</span>
                </div>
              </div>
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
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${drilldownComplaint.isDeleted
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-200 border border-rose-300 dark:border-rose-800'
                        : drilldownComplaint.status === 'Closed' ||
                          drilldownComplaint.status === 'Verified'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                  >
                    {drilldownComplaint.isDeleted
                      ? `Deleted (${drilldownComplaint.status})`
                      : drilldownComplaint.status}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
                    Risk: {(drilldownComplaint.priority || drilldownComplaint.riskSeverity || 'MEDIUM').toUpperCase()}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1">
                  {getFindingText(drilldownComplaint)}
                </h3>
                <p className="text-xs text-slate-500">
                  {drilldownComplaint.department} • {drilldownComplaint.location}
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

            {/* Archived Alert Banner if Deleted */}
            {drilldownComplaint.isDeleted && (
              <div className="p-4 rounded-2xl bg-rose-50/90 dark:bg-rose-950/70 border-2 border-rose-300 dark:border-rose-800 text-xs text-rose-900 dark:text-rose-200 space-y-1.5 shadow-xs">
                <div className="flex items-center gap-2 font-black text-rose-800 dark:text-rose-200 text-sm">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  <span>ARCHIVED RECORD • SOFT-DELETED NON-CONFORMANCE</span>
                </div>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                  Deleted on{' '}
                  <strong className="font-mono text-slate-900 dark:text-white">
                    {drilldownComplaint.deletedAt ? new Date(drilldownComplaint.deletedAt).toLocaleString() : 'N/A'}
                  </strong>{' '}
                  by{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {typeof drilldownComplaint.deletedBy === 'object'
                      ? drilldownComplaint.deletedBy?.name
                      : (drilldownComplaint.deletedBy || 'System')}
                  </strong>
                  {drilldownComplaint.deletedReason ? ` • Reason: "${drilldownComplaint.deletedReason}"` : ''}.
                  All non-conformance details, photos, department info, assigned employee, root cause, and CAP details are permanently preserved.
                </p>
              </div>
            )}

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
                  Standard: {drilldownComplaint.requirement || '—'}
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
                  Responsible Person (Resolver)
                </span>
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  {getAssignedToName(drilldownComplaint)}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Designation: {drilldownComplaint.assignedTo?.designation || '—'}
                </div>
                <div className="text-[11px] font-mono text-slate-500">
                  Mobile: {drilldownComplaint.assignedTo?.mobileNumber || '—'}
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
                Stage 3: 5-Why Root Cause &amp; CAPA Corrective Actions
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

            {/* Stage 3.5: Auditor Rejection Directives & Feedback */}
            {isRejectRework(drilldownComplaint) && (
              <div className="p-4 rounded-2xl bg-orange-50/60 dark:bg-orange-950/30 border border-orange-200/80 dark:border-orange-800/60 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-orange-800 dark:text-orange-300">
                  <RotateCcw className="w-3.5 h-3.5 text-orange-600" />
                  <span>Auditor Rejection Directives &amp; Feedback</span>
                </div>
                <div className="text-xs bg-white/80 dark:bg-slate-900/80 p-3 rounded-xl border border-orange-200/60 dark:border-orange-800/40">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                    <span>Rejected By: <strong className="text-slate-800 dark:text-slate-200">{getRejectionAuditor(drilldownComplaint)}</strong></span>
                    <span className="font-mono">{getRejectionTimestamp(drilldownComplaint)}</span>
                  </div>
                  <p className="text-slate-800 dark:text-slate-200 font-medium">
                    {getRejectionReasonText(drilldownComplaint)}
                  </p>
                </div>
              </div>
            )}

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
                  <span>View in NC/CAPA Register</span>
                </button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => generateSingleNCPdf(drilldownComplaint, user?.name || 'Quality Directorate')}
                  disabled={downloadingPDF}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-600/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  title="Download Single NC PDF Report with Before & After Photos"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Export NC PDF Report</span>
                </button>

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
        </div>
      )}
      {/* Export Checklist & Column Selector Modal */}
      <ExportColumnsModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        initialFormat={exportModalFormat}
        activeReportTab={activeReportTab}
        reportTitle={currentReportTitle}
        availableColumns={currentAvailableColumns}
        presets={currentPresets}
        datasetCount={currentDatasetCount}
        isExporting={downloadingCSV || downloadingPDF}
        onExecuteExport={handleExecuteExport}
      />
    </div>
  );
};

export default ReportsView;
