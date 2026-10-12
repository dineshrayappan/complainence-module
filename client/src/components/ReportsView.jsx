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
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '../context/AuthContext';

export const ReportsView = ({ complaints = [], departmentData = null }) => {
  const { user } = useAuth();
  const [downloadingCSV, setDownloadingCSV] = useState(false);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Compute key summary metrics for reports
  const totalNC = complaints.length;
  const openCount = complaints.filter(
    (c) => c.status === 'Open' || c.status === 'Assigned' || c.status === 'In Progress'
  ).length;
  const underReviewCount = complaints.filter(
    (c) => c.status === 'CAP Submitted' || c.status === 'Under Review' || c.status === 'Under Verification'
  ).length;
  const closedCount = complaints.filter((c) => c.status === 'Closed' || c.status === 'Verified').length;
  const overdueCount = complaints.filter((c) => {
    if (c.status === 'Closed' || c.status === 'Verified') return false;
    return c.deadlineTimestamp && Date.now() > new Date(c.deadlineTimestamp).getTime();
  }).length;
  const slaRate = totalNC > 0 ? Math.round(((totalNC - overdueCount) / totalNC) * 100) : null;

  // Filter complaints for on-screen preview
  const filteredComplaints = useMemo(() => {
    return complaints.filter((c) => {
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'OPEN' && ['Open', 'Assigned', 'In Progress'].includes(c.status)) ||
        (statusFilter === 'REVIEW' && ['CAP Submitted', 'Under Review', 'Under Verification'].includes(c.status)) ||
        (statusFilter === 'CLOSED' && ['Closed', 'Verified'].includes(c.status)) ||
        (statusFilter === 'OVERDUE' && c.status !== 'Closed' && c.deadlineTimestamp && Date.now() > new Date(c.deadlineTimestamp).getTime());

      const term = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !term ||
        (c.complaintId || '').toLowerCase().includes(term) ||
        (c.department || '').toLowerCase().includes(term) ||
        (c.location || '').toLowerCase().includes(term) ||
        (c.describeFinding || c.findingDescription || c.description || c.title || '').toLowerCase().includes(term) ||
        (c.assignedTo?.name || '').toLowerCase().includes(term) ||
        (c.cap?.rootCause || '').toLowerCase().includes(term);

      return matchesStatus && matchesSearch;
    });
  }, [complaints, statusFilter, searchTerm]);

  // Helper to extract clean text safely
  const getFindingText = (c) => {
    return c.describeFinding || c.findingDescription || c.description || c.title || 'No defect description logged.';
  };

  const getImmediateCorrectionText = (c) => {
    return c.cap?.immediateCorrection || c.actionNotes || 'Pending immediate containment action from supervisor.';
  };

  const getRootCauseText = (c) => {
    return c.cap?.rootCause || c.feedbackRemarks || 'Pending 5-Why root cause analysis from supervisor.';
  };

  const getCorrectiveActionText = (c) => {
    return c.cap?.correctiveAction || c.actionNotes || 'Pending corrective action execution.';
  };

  const getPreventiveActionText = (c) => {
    return c.cap?.preventiveAction || 'Pending systemic recurrence prevention procedure.';
  };

  const getResponsiblePerson = (c) => {
    if (typeof c.cap?.responsiblePerson === 'object' && c.cap?.responsiblePerson?.name) {
      return c.cap.responsiblePerson.name;
    }
    return c.cap?.responsiblePerson || c.assignedTo?.name || 'Assigned Line In-Charge';
  };

  const getCapTargetDate = (c) => {
    if (c.cap?.targetDate) return new Date(c.cap.targetDate).toLocaleDateString();
    if (c.deadlineTimestamp) return new Date(c.deadlineTimestamp).toLocaleDateString();
    return 'Not Specified';
  };

  // =========================================================================
  // 1. COMPLETE A-TO-Z PDF AUDIT REPORT DOWNLOAD HANDLER
  // =========================================================================
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

      // -----------------------------------------------------------------------
      // PAGE 1: EXECUTIVE COVER & QUALITY COMPLIANCE SUMMARY
      // -----------------------------------------------------------------------
      // Header Ribbon
      doc.setFillColor(...brandPrimary);
      doc.rect(0, 0, pageWidth, 50, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.text('GARMENT QUALITY MANAGEMENT SYSTEM (QMS)', margin, 28);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(
        'Plant Unit #4 • ISO 9001:2015 & Buyer Compliance Register',
        pageWidth - margin,
        28,
        { align: 'right' }
      );

      // Report Main Title
      doc.setTextColor(...brandDark);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('Complete A-to-Z Non-Conformance (NC) & CAP Audit Report', margin, 80);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...brandMuted);
      const generatedDate = new Date().toLocaleString();
      const genUser = user
        ? `${user.name} (${user.employeeId || 'N/A'}) • ${user.department || 'Quality Department'}`
        : 'System Administrator';
      doc.text(`Generated By: ${genUser}   |   Execution Date: ${generatedDate}`, margin, 96);
      doc.text(
        `Scope: All Plant Lines • Defect Logging to Corrective & Preventive Action (CAP) Verification Closure`,
        margin,
        109
      );

      // Executive Metrics Scorecard Banner
      doc.setFillColor(...bgLight);
      doc.setDrawColor(...borderLine);
      doc.roundedRect(margin, 122, contentWidth, 48, 6, 6, 'FD');

      const kpiColWidth = contentWidth / 6;
      const kpis = [
        { label: 'Total NCs Logged', val: String(totalNC), col: brandDark },
        { label: 'Open / In Progress', val: String(openCount), col: [217, 119, 6] },
        { label: 'Under Review', val: String(underReviewCount), col: [79, 70, 229] },
        { label: 'Overdue SLA', val: String(overdueCount), col: [225, 29, 72] },
        { label: 'Verified & Closed', val: String(closedCount), col: [16, 185, 129] },
        { label: 'SLA Adherence Rate', val: slaRate !== null ? `${slaRate}%` : '—', col: [37, 99, 235] },
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
        ['NC ID', 'Line / Location', 'Department', 'Severity', 'Assigned In-Charge', 'Target SLA', 'CAP Status', 'Final Status'],
      ];

      const summaryTableRows = complaints.map((c) => {
        const isOverdue =
          c.status !== 'Closed' &&
          c.status !== 'Verified' &&
          c.deadlineTimestamp &&
          Date.now() > new Date(c.deadlineTimestamp).getTime();

        return [
          c.complaintId || 'NC-N/A',
          (c.location || 'Line Floor').slice(0, 18),
          c.department || 'N/A',
          c.priority || c.riskSeverity || 'Medium',
          (c.assignedTo?.name || 'Unassigned').slice(0, 16),
          c.deadlineTimestamp ? new Date(c.deadlineTimestamp).toLocaleDateString() : 'N/A',
          c.cap?.status || (c.capRequired ? 'Required' : 'Direct Fix'),
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
          fontSize: 7.5,
          fontStyle: 'bold',
          halign: 'left',
        },
        styles: {
          fontSize: 7.5,
          cellPadding: 4,
          overflow: 'linebreak',
        },
        columnStyles: {
          0: { cellWidth: 65, fontStyle: 'bold' },
          1: { cellWidth: 75 },
          2: { cellWidth: 65 },
          3: { cellWidth: 50 },
          4: { cellWidth: 80 },
          5: { cellWidth: 60 },
          6: { cellWidth: 65 },
          7: { cellWidth: 60, fontStyle: 'bold' },
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
      });

      // -----------------------------------------------------------------------
      // SECTION 2: COMPLETE A-TO-Z DETAILED DOSSIER FOR EVERY NC & CAP
      // -----------------------------------------------------------------------
      doc.addPage();
      let currentY = 50;

      // Section Header Banner
      doc.setFillColor(...brandPrimary);
      doc.rect(0, 0, pageWidth, 40, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(255, 255, 255);
      doc.text('2. Comprehensive A-to-Z Non-Conformance & CAP Dossier', margin, 24);

      complaints.forEach((c, index) => {
        // Check if we need a new page for the next record
        if (currentY + 230 > pageHeight - 40) {
          doc.addPage();
          currentY = 40;
        }

        const isOverdue =
          c.status !== 'Closed' &&
          c.status !== 'Verified' &&
          c.deadlineTimestamp &&
          Date.now() > new Date(c.deadlineTimestamp).getTime();

        const createdDateStr = c.createdAt ? new Date(c.createdAt).toLocaleString() : 'N/A';
        const deadlineDateStr = c.deadlineTimestamp ? new Date(c.deadlineTimestamp).toLocaleString() : 'N/A';
        const closedDateStr = c.actualCompletedAt ? new Date(c.actualCompletedAt).toLocaleString() : 'Pending Closure';

        // Record Title Bar
        doc.setFillColor(241, 245, 249); // slate-100
        doc.setDrawColor(...borderLine);
        doc.roundedRect(margin, currentY, contentWidth, 22, 4, 4, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(...brandDark);
        doc.text(
          `Record #${index + 1}:  ${c.complaintId || 'NC-N/A'}  —  ${c.department || 'General'} (${c.location || 'Floor'})`,
          margin + 8,
          currentY + 14
        );

        // Status Badge text on right
        doc.setFontSize(8.5);
        if (c.status === 'Closed' || c.status === 'Verified') {
          doc.setTextColor(16, 185, 129);
          doc.text(`[CLOSED & VERIFIED EFFECTIVE]`, pageWidth - margin - 8, currentY + 14, { align: 'right' });
        } else if (isOverdue) {
          doc.setTextColor(225, 29, 72);
          doc.text(`[STATUS: OVERDUE SLA BREACH]`, pageWidth - margin - 8, currentY + 14, { align: 'right' });
        } else {
          doc.setTextColor(37, 99, 235);
          doc.text(`[STATUS: ${(c.status || 'OPEN').toUpperCase()}]`, pageWidth - margin - 8, currentY + 14, { align: 'right' });
        }

        // Structured Table for A-to-Z Lifecycle
        const recordDetails = [
          [
            { content: 'STAGE 1: NC CREATION & DEFECT FINDING', colSpan: 2, styles: { fillColor: [248, 250, 252], fontStyle: 'bold', textColor: [71, 85, 105] } },
          ],
          [
            { content: 'Logged Date & Time:', styles: { fontStyle: 'bold', cellWidth: 140 } },
            { content: `${createdDateStr}  (Logged By: ${c.createdBy?.name || 'Auditor'} • ${c.createdBy?.role || 'AUDITOR'} • ID: ${c.createdBy?.employeeId || 'N/A'})` },
          ],
          [
            { content: 'Audit Standard Breached:', styles: { fontStyle: 'bold' } },
            { content: `${c.requirement || 'AQL 1.5 Workmanship Standard'}  |  Category: ${c.category || 'Quality'}  |  Severity: ${c.priority || c.riskSeverity || 'High'}` },
          ],
          [
            { content: 'Defect Finding & Description:', styles: { fontStyle: 'bold' } },
            { content: getFindingText(c) },
          ],
          [
            { content: 'Verification Method / Evidence:', styles: { fontStyle: 'bold' } },
            { content: `Method: ${c.verificationMethod || 'Physical Floor Re-inspection'}  |  Before Photo Evidence: ${c.beforePhoto ? 'Attached (Recorded on File)' : 'None'}` },
          ],
          [
            { content: 'STAGE 2: ASSIGNMENT & SLA GOVERNANCE', colSpan: 2, styles: { fillColor: [248, 250, 252], fontStyle: 'bold', textColor: [71, 85, 105] } },
          ],
          [
            { content: 'Assigned Line In-Charge:', styles: { fontStyle: 'bold' } },
            { content: `${c.assignedTo?.name || 'Unassigned'}  (ID: ${c.assignedTo?.employeeId || 'N/A'} • ${c.assignedTo?.designation || 'Supervisor'} • Phone: ${c.assignedTo?.mobileNumber || 'N/A'})` },
          ],
          [
            { content: 'SLA Duration & Target Deadline:', styles: { fontStyle: 'bold' } },
            { content: `Target Duration: ${c.deadlineHours || 24} Hours  |  Target Due Date: ${deadlineDateStr}  |  SLA Condition: ${isOverdue ? 'Overdue Breach' : 'Within SLA Window'}` },
          ],
          [
            { content: 'STAGE 3: CORRECTIVE ACTION PLAN (CAP) SUBMISSION', colSpan: 2, styles: { fillColor: [248, 250, 252], fontStyle: 'bold', textColor: [71, 85, 105] } },
          ],
          [
            { content: '1. Immediate Containment Action:', styles: { fontStyle: 'bold' } },
            { content: getImmediateCorrectionText(c) },
          ],
          [
            { content: '2. Root Cause Analysis (5-Why):', styles: { fontStyle: 'bold' } },
            { content: getRootCauseText(c) },
          ],
          [
            { content: '3. Corrective Action (Permanent Fix):', styles: { fontStyle: 'bold' } },
            { content: getCorrectiveActionText(c) },
          ],
          [
            { content: '4. Preventive Action (Systemic):', styles: { fontStyle: 'bold' } },
            { content: getPreventiveActionText(c) },
          ],
          [
            { content: 'CAP Governance & After Proof:', styles: { fontStyle: 'bold' } },
            { content: `Responsible: ${getResponsiblePerson(c)}  |  Target Date: ${getCapTargetDate(c)}  |  After Photo Proof: ${c.afterPhoto ? 'Verified & Uploaded' : 'Pending Floor Proof'}` },
          ],
          [
            { content: 'STAGE 4: AUDITOR VERIFICATION & FINAL CLOSURE', colSpan: 2, styles: { fillColor: [248, 250, 252], fontStyle: 'bold', textColor: [71, 85, 105] } },
          ],
          [
            { content: 'Verification Outcome & Closure:', styles: { fontStyle: 'bold' } },
            { content: `Review Status: ${c.cap?.status || (c.status === 'Closed' ? 'VERIFIED_EFFECTIVE' : 'IN_PROGRESS')}  |  Approved Closure Date: ${closedDateStr}` },
          ],
        ];

        autoTable(doc, {
          body: recordDetails,
          startY: currentY + 24,
          margin: { left: margin, right: margin, bottom: 36 },
          theme: 'grid',
          styles: {
            fontSize: 7.5,
            cellPadding: 3.5,
            overflow: 'linebreak',
            lineColor: borderLine,
            lineWidth: 0.5,
          },
          columnStyles: {
            0: { cellWidth: 145, fontStyle: 'bold', textColor: [30, 41, 59] },
            1: { cellWidth: contentWidth - 145, textColor: [15, 23, 42] },
          },
        });

        currentY = doc.lastAutoTable.finalY + 16;
      });

      // Page Numbering Footer on all pages
      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...brandMuted);
        doc.text(
          `Page ${i} of ${totalPages}   •   Garment QMS Confidential Quality Audit Record   •   Complete A-to-Z NC & CAP Lifecycle Dossier`,
          pageWidth / 2,
          pageHeight - 16,
          { align: 'center' }
        );
      }

      const filename = `Garment_A_to_Z_NC_and_CAP_Audit_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error('Failed to export A-to-Z PDF report:', err);
    } finally {
      setTimeout(() => setDownloadingPDF(false), 600);
    }
  };

  // =========================================================================
  // 2. COMPLETE A-TO-Z CSV REPORT DOWNLOAD HANDLER
  // =========================================================================
  const handleExportCSV = () => {
    setDownloadingCSV(true);
    try {
      const headers = [
        'NC Number',
        'Current Status',
        'Severity / Priority',
        'Department',
        'Line / Shopfloor Location',
        'Defect Category',
        'Audit Standard / Requirement',
        'Verification Method Required',
        'NC Logged Date & Time',
        'Auditor Name (Created By)',
        'Auditor Employee ID',
        'Auditor Role',
        'Defect Finding & Description',
        'Before Photo Evidence Status',
        'Assigned Line In-Charge (Supervisor)',
        'Assigned Supervisor Employee ID',
        'Assigned Supervisor Designation',
        'Assigned Supervisor Mobile Contact',
        'SLA Target Duration (Hours)',
        'Target SLA Deadline Date & Time',
        'SLA Condition Status',
        'CAP Requirement',
        'CAP Lifecycle Status',
        'Immediate Correction (Containment Action)',
        'Root Cause Analysis (5-Why / 6M)',
        'Corrective Action (Permanent Fix)',
        'Preventive Action (Systemic Recurrence Prevention)',
        'CAP Responsible Person',
        'CAP Target Completion Date',
        'After Proof Photo Evidence Status',
        'Verification Readiness Notes',
        'Approved Closure Date & Time',
        'Auditor Rejection Reason (If Any)',
      ];

      const rows = complaints.map((c) => {
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
          `"${(c.requirement || '').replace(/"/g, '""')}"`,
          `"${(c.verificationMethod || '').replace(/"/g, '""')}"`,
          `"${c.createdAt ? new Date(c.createdAt).toLocaleString() : ''}"`,
          `"${(c.createdBy?.name || '').replace(/"/g, '""')}"`,
          `"${c.createdBy?.employeeId || ''}"`,
          `"${c.createdBy?.role || ''}"`,
          `"${getFindingText(c).replace(/"/g, '""')}"`,
          `"${c.beforePhoto ? 'Yes (Photo Captured)' : 'No Photo'}"`,
          `"${(c.assignedTo?.name || '').replace(/"/g, '""')}"`,
          `"${c.assignedTo?.employeeId || ''}"`,
          `"${(c.assignedTo?.designation || '').replace(/"/g, '""')}"`,
          `"${c.assignedTo?.mobileNumber || ''}"`,
          `"${c.deadlineHours || 24}"`,
          `"${c.deadlineTimestamp ? new Date(c.deadlineTimestamp).toLocaleString() : ''}"`,
          `"${isOverdue ? 'Overdue Breach' : c.deadlineCondition || 'Within SLA'}"`,
          `"${c.capRequired ? 'Mandatory CAP' : 'Direct Correction'}"`,
          `"${c.cap?.status || (c.status === 'Closed' ? 'VERIFIED_EFFECTIVE' : 'IN_PROGRESS')}"`,
          `"${getImmediateCorrectionText(c).replace(/"/g, '""')}"`,
          `"${getRootCauseText(c).replace(/"/g, '""')}"`,
          `"${getCorrectiveActionText(c).replace(/"/g, '""')}"`,
          `"${getPreventiveActionText(c).replace(/"/g, '""')}"`,
          `"${getResponsiblePerson(c).replace(/"/g, '""')}"`,
          `"${getCapTargetDate(c)}"`,
          `"${c.afterPhoto ? 'Yes (Proof Uploaded)' : 'Pending After Proof'}"`,
          `"${(c.cap?.verificationReadinessNotes || '').replace(/"/g, '""')}"`,
          `"${c.actualCompletedAt ? new Date(c.actualCompletedAt).toLocaleString() : 'Pending Closure'}"`,
          `"${(c.rejectionReason || 'None').replace(/"/g, '""')}"`,
        ];
      });

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute(
        'download',
        `Garment_A_to_Z_NC_and_CAP_Audit_Report_${new Date().toISOString().slice(0, 10)}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export A-to-Z CSV report:', err);
    } finally {
      setTimeout(() => setDownloadingCSV(false), 600);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-cyan-400">
              <BarChart3 className="w-5 h-5" />
            </span>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              Complete A to Z Non-Conformance &amp; CAP Audit Reports
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
            Download comprehensive, fully-detailed reports of all NCs created so far and their corresponding Corrective Action Plan (CAP) submissions — from initial defect creation to floor containment, root cause analysis, corrective/preventive actions, and auditor verification closure.
          </p>
        </div>

        {/* Direct Download Action Buttons */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            id="btn-download-pdf-top"
            onClick={handleExportPDF}
            disabled={downloadingPDF}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-600/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            title="Download Complete A-to-Z PDF Audit Dossier"
          >
            <FileText className="w-4 h-4" />
            <span>{downloadingPDF ? 'Compiling PDF Dossier...' : 'Download A-to-Z PDF Report'}</span>
          </button>

          <button
            type="button"
            id="btn-download-csv-top"
            onClick={handleExportCSV}
            disabled={downloadingCSV}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            title="Download Complete A-to-Z CSV Master Register"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{downloadingCSV ? 'Exporting Master CSV...' : 'Download A-to-Z CSV Register'}</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Total NCs Logged</div>
          <div className="text-xl font-black text-slate-900 dark:text-white font-mono">{totalNC}</div>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Open / In Progress</div>
          <div className="text-xl font-black text-amber-600 dark:text-amber-400 font-mono">{openCount}</div>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Under CAP Review</div>
          <div className="text-xl font-black text-indigo-600 dark:text-cyan-400 font-mono">{underReviewCount}</div>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Overdue SLA Breaches</div>
          <div className="text-xl font-black text-rose-600 dark:text-rose-400 font-mono">{overdueCount}</div>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Verified &amp; Closed</div>
          <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono">{closedCount}</div>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">SLA Compliance Rate</div>
          <div className="text-xl font-black text-blue-600 dark:text-blue-400 font-mono">{slaRate !== null ? `${slaRate}%` : '—'}</div>
        </div>
      </div>

      {/* Available Download Formats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* PDF Card */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:border-rose-300 dark:hover:border-rose-800 transition-all">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="w-11 h-11 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shadow-xs">
                <FileText className="w-5 h-5" />
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                PDF Full Dossier (.pdf)
              </span>
            </div>

            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Complete A-to-Z Non-Conformance &amp; CAP Audit Dossier (PDF)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              Standardized corporate audit document containing the Master Non-Conformance Index plus a comprehensive 4-stage lifecycle breakdown for every non-conformance:
            </p>

            <ul className="mt-3 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>Stage 1:</strong> NC Number, Auditor, Line Location, Requirement Standard &amp; Full Finding Description.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>Stage 2:</strong> Assigned Supervisor, Designation, Contact Number &amp; SLA Target Timeline.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>Stage 3:</strong> Containment Correction, 5-Why Root Cause, Permanent Corrective Action, Preventive Action &amp; Proof.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>Stage 4:</strong> Auditor Verification Method, Review Outcome &amp; Approved Final Closure Timestamp.</span>
              </li>
            </ul>
          </div>

          <button
            type="button"
            id="btn-download-pdf-card"
            onClick={handleExportPDF}
            disabled={downloadingPDF}
            className="mt-6 w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-rose-600/20 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>{downloadingPDF ? 'Compiling PDF Dossier...' : 'Download Complete A-to-Z PDF Report (.pdf)'}</span>
          </button>
        </div>

        {/* CSV Card */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:border-emerald-300 dark:hover:border-emerald-800 transition-all">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-xs">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                CSV Master Register (.csv)
              </span>
            </div>

            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Complete A-to-Z Defect &amp; CAP Master Spreadsheet (CSV)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              Exhaustive 33-column tabular dataset formatted for Microsoft Excel, Google Sheets, and Business Intelligence analysis:
            </p>

            <ul className="mt-3 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>Every NC Attribute:</strong> Identification, Department, Line Floor, Standard Breached, Auditor Name &amp; Role.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>Complete 4-Part CAP:</strong> Containment Action, 5-Why Root Cause, Corrective Action, Preventive Action.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>Full Accountability:</strong> Assigned Supervisor, Employee ID, Mobile Contact, Responsible Person &amp; Target Date.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>Verification Audit Trail:</strong> Verification method, photo proof flags, closure timestamps &amp; rejection remarks.</span>
              </li>
            </ul>
          </div>

          <button
            type="button"
            id="btn-download-csv-card"
            onClick={handleExportCSV}
            disabled={downloadingCSV}
            className="mt-6 w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>{downloadingCSV ? 'Exporting Master CSV...' : 'Download Complete A-to-Z CSV Register (.csv)'}</span>
          </button>
        </div>
      </div>

      {/* On-Screen A-to-Z Report Preview & Interactive Explorer */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
        {/* Table Filter & Search Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Interactive A-to-Z Record Preview</span>
              <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                {filteredComplaints.length} of {complaints.length} Records
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Review how your non-conformances and CAP submissions appear before exporting.
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

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-hidden"
            >
              <option value="ALL">All Statuses ({complaints.length})</option>
              <option value="OPEN">Open / In Progress ({openCount})</option>
              <option value="REVIEW">Under Review ({underReviewCount})</option>
              <option value="CLOSED">Verified &amp; Closed ({closedCount})</option>
              <option value="OVERDUE">Overdue SLA ({overdueCount})</option>
            </select>
          </div>
        </div>

        {/* Records Preview Table */}
        <div className="overflow-x-auto">
          {filteredComplaints.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              No matching records found. Try adjusting your search or filters.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-[11px] font-bold text-slate-600 dark:text-slate-400">
                  <th className="py-3 px-4">NC ID &amp; Location</th>
                  <th className="py-3 px-4">Requirement &amp; Finding</th>
                  <th className="py-3 px-4">Line In-Charge</th>
                  <th className="py-3 px-4">CAP Submission (Root Cause &amp; Fix)</th>
                  <th className="py-3 px-4">Timeline &amp; SLA</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredComplaints.map((c) => {
                  const isOverdue =
                    c.status !== 'Closed' &&
                    c.status !== 'Verified' &&
                    c.deadlineTimestamp &&
                    Date.now() > new Date(c.deadlineTimestamp).getTime();

                  return (
                    <tr key={c._id || c.id || c.complaintId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="py-3.5 px-4 align-top">
                        <div className="font-mono font-bold text-indigo-600 dark:text-cyan-400">
                          {c.complaintId || 'NC-N/A'}
                        </div>
                        <div className="text-[11px] font-semibold text-slate-900 dark:text-white mt-0.5">
                          {c.department}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {c.location || 'Floor'}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 align-top max-w-xs">
                        <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                          {c.requirement || 'Standard Workmanship'}
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">
                          {getFindingText(c)}
                        </p>
                        <div className="text-[10px] text-slate-400 mt-1">
                          Auditor: {c.createdBy?.name || 'Quality Team'} ({c.createdBy?.role || 'AUDITOR'})
                        </div>
                      </td>

                      <td className="py-3.5 px-4 align-top whitespace-nowrap">
                        <div className="font-bold text-slate-900 dark:text-slate-200">
                          {c.assignedTo?.name || 'Unassigned'}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          {c.assignedTo?.designation || 'Supervisor'}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {c.assignedTo?.mobileNumber || c.assignedTo?.employeeId || ''}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 align-top max-w-sm">
                        <div className="text-[11px]">
                          <span className="font-bold text-amber-700 dark:text-amber-400">Root Cause: </span>
                          <span className="text-slate-600 dark:text-slate-300 line-clamp-1">
                            {c.cap?.rootCause || c.feedbackRemarks || 'Pending 5-Why analysis'}
                          </span>
                        </div>
                        <div className="text-[11px] mt-1">
                          <span className="font-bold text-blue-700 dark:text-cyan-400">Fix: </span>
                          <span className="text-slate-600 dark:text-slate-300 line-clamp-1">
                            {c.cap?.correctiveAction || c.actionNotes || 'Pending corrective action'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-2">
                          <span>Proof: {c.afterPhoto ? 'Uploaded' : 'Pending'}</span>
                          <span>•</span>
                          <span>Resp: {getResponsiblePerson(c)}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 align-top whitespace-nowrap text-[11px]">
                        <div className="text-slate-500">
                          Logged: {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'N/A'}
                        </div>
                        <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                          Target: {c.deadlineTimestamp ? new Date(c.deadlineTimestamp).toLocaleDateString() : 'N/A'}
                        </div>
                        {c.actualCompletedAt && (
                          <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                            Closed: {new Date(c.actualCompletedAt).toLocaleDateString()}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 align-top text-center whitespace-nowrap">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold font-mono uppercase tracking-wider ${
                          c.status === 'Closed' || c.status === 'Verified'
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                            : isOverdue
                            ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 animate-pulse'
                            : c.status === 'CAP Submitted' || c.status === 'Under Review' || c.status === 'Under Verification'
                            ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-cyan-300 border border-indigo-300 dark:border-indigo-800'
                            : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                        }`}>
                          {isOverdue ? 'Overdue SLA' : c.status || 'Open'}
                        </span>
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
  );
};

export default ReportsView;
