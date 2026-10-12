import React, { useState, useMemo } from 'react';
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
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '../context/AuthContext';

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
  // FILTER STATES (Fulfilling all 6 user requirements)
  // ---------------------------------------------------------------------------
  // 1. Search & Free text
  const [searchTerm, setSearchTerm] = useState('');

  // 2. Date Range Filter
  const [datePreset, setDatePreset] = useState('ALL'); // 'ALL' | 'TODAY' | '7D' | '30D' | 'THIS_MONTH' | 'CUSTOM'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // 3. Department Wise Filter
  const [departmentFilter, setDepartmentFilter] = useState('ALL');

  // 4. NC Status & Risk Filter
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'OPEN' | 'CAP_SUBMITTED' | 'UNDER_REVIEW' | 'REWORK' | 'CLOSED' | 'OVERDUE'
  const [riskFilter, setRiskFilter] = useState('ALL'); // 'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

  // 5. Responsible Person & Auditor Filter
  const [responsibleFilter, setResponsibleFilter] = useState('ALL');
  const [auditorFilter, setAuditorFilter] = useState('ALL');

  // 6. Aging & Repeat NC Filter
  const [agingFilter, setAgingFilter] = useState('ALL'); // 'ALL' | 'FRESH' | 'MODERATE' | 'HIGH' | 'SEVERE'
  const [repeatFilter, setRepeatFilter] = useState('ALL'); // 'ALL' | 'REPEAT' | 'SINGLE'

  // 7. Export Scope & Drill-Down Modal State
  const [exportScope, setExportScope] = useState('FILTERED'); // 'FILTERED' | 'ALL'
  const [drilldownComplaint, setDrilldownComplaint] = useState(null);
  const [showFiltersExpanded, setShowFiltersExpanded] = useState(true);

  // Helper to extract clean finding text
  const getFindingText = (c) => {
    return (
      c.describeFinding ||
      c.findingDescription ||
      c.description ||
      c.title ||
      'No defect description logged.'
    );
  };

  // Helper to normalize issue key for frequency calculation
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

  // Issue frequency map: count occurrences of each issue across the complaints dataset
  const issueFrequencyMap = useMemo(() => {
    const map = {};
    (complaints || []).forEach((c) => {
      const key = getIssueKey(c);
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [complaints]);

  // Frequency getter: returns the exact count of times this same issue has occurred
  const getIssueFrequency = (c) => {
    const key = getIssueKey(c);
    return issueFrequencyMap[key] || 1;
  };

  const getImmediateCorrectionText = (c) => {
    return (
      c.cap?.immediateCorrection ||
      c.actionNotes ||
      'Pending immediate containment action from supervisor.'
    );
  };

  // Root cause of the issue (5-Why analysis)
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

  // Assigned To: the person responsible for resolving the issue
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

  // Calculate ticket age in hours and days
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
  // DYNAMIC FILTER OPTION EXTRACTORS (Strictly from real database records)
  // ---------------------------------------------------------------------------
  const departmentList = useMemo(() => {
    const set = new Set();
    (complaints || []).forEach((c) => {
      if (c.department && c.department.trim()) {
        set.add(c.department.trim());
      }
    });
    return Array.from(set).sort();
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

  // Department counts for quick drilldown chips
  const departmentCounts = useMemo(() => {
    const counts = {};
    (complaints || []).forEach((c) => {
      const dept = c.department || 'Unassigned';
      counts[dept] = (counts[dept] || 0) + 1;
    });
    return counts;
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
        if (
          statusFilter === 'REWORK' &&
          c.status !== 'Rejected / Rework'
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
        const cDept = (c.department || '').trim().toLowerCase();
        const targetDept = departmentFilter.trim().toLowerCase();
        if (
          cDept !== targetDept &&
          !cDept.includes(targetDept) &&
          !targetDept.includes(cDept)
        )
          return false;
      }

      // 4. Responsible Person Filter
      if (responsibleFilter !== 'ALL') {
        const respName = getAssignedToName(c).toLowerCase();
        if (!respName.includes(responsibleFilter.toLowerCase())) return false;
      }

      // 5. Auditor Filter
      if (auditorFilter !== 'ALL') {
        const audName = (c.createdBy?.name || '').toLowerCase();
        if (!audName.includes(auditorFilter.toLowerCase())) return false;
      }

      // 6. Aging Filter
      if (agingFilter !== 'ALL') {
        const ageHours = getTicketAgeHours(c);
        if (agingFilter === 'FRESH' && ageHours > 24) return false;
        if (agingFilter === 'MODERATE' && (ageHours <= 24 || ageHours > 72))
          return false;
        if (agingFilter === 'HIGH' && (ageHours <= 72 || ageHours > 168))
          return false;
        if (agingFilter === 'SEVERE' && ageHours <= 168) return false;
      }

      // 7. Repeat NC Filter
      if (repeatFilter !== 'ALL') {
        const freq = getIssueFrequency(c);
        if (repeatFilter === 'REPEAT' && freq <= 1) return false;
        if (repeatFilter === 'SINGLE' && freq > 1) return false;
      }

      // 8. Date Range Filter
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

      // 9. Free-text Search
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const matchesSearch =
          (c.complaintId || '').toLowerCase().includes(term) ||
          (c.department || '').toLowerCase().includes(term) ||
          (c.location || '').toLowerCase().includes(term) ||
          (c.category || '').toLowerCase().includes(term) ||
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
    responsibleFilter,
    auditorFilter,
    agingFilter,
    repeatFilter,
    datePreset,
    startDate,
    endDate,
    searchTerm,
    issueFrequencyMap,
  ]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchTerm.trim()) count++;
    if (datePreset !== 'ALL' || startDate || endDate) count++;
    if (departmentFilter !== 'ALL') count++;
    if (statusFilter !== 'ALL') count++;
    if (riskFilter !== 'ALL') count++;
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
    statusFilter,
    riskFilter,
    responsibleFilter,
    auditorFilter,
    agingFilter,
    repeatFilter,
  ]);

  const hasActiveFilters = activeFilterCount > 0;

  // Reset all filters function
  const handleResetFilters = () => {
    setSearchTerm('');
    setDatePreset('ALL');
    setStartDate('');
    setEndDate('');
    setDepartmentFilter('ALL');
    setStatusFilter('ALL');
    setRiskFilter('ALL');
    setResponsibleFilter('ALL');
    setAuditorFilter('ALL');
    setAgingFilter('ALL');
    setRepeatFilter('ALL');
  };

  // Target dataset for export based on exportScope
  const datasetToExport =
    exportScope === 'ALL' && hasActiveFilters
      ? complaints
      : filteredComplaints;

  // Compute key summary metrics based on filtered set
  const totalNC = complaints.length;
  const filteredCount = filteredComplaints.length;
  const openCount = filteredComplaints.filter(
    (c) =>
      c.status === 'Open' ||
      c.status === 'Assigned' ||
      c.status === 'In Progress'
  ).length;
  const underReviewCount = filteredComplaints.filter(
    (c) =>
      c.status === 'CAP Submitted' ||
      c.status === 'Under Review' ||
      c.status === 'Under Verification'
  ).length;
  const closedCount = filteredComplaints.filter(
    (c) => c.status === 'Closed' || c.status === 'Verified'
  ).length;
  const overdueCount = filteredComplaints.filter((c) => {
    if (c.status === 'Closed' || c.status === 'Verified') return false;
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
      : null;

  // ---------------------------------------------------------------------------
  // 1. COMPLETE A-TO-Z PDF AUDIT REPORT DOWNLOAD HANDLER
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
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 36;
      const contentWidth = pageWidth - margin * 2;

      // Color Palette
      const brandDark = [15, 23, 42]; // Slate 900
      const brandPrimary = [37, 99, 235]; // Royal Blue
      const brandMuted = [100, 116, 139]; // Slate 500
      const bgLight = [248, 250, 252]; // Slate 50
      const borderLine = [226, 232, 240]; // Slate 200

      // PAGE 1: Header Ribbon
      doc.setFillColor(...brandPrimary);
      doc.rect(0, 0, pageWidth, 50, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.text('GARMENT QUALITY MANAGEMENT SYSTEM (QMS)', margin, 28);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(
        'Plant Unit #4 • Audit & Action Compliance Register',
        pageWidth - margin,
        28,
        { align: 'right' }
      );

      // Report Main Title
      doc.setTextColor(...brandDark);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('A-to-Z Non-Conformance (NC) & CAP Audit Report', margin, 80);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...brandMuted);
      const generatedDate = new Date().toLocaleString();
      const genUser = user
        ? `${user.name} (${user.employeeId || 'N/A'}) • ${user.department || 'Quality Department'}`
        : 'System Administrator';
      doc.text(`Generated By: ${genUser}   |   Execution Date: ${generatedDate}`, margin, 96);

      // Active filters summary note
      const filterSummaryNotes = [];
      if (departmentFilter !== 'ALL') filterSummaryNotes.push(`Dept: ${departmentFilter}`);
      if (statusFilter !== 'ALL') filterSummaryNotes.push(`Status: ${statusFilter}`);
      if (riskFilter !== 'ALL') filterSummaryNotes.push(`Risk: ${riskFilter}`);
      if (responsibleFilter !== 'ALL') filterSummaryNotes.push(`Resolver: ${responsibleFilter}`);
      if (auditorFilter !== 'ALL') filterSummaryNotes.push(`Auditor: ${auditorFilter}`);
      if (agingFilter !== 'ALL') filterSummaryNotes.push(`Aging: ${agingFilter}`);
      if (repeatFilter !== 'ALL') filterSummaryNotes.push(`Recurrence: ${repeatFilter}`);
      if (datePreset !== 'ALL') filterSummaryNotes.push(`Range: ${datePreset}`);

      const scopeText =
        filterSummaryNotes.length > 0
          ? `Filtered Scope (${datasetToExport.length} Records): ${filterSummaryNotes.join(' • ')}`
          : `Scope: All Plant Records (${datasetToExport.length} Records) • Complete Defect to CAP Verification Closure`;

      doc.text(scopeText, margin, 109);

      // Executive Metrics Scorecard Banner
      doc.setFillColor(...bgLight);
      doc.setDrawColor(...borderLine);
      doc.roundedRect(margin, 122, contentWidth, 48, 6, 6, 'FD');

      const kpiColWidth = contentWidth / 6;
      const kpis = [
        { label: 'NCs in Report', val: String(datasetToExport.length), col: brandDark },
        { label: 'Open / In Progress', val: String(openCount), col: [217, 119, 6] },
        { label: 'Under Review', val: String(underReviewCount), col: [79, 70, 229] },
        { label: 'Overdue SLA', val: String(overdueCount), col: [225, 29, 72] },
        { label: 'Verified & Closed', val: String(closedCount), col: [16, 185, 129] },
        {
          label: 'SLA Adherence',
          val: slaRate !== null ? `${slaRate}%` : '—',
          col: [37, 99, 235],
        },
      ];

      kpis.forEach((kpi, idx) => {
        const xPos = margin + idx * kpiColWidth + kpiColWidth / 2;
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...brandMuted);
        doc.text(kpi.label, xPos, 140, { align: 'center' });

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...kpi.col);
        doc.text(kpi.val, xPos, 158, { align: 'center' });
      });

      // SECTION 1 TABLE: High-Level Non-Conformance Register Index
      doc.setTextColor(...brandDark);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('1. Master Non-Conformance (NC) Status Index', margin, 192);

      const summaryTableHeaders = [
        [
          'NC ID',
          'Dept / Line',
          'Defect Finding & Frequency',
          'Root Cause of Issue',
          'Assigned To (Responsible)',
          'CAP / Due',
          'Status',
        ],
      ];

      const summaryTableRows = datasetToExport.map((c) => {
        const isOverdue =
          c.status !== 'Closed' &&
          c.status !== 'Verified' &&
          c.deadlineTimestamp &&
          Date.now() > new Date(c.deadlineTimestamp).getTime();

        const freq = getIssueFrequency(c);
        const finding = getFindingText(c);
        const rootCause = getRootCauseText(c);
        const assignedName = getAssignedToName(c);

        return [
          c.complaintId || 'NC-N/A',
          `${c.department || 'N/A'}\n(${c.location || 'Floor'})`,
          `${finding.slice(0, 42)}${finding.length > 42 ? '...' : ''}\n[Freq: ${freq} time${freq > 1 ? 's' : ''}]`,
          `${rootCause.slice(0, 50)}${rootCause.length > 50 ? '...' : ''}`,
          `${assignedName.slice(0, 22)}`,
          `${c.cap?.status || (c.capRequired ? 'CAP Req' : 'Direct')}\n${
            c.deadlineTimestamp
              ? new Date(c.deadlineTimestamp).toLocaleDateString()
              : 'N/A'
          }`,
          isOverdue ? 'OVERDUE' : c.status || 'Open',
        ];
      });

      autoTable(doc, {
        head: summaryTableHeaders,
        body: summaryTableRows,
        startY: 200,
        margin: { left: margin, right: margin, bottom: 36 },
        theme: 'grid',
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontSize: 7.2,
          fontStyle: 'bold',
          halign: 'left',
        },
        styles: {
          fontSize: 7.2,
          cellPadding: 3.5,
          overflow: 'linebreak',
        },
        columnStyles: {
          0: { cellWidth: 55, fontStyle: 'bold' },
          1: { cellWidth: 68 },
          2: { cellWidth: 108 },
          3: { cellWidth: 112 },
          4: { cellWidth: 78, fontStyle: 'bold' },
          5: { cellWidth: 50 },
          6: { cellWidth: 52, fontStyle: 'bold' },
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
      });

      // SECTION 2: COMPLETE A-TO-Z DETAILED DOSSIER
      doc.addPage();
      let currentY = 50;

      doc.setFillColor(...brandPrimary);
      doc.rect(0, 0, pageWidth, 40, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(255, 255, 255);
      doc.text(
        '2. Comprehensive Non-Conformance & CAP Dossier',
        margin,
        24
      );

      datasetToExport.forEach((c, index) => {
        if (currentY + 230 > pageHeight - 40) {
          doc.addPage();
          currentY = 40;
        }

        const isOverdue =
          c.status !== 'Closed' &&
          c.status !== 'Verified' &&
          c.deadlineTimestamp &&
          Date.now() > new Date(c.deadlineTimestamp).getTime();

        const createdDateStr = c.createdAt
          ? new Date(c.createdAt).toLocaleString()
          : 'N/A';
        const deadlineDateStr = c.deadlineTimestamp
          ? new Date(c.deadlineTimestamp).toLocaleString()
          : 'N/A';
        const closedDateStr = c.actualCompletedAt
          ? new Date(c.actualCompletedAt).toLocaleString()
          : 'Pending Closure';

        const freq = getIssueFrequency(c);
        const assignedName = getAssignedToName(c);
        const rootCause = getRootCauseText(c);

        doc.setFillColor(241, 245, 249);
        doc.setDrawColor(...borderLine);
        doc.roundedRect(margin, currentY, contentWidth, 22, 4, 4, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(...brandDark);
        doc.text(
          `Record #${index + 1}:  ${c.complaintId || 'NC-N/A'}  —  ${
            c.department || 'General'
          } (${c.location || 'Floor'})`,
          margin + 8,
          currentY + 14
        );

        doc.setFontSize(8.5);
        if (c.status === 'Closed' || c.status === 'Verified') {
          doc.setTextColor(16, 185, 129);
          doc.text(
            `[CLOSED & VERIFIED EFFECTIVE]`,
            pageWidth - margin - 8,
            currentY + 14,
            { align: 'right' }
          );
        } else if (isOverdue) {
          doc.setTextColor(225, 29, 72);
          doc.text(
            `[STATUS: OVERDUE SLA BREACH]`,
            pageWidth - margin - 8,
            currentY + 14,
            { align: 'right' }
          );
        } else {
          doc.setTextColor(37, 99, 235);
          doc.text(
            `[STATUS: ${(c.status || 'OPEN').toUpperCase()}]`,
            pageWidth - margin - 8,
            currentY + 14,
            { align: 'right' }
          );
        }

        const recordDetails = [
          [
            {
              content: 'STAGE 1: NC CREATION & ISSUE FREQUENCY',
              colSpan: 2,
              styles: {
                fillColor: [248, 250, 252],
                fontStyle: 'bold',
                textColor: [71, 85, 105],
              },
            },
          ],
          [
            'Defect Finding:',
            `${getFindingText(c)} [Occurred ${freq} time${freq > 1 ? 's' : ''}]`,
          ],
          [
            'Defect Category & Risk:',
            `${c.category || 'Quality Fault'} | Severity: ${
              c.priority || c.riskSeverity || 'Medium'
            }`,
          ],
          [
            'Auditor & Station Location:',
            `${c.createdBy?.name || 'Quality Team'} (${
              c.createdBy?.role || 'AUDITOR'
            }) • ${c.location || 'Factory Floor'}`,
          ],
          [
            {
              content: 'STAGE 2: ASSIGNMENT & SLA RECTIFICATION TARGET',
              colSpan: 2,
              styles: {
                fillColor: [248, 250, 252],
                fontStyle: 'bold',
                textColor: [71, 85, 105],
              },
            },
          ],
          [
            'Responsible Person:',
            `${assignedName} [${c.assignedTo?.designation || 'Supervisor'}] • Mobile: ${
              c.assignedTo?.mobileNumber || 'N/A'
            }`,
          ],
          [
            'SLA Window & Target Due Date:',
            `${c.deadlineHours || 24}h Window • Target: ${deadlineDateStr} (Logged: ${createdDateStr})`,
          ],
          [
            {
              content: 'STAGE 3: 5-WHY ROOT CAUSE ANALYSIS & CAP DIRECTIVES',
              colSpan: 2,
              styles: {
                fillColor: [248, 250, 252],
                fontStyle: 'bold',
                textColor: [71, 85, 105],
              },
            },
          ],
          ['Root Cause of the Issue:', `${rootCause}`],
          ['Immediate Containment Action:', `${getImmediateCorrectionText(c)}`],
          ['Permanent Corrective Action:', `${getCorrectiveActionText(c)}`],
          ['Preventive Action Recurrence Plan:', `${getPreventiveActionText(c)}`],
          [
            {
              content: 'STAGE 4: AUDITOR FLOOR VERIFICATION & CLOSURE',
              colSpan: 2,
              styles: {
                fillColor: [248, 250, 252],
                fontStyle: 'bold',
                textColor: [71, 85, 105],
              },
            },
          ],
          [
            'Verification Evidence & Status:',
            `After Photo Proof: ${
              c.afterPhoto ? 'Verified Uploaded' : 'Pending Proof'
            } • Condition: ${c.deadlineCondition || (isOverdue ? 'Overdue Breach' : 'Within SLA')}`,
          ],
          [
            'Final Closure Approval Date:',
            `${closedDateStr} • Verification Readiness: ${
              c.cap?.verificationReadinessNotes || 'Normal QMS Procedure'
            }`,
          ],
        ];

        autoTable(doc, {
          body: recordDetails,
          startY: currentY + 24,
          margin: { left: margin, right: margin },
          theme: 'grid',
          styles: {
            fontSize: 7,
            cellPadding: 2.5,
            overflow: 'linebreak',
          },
          columnStyles: {
            0: {
              cellWidth: 140,
              fontStyle: 'bold',
              textColor: [51, 65, 85],
            },
            1: { cellWidth: contentWidth - 140, textColor: [15, 23, 42] },
          },
        });

        currentY = doc.lastAutoTable.finalY + 14;
      });

      doc.save(
        `Garment_QMS_NC_and_CAP_Audit_Report_${new Date()
          .toISOString()
          .slice(0, 10)}.pdf`
      );
    } catch (err) {
      console.error('Failed to export PDF report:', err);
    } finally {
      setTimeout(() => setDownloadingPDF(false), 600);
    }
  };

  // ---------------------------------------------------------------------------
  // 2. COMPLETE CSV MASTER SPREADSHEET EXPORT HANDLER
  // ---------------------------------------------------------------------------
  const handleExportCSV = () => {
    setDownloadingCSV(true);
    try {
      const headers = [
        'Non-Conformance ID',
        'Lifecycle Status',
        'Risk Severity / Priority',
        'Department',
        'Plant Location & Line Station',
        'Defect Category',
        'Creation Timestamp (Date & Time)',
        'Auditor Name',
        'Auditor Employee ID',
        'Auditor Role',
        'Defect Finding Description',
        'Issue Occurrence Frequency (Count)',
        'Ticket Aging Duration',
        'Before Photo Attached Status',
        'Assigned To (Responsible for Resolving)',
        'Assigned Supervisor Employee ID',
        'Assigned Supervisor Designation',
        'Assigned Supervisor Mobile Contact',
        'SLA Target Duration (Hours)',
        'Target SLA Deadline Date & Time',
        'SLA Condition Status',
        'CAP Requirement',
        'CAP Lifecycle Status',
        'Immediate Correction (Containment Action)',
        'Root Cause of the Issue (5-Why Analysis)',
        'Corrective Action (Permanent Fix)',
        'Preventive Action (Systemic Recurrence Prevention)',
        'CAP Responsible Person',
        'CAP Target Completion Date',
        'After Proof Photo Evidence Status',
        'Verification Readiness Notes',
        'Approved Closure Date & Time',
        'Auditor Rejection Reason (If Any)',
      ];

      const rows = datasetToExport.map((c) => {
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
          `"${(c.createdBy?.name || '').replace(/"/g, '""')}"`,
          `"${c.createdBy?.employeeId || ''}"`,
          `"${c.createdBy?.role || ''}"`,
          `"${getFindingText(c).replace(/"/g, '""')}"`,
          `"${getIssueFrequency(c)}"`,
          `"${getTicketAgeLabel(c)}"`,
          `"${c.beforePhoto ? 'Yes (Photo Captured)' : 'No Photo'}"`,
          `"${getAssignedToName(c).replace(/"/g, '""')}"`,
          `"${c.assignedTo?.employeeId || ''}"`,
          `"${(c.assignedTo?.designation || '').replace(/"/g, '""')}"`,
          `"${c.assignedTo?.mobileNumber || ''}"`,
          `"${c.deadlineHours || 24}"`,
          `"${
            c.deadlineTimestamp
              ? new Date(c.deadlineTimestamp).toLocaleString()
              : ''
          }"`,
          `"${isOverdue ? 'Overdue Breach' : c.deadlineCondition || 'Within SLA'}"`,
          `"${c.capRequired ? 'Mandatory CAP' : 'Direct Correction'}"`,
          `"${
            c.cap?.status ||
            (c.status === 'Closed' ? 'VERIFIED_EFFECTIVE' : 'IN_PROGRESS')
          }"`,
          `"${getImmediateCorrectionText(c).replace(/"/g, '""')}"`,
          `"${getRootCauseText(c).replace(/"/g, '""')}"`,
          `"${getCorrectiveActionText(c).replace(/"/g, '""')}"`,
          `"${getPreventiveActionText(c).replace(/"/g, '""')}"`,
          `"${getResponsiblePerson(c).replace(/"/g, '""')}"`,
          `"${getCapTargetDate(c)}"`,
          `"${c.afterPhoto ? 'Yes (Proof Uploaded)' : 'Pending After Proof'}"`,
          `"${(c.cap?.verificationReadinessNotes || '').replace(/"/g, '""')}"`,
          `"${
            c.actualCompletedAt
              ? new Date(c.actualCompletedAt).toLocaleString()
              : 'Pending Closure'
          }"`,
          `"${(c.rejectionReason || 'None').replace(/"/g, '""')}"`,
        ];
      });

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join(
        '\n'
      );
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute(
        'download',
        `Garment_QMS_NC_and_CAP_Master_Register_${new Date()
          .toISOString()
          .slice(0, 10)}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export CSV register:', err);
    } finally {
      setTimeout(() => setDownloadingCSV(false), 600);
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
            Multi-dimensional audit reporting, department defect trends, repeat NC root cause tracking, and SLA verification closure. Filter by date range, department, risk, resolvers, and aging with live interactive drill-down.
          </p>
        </div>

        {/* Direct Download Action Buttons with Export Scope selector */}
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
                : `Export CSV (${datasetToExport.length})`}
            </span>
          </button>
        </div>
      </div>

      {/* 2. Interactive KPI Overview Cards with Drill-Down Clicks */}
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            Audit Scorecard &amp; 1-Click Drill-Down
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            Click any metric to drill down into records
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
              <span>Open NCs</span>
              <Clock className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div className="text-xl font-black text-amber-600 dark:text-amber-400 font-mono my-1">
              {openCount}
            </div>
            <div className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
              <span>Drill-Down</span>
              <ChevronRight className="w-2.5 h-2.5" />
            </div>
          </div>

          {/* CARD 3: Under Review */}
          <div
            onClick={() => setStatusFilter('UNDER_REVIEW')}
            className={`p-3 rounded-xl bg-white dark:bg-slate-900 border shadow-2xs hover:border-indigo-400 dark:hover:border-indigo-600 transition-all cursor-pointer group flex flex-col justify-between ${
              statusFilter === 'UNDER_REVIEW'
                ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/20 dark:bg-indigo-950/20'
                : 'border-slate-200/90 dark:border-slate-800'
            }`}
            title="Drill down to CAP Submitted / Under Verification"
          >
            <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>CAP Review</span>
              <FileCheck className="w-3.5 h-3.5 text-indigo-500" />
            </div>
            <div className="text-xl font-black text-indigo-600 dark:text-cyan-400 font-mono my-1">
              {underReviewCount}
            </div>
            <div className="text-[10px] text-indigo-600 dark:text-cyan-400 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
              <span>Drill-Down</span>
              <ChevronRight className="w-2.5 h-2.5" />
            </div>
          </div>

          {/* CARD 4: Overdue SLA */}
          <div
            onClick={() => setStatusFilter('OVERDUE')}
            className={`p-3 rounded-xl bg-white dark:bg-slate-900 border shadow-2xs hover:border-rose-400 dark:hover:border-rose-600 transition-all cursor-pointer group flex flex-col justify-between ${
              statusFilter === 'OVERDUE'
                ? 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-50/20 dark:bg-rose-950/20'
                : 'border-slate-200/90 dark:border-slate-800'
            }`}
            title="Drill down to Overdue SLA Breaches"
          >
            <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>Overdue SLA</span>
              <Flame className="w-3.5 h-3.5 text-rose-500" />
            </div>
            <div className="text-xl font-black text-rose-600 dark:text-rose-400 font-mono my-1">
              {overdueCount}
            </div>
            <div className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
              <span>Drill-Down</span>
              <ChevronRight className="w-2.5 h-2.5" />
            </div>
          </div>

          {/* CARD 5: Verified & Closed */}
          <div
            onClick={() => setStatusFilter('CLOSED')}
            className={`p-3 rounded-xl bg-white dark:bg-slate-900 border shadow-2xs hover:border-emerald-400 dark:hover:border-emerald-600 transition-all cursor-pointer group flex flex-col justify-between ${
              statusFilter === 'CLOSED'
                ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/20 dark:bg-emerald-950/20'
                : 'border-slate-200/90 dark:border-slate-800'
            }`}
            title="Drill down to Verified and Closed NCs"
          >
            <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>Closed &amp; Verified</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono my-1">
              {closedCount}
            </div>
            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
              <span>Drill-Down</span>
              <ChevronRight className="w-2.5 h-2.5" />
            </div>
          </div>

          {/* CARD 6: Critical Severity */}
          <div
            onClick={() => setRiskFilter('CRITICAL')}
            className={`p-3 rounded-xl bg-white dark:bg-slate-900 border shadow-2xs hover:border-rose-400 dark:hover:border-rose-600 transition-all cursor-pointer group flex flex-col justify-between ${
              riskFilter === 'CRITICAL'
                ? 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-50/20 dark:bg-rose-950/20'
                : 'border-slate-200/90 dark:border-slate-800'
            }`}
            title="Drill down to CRITICAL risk NCs"
          >
            <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>Critical Risk</span>
              <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
            </div>
            <div className="text-xl font-black text-rose-600 dark:text-rose-400 font-mono my-1">
              {criticalCount}
            </div>
            <div className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
              <span>Drill-Down</span>
              <ChevronRight className="w-2.5 h-2.5" />
            </div>
          </div>

          {/* CARD 7: Repeat Defect Issues */}
          <div
            onClick={() => setRepeatFilter('REPEAT')}
            className={`p-3 rounded-xl bg-white dark:bg-slate-900 border shadow-2xs hover:border-purple-400 dark:hover:border-purple-600 transition-all cursor-pointer group flex flex-col justify-between ${
              repeatFilter === 'REPEAT'
                ? 'border-purple-500 ring-2 ring-purple-500/20 bg-purple-50/20 dark:bg-purple-950/20'
                : 'border-slate-200/90 dark:border-slate-800'
            }`}
            title="Drill down to Recurring / Repeat NCs (Frequency >= 2)"
          >
            <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>Repeat NCs</span>
              <Repeat className="w-3.5 h-3.5 text-purple-500" />
            </div>
            <div className="text-xl font-black text-purple-600 dark:text-purple-400 font-mono my-1">
              {repeatCount}
            </div>
            <div className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
              <span>Drill-Down</span>
              <ChevronRight className="w-2.5 h-2.5" />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Interactive Department Wise Drill-Down Quick Chips */}
      {departmentList.length > 0 && (
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-indigo-500" />
              <span>Department-Wise Drill-Down</span>
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              {departmentList.length} Departments Active
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto horizontal-scroll-bar pb-1">
            <button
              type="button"
              onClick={() => setDepartmentFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                departmentFilter === 'ALL'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              All Departments ({totalNC})
            </button>

            {departmentList.map((dept) => {
              const count = departmentCounts[dept] || 0;
              const isSelected = departmentFilter === dept;
              return (
                <button
                  key={dept}
                  type="button"
                  onClick={() =>
                    setDepartmentFilter(isSelected ? 'ALL' : dept)
                  }
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>{dept}</span>
                  <span
                    className={`px-1.5 py-0.2 text-[10px] rounded-full font-mono font-bold ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. COMPREHENSIVE MULTI-FILTER CONTROL PANEL */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
        {/* Filter Panel Header */}
        <div className="p-3.5 sm:p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-cyan-400 flex items-center justify-center font-bold">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                  Advanced Audit Filters
                </span>
                {hasActiveFilters && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-cyan-300">
                    {activeFilterCount} Active
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Date Range • Department • NC Status • Risk • Resolver • Auditor • Aging &amp; Recurrence
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                title="Reset all filters to default"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset All</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowFiltersExpanded((prev) => !prev)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title={showFiltersExpanded ? 'Collapse filters' : 'Expand filters'}
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform ${
                  showFiltersExpanded ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>
        </div>

        {/* Filter Input Grid */}
        {showFiltersExpanded && (
          <div className="p-4 sm:p-5 space-y-4">
            {/* ROW 1: Date Range Filters & Presets */}
            <div className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-slate-950/40 border border-slate-200/70 dark:border-slate-800/80 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                  <span>1. Date Range Filter</span>
                </span>

                {/* Quick Presets */}
                <div className="flex flex-wrap items-center gap-1 text-[11px]">
                  {[
                    { id: 'ALL', label: 'All Time' },
                    { id: 'TODAY', label: 'Today' },
                    { id: '7D', label: 'Last 7 Days' },
                    { id: '30D', label: 'Last 30 Days' },
                    { id: 'THIS_MONTH', label: 'This Month' },
                    { id: 'CUSTOM', label: 'Custom' },
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setDatePreset(preset.id);
                        if (preset.id !== 'CUSTOM') {
                          setStartDate('');
                          setEndDate('');
                        }
                      }}
                      className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                        datePreset === preset.id
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200/70 dark:border-slate-700/60'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Start & End Date Pickers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    From Logged Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setDatePreset('CUSTOM');
                    }}
                    className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 font-sans"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    To Logged Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setDatePreset('CUSTOM');
                    }}
                    className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 font-sans"
                  />
                </div>
              </div>
            </div>

            {/* ROW 2: Department, NC Status & Risk */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* 2. Department Wise Filter */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <Building2 className="w-3 h-3 text-indigo-500" />
                  <span>2. Department</span>
                </label>
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="ALL">All Departments ({totalNC})</option>
                  {departmentList.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept} ({departmentCounts[dept] || 0} NCs)
                    </option>
                  ))}
                </select>
              </div>

              {/* 3a. NC Lifecycle Status */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  <span>3a. NC Status</span>
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 cursor-pointer"
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

              {/* 3b. Risk / Severity Filter */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                  <span>3b. Risk / Severity</span>
                </label>
                <select
                  value={riskFilter}
                  onChange={(e) => setRiskFilter(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="ALL">All Risk Levels</option>
                  <option value="CRITICAL">🔥 CRITICAL (Shipment Risk / Line Stop)</option>
                  <option value="HIGH">⚠️ HIGH (AQL Failure Risk)</option>
                  <option value="MEDIUM">🔷 MEDIUM (Standard Rework)</option>
                  <option value="LOW">◽ LOW (Minor Observation)</option>
                </select>
              </div>
            </div>

            {/* ROW 3: Responsible Person, Auditor, Aging & Repeat NC */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* 4a. Responsible Person Filter */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <UserCheck className="w-3 h-3 text-indigo-500" />
                  <span>4a. Responsible Person</span>
                </label>
                <select
                  value={responsibleFilter}
                  onChange={(e) => setResponsibleFilter(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="ALL">All Responsible Resolvers</option>
                  {responsibleList.map((person) => (
                    <option key={person} value={person}>
                      {person}
                    </option>
                  ))}
                </select>
              </div>

              {/* 4b. Auditor Filter */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-purple-500" />
                  <span>4b. Auditor / Created By</span>
                </label>
                <select
                  value={auditorFilter}
                  onChange={(e) => setAuditorFilter(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="ALL">All Auditors</option>
                  {auditorList.map((auditor) => (
                    <option key={auditor} value={auditor}>
                      {auditor}
                    </option>
                  ))}
                </select>
              </div>

              {/* 5a. Ticket Aging Duration */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-blue-500" />
                  <span>5a. Ticket Aging</span>
                </label>
                <select
                  value={agingFilter}
                  onChange={(e) => setAgingFilter(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="ALL">All Aging Durations</option>
                  <option value="FRESH">Fresh (&lt; 24 Hours)</option>
                  <option value="MODERATE">Moderate Aging (1 – 3 Days)</option>
                  <option value="HIGH">High Aging (3 – 7 Days)</option>
                  <option value="SEVERE">🚨 Severe Aging (&gt; 7 Days)</option>
                </select>
              </div>

              {/* 5b. Repeat NC Recurrence Filter */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <Repeat className="w-3 h-3 text-purple-500" />
                  <span>5b. Defect Recurrence</span>
                </label>
                <select
                  value={repeatFilter}
                  onChange={(e) => setRepeatFilter(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="ALL">All Defect Types</option>
                  <option value="REPEAT">🔁 Repeat NCs Only (Freq ≥ 2)</option>
                  <option value="SINGLE">◽ First-Time / Single Defect</option>
                </select>
              </div>
            </div>

            {/* Active Filter Chips Strip */}
            {hasActiveFilters && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[11px] font-bold text-slate-400 mr-1">
                  Active Filter Criteria:
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

                {datePreset !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-cyan-300 border border-indigo-200 dark:border-indigo-800 text-[11px]">
                    <span>Date: {datePreset}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setDatePreset('ALL');
                        setStartDate('');
                        setEndDate('');
                      }}
                      className="hover:text-indigo-900 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {(startDate || endDate) && datePreset === 'CUSTOM' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-cyan-300 border border-indigo-200 dark:border-indigo-800 text-[11px]">
                    <span>
                      Range: {startDate || 'Start'} → {endDate || 'End'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setStartDate('');
                        setEndDate('');
                        setDatePreset('ALL');
                      }}
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

                {responsibleFilter !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-[11px]">
                    <span>Resolver: {responsibleFilter}</span>
                    <button
                      type="button"
                      onClick={() => setResponsibleFilter('ALL')}
                      className="hover:text-purple-900 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {auditorFilter !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[11px]">
                    <span>Auditor: {auditorFilter}</span>
                    <button
                      type="button"
                      onClick={() => setAuditorFilter('ALL')}
                      className="hover:text-indigo-900 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {agingFilter !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-50 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 text-[11px]">
                    <span>Aging: {agingFilter}</span>
                    <button
                      type="button"
                      onClick={() => setAgingFilter('ALL')}
                      className="hover:text-cyan-900 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {repeatFilter !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-[11px]">
                    <span>Recurrence: {repeatFilter}</span>
                    <button
                      type="button"
                      onClick={() => setRepeatFilter('ALL')}
                      className="hover:text-purple-900 cursor-pointer"
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

      {/* 5. INTERACTIVE A-TO-Z REPORT PREVIEW TABLE */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
        {/* Table Filter & Search Header */}
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
            {/* Search Input */}
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

        {/* Records Preview Table */}
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
                No tickets match your active combination of date range, department, risk, and status filters.
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
                        <div className="mt-1">
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            Aging: {getTicketAgeLabel(c)}
                          </span>
                        </div>
                      </td>

                      {/* 6. Status & Risk */}
                      <td className="py-3.5 px-4 align-top text-center whitespace-nowrap">
                        <div className="space-y-1">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase tracking-wider ${
                              c.status === 'Closed' || c.status === 'Verified'
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                                : isOverdue
                                ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 animate-pulse'
                                : c.status === 'CAP Submitted' ||
                                  c.status === 'Under Review' ||
                                  c.status === 'Under Verification'
                                ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-cyan-300 border border-indigo-300 dark:border-indigo-800'
                                : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                            }`}
                          >
                            {isOverdue ? 'Overdue SLA' : c.status || 'Open'}
                          </span>

                          <div>
                            <span
                              className={`inline-block px-2 py-0.2 rounded-md text-[9px] font-extrabold uppercase font-mono ${
                                cRisk === 'CRITICAL'
                                  ? 'bg-rose-600 text-white'
                                  : cRisk === 'HIGH'
                                  ? 'bg-amber-500 text-white'
                                  : cRisk === 'LOW'
                                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                                  : 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300'
                              }`}
                            >
                              {cRisk}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 7. Drill-Down Action Button */}
                      <td className="py-3.5 px-4 align-top text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setDrilldownComplaint(c)}
                          className="px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-cyan-400 font-bold text-[11px] border border-indigo-200 dark:border-indigo-800 transition-all cursor-pointer flex items-center gap-1 mx-auto"
                          title="Drill-down to view complete 4-stage audit lifecycle"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Drill-Down</span>
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

      {/* 6. COMPLETE AUDIT LIFECYCLE DRILL-DOWN MODAL */}
      {drilldownComplaint && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-xs animate-in fade-in"
          onClick={() => setDrilldownComplaint(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-3xl w-full max-h-[92vh] overflow-y-auto shadow-2xl p-5 sm:p-7 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-cyan-400 flex items-center justify-center font-bold">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-base text-indigo-600 dark:text-cyan-400">
                      {drilldownComplaint.complaintId || 'NC-N/A'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase ${
                        drilldownComplaint.status === 'Closed' ||
                        drilldownComplaint.status === 'Verified'
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300'
                          : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300'
                      }`}
                    >
                      {drilldownComplaint.status}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold font-mono bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      Risk: {drilldownComplaint.priority || drilldownComplaint.riskSeverity || 'MEDIUM'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {drilldownComplaint.department} • {drilldownComplaint.location || 'Floor Station'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDrilldownComplaint(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stage 1: Defect Finding Narrative */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Stage 1: Defect Finding &amp; Recurrence
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                  Occurred {getIssueFrequency(drilldownComplaint)} time(s) across plant
                </span>
              </div>
              <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-sans">
                {getFindingText(drilldownComplaint)}
              </p>
              <div className="pt-2 text-[11px] text-slate-500 flex flex-wrap items-center gap-3">
                <span>Auditor: {getAuditorName(drilldownComplaint)}</span>
                <span>•</span>
                <span>Category: {drilldownComplaint.category || 'General Defect'}</span>
                <span>•</span>
                <span>
                  Logged: {drilldownComplaint.createdAt ? new Date(drilldownComplaint.createdAt).toLocaleString() : 'N/A'}
                </span>
              </div>
            </div>

            {/* Stage 2: Assignment & SLA */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 block mb-1">
                  Stage 2: Assigned Resolver
                </span>
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  {getAssignedToName(drilldownComplaint)}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
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
                        className="w-full h-36 object-cover rounded-xl border border-slate-200 dark:border-slate-800"
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
                        className="w-full h-36 object-cover rounded-xl border border-slate-200 dark:border-slate-800"
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
