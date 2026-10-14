import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Safely loads an image (data URL, web URL, or base64) onto an offscreen canvas
 * to convert it to a standard, clean JPEG data URL with bounded dimensions.
 * This prevents jsPDF image parsing errors, unsupported formats, and bloated file sizes.
 */
export const getPdfImageSafe = async (src) => {
  if (!src || typeof src !== 'string' || !src.trim()) return null;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const maxDim = 600; // Optimal resolution for A4 printable PDF
        let w = img.naturalWidth || img.width || 400;
        let h = img.naturalHeight || img.height || 300;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = Math.max(w, 1);
        canvas.height = Math.max(h, 1);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve({ dataUrl, width: canvas.width, height: canvas.height });
      } catch (err) {
        if (src.startsWith('data:image/jpeg') || src.startsWith('data:image/png')) {
          resolve({ dataUrl: src, width: 400, height: 300 });
        } else {
          resolve(null);
        }
      }
    };
    img.onerror = () => {
      if (src.startsWith('data:image/jpeg') || src.startsWith('data:image/png')) {
        resolve({ dataUrl: src, width: 400, height: 300 });
      } else {
        resolve(null);
      }
    };
    img.src = src;
  });
};

// Text extractors for robust rendering
export const extractFinding = (c) => {
  if (!c) return 'General Quality Non-Conformance';
  const desc = c.description || c.title || '';
  if (desc && !desc.toLowerCase().includes('no defect description')) return desc;
  return c.category || 'General Quality Defect';
};

export const extractRootCause = (c) => {
  if (!c) return 'Pending Analysis';
  return (
    c.cap?.rootCause ||
    c.feedbackRemarks ||
    c.actionNotes ||
    'Root cause investigation pending floor analysis'
  );
};

export const extractImmediateCorrection = (c) => {
  if (!c) return 'Pending Floor Containment';
  return (
    c.cap?.immediateCorrection ||
    c.cap?.immediateContainment ||
    c.actionNotes ||
    'Immediate containment action pending floor response'
  );
};

export const extractCorrectiveAction = (c) => {
  if (!c) return 'Pending Corrective Plan';
  return (
    c.cap?.correctiveAction ||
    c.actionNotes ||
    'Permanent corrective action pending verification'
  );
};

export const extractPreventiveAction = (c) => {
  if (!c) return 'Pending Preventive Plan';
  return (
    c.cap?.preventiveAction ||
    'Preventive measure pending management review'
  );
};

export const extractResponsiblePerson = (c) => {
  if (!c) return 'Unassigned';
  if (c.assignedTo?.name && c.assignedTo.name !== 'Unassigned') return c.assignedTo.name;
  if (typeof c.cap?.responsiblePerson === 'object' && c.cap?.responsiblePerson?.name) {
    return c.cap.responsiblePerson.name;
  }
  if (typeof c.cap?.responsiblePerson === 'string' && c.cap.responsiblePerson.trim()) {
    return c.cap.responsiblePerson.trim();
  }
  return c.assignedTo?.name || 'Floor Supervisor';
};

export const extractAuditorName = (c) => {
  if (!c) return 'Quality Auditor';
  return c.createdBy?.name || c.auditorName || 'Lead QA Auditor';
};

export const extractRejectionReason = (c) => {
  if (!c) return '';
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
    return c.feedbackRemarks || 'Auditor rejected resolution and returned to line for rework.';
  }
  return '';
};

/**
 * Draws an NC record with side-by-side Before Photo and After Photo
 * and technical CAP details onto a jsPDF document.
 */
export const drawNCWithPhotos = async (doc, c, startY, pageWidth, margin, contentWidth, idx = null) => {
  const pageHeight = doc.internal.pageSize.getHeight();
  let currentY = startY;

  // Height required for photo block + details table
  const cardHeightNeeded = 225;
  if (currentY + cardHeightNeeded > pageHeight - margin) {
    doc.addPage();
    currentY = margin + 15;
  }

  // Pre-load images safely
  const beforeImg = await getPdfImageSafe(c.beforePhoto);
  const afterImg = await getPdfImageSafe(c.afterPhoto);

  const cRisk = (c.priority || c.riskSeverity || 'MEDIUM').toUpperCase();
  const ncId = c.complaintId || 'NC-RECORD';
  const headerTitle = idx !== null 
    ? `NC #${idx + 1}: ${ncId} • Department: ${c.department || 'General'} • Priority: ${cRisk}`
    : `${ncId} • Department: ${c.department || 'General'} • Priority: ${cRisk}`;

  // Header Bar
  doc.setFillColor(15, 23, 42); // slate-900
  doc.roundedRect(margin, currentY, contentWidth, 20, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text(headerTitle, margin + 8, currentY + 13);
  
  // Status Badge on right of Header Bar
  doc.setFontSize(8);
  doc.text(`Status: ${c.status || 'Open'}`, margin + contentWidth - 8, currentY + 13, { align: 'right' });
  currentY += 24;

  // Two columns for Photos
  const gap = 12;
  const colW = (contentWidth - gap) / 2;
  const photoH = 105;

  // 1. BEFORE PHOTO CARD (Rose / Red Theme)
  doc.setDrawColor(244, 63, 94); // rose-500
  doc.setFillColor(255, 241, 242); // rose-50
  doc.roundedRect(margin, currentY, colW, photoH + 18, 3, 3, 'FD');

  // Before Title Tab
  doc.setFillColor(225, 29, 72); // rose-600
  doc.rect(margin, currentY, colW, 14, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text('BEFORE RECTIFICATION: Initial Defect Evidence', margin + 6, currentY + 10);

  if (beforeImg) {
    try {
      doc.addImage(beforeImg.dataUrl, 'JPEG', margin + 2, currentY + 16, colW - 4, photoH);
    } catch (e) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(159, 18, 57);
      doc.text('Image preview unavailable', margin + colW / 2, currentY + 16 + photoH / 2, { align: 'center' });
    }
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(159, 18, 57);
    doc.text('No Before Defect Photo Attached', margin + colW / 2, currentY + 16 + photoH / 2, { align: 'center' });
  }

  // 2. AFTER PHOTO CARD (Emerald / Green Theme)
  const afterX = margin + colW + gap;
  doc.setDrawColor(16, 185, 129); // emerald-500
  doc.setFillColor(236, 253, 245); // emerald-50
  doc.roundedRect(afterX, currentY, colW, photoH + 18, 3, 3, 'FD');

  // After Title Tab
  doc.setFillColor(5, 150, 105); // emerald-600
  doc.rect(afterX, currentY, colW, 14, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text('AFTER RECTIFICATION: CAP Verified Proof', afterX + 6, currentY + 10);

  if (afterImg) {
    try {
      doc.addImage(afterImg.dataUrl, 'JPEG', afterX + 2, currentY + 16, colW - 4, photoH);
    } catch (e) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(6, 95, 70);
      doc.text('Image preview unavailable', afterX + colW / 2, currentY + 16 + photoH / 2, { align: 'center' });
    }
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(180, 83, 9);
    const pendingMsg = ['Closed', 'Verified'].includes(c.status)
      ? 'Verification Closed (No Photo Required)'
      : 'Pending CAP Floor Rectification Photo Proof';
    doc.text(pendingMsg, afterX + colW / 2, currentY + 16 + photoH / 2, { align: 'center' });
  }

  currentY += photoH + 22;

  // Metadata & Action Details below photos
  const findingText = extractFinding(c);
  const rootCauseText = extractRootCause(c);
  const corrActionText = extractCorrectiveAction(c);
  const prevActionText = extractPreventiveAction(c);
  const assignedName = extractResponsiblePerson(c);
  const auditorName = extractAuditorName(c);
  const rejReasonText = extractRejectionReason(c);

  const detailRows = [
    ['Defect Finding:', findingText],
    ...(rejReasonText ? [['Rejection Directive:', `[AUDITOR REJECT / REWORK] ${rejReasonText}`]] : []),
    ['Root Cause (5-Why):', rootCauseText],
    ['Corrective Action:', corrActionText],
    ['Preventive Action:', prevActionText],
    ['Accountability:', `Assigned To: ${assignedName}   |   Auditor: ${auditorName}   |   Location: ${c.location || 'Line Floor'}`],
  ];

  autoTable(doc, {
    startY: currentY,
    body: detailRows,
    theme: 'plain',
    styles: {
      fontSize: 6.8,
      cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 },
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: [51, 65, 85], cellWidth: 95 },
      1: { textColor: [15, 23, 42], cellWidth: contentWidth - 95 },
    },
  });

  currentY = doc.lastAutoTable.finalY + 14;
  return currentY;
};

/**
 * Generates an executive single-NC report PDF with Before and After photo evidence.
 */
export const generateSingleNCPdf = async (complaint, generatedBy = 'Quality Directorate') => {
  if (!complaint) return;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 36;
  const contentWidth = pageWidth - margin * 2;

  // Top Ribbon
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageWidth, 48, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text('GARMENT QUALITY MANAGEMENT SYSTEM (QMS)', margin, 28);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('Individual Non-Conformance Audit Dossier', pageWidth - margin, 28, { align: 'right' });

  // Title
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(`NC Audit Certificate: ${complaint.complaintId || 'NC-RECORD'}`, margin, 78);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Generated By: ${generatedBy}   |   Date: ${new Date().toLocaleString()}   |   Status: ${complaint.status}`,
    margin,
    94
  );

  let currentY = 112;
  await drawNCWithPhotos(doc, complaint, currentY, pageWidth, margin, contentWidth, null);

  doc.save(`Garment_QMS_NC_${complaint.complaintId || 'Report'}_${new Date().toISOString().slice(0, 10)}.pdf`);
};
