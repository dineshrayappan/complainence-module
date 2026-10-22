import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Normalizes any image source string into an array of candidate URLs or data URLs.
 * Handles data URLs, raw base64 strings, relative paths (/uploads/...), backend endpoints, and cloud storage URLs.
 */
export const getCandidateUrls = (rawSrc) => {
  if (!rawSrc) return [];
  let src = rawSrc;
  if (typeof rawSrc === 'object' && rawSrc !== null) {
    src = rawSrc.url || rawSrc.dataUrl || rawSrc.path || rawSrc.src || '';
  }
  if (typeof src !== 'string') return [];
  let trimmed = src.trim();
  if (!trimmed) return [];

  // Normalize Windows filesystem backslashes to standard URL forward slashes
  trimmed = trimmed.replace(/\\/g, '/');

  // 1. Data URLs and Blob URLs (already self-contained)
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return [trimmed];
  }

  // 2. Base64 strings missing the "data:image/..." prefix (heuristic by magic bytes or length)
  if (trimmed.startsWith('/9j/')) return [`data:image/jpeg;base64,${trimmed}`];
  if (trimmed.startsWith('iVBORw0KGgo')) return [`data:image/png;base64,${trimmed}`];
  if (trimmed.startsWith('UklGR')) return [`data:image/webp;base64,${trimmed}`];
  if (trimmed.startsWith('PHN2Zy') || trimmed.startsWith('PD94bWw')) return [`data:image/svg+xml;base64,${trimmed}`];
  if (!trimmed.includes('/') && !trimmed.includes(':') && trimmed.length > 100) {
    return [`data:image/jpeg;base64,${trimmed}`];
  }

  // 3. Absolute HTTP/HTTPS URLs (Cloudinary, AWS S3, GCS, localhost or external backend)
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const candidates = [trimmed];
    try {
      const parsedUrl = new URL(trimmed);
      if (parsedUrl.pathname && parsedUrl.pathname.includes('/uploads/')) {
        const uploadIdx = parsedUrl.pathname.indexOf('/uploads/');
        const relativeUpload = parsedUrl.pathname.slice(uploadIdx);
        if (!candidates.includes(relativeUpload)) candidates.push(relativeUpload);
        if (typeof window !== 'undefined' && window.location?.origin) {
          const locOrigin = `${window.location.origin}${relativeUpload}`;
          if (!candidates.includes(locOrigin)) candidates.push(locOrigin);
        }
        const port5000 = `http://localhost:5000${relativeUpload}`;
        if (!candidates.includes(port5000)) candidates.push(port5000);
      }
    } catch (e) {
      // Ignore URL parse error
    }
    return candidates;
  }

  // 4. Relative paths (e.g. /uploads/defect.jpg or uploads/defect.jpg)
  const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const candidates = [];

  // Candidate A: Direct relative path (works with Vite reverse proxy in development and same-origin in production)
  candidates.push(normalizedPath);

  // Candidate B: Direct backend server URL (standard default port 5000)
  candidates.push(`http://localhost:5000${normalizedPath}`);

  // Candidate C: Base URL from Vite environment variable if configured
  try {
    const envApi = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL;
    if (envApi && (envApi.startsWith('http://') || envApi.startsWith('https://'))) {
      const origin = new URL(envApi).origin;
      const full = `${origin}${normalizedPath}`;
      if (!candidates.includes(full)) candidates.push(full);
    }
  } catch (e) {
    // Ignore URL parse error
  }

  // Candidate D: Browser window origin
  if (typeof window !== 'undefined' && window.location?.origin) {
    const locOrigin = `${window.location.origin}${normalizedPath}`;
    if (!candidates.includes(locOrigin)) candidates.push(locOrigin);
  }

  return candidates;
};

/**
 * Converts an HTMLImageElement to a clean, bounded baseline JPEG data URL using an offscreen canvas.
 * - Scales down oversized camera images (max 800px on the longest dimension) to preserve sharp print clarity
 *   without bloating PDF file sizes.
 * - Fills a solid white background to eliminate transparency artifacts from PNG/SVG images.
 * - Standardizes formats (e.g. WebP/PNG/SVG -> JPEG) to guarantee full compatibility with jsPDF doc.addImage.
 */
const convertImageElementToJpeg = (img, maxDim = 800, quality = 0.88) => {
  try {
    const canvas = document.createElement('canvas');
    let w = img.naturalWidth || img.width || 400;
    let h = img.naturalHeight || img.height || 300;
    if (w <= 0) w = 400;
    if (h <= 0) h = 300;

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

    // Solid white background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);
    return {
      status: 'success',
      dataUrl: jpegDataUrl,
      width: canvas.width,
      height: canvas.height,
    };
  } catch (err) {
    return {
      status: 'error',
      error: true,
      message: `Canvas export failed: ${err.message}`,
    };
  }
};

/**
 * Safely loads any image (data URL, web URL, cloud storage, or relative server file)
 * and converts it to a standard, clean JPEG data URL for jsPDF.
 * Handles CORS, authorization tokens, format conversions (WebP, PNG, SVG), and network failures gracefully.
 */
export const getPdfImageSafe = async (rawSrc) => {
  if (!rawSrc) {
    return { status: 'empty', message: 'No photo attached' };
  }

  const candidates = getCandidateUrls(rawSrc);
  if (candidates.length === 0) {
    return { status: 'empty', message: 'No valid photo source provided' };
  }

  // A. If the source is already a Data URL or Blob URL (self-contained, no network request needed)
  if (candidates[0].startsWith('data:') || candidates[0].startsWith('blob:')) {
    const dataUrl = candidates[0];
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve({
            status: 'error',
            error: true,
            message: 'Image decode timed out',
            source: dataUrl.slice(0, 50),
          });
        }
      }, 7000);

      const img = new Image();
      // NOTE: Do NOT set crossOrigin on data: URLs as it causes canvas tainting in some browsers
      img.onload = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const res = convertImageElementToJpeg(img);
        if (res.status === 'success') {
          resolve(res);
        } else if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/png')) {
          // Direct fallback if canvas conversion threw
          resolve({
            status: 'success',
            dataUrl,
            width: img.naturalWidth || 400,
            height: img.naturalHeight || 300,
          });
        } else {
          resolve(res);
        }
      };
      img.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          status: 'error',
          error: true,
          message: 'Data URL image failed to decode',
          source: dataUrl.slice(0, 50),
        });
      };
      img.src = dataUrl;
    });
  }

  // B. HTTP/HTTPS or relative URLs: Retrieve via fetch with auth headers or fallback to Image element
  const authHeader = {};
  if (typeof window !== 'undefined' && window.localStorage) {
    const token = localStorage.getItem('garment_qms_token');
    if (token) {
      authHeader['Authorization'] = `Bearer ${token}`;
    }
  }

  for (const url of candidates) {
    // Strategy 1: Fetch as Blob with AbortController timeout (handles CORS headers, authorization tokens, avoids canvas taint)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const response = await fetch(url, {
        method: 'GET',
        headers: authHeader,
        mode: 'cors',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const blob = await response.blob();
        if (blob && blob.size > 0) {
          const dataUrl = await new Promise((resolveBlob, rejectBlob) => {
            const reader = new FileReader();
            reader.onloadend = () => resolveBlob(reader.result);
            reader.onerror = rejectBlob;
            reader.readAsDataURL(blob);
          });

          if (dataUrl && typeof dataUrl === 'string') {
            const loaded = await new Promise((resolveImg) => {
              let settled = false;
              const timer = setTimeout(() => {
                if (!settled) {
                  settled = true;
                  resolveImg(null);
                }
              }, 6000);

              const img = new Image();
              img.onload = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolveImg(convertImageElementToJpeg(img));
              };
              img.onerror = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolveImg(null);
              };
              img.src = dataUrl;
            });

            if (loaded && loaded.status === 'success') {
              return loaded;
            }
          }
        }
      }
    } catch (fetchErr) {
      // Continue to next strategy or candidate
    }

    // Strategy 2: HTML Image element with crossOrigin anonymous and timeout
    try {
      const loaded = await new Promise((resolveImg) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            resolveImg(null);
          }
        }, 5000);

        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const res = convertImageElementToJpeg(img);
          resolveImg(res);
        };
        img.onerror = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolveImg(null);
        };
        img.src = url;
      });

      if (loaded && loaded.status === 'success') {
        return loaded;
      }
    } catch (imgErr) {
      // Continue
    }
  }

  // If all candidate URLs failed to load
  const shortSource = typeof rawSrc === 'string'
    ? (rawSrc.length > 55 ? rawSrc.slice(0, 52) + '...' : rawSrc)
    : 'Image resource';

  return {
    status: 'error',
    error: true,
    message: 'Image could not be loaded from server or storage',
    source: shortSource,
  };
};

// -----------------------------------------------------------------------------
// PHOTO & METADATA EXTRACTORS (Support all project schemas and fallbacks)
// -----------------------------------------------------------------------------

export const extractBeforePhoto = (c) => {
  if (!c) return null;
  // If photos array exists
  if (Array.isArray(c.photos) && c.photos.length > 0) {
    const candidate = c.photos[0];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (typeof candidate === 'object' && candidate !== null) {
      return candidate.url || candidate.dataUrl || candidate.path || candidate.src || null;
    }
  }
  const p =
    c.beforePhoto ||
    c.beforePhotoUrl ||
    c.beforePhotoBase64 ||
    c.photo ||
    c.photoUrl ||
    c.findingPhoto ||
    c.defectPhoto ||
    c.complaintPhoto ||
    c.image ||
    c.imageUrl ||
    c.evidencePhoto ||
    c.initialPhoto ||
    c.problemPhoto ||
    c.cap?.beforePhoto ||
    c.cap?.problemPhoto ||
    null;
  if (typeof p === 'object' && p !== null) {
    return p.url || p.dataUrl || p.path || p.src || null;
  }
  return typeof p === 'string' && p.trim() ? p.trim() : null;
};

export const extractAfterPhoto = (c) => {
  if (!c) return null;
  // If afterPhotos or cap.photos array exists
  if (Array.isArray(c.afterPhotos) && c.afterPhotos.length > 0) {
    const candidate = c.afterPhotos[0];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (typeof candidate === 'object' && candidate !== null) {
      return candidate.url || candidate.dataUrl || candidate.path || candidate.src || null;
    }
  }
  if (Array.isArray(c.cap?.photos) && c.cap.photos.length > 0) {
    const candidate = c.cap.photos[0];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (typeof candidate === 'object' && candidate !== null) {
      return candidate.url || candidate.dataUrl || candidate.path || candidate.src || null;
    }
  }
  const p =
    c.afterPhoto ||
    c.afterPhotoUrl ||
    c.afterPhotoBase64 ||
    c.cap?.afterPhoto ||
    c.cap?.completionPhoto ||
    c.cap?.rectificationPhoto ||
    c.cap?.evidence ||
    c.cap?.proofPhoto ||
    c.cap?.verifiedPhoto ||
    c.proofPhoto ||
    c.actionTaken?.photo ||
    c.rectificationPhoto ||
    c.resolutionPhoto ||
    c.completionPhoto ||
    c.verificationPhoto ||
    null;
  if (typeof p === 'object' && p !== null) {
    return p.url || p.dataUrl || p.path || p.src || null;
  }
  return typeof p === 'string' && p.trim() ? p.trim() : null;
};

export const extractFinding = (c) => {
  if (!c) return 'General Quality Non-Conformance';
  const desc = c.description || c.findingDescription || c.title || '';
  if (desc && !desc.toLowerCase().includes('no defect description')) return desc;
  return c.category || 'General Quality Defect';
};

export const extractRootCause = (c) => {
  if (!c) return 'Pending Floor Investigation';
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

// -----------------------------------------------------------------------------
// PDF RENDERING CORE: DRAW NC WITH BEFORE & AFTER PHOTOS
// -----------------------------------------------------------------------------

/**
 * Draws an NC record with side-by-side Before Photo and After Photo
 * and technical CAP details onto a jsPDF document.
 * Ensures strict layout boundaries, no image clipping, and keeps issue details together.
 */
export const drawNCWithPhotos = async (doc, c, startY, pageWidth, margin, contentWidth, idx = null) => {
  const pageHeight = doc.internal.pageSize.getHeight();
  let currentY = startY;

  // Exact height required for Header (22) + Spacing (6) + Photo Cards (140) + Spacing (10) + Details Table (~95) = ~273pt
  const cardHeightNeeded = 285;
  if (currentY + cardHeightNeeded > pageHeight - margin) {
    doc.addPage();
    currentY = margin + 15;
  }

  // Pre-load both Before & After images concurrently using our safe loader
  const beforeSource = extractBeforePhoto(c);
  const afterSource = extractAfterPhoto(c);

  const [beforeImg, afterImg] = await Promise.all([
    getPdfImageSafe(beforeSource),
    getPdfImageSafe(afterSource),
  ]);

  const cRisk = (c.priority || c.riskSeverity || 'MEDIUM').toUpperCase();
  const ncId = c.complaintId || 'NC-RECORD';
  const deptName = c.department || 'General Floor';
  const assignedName = extractResponsiblePerson(c);
  const auditorName = extractAuditorName(c);
  const loggedDateStr = c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'N/A';

  const headerTitle = idx !== null
    ? `NC #${idx + 1}: ${ncId} • Department: ${deptName} • Priority: ${cRisk}`
    : `${ncId} • Department: ${deptName} • Priority: ${cRisk}`;

  // 1. Header Bar
  doc.setFillColor(15, 23, 42); // slate-900
  doc.roundedRect(margin, currentY, contentWidth, 22, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text(headerTitle, margin + 8, currentY + 14);

  // Status Badge on right of Header Bar
  doc.setFontSize(8);
  const statusBadgeText = c.isDeleted
    ? `DELETED (${c.status || 'Archived'})`
    : `Status: ${c.status || 'Open'}`;
  doc.text(statusBadgeText, margin + contentWidth - 8, currentY + 14, { align: 'right' });
  currentY += 26;

  // Two columns for Side-by-Side Photos
  const gap = 12;
  const colW = (contentWidth - gap) / 2;
  const photoH = 105;
  const cardHeaderH = 15;
  const cardFooterH = 18;
  const totalCardH = cardHeaderH + photoH + cardFooterH; // 138pt

  // ---------------------------------------------------------------------------
  // A. BEFORE PHOTO CARD (Rose / Red Theme)
  // ---------------------------------------------------------------------------
  const beforeX = margin;
  doc.setDrawColor(244, 63, 94); // rose-500
  doc.setFillColor(255, 241, 242); // rose-50
  doc.roundedRect(beforeX, currentY, colW, totalCardH, 3, 3, 'FD');

  // Before Card Header Tab
  doc.setFillColor(225, 29, 72); // rose-600
  doc.rect(beforeX, currentY, colW, cardHeaderH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text('BEFORE RECTIFICATION: Initial Defect Evidence', beforeX + 6, currentY + 10.5);
  doc.setFontSize(6.5);
  doc.text('Auditor Finding', beforeX + colW - 6, currentY + 10.5, { align: 'right' });

  // Photo Drawing Area inside Before Card
  const beforePhotoY = currentY + cardHeaderH;
  doc.setFillColor(255, 255, 255);
  doc.rect(beforeX + 1, beforePhotoY, colW - 2, photoH, 'F');

  if (beforeImg && beforeImg.status === 'success' && beforeImg.dataUrl) {
    try {
      // Calculate aspect ratio to avoid stretching or image distortion
      const imgAspect = (beforeImg.width || 400) / (beforeImg.height || 300);
      const boxAspect = (colW - 6) / (photoH - 6);
      let drawW = colW - 6;
      let drawH = photoH - 6;
      let drawX = beforeX + 3;
      let drawY = beforePhotoY + 3;

      if (imgAspect > boxAspect) {
        drawW = colW - 6;
        drawH = drawW / imgAspect;
        drawY = beforePhotoY + 3 + (photoH - 6 - drawH) / 2;
      } else {
        drawH = photoH - 6;
        drawW = drawH * imgAspect;
        drawX = beforeX + 3 + (colW - 6 - drawW) / 2;
      }

      doc.addImage(beforeImg.dataUrl, 'JPEG', drawX, drawY, drawW, drawH);
    } catch (e) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(159, 18, 57);
      doc.text('Photo render error (unsupported format)', beforeX + colW / 2, beforePhotoY + photoH / 2, { align: 'center' });
    }
  } else if (beforeImg && beforeImg.status === 'error') {
    doc.setFillColor(254, 242, 242);
    doc.rect(beforeX + 2, beforePhotoY + 2, colW - 4, photoH - 4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(185, 28, 28);
    doc.text('[!] Photo File Load Error', beforeX + colW / 2, beforePhotoY + photoH / 2 - 8, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(beforeImg.message || 'File inaccessible from server storage', beforeX + colW / 2, beforePhotoY + photoH / 2 + 5, { align: 'center' });
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(159, 18, 57);
    doc.text('No Initial Defect Photo Attached', beforeX + colW / 2, beforePhotoY + photoH / 2, { align: 'center' });
  }

  // Before Card Footer Info Strip
  const beforeFooterY = beforePhotoY + photoH;
  doc.setFillColor(255, 241, 242); // rose-50
  doc.rect(beforeX, beforeFooterY, colW, cardFooterH, 'F');
  doc.setDrawColor(254, 205, 211); // rose-200
  doc.line(beforeX, beforeFooterY, beforeX + colW, beforeFooterY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(136, 19, 55);
  doc.text(`Issue: ${ncId} • Dept: ${deptName}`, beforeX + 5, beforeFooterY + 11.5);
  doc.text(`Auditor: ${auditorName}`, beforeX + colW - 5, beforeFooterY + 11.5, { align: 'right' });

  // ---------------------------------------------------------------------------
  // B. AFTER PHOTO CARD (Emerald / Green Theme)
  // ---------------------------------------------------------------------------
  const afterX = margin + colW + gap;
  doc.setDrawColor(16, 185, 129); // emerald-500
  doc.setFillColor(236, 253, 245); // emerald-50
  doc.roundedRect(afterX, currentY, colW, totalCardH, 3, 3, 'FD');

  // After Card Header Tab
  doc.setFillColor(5, 150, 105); // emerald-600
  doc.rect(afterX, currentY, colW, cardHeaderH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text('AFTER RECTIFICATION: CAP Verified Proof', afterX + 6, currentY + 10.5);
  doc.setFontSize(6.5);
  doc.text('Floor Resolution', afterX + colW - 6, currentY + 10.5, { align: 'right' });

  // Photo Drawing Area inside After Card
  const afterPhotoY = currentY + cardHeaderH;
  doc.setFillColor(255, 255, 255);
  doc.rect(afterX + 1, afterPhotoY, colW - 2, photoH, 'F');

  if (afterImg && afterImg.status === 'success' && afterImg.dataUrl) {
    try {
      const imgAspect = (afterImg.width || 400) / (afterImg.height || 300);
      const boxAspect = (colW - 6) / (photoH - 6);
      let drawW = colW - 6;
      let drawH = photoH - 6;
      let drawX = afterX + 3;
      let drawY = afterPhotoY + 3;

      if (imgAspect > boxAspect) {
        drawW = colW - 6;
        drawH = drawW / imgAspect;
        drawY = afterPhotoY + 3 + (photoH - 6 - drawH) / 2;
      } else {
        drawH = photoH - 6;
        drawW = drawH * imgAspect;
        drawX = afterX + 3 + (colW - 6 - drawW) / 2;
      }

      doc.addImage(afterImg.dataUrl, 'JPEG', drawX, drawY, drawW, drawH);
    } catch (e) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(6, 95, 70);
      doc.text('Photo render error (unsupported format)', afterX + colW / 2, afterPhotoY + photoH / 2, { align: 'center' });
    }
  } else if (afterImg && afterImg.status === 'error') {
    doc.setFillColor(254, 243, 199);
    doc.rect(afterX + 2, afterPhotoY + 2, colW - 4, photoH - 4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(180, 83, 9);
    doc.text('[!] Rectification Photo Load Error', afterX + colW / 2, afterPhotoY + photoH / 2 - 8, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(afterImg.message || 'File inaccessible from server storage', afterX + colW / 2, afterPhotoY + photoH / 2 + 5, { align: 'center' });
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(180, 83, 9);
    const pendingMsg = ['Closed', 'Verified'].includes(c.status)
      ? 'Verification Closed (No Photo Required)'
      : 'Pending Floor Rectification Photo Proof';
    doc.text(pendingMsg, afterX + colW / 2, afterPhotoY + photoH / 2, { align: 'center' });
  }

  // After Card Footer Info Strip
  const afterFooterY = afterPhotoY + photoH;
  doc.setFillColor(236, 253, 245); // emerald-50
  doc.rect(afterX, afterFooterY, colW, cardFooterH, 'F');
  doc.setDrawColor(167, 243, 208); // emerald-200
  doc.line(afterX, afterFooterY, afterX + colW, afterFooterY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(6, 78, 59);
  doc.text(`Assigned: ${assignedName} • Status: ${c.status || 'Open'}`, afterX + 5, afterFooterY + 11.5);
  doc.text(`Proof: ${afterImg?.status === 'success' ? 'Evidence Attached' : 'Awaiting Proof'}`, afterX + colW - 5, afterFooterY + 11.5, { align: 'right' });

  currentY += totalCardH + 8;

  // ---------------------------------------------------------------------------
  // C. DETAILED TECHNICAL TABLE (Finding, 5-Why, Actions, ISO Standard)
  // ---------------------------------------------------------------------------
  const findingText = extractFinding(c);
  const rootCauseText = extractRootCause(c);
  const corrActionText = extractCorrectiveAction(c);
  const prevActionText = extractPreventiveAction(c);
  const rejReasonText = extractRejectionReason(c);
  const locationText = c.location || 'Line Floor';

  const detailRows = [
    ...(c.isDeleted
      ? [
          [
            'Record Status:',
            `[ARCHIVED / DELETED NC] Deleted on ${
              c.deletedAt ? new Date(c.deletedAt).toLocaleString() : 'N/A'
            } by ${
              typeof c.deletedBy === 'object'
                ? c.deletedBy?.name
                : c.deletedBy || 'System'
            }${c.deletedReason ? ` (Reason: ${c.deletedReason})` : ''}`,
          ],
        ]
      : []),
    ['Defect Finding:', findingText],
    ...(rejReasonText ? [['Rejection Directive:', `[AUDITOR REJECT / REWORK] ${rejReasonText}`]] : []),
    ['Root Cause (5-Why):', rootCauseText],
    ['Corrective Action:', corrActionText],
    ['Preventive Action:', prevActionText],
    ['Standard / Clause:', c.requirement || 'ISO 9001 Clause 8.7 Nonconforming Outputs'],
    ['Accountability:', `Assigned To: ${assignedName}   |   Auditor: ${auditorName}   |   Location: ${locationText}   |   Logged: ${loggedDateStr}`],
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

// -----------------------------------------------------------------------------
// EXECUTIVE INDIVIDUAL NC AUDIT DOSSIER (Single NC Report)
// -----------------------------------------------------------------------------

/**
 * Generates an executive single-NC report PDF with Before and After photo evidence.
 * Suitable for audit sign-offs, vendor reports, and official quality certificates.
 */
export const generateSingleNCPdf = async (complaint, generatedBy = 'Quality Directorate') => {
  if (!complaint) return;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  const contentWidth = pageWidth - margin * 2;

  // 1. Top Branded Ribbon
  doc.setFillColor(37, 99, 235); // blue-600
  doc.rect(0, 0, pageWidth, 48, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text('GARMENT QUALITY MANAGEMENT SYSTEM (QMS)', margin, 28);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('Official Non-Conformance Audit Dossier', pageWidth - margin, 28, { align: 'right' });

  // 2. NC Document Header Banner
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(`NC Audit Certificate: ${complaint.complaintId || 'NC-RECORD'}`, margin, 74);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const genDateStr = new Date().toLocaleString();
  const currentStatusStr = complaint.isDeleted
    ? `DELETED (${complaint.status || 'Archived'})`
    : (complaint.status || 'Open');
  doc.text(
    `Generated By: ${generatedBy}   |   Execution Date: ${genDateStr}   |   Current Status: ${currentStatusStr}`,
    margin,
    88
  );

  // 3. Draw Side-by-Side Photos & Core Details Card
  let currentY = 104;
  currentY = await drawNCWithPhotos(doc, complaint, currentY, pageWidth, margin, contentWidth, null);

  // 4. Official Sign-off & Verification Section at Bottom
  // Check if sign-off box fits on the current page; if not, add page
  const signoffHeight = 72;
  if (currentY + signoffHeight > pageHeight - margin) {
    doc.addPage();
    currentY = margin + 20;
  } else {
    currentY += 8;
  }

  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(margin, currentY, contentWidth, signoffHeight, 3, 3, 'FD');

  const signColW = contentWidth / 3;

  // Panel 1: Floor Supervisor
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text('1. FLOOR SUPERVISOR (ACTION LEAD)', margin + 8, currentY + 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Name: ${extractResponsiblePerson(complaint)}`, margin + 8, currentY + 28);
  doc.text(`Action Verified: ${complaint.status === 'Closed' || complaint.status === 'Verified' ? 'Complete' : 'In Progress'}`, margin + 8, currentY + 40);
  doc.line(margin + 8, currentY + 58, margin + signColW - 14, currentY + 58);
  doc.text('Supervisor Signature / Date', margin + 8, currentY + 66);

  // Panel 2: Quality Auditor
  const audX = margin + signColW;
  doc.line(audX, currentY + 6, audX, currentY + signoffHeight - 6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text('2. QUALITY AUDITOR (INSPECTOR)', audX + 8, currentY + 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Name: ${extractAuditorName(complaint)}`, audX + 8, currentY + 28);
  doc.text(`Re-inspection: ${['Closed', 'Verified'].includes(complaint.status) ? 'Pass & Verified' : 'Awaiting Final Proof'}`, audX + 8, currentY + 40);
  doc.line(audX + 8, currentY + 58, audX + signColW - 14, currentY + 58);
  doc.text('Auditor Signature / Date', audX + 8, currentY + 66);

  // Panel 3: Quality Directorate Approval
  const dirX = margin + signColW * 2;
  doc.line(dirX, currentY + 6, dirX, currentY + signoffHeight - 6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text('3. QA DIRECTORATE (APPROVAL)', dirX + 8, currentY + 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text('Compliance: ISO 9001:2015 Clause 8.7', dirX + 8, currentY + 28);
  doc.text(`Stamp: [QMS DIGITAL SIGNATURE VERIFIED]`, dirX + 8, currentY + 40);
  doc.line(dirX + 8, currentY + 58, dirX + signColW - 14, currentY + 58);
  doc.text('QA Manager Signature / Date', dirX + 8, currentY + 66);

  // 5. Save generated PDF
  const safeFilename = `Garment_QMS_NC_${complaint.complaintId || 'Report'}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(safeFilename);
};
