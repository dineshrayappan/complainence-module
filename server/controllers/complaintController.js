const fs = require('fs');
const path = require('path');
const { isMongoConnected } = require('../config/db');
const Complaint = require('../models/Complaint');
const User = require('../models/User');
const Department = require('../models/Department');
const Audit = require('../models/Audit');
const mockStore = require('../config/mockStore');
const { computeDepartmentNCScore } = require('../utils/scoringEngine');
const { toBase64DataUrl, isBase64DataUrl } = require('../utils/base64Helper');
const { logEvent } = require('../utils/eventLogger');

// Database status adapter: maps workflow statuses to canonical values
// allows ('Assigned', 'In Progress', 'Closed'). We map workflow statuses to compatible DB values.
const toDbStatus = (status) => {
  const s = String(status || '').trim();
  const allowedStatuses = [
    'Draft',
    'Open',
    'Assigned',
    'In Progress',
    'CAP Submitted',
    'Under Review',
    'Rejected / Rework',
    'Verified',
    'Closed'
  ];
  if (allowedStatuses.includes(s)) return s;
  if (s === 'VERIFIED_EFFECTIVE') return 'Verified';
  if (['SUBMITTED', 'ACTION_TAKEN'].includes(s)) return 'CAP Submitted';
  if (s === 'Rejected / Sent Back') return 'Rejected / Rework';
  return 'Open';
};

const setWorkflowStatusInDescription = (desc, status) => {
  let text = String(desc || '');
  if (text.includes('[Workflow Status:')) {
    return text.replace(/\[Workflow Status:\s*.*?\]/, `[Workflow Status: ${status}]`);
  }
  return `[Workflow Status: ${status}] ${text}`;
};

// Helper to convert any image path (including disk files in /uploads) into a self-contained base64 data URL
const ensureDataUrl = (photoPath) => {
  return toBase64DataUrl(photoPath);
};

// Helper to ensure all complaint outputs have self-contained data URLs and compatible identifiers
const formatComplaintOutput = (complaint) => {
  if (!complaint) return null;
  const obj = typeof complaint.toObject === 'function' ? complaint.toObject() : { ...complaint };
  obj._id = obj.id || obj._id;
  obj.id = obj.id || obj._id;

  if (obj.beforePhoto) {
    obj.beforePhoto = toBase64DataUrl(obj.beforePhoto);
  }
  if (obj.afterPhoto) {
    obj.afterPhoto = toBase64DataUrl(obj.afterPhoto);
  }
  if (obj.cap && obj.cap.evidence) {
    obj.cap.evidence = toBase64DataUrl(obj.cap.evidence);
  }

  // 1. Workflow Lifecycle Status: Draft -> Open -> CAP Submitted -> Under Review -> Rejected / Rework -> Verified -> Closed
  let workflowStatus = obj.status || 'Open';
  if (obj.description && obj.description.includes('[Workflow Status:')) {
    const m = obj.description.match(/\[Workflow Status:\s*(.*?)\]/);
    if (m && m[1]) workflowStatus = m[1].trim();
  } else if (Array.isArray(obj.timeline) && obj.timeline.length > 0) {
    const lastAction = obj.timeline[obj.timeline.length - 1]?.action;
    if (lastAction === 'CLOSED') workflowStatus = 'Closed';
    else if (lastAction === 'VERIFIED') workflowStatus = 'Verified';
    else if (lastAction === 'UNDER_REVIEW') workflowStatus = 'Under Review';
    else if (lastAction === 'CAP_SUBMITTED' || lastAction === 'ACTION_SUBMITTED') workflowStatus = 'CAP Submitted';
    else if (lastAction === 'REJECTED') workflowStatus = 'Rejected / Rework';
    else if (lastAction === 'DRAFT') workflowStatus = 'Draft';
    else if (lastAction === 'CREATED') workflowStatus = 'Open';
  }

  let normalizedStatus = workflowStatus;
  if (['Assigned'].includes(normalizedStatus)) {
    normalizedStatus = 'Open';
  } else if (['Under Verification'].includes(normalizedStatus)) {
    normalizedStatus = 'CAP Submitted';
  } else if (['Rejected / Sent Back'].includes(normalizedStatus)) {
    normalizedStatus = 'Rejected / Rework';
  }
  obj.status = normalizedStatus;

  // 2. Decoupled Deadline Condition: Open | Overdue | Due Soon | Closed
  const isTerminal = normalizedStatus === 'Closed' || normalizedStatus === 'Verified';
  let deadlineCondition = 'Open';
  if (isTerminal) {
    deadlineCondition = 'Closed';
  } else if (obj.deadlineTimestamp) {
    const diffMs = new Date(obj.deadlineTimestamp).getTime() - Date.now();
    if (diffMs <= 0) {
      deadlineCondition = 'Overdue';
    } else if (diffMs <= 4 * 60 * 60 * 1000) {
      deadlineCondition = 'Due Soon';
    } else {
      deadlineCondition = 'Open';
    }
  }
  obj.deadlineCondition = deadlineCondition;
  obj.isCurrentlyOverdue = deadlineCondition === 'Overdue';

  // Ensure timeline is an array
  if (!Array.isArray(obj.timeline)) {
    try {
      obj.timeline = typeof obj.timeline === 'string' ? JSON.parse(obj.timeline) : [];
    } catch (e) {
      obj.timeline = [];
    }
  }

  // Extract audit workflow fields if embedded in description or native
  if ((!obj.requirement || obj.requirement === 'AQL 1.5 Workmanship Standard') && obj.description && obj.description.includes('[Audit Requirement:')) {
    const m = obj.description.match(/\[Audit Requirement:\s*(.*?)\]/);
    if (m && m[1]) obj.requirement = m[1].trim();
  }
  if (!obj.requirement) {
    obj.requirement = 'AQL 1.5 Workmanship Standard';
  }

  // Extract clean finding description if embedded in description
  let cleanFinding = obj.findingDescription || obj.description || '';
  if (cleanFinding && cleanFinding.includes('[Audit Requirement:')) {
    const parts = cleanFinding.split('\n\n');
    cleanFinding = parts.length > 1 ? parts.slice(1).join('\n\n').trim() : cleanFinding.replace(/\[.*?\]\s*/g, '').trim();
  }
  obj.findingDescription = cleanFinding;

  if (typeof obj.capRequired === 'undefined') {
    if (obj.description && obj.description.includes('[CAP Required:')) {
      obj.capRequired = obj.description.includes('[CAP Required: YES]');
    } else {
      obj.capRequired = false;
    }
  }

  if (!obj.verificationMethod && obj.description && obj.description.includes('[Verification:')) {
    const m = obj.description.match(/\[Verification:\s*(.*?)\]/);
    if (m) obj.verificationMethod = m[1];
  }
  if (!obj.verificationMethod) {
    obj.verificationMethod = 'Physical Floor Re-inspection';
  }

  if (!obj.riskSeverity) {
    obj.riskSeverity = obj.priority || 'HIGH';
  }

  // Extract or synthesize full structured 8-part CAP structure (NC -> Immediate Correction -> Root Cause -> Corrective Action -> Preventive Action -> Responsible Person -> Target Date -> Evidence -> Verification)
  let capObj = null;
  if (obj.cap) {
    if (typeof obj.cap === 'string') {
      try {
        capObj = JSON.parse(obj.cap);
      } catch (e) {
        capObj = null;
      }
    } else if (typeof obj.cap === 'object') {
      capObj = { ...obj.cap };
    }
  }

  const isClosed = obj.status === 'Closed' || obj.status === 'Verified';
  const isUnderVerification =
    obj.status === 'CAP Submitted' ||
    obj.status === 'Under Review' ||
    obj.status === 'Under Verification';
  const hasResolution = Boolean(obj.actionNotes || obj.feedbackRemarks || obj.afterPhoto);

  let immediateCorrection = obj.immediateCorrection || '';
  let correctiveAction = obj.correctiveAction || '';
  let rootCause = obj.rootCause || '';
  let preventiveAction = obj.preventiveAction || '';

  if (obj.actionNotes) {
    const immMatch = obj.actionNotes.match(/\[Immediate Correction\]:\s*(.*?)(?=\n\n\[|$)/s);
    const corrMatch = obj.actionNotes.match(/\[Corrective Action\]:\s*(.*?)(?=\n\n\[|$)/s);
    if (immMatch && !immediateCorrection) immediateCorrection = immMatch[1].trim();
    if (corrMatch && !correctiveAction) correctiveAction = corrMatch[1].trim();
    if (!immediateCorrection && !correctiveAction) {
      immediateCorrection = obj.actionNotes;
      correctiveAction = obj.actionNotes;
    }
  }

  if (obj.feedbackRemarks) {
    const rcMatch = obj.feedbackRemarks.match(/\[Root Cause\]:\s*(.*?)(?=\n\n\[|$)/s);
    const prevMatch = obj.feedbackRemarks.match(/\[Preventive Action\]:\s*(.*?)(?=\n\n\[|$)/s);
    if (rcMatch && !rootCause) rootCause = rcMatch[1].trim();
    if (prevMatch && !preventiveAction) preventiveAction = prevMatch[1].trim();
    if (!rootCause && !preventiveAction) {
      rootCause = obj.feedbackRemarks;
      preventiveAction = obj.feedbackRemarks;
    }
  }

  if (!capObj) {
    capObj = {
      required: Boolean(obj.capRequired),
      status: isClosed
        ? 'VERIFIED_EFFECTIVE'
        : isUnderVerification
        ? 'SUBMITTED'
        : hasResolution
        ? 'SUBMITTED'
        : obj.capRequired
        ? 'PENDING'
        : 'DIRECT_CORRECTION',
      immediateCorrection: immediateCorrection || '',
      rootCause: rootCause || '',
      correctiveAction: correctiveAction || '',
      preventiveAction: preventiveAction || '',
      responsiblePerson: obj.capResponsiblePerson || obj.assignedTo || null,
      targetDate: obj.capTargetDate || obj.deadlineTimestamp || null,
      evidence: obj.afterPhoto || null,
      verificationMethod: obj.verificationMethod || 'Physical Floor Re-inspection',
      verificationCriteria: obj.verificationCriteria || 'Zero defect recurrence & standard adherence',
      verificationReadinessNotes: obj.verificationReadinessNotes || '',
      verifiedEffective: isClosed,
      verifiedAt: isClosed ? obj.actualCompletedAt || obj.updatedAt : null,
      verifiedBy: obj.verifiedBy || (isClosed ? 'Internal QA Auditor' : null),
    };
  } else {
    if (!capObj.immediateCorrection && immediateCorrection) capObj.immediateCorrection = immediateCorrection;
    if (!capObj.rootCause && rootCause) capObj.rootCause = rootCause;
    if (!capObj.correctiveAction && correctiveAction) capObj.correctiveAction = correctiveAction;
    if (!capObj.preventiveAction && preventiveAction) capObj.preventiveAction = preventiveAction;
    if (!capObj.responsiblePerson) capObj.responsiblePerson = obj.assignedTo || null;
    if (!capObj.targetDate) capObj.targetDate = obj.deadlineTimestamp || null;
    if (!capObj.evidence && obj.afterPhoto) capObj.evidence = obj.afterPhoto;
    if (!capObj.verificationMethod) capObj.verificationMethod = obj.verificationMethod || 'Physical Floor Re-inspection';
    if (!capObj.verificationCriteria) capObj.verificationCriteria = obj.verificationCriteria || 'Zero defect recurrence & standard adherence';
    if (isClosed) {
      capObj.status = 'VERIFIED_EFFECTIVE';
      capObj.verifiedEffective = true;
      if (!capObj.verifiedAt) capObj.verifiedAt = obj.actualCompletedAt || obj.updatedAt;
      if (!capObj.verifiedBy) capObj.verifiedBy = 'Internal QA Auditor';
    }
  }

  obj.cap = capObj;

  // Soft deletion and audit archival preservation fields
  obj.isDeleted = Boolean(obj.isDeleted);
  obj.deletedAt = obj.deletedAt || null;
  obj.deletedBy = obj.deletedBy || null;
  obj.deletedReason = obj.deletedReason || '';

  return obj;
};

// Helper to safely parse timeline whether it is an Array or JSON String
const parseTimeline = (tl) => {
  if (Array.isArray(tl)) return [...tl];
  if (typeof tl === 'string') {
    try {
      const parsed = JSON.parse(tl);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {}
  }
  return [];
};

// Generate fallback SVG snapshot if auditor does not upload photo or upload is malformed
const generateDefaultAuditPhoto = (dept, prio, desc) => {
  const safeDept = (dept || 'Production').replace(/[<>&"]/g, '');
  const safePrio = (prio || 'HIGH').replace(/[<>&"]/g, '');
  const safeDesc = (desc || 'Audit Non-Conformance Finding').slice(0, 45).replace(/[<>&"]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
    <rect width="600" height="400" fill="#0f172a"/>
    <rect x="20" y="20" width="560" height="360" rx="16" fill="#1e293b" stroke="#6366f1" stroke-width="2"/>
    <text x="300" y="130" fill="#ffffff" font-size="22" font-family="sans-serif" font-weight="bold" text-anchor="middle">NC DEFECT RECORD</text>
    <text x="300" y="180" fill="#a5b4fc" font-size="16" font-family="sans-serif" text-anchor="middle">Department: ${safeDept}</text>
    <text x="300" y="220" fill="#f43f5e" font-size="16" font-family="sans-serif" font-weight="bold" text-anchor="middle">Risk: ${safePrio}</text>
    <text x="300" y="270" fill="#cbd5e1" font-size="13" font-family="sans-serif" text-anchor="middle">${safeDesc}</text>
    <text x="300" y="320" fill="#64748b" font-size="11" font-family="sans-serif" text-anchor="middle">${new Date().toLocaleString()}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

// Helper to extract photo data URL from base64, memory buffer, disk file, or URL
const extractPhotoPayload = (req, fieldName, base64FieldName) => {
  // 1. Direct Base64 field in body
  if (req.body && req.body[base64FieldName]) {
    const b64 = toBase64DataUrl(req.body[base64FieldName]);
    if (b64) return b64;
  }

  // 2. Standard field in body (can be Base64 string, SVG, or data URL)
  if (req.body && req.body[fieldName]) {
    const b64 = toBase64DataUrl(req.body[fieldName]);
    if (b64) return b64;
  }

  // 3. Alternative field in body (e.g. fieldName + 'File')
  if (req.body && req.body[`${fieldName}File`]) {
    const b64 = toBase64DataUrl(req.body[`${fieldName}File`]);
    if (b64) return b64;
  }

  // 4. Single uploaded file via multer (memory buffer or disk file)
  if (req.file) {
    try {
      const mime = req.file.mimetype || 'image/jpeg';
      if (req.file.buffer) {
        return toBase64DataUrl(req.file.buffer, mime);
      }
      if (req.file.path && fs.existsSync(req.file.path)) {
        const fileBuf = fs.readFileSync(req.file.path);
        return toBase64DataUrl(fileBuf, mime);
      }
    } catch (e) {}
    if (req.file.filename) {
      const b64 = toBase64DataUrl(`/uploads/${req.file.filename}`);
      if (b64) return b64;
    }
  }

  // 5. Multiple uploaded files via multer (req.files) - supports both Array (upload.any) and Object (upload.fields)
  if (req.files) {
    let fileObj = null;
    if (Array.isArray(req.files)) {
      fileObj =
        req.files.find(
          (f) =>
            f.fieldname === fieldName ||
            f.fieldname === base64FieldName ||
            f.fieldname === `${fieldName}File` ||
            f.fieldname === 'photo' ||
            f.fieldname === 'image' ||
            f.fieldname === 'file'
        ) || req.files[0];
    } else if (typeof req.files === 'object') {
      fileObj =
        req.files[fieldName] ||
        req.files[base64FieldName] ||
        req.files[`${fieldName}File`] ||
        null;
      if (Array.isArray(fileObj)) fileObj = fileObj[0];
    }

    if (fileObj) {
      const mime = fileObj.mimetype || 'image/jpeg';
      if (fileObj.buffer) {
        return toBase64DataUrl(fileObj.buffer, mime);
      }
      if (fileObj.path && fs.existsSync(fileObj.path)) {
        try {
          const fileBuf = fs.readFileSync(fileObj.path);
          return toBase64DataUrl(fileBuf, mime);
        } catch (e) {}
      }
      if (fileObj.filename) {
        const b64 = toBase64DataUrl(`/uploads/${fileObj.filename}`);
        if (b64) return b64;
      }
    }
  }

  // 6. Explicit URL field
  if (req.body && req.body[`${fieldName}Url`]) {
    const b64 = toBase64DataUrl(req.body[`${fieldName}Url`]);
    if (b64) return b64;
  }

  return null;
};

// Helper to format file URL
const getFileUrl = (req, filename) => {
  if (!filename) return null;
  if (
    filename.startsWith('http') ||
    filename.startsWith('data:') ||
    filename.startsWith('/uploads/')
  ) {
    return filename;
  }
  return `/uploads/${filename}`;
};

// @desc    Create new complaint with Before Photo and 12-24h SLA
// @route   POST /api/complaints
// @access  Private (Auditor only)
const createComplaint = async (req, res) => {
  try {
    const {
      category = 'Stitching Fault',
      department,
      location = 'Production Floor',
      priority = 'HIGH',
      description = '',
      findingDescription = '',
      assignedToUserId,
      deadlineHours,
      requirement = 'AQL 1.5 Workmanship Standard',
      riskSeverity,
      capRequired,
      verificationMethod = 'Physical Floor Re-inspection',
      dueDate,
    } = req.body;

    const targetSupervisorId = assignedToUserId || req.body.assignedToId;

    const now = new Date();
    let hours = Number(deadlineHours);
    if (isNaN(hours) || hours < 1) {
      hours = 16;
    }

    let deadlineTimestamp;
    if (dueDate && !isNaN(new Date(dueDate).getTime())) {
      deadlineTimestamp = new Date(dueDate);
      hours = Math.max(1, Math.round((deadlineTimestamp.getTime() - now.getTime()) / (1000 * 60 * 60)));
    } else {
      deadlineTimestamp = new Date(now.getTime() + hours * 60 * 60 * 1000);
    }

    const effectivePriority = (riskSeverity || priority || 'HIGH').toUpperCase();
    const effectiveRequirement = requirement || 'AQL 1.5 Workmanship Standard';
    const isCapRequired = String(capRequired) === 'true' || capRequired === true;
    const effectiveVerification = verificationMethod || 'Physical Floor Re-inspection';
    const rawFinding = findingDescription || description || 'Non-Conformance Observed';
    const rawWorkflowStatus = req.body.isDraft === 'true' || req.body.isDraft === true ? 'Draft' : 'Open';

    // Build enriched description to permanently preserve audit criteria and workflow status
    let enrichedDescription = rawFinding;
    if (!enrichedDescription.includes('[Audit Requirement:')) {
      enrichedDescription = `[Workflow Status: ${rawWorkflowStatus}] [Audit Requirement: ${effectiveRequirement}] [Risk: ${effectivePriority}] [CAP Required: ${isCapRequired ? 'YES' : 'NO'}] [Verification: ${effectiveVerification}]\n\n${rawFinding}`;
    } else if (!enrichedDescription.includes('[Workflow Status:')) {
      enrichedDescription = `[Workflow Status: ${rawWorkflowStatus}] ${enrichedDescription}`;
    }

    const initialCap = {
      required: isCapRequired,
      status: isCapRequired ? 'PENDING' : 'NOT_REQUIRED',
      immediateCorrection: (req.body.immediateCorrection || '').trim(),
      rootCause: (req.body.rootCause || '').trim(),
      correctiveAction: (req.body.correctiveAction || '').trim(),
      preventiveAction: (req.body.preventiveAction || '').trim(),
      responsiblePerson: null, // will be assigned to assignedToData below
      targetDate: deadlineTimestamp.toISOString().split('T')[0],
      evidence: null,
      verificationMethod: effectiveVerification,
      verificationCriteria: (req.body.verificationCriteria || 'Zero defect recurrence & standard adherence').trim(),
      verificationReadinessNotes: '',
      submittedAt: null,
      verifiedEffective: false,
      verifiedAt: null,
      verifiedBy: null,
    };

    // Extract Before Photo (memory buffer, disk file, base64 or URL)
    let beforePhotoUrl = extractPhotoPayload(req, 'beforePhoto', 'beforePhotoBase64');

    if (!beforePhotoUrl) {
      console.warn('[ComplaintController:createComplaint] No photo payload found, generating fallback standard snapshot');
      beforePhotoUrl = generateDefaultAuditPhoto(department, effectivePriority, rawFinding);
    }

    const createdByData = {
      userId: req.user?.id || req.user?._id || null,
      employeeId: req.user?.employeeId || null,
      name: req.user?.name || 'Authorized Auditor',
      role: req.user?.role || 'AUDITOR',
    };

    const lookupSupervisorId = targetSupervisorId;

    // Lookup supervisor from MongoDB or mockStore
    let supervisor = null;

    if (isMongoConnected() && lookupSupervisorId) {
      try {
        const supQuery = {
          $or: [
            { employeeId: lookupSupervisorId.toUpperCase() },
            { email: lookupSupervisorId.toLowerCase() },
          ],
        };
        if (lookupSupervisorId.match(/^[0-9a-fA-F]{24}$/)) {
          supQuery.$or.unshift({ _id: lookupSupervisorId });
        }
        const supUser = await User.findOne(supQuery).lean();
        if (supUser) {
          supervisor = { ...supUser, id: supUser._id.toString() };
        }
      } catch (e) {
        // fallback
      }
    }

    if (!supervisor && lookupSupervisorId) {
      supervisor =
        mockStore.findUserById(lookupSupervisorId) ||
        mockStore.getUsers().find((u) => u.employeeId === lookupSupervisorId) || null;
    }

    // Secondary fallback: find an active staff member in the same department
    if (!supervisor && department && isMongoConnected()) {
      try {
        const deptUser = await User.findOne({
          isActive: true,
          department: new RegExp(`^${department.trim()}$`, 'i'),
        }).lean();
        if (deptUser) {
          supervisor = { ...deptUser, id: deptUser._id.toString() };
        }
      } catch (e) {}
    }

    let reqAssigned = req.body.assignedTo;
    if (typeof reqAssigned === 'string') {
      try { reqAssigned = JSON.parse(reqAssigned); } catch (e) {}
    }

    const assignedToData = {
      userId: supervisor?.id || supervisor?._id || reqAssigned?.userId || '',
      employeeId: supervisor?.employeeId || reqAssigned?.employeeId || '',
      name: supervisor?.name || reqAssigned?.name || (department ? `${department} Line In-Charge` : 'Line Supervisor'),
      department: supervisor?.department || reqAssigned?.department || department || 'Production',
      designation: supervisor?.designation || reqAssigned?.designation || 'Department In-Charge',
      mobileNumber: supervisor?.mobileNumber || reqAssigned?.mobileNumber || '',
    };

    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    const complaintId = `CMP-${randomSuffix}`;

    const initialTimeline = [
      {
        action: rawWorkflowStatus === 'Draft' ? 'DRAFT' : 'CREATED',
        performedBy: {
          userId: createdByData.userId,
          name: createdByData.name,
          role: createdByData.role,
          employeeId: createdByData.employeeId,
        },
        notes: `NC logged for ${department || assignedToData.department} against standard "${effectiveRequirement}". Risk: ${effectivePriority}. CAP Required: ${isCapRequired ? 'YES' : 'NO'}. Verification: ${effectiveVerification}. Assigned to ${assignedToData.name} (${assignedToData.designation}) with ${hours}h SLA.`,
        timestamp: now.toISOString(),
      },
    ];

    if (isMongoConnected()) {
      try {
        const mongoPayload = {
          complaintId,
          category: category || 'Stitching Fault',
          department: department || supervisor?.department || 'Production',
          location: location || 'Production Floor',
          priority: effectivePriority,
          description: enrichedDescription,
          requirement: effectiveRequirement,
          riskSeverity: effectivePriority,
          capRequired: isCapRequired,
          verificationMethod: effectiveVerification,
          beforePhoto: beforePhotoUrl,
          afterPhoto: null,
          assignedTo: assignedToData,
          createdBy: createdByData,
          deadlineHours: hours,
          deadlineTimestamp,
          status: rawWorkflowStatus || 'Open',
          actionNotes: '',
          feedbackRemarks: '',
          rejectionReason: '',
          cap: initialCap,
          timeline: initialTimeline,
          createdAt: now,
          updatedAt: now,
        };

        initialCap.responsiblePerson = assignedToData;

        const created = await Complaint.create(mongoPayload);
        if (created) {
          const inserted = {
            ...created.toObject(),
            id: created._id.toString(),
            _id: created._id.toString(),
          };
          mockStore.createComplaint(inserted);
          return res.status(201).json({
            success: true,
            message: `NC Defect ${inserted.complaintId} created and assigned successfully.`,
            complaint: formatComplaintOutput(inserted),
          });
        }
      } catch (dbErr) {
        console.error('[ComplaintController:createComplaint] MongoDB exception:', dbErr);
        return res.status(500).json({
          success: false,
          message: `Database error: ${dbErr.message}`,
          error: dbErr.message,
        });
      }
    }

    initialCap.responsiblePerson = assignedToData;

    // Fallback when MongoDB is not connected
    const fallbackTicket = mockStore.createComplaint({
      category: category || 'Stitching Fault',
      department: department || supervisor.department || 'Production',
      location: location || 'Production Floor',
      priority: effectivePriority,
      description: enrichedDescription,
      requirement: effectiveRequirement,
      riskSeverity: effectivePriority,
      capRequired: isCapRequired,
      verificationMethod: effectiveVerification,
      beforePhoto: beforePhotoUrl,
      assignedTo: assignedToData,
      createdBy: createdByData,
      deadlineHours: hours,
      deadlineTimestamp,
      status: req.body.isDraft === 'true' || req.body.isDraft === true ? 'Draft' : 'Open',
      cap: initialCap,
    });

    return res.status(201).json({
      success: true,
      message: `NC Defect ${fallbackTicket.complaintId} created and assigned successfully (offline mode).`,
      complaint: formatComplaintOutput(fallbackTicket),
    });
  } catch (error) {
    console.error('[ComplaintController:createComplaint] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create complaint.',
      error: error.message,
    });
  }
};

// @desc    Get complaints list with RBAC filters
// @route   GET /api/complaints
// @access  Private
const getComplaints = async (req, res) => {
  try {
    const { status, category, priority, department, search, tab, deadlineCondition, deadline, recordStatus, includeDeleted } = req.query;
    const now = new Date();

    if (isMongoConnected()) {
      try {
        const query = {};

        // Record Status filter: 'all' | 'active' | 'deleted' (Preserves deleted records in reports)
        if (recordStatus === 'deleted') {
          query.isDeleted = true;
        } else if (recordStatus === 'active') {
          query.isDeleted = { $ne: true };
        } else if (recordStatus === 'all' || includeDeleted === 'true' || includeDeleted === true) {
          // Keep all records including deleted for reports
        } else if (tab && tab !== 'all') {
          // Specific workflow queue tabs exclude deleted records by default
          query.isDeleted = { $ne: true };
        }

        // RBAC filtering for Supervisor / Action Person (Strict Personal Assignment Isolation across ALL tabs)
        if (req.user && (req.user.role === 'ACTION_PERSON' || req.user.role === 'SUPERVISOR')) {
          const userEmpId = (req.user.employeeId || '').toUpperCase();
          const userId = String(req.user.id || req.user._id || '');

          const orConditions = [];
          if (userEmpId) orConditions.push({ 'assignedTo.employeeId': userEmpId });
          if (userId) orConditions.push({ 'assignedTo.userId': userId });

          if (orConditions.length > 0) {
            query.$or = orConditions;
          } else {
            query._id = null;
          }
        }

        // 1. Workflow Status / Tab filtering
        if (tab === 'draft') {
          query.status = 'Draft';
        } else if (tab === 'open') {
          query.status = { $in: ['Open', 'Assigned', 'In Progress'] };
        } else if (tab === 'cap-submitted') {
          query.status = { $in: ['CAP Submitted', 'Under Verification'] };
        } else if (tab === 'under-review') {
          query.status = 'Under Review';
        } else if (tab === 'rejected-rework') {
          query.status = { $in: ['Rejected / Rework', 'Rejected / Sent Back'] };
        } else if (tab === 'verified') {
          query.status = 'Verified';
        } else if (tab === 'closed') {
          query.status = { $in: ['Closed', 'Verified'] };
        } else if (tab === 'action-pending') {
          query.status = { $in: ['Open', 'Assigned', 'In Progress', 'Rejected / Rework', 'Rejected / Sent Back'] };
        } else if (tab === 'under-verification') {
          query.status = { $in: ['CAP Submitted', 'Under Review', 'Under Verification'] };
        } else if (tab === 'overdue') {
          query.status = { $nin: ['Closed', 'Verified'] };
          query.deadlineTimestamp = { $lt: now };
        } else if (status && status !== 'all' && status !== 'All Statuses') {
          query.status = status;
        }

        // 2. Decoupled Deadline Condition filter: Open | Overdue | Due Soon | Closed
        const dCond = deadlineCondition || deadline;
        if (dCond && dCond !== 'All Deadlines') {
          if (dCond === 'Overdue') {
            query.status = { $nin: ['Closed', 'Verified'] };
            query.deadlineTimestamp = { $lt: now };
          } else if (dCond === 'Due Soon') {
            const fourHoursLater = new Date(now.getTime() + 4 * 60 * 60 * 1000);
            query.status = { $nin: ['Closed', 'Verified'] };
            query.deadlineTimestamp = { $gte: now, $lte: fourHoursLater };
          } else if (dCond === 'Open') {
            const fourHoursLater = new Date(now.getTime() + 4 * 60 * 60 * 1000);
            query.status = { $nin: ['Closed', 'Verified'] };
            query.deadlineTimestamp = { $gt: fourHoursLater };
          } else if (dCond === 'Closed') {
            query.status = { $in: ['Closed', 'Verified'] };
          }
        }

        if (category) query.category = category;
        if (priority) query.priority = priority;
        if (department) query.department = department;

        if (search) {
          const s = new RegExp(search, 'i');
          const searchConditions = [
            { complaintId: s },
            { location: s },
            { description: s },
            { category: s },
            { 'assignedTo.name': s },
          ];
          if (query.$or) {
            query.$and = [{ $or: query.$or }, { $or: searchConditions }];
            delete query.$or;
          } else {
            query.$or = searchConditions;
          }
        }

        const data = await Complaint.find(query).sort({ createdAt: -1 }).lean();

        if (data) {
          mockStore.syncWithDB(data);

          return res.status(200).json({
            success: true,
            count: data.length,
            complaints: data.map(formatComplaintOutput),
          });
        }
      } catch (dbErr) {
        console.error('[ComplaintController:getComplaints] MongoDB query exception:', dbErr.message);
        return res.status(500).json({
          success: false,
          message: 'Database query exception: ' + dbErr.message,
          error: dbErr.message,
        });
      }
    }

    // Fallback store
    const complaints = mockStore.getComplaints(req.query, req.user);
    res.status(200).json({
      success: true,
      count: complaints.length,
      complaints: complaints.map(formatComplaintOutput),
    });
  } catch (error) {
    console.error('[ComplaintController:getComplaints] Error:', error);
    const complaints = mockStore.getComplaints(req.query, req.user);
    res.status(200).json({
      success: true,
      count: complaints.length,
      complaints: complaints.map(formatComplaintOutput),
    });
  }
};

// @desc    Get single complaint detail by ID
// @route   GET /api/complaints/:id
// @access  Private
const getComplaintById = async (req, res) => {
  try {
    const paramId = req.params.id;

    if (isMongoConnected()) {
      try {
        const query = { $or: [{ complaintId: paramId }] };
        if (paramId && typeof paramId === 'string' && paramId.match(/^[0-9a-fA-F]{24}$/)) {
          query.$or.push({ _id: paramId });
        }
        const data = await Complaint.findOne(query).lean();

        if (data) {
          // Strict RBAC Isolation: If requester is a Supervisor or Action Person, verify this specific NC was assigned to them
          if (req.user && (req.user.role === 'SUPERVISOR' || req.user.role === 'ACTION_PERSON')) {
            const userEmpId = (req.user.employeeId || '').toUpperCase();
            const userId = String(req.user.id || req.user._id || '');
            let assignedEmpId = '';
            let assignedUserId = '';
            if (data.assignedTo) {
              const assigned = typeof data.assignedTo === 'string' ? JSON.parse(data.assignedTo) : data.assignedTo;
              assignedEmpId = (assigned.employeeId || '').toUpperCase();
              assignedUserId = String(assigned.userId || assigned._id || '');
            }
            const isAssigned = (userEmpId && assignedEmpId && userEmpId === assignedEmpId) ||
                               (userId && assignedUserId && userId === assignedUserId);
            if (!isAssigned) {
              return res.status(403).json({
                success: false,
                message: "Access Denied: You are not authorized to view or access another supervisor's assigned NC record or CAP details.",
              });
            }
          }

          return res.status(200).json({
            success: true,
            complaint: formatComplaintOutput(data),
          });
        }
      } catch (dbErr) {
        console.error('[ComplaintController:getComplaintById] MongoDB error:', dbErr.message);
      }
    }

    const complaint = mockStore.getComplaintById(paramId);
    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint ticket not found.',
      });
    }

    // Strict RBAC Isolation for fallback store
    if (req.user && (req.user.role === 'SUPERVISOR' || req.user.role === 'ACTION_PERSON')) {
      const userEmpId = (req.user.employeeId || '').toUpperCase();
      const userId = String(req.user.id || req.user._id || '');
      let assignedEmpId = '';
      let assignedUserId = '';
      if (complaint.assignedTo) {
        const assigned = typeof complaint.assignedTo === 'string' ? JSON.parse(complaint.assignedTo) : complaint.assignedTo;
        assignedEmpId = (assigned.employeeId || '').toUpperCase();
        assignedUserId = String(assigned.userId || assigned._id || '');
      }
      const isAssigned = (userEmpId && assignedEmpId && userEmpId === assignedEmpId) ||
                         (userId && assignedUserId && userId === assignedUserId);
      if (!isAssigned) {
        return res.status(403).json({
          success: false,
          message: "Access Denied: You are not authorized to view or access another supervisor's assigned NC record or CAP details.",
        });
      }
    }

    res.status(200).json({
      success: true,
      complaint: formatComplaintOutput(complaint),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching complaint details.',
      error: error.message,
    });
  }
};

const markInProgress = async (req, res) => {
  try {
    if (req.user && req.user.role === 'AUDITOR') {
      return res.status(403).json({
        success: false,
        message: 'Access Denied: Auditors cannot start floor containment tasks. Start and Stop work is reserved for Department Supervisors.',
      });
    }
    const paramId = req.params.id;
    const now = new Date();

    const startedBy = {
      name: req.user?.name || 'Line Supervisor',
      role: req.user?.role || 'SUPERVISOR',
      employeeId: req.user?.employeeId || '',
      department: req.user?.department || '',
      userId: req.user?._id ? req.user._id.toString() : (req.user?.id || ''),
    };

    if (isMongoConnected()) {
      try {
        const query = { $or: [{ complaintId: paramId }] };
        if (paramId && typeof paramId === 'string' && paramId.match(/^[0-9a-fA-F]{24}$/)) {
          query.$or.push({ _id: paramId });
        }
        const current = await Complaint.findOne(query);

        if (current) {
          if (current.status === 'Closed') {
            return res.status(400).json({
              success: false,
              message: 'Cannot modify a closed complaint.',
            });
          }

          const timeline = parseTimeline(current.timeline);
          timeline.push({
            action: 'IN_PROGRESS',
            performedBy: {
              name: req.user.name,
              role: req.user.role,
              employeeId: req.user.employeeId,
            },
            notes: `Supervisor ${req.user.name} initiated live floor containment. Reflected as Busy in Progress on Live Work Operations.`,
            timestamp: now.toISOString(),
          });

          current.status = 'In Progress';
          current.startedAt = now;
          current.startedBy = startedBy;
          if (!current.assignedTo?.name || !current.assignedTo?.employeeId) {
            current.assignedTo = startedBy;
          }
          current.description = setWorkflowStatusInDescription(current.description, 'In Progress');
          current.timeline = timeline;
          current.updatedAt = now;

          const updated = await current.save();
          mockStore.updateComplaint(current._id.toString(), current.toObject());
          return res.status(200).json({
            success: true,
            message: `Complaint ${updated.complaintId} marked In Progress. Reflected to Live Work Operations as Busy in Progress.`,
            complaint: formatComplaintOutput(updated.toObject()),
          });
        }
      } catch (dbErr) {
        console.error('[ComplaintController:markInProgress] MongoDB exception:', dbErr.message);
      }
    }

    // Fallback to mockStore
    const complaint = mockStore.findComplaintById(paramId);
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }
    const timeline = parseTimeline(complaint.timeline);
    timeline.push({
      action: 'IN_PROGRESS',
      performedBy: {
        name: req.user.name,
        role: req.user.role,
        employeeId: req.user.employeeId,
      },
      notes: `Supervisor ${req.user.name} initiated live floor containment. Reflected as Busy in Progress on Live Work Operations.`,
      timestamp: now.toISOString(),
    });
    const updated = mockStore.updateComplaint(complaint.id, {
      status: 'In Progress',
      startedAt: now.toISOString(),
      startedBy,
      assignedTo: (!complaint.assignedTo?.name || !complaint.assignedTo?.employeeId) ? startedBy : complaint.assignedTo,
      timeline,
      updatedAt: now.toISOString(),
    });
    return res.status(200).json({
      success: true,
      message: `Complaint ${updated.complaintId} marked In Progress. Reflected to Live Work Operations as Busy in Progress.`,
      complaint: formatComplaintOutput(updated),
    });
  } catch (error) {
    console.error('[ComplaintController:markInProgress] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error marking complaint in progress.',
    });
  }
};

// @desc    Pause / Stop floor containment and return NC to Open status
// @route   PATCH /api/complaints/:id/stop-work
// @access  Private (Action Person, Supervisor, Auditor, Admin)
const pauseProgress = async (req, res) => {
  try {
    if (req.user && req.user.role === 'AUDITOR') {
      return res.status(403).json({
        success: false,
        message: 'Access Denied: Auditors cannot pause floor containment tasks. Start and Stop work is reserved for Department Supervisors.',
      });
    }
    const paramId = req.params.id;
    const { reason } = req.body || {};
    const now = new Date();

    if (isMongoConnected()) {
      try {
        const query = { $or: [{ complaintId: paramId }] };
        if (paramId && typeof paramId === 'string' && paramId.match(/^[0-9a-fA-F]{24}$/)) {
          query.$or.push({ _id: paramId });
        }
        const current = await Complaint.findOne(query);

        if (current) {
          if (current.status === 'Closed') {
            return res.status(400).json({
              success: false,
              message: 'Cannot modify a closed complaint.',
            });
          }

          const timeline = parseTimeline(current.timeline);
          timeline.push({
            action: 'WORK_STOPPED',
            performedBy: {
              name: req.user.name,
              role: req.user.role,
              employeeId: req.user.employeeId,
            },
            notes: reason || `Supervisor ${req.user.name} paused floor containment. Work status reverted to Available.`,
            timestamp: now.toISOString(),
          });

          current.status = 'Open';
          current.startedAt = null;
          current.description = setWorkflowStatusInDescription(current.description, 'Open');
          current.timeline = timeline;
          current.updatedAt = now;

          const updated = await current.save();
          mockStore.updateComplaint(current._id.toString(), current.toObject());
          return res.status(200).json({
            success: true,
            message: `Complaint ${updated.complaintId} floor containment paused. Live work status reset to Available.`,
            complaint: formatComplaintOutput(updated.toObject()),
          });
        }
      } catch (dbErr) {
        console.error('[ComplaintController:pauseProgress] MongoDB exception:', dbErr.message);
      }
    }

    // Fallback to mockStore
    const complaint = mockStore.findComplaintById(paramId);
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }
    const timeline = parseTimeline(complaint.timeline);
    timeline.push({
      action: 'WORK_STOPPED',
      performedBy: {
        name: req.user.name,
        role: req.user.role,
        employeeId: req.user.employeeId,
      },
      notes: reason || `Supervisor ${req.user.name} paused floor containment. Work status reverted to Available.`,
      timestamp: now.toISOString(),
    });
    const updated = mockStore.updateComplaint(complaint.id, {
      status: 'Open',
      startedAt: null,
      timeline,
      updatedAt: now.toISOString(),
    });
    return res.status(200).json({
      success: true,
      message: `Complaint ${updated.complaintId} floor containment paused. Live work status reset to Available.`,
      complaint: formatComplaintOutput(updated),
    });
  } catch (error) {
    console.error('[ComplaintController:pauseProgress] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error pausing floor containment on complaint.',
    });
  }
};

// @desc    Submit action resolution with mandatory After Photo proof & feedback
// @route   POST /api/complaints/:id/submit-action
// @access  Private (Action Person, Supervisor, Auditor, Admin)
const submitAction = async (req, res) => {
  try {
    const paramId = req.params.id;
    const {
      actionNotes,
      feedbackRemarks,
      immediateCorrection,
      rootCause,
      correctiveAction,
      preventiveAction,
      responsiblePerson,
      targetDate,
      verificationReadinessNotes,
    } = req.body;
    const now = new Date();

    const afterPhotoUrl = extractPhotoPayload(req, 'afterPhoto', 'afterPhotoBase64');

    if (!afterPhotoUrl) {
      return res.status(400).json({
        success: false,
        message: 'Mandatory After Photo proof (Evidence) is required to submit defect resolution.',
      });
    }

    const finalImmediateCorrection = (immediateCorrection || '').trim() || (actionNotes || '').trim();
    const finalCorrectiveAction = (correctiveAction || '').trim() || (actionNotes || '').trim();
    const finalRootCause = (rootCause || '').trim() || (feedbackRemarks || '').trim();
    const finalPreventiveAction = (preventiveAction || '').trim() || (feedbackRemarks || '').trim();

    if (!finalImmediateCorrection && !finalCorrectiveAction && !actionNotes) {
      return res.status(400).json({
        success: false,
        message: 'Immediate Correction and Corrective Action details are mandatory for CAP.',
      });
    }

    if (!finalRootCause && !finalPreventiveAction && !feedbackRemarks) {
      return res.status(400).json({
        success: false,
        message: 'Root Cause Analysis and Preventive Action are mandatory for QMS compliance.',
      });
    }

    // Synthesize readable legacy text blocks while preserving exact CAP headers
    const finalActionNotes =
      actionNotes && actionNotes.includes('[Immediate Correction]')
        ? actionNotes
        : [
            finalImmediateCorrection ? `[Immediate Correction]: ${finalImmediateCorrection}` : '',
            finalCorrectiveAction ? `[Corrective Action]: ${finalCorrectiveAction}` : '',
          ].filter(Boolean).join('\n\n') || actionNotes || finalImmediateCorrection || 'Correction Completed';

    const finalFeedbackRemarks =
      feedbackRemarks && feedbackRemarks.includes('[Root Cause]')
        ? feedbackRemarks
        : [
            finalRootCause ? `[Root Cause]: ${finalRootCause}` : '',
            finalPreventiveAction ? `[Preventive Action]: ${finalPreventiveAction}` : '',
          ].filter(Boolean).join('\n\n') || feedbackRemarks || finalRootCause || 'Preventive Action Implemented';

    let respPerson = null;
    if (responsiblePerson) {
      try {
        respPerson = typeof responsiblePerson === 'string' ? JSON.parse(responsiblePerson) : responsiblePerson;
      } catch (e) {
        respPerson = null;
      }
    }
    if (!respPerson) {
      respPerson = {
        userId: req.user?.id || req.user?._id || '',
        employeeId: req.user?.employeeId || '',
        name: req.user?.name || '',
        role: req.user?.role || 'ACTION_PERSON',
        department: req.user?.department || '',
        designation: req.user?.designation || '',
      };
    }

    const structuredCap = {
      required: true,
      status: 'SUBMITTED',
      immediateCorrection: finalImmediateCorrection,
      rootCause: finalRootCause,
      correctiveAction: finalCorrectiveAction,
      preventiveAction: finalPreventiveAction,
      responsiblePerson: respPerson,
      targetDate: targetDate || now.toISOString().split('T')[0],
      evidence: afterPhotoUrl,
      verificationReadinessNotes: (verificationReadinessNotes || '').trim(),
      submittedAt: now.toISOString(),
      verifiedEffective: false,
    };

    if (isMongoConnected()) {
      try {
        const query = { $or: [{ complaintId: paramId }] };
        if (paramId && typeof paramId === 'string' && paramId.match(/^[0-9a-fA-F]{24}$/)) {
          query.$or.push({ _id: paramId });
        }
        const current = await Complaint.findOne(query);

        if (current) {
          if (current.status === 'Closed') {
            return res.status(400).json({
              success: false,
              message: 'Complaint has already been closed by audit.',
            });
          }

          const timeline = parseTimeline(current.timeline);
          timeline.push({
            action: 'ACTION_SUBMITTED',
            performedBy: {
              name: req.user.name,
              role: req.user.role,
              employeeId: req.user.employeeId,
            },
            notes: `CAP submitted for audit verification:\n• Immediate Correction: ${finalImmediateCorrection}\n• Root Cause: ${finalRootCause}\n• Corrective Action: ${finalCorrectiveAction}\n• Preventive Action: ${finalPreventiveAction}\n• Responsible: ${respPerson.name} (${respPerson.department})`,
            timestamp: now.toISOString(),
          });

          current.afterPhoto = afterPhotoUrl;
          current.actionNotes = finalActionNotes;
          current.feedbackRemarks = finalFeedbackRemarks;
          current.actualCompletedAt = now;
          current.status = 'CAP Submitted';
          current.cap = structuredCap;
          current.description = setWorkflowStatusInDescription(current.description, 'CAP Submitted');
          current.timeline = timeline;
          current.updatedAt = now;

          const updated = await current.save();
          mockStore.updateComplaint(current._id.toString(), {
            ...current.toObject(),
            cap: structuredCap,
            immediateCorrection: finalImmediateCorrection,
            rootCause: finalRootCause,
            correctiveAction: finalCorrectiveAction,
            preventiveAction: finalPreventiveAction,
          });

          return res.status(200).json({
            success: true,
            message: `CAP Resolution for NC ${updated.complaintId} submitted successfully and queued for audit verification.`,
            complaint: formatComplaintOutput(updated.toObject()),
          });
        }
      } catch (dbErr) {
        console.error('[ComplaintController:submitAction] MongoDB exception:', dbErr.message);
      }
    }

    const complaint = mockStore.getComplaintById(paramId);
    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found.',
      });
    }

    if (complaint.status === 'Closed') {
      return res.status(400).json({
        success: false,
        message: 'Complaint has already been closed by audit.',
      });
    }

    complaint.afterPhoto = afterPhotoUrl;
    complaint.actionNotes = finalActionNotes;
    complaint.feedbackRemarks = finalFeedbackRemarks;
    complaint.immediateCorrection = finalImmediateCorrection;
    complaint.rootCause = finalRootCause;
    complaint.correctiveAction = finalCorrectiveAction;
    complaint.preventiveAction = finalPreventiveAction;
    complaint.capResponsiblePerson = respPerson;
    complaint.capTargetDate = targetDate || now.toISOString();
    complaint.cap = structuredCap;
    complaint.actualCompletedAt = now;
    complaint.status = 'CAP Submitted';
    complaint.timeline.push({
      action: 'ACTION_SUBMITTED',
      performedBy: {
        name: req.user.name,
        role: req.user.role,
        employeeId: req.user.employeeId,
      },
      notes: `CAP submitted for audit verification:\n• Immediate Correction: ${finalImmediateCorrection}\n• Root Cause: ${finalRootCause}\n• Corrective Action: ${finalCorrectiveAction}\n• Preventive Action: ${finalPreventiveAction}\n• Responsible: ${respPerson.name} (${respPerson.department})`,
      timestamp: now,
    });
    mockStore.updateComplaint(complaint._id, complaint);

    return res.status(200).json({
      success: true,
      message: `Resolution for ${complaint.complaintId} submitted for audit verification.`,
      complaint: formatComplaintOutput(complaint),
    });
  } catch (error) {
    console.error('[ComplaintController:submitAction] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit action resolution.',
      error: error.message,
    });
  }
};

// @desc    Audit Verification Gateway: Approve & Close OR Reject & Return
// @route   POST /api/complaints/:id/verify
// @access  Private (Auditor only)
const verifyComplaint = async (req, res) => {
  try {
    const paramId = req.params.id;
    const { decision, notes, rejectionReason } = req.body;
    const now = new Date();

    if (!['APPROVE', 'REJECT', 'VERIFY', 'START_REVIEW', 'CLOSE'].includes(decision)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification decision. Must be APPROVE, CLOSE, VERIFY, START_REVIEW, or REJECT.',
      });
    }

    if (decision === 'REJECT' && !rejectionReason && !notes) {
      return res.status(400).json({
        success: false,
        message: 'A rejection reason is mandatory when returning a complaint to the line.',
      });
    }

    if (isMongoConnected()) {
      try {
        const query = { $or: [{ complaintId: paramId }] };
        if (paramId && typeof paramId === 'string' && paramId.match(/^[0-9a-fA-F]{24}$/)) {
          query.$or.push({ _id: paramId });
        }
        const current = await Complaint.findOne(query);

        if (current) {
          const timeline = parseTimeline(current.timeline);
          let newStatus = current.status;
          const capUpdate = (current.cap && typeof current.cap === 'object') ? (current.cap.toObject ? current.cap.toObject() : { ...current.cap }) : {};

          if (decision === 'START_REVIEW') {
            newStatus = 'Under Review';
            capUpdate.status = 'UNDER_REVIEW';
            timeline.push({
              action: 'UNDER_REVIEW',
              performedBy: {
                name: req.user.name,
                role: req.user.role,
                employeeId: req.user.employeeId,
              },
              notes: notes || 'Auditor initiated review and on-site audit of submitted CAP.',
              timestamp: now.toISOString(),
            });
          } else if (decision === 'VERIFY') {
            newStatus = 'Verified';
            capUpdate.status = 'VERIFIED_EFFECTIVE';
            capUpdate.verifiedEffective = true;
            capUpdate.verifiedAt = now.toISOString();
            capUpdate.verifiedBy = req.user.name;
            capUpdate.verificationNotes = notes || 'Audit verified that CAP actions are effective on the shop floor.';
            timeline.push({
              action: 'VERIFIED',
              performedBy: {
                name: req.user.name,
                role: req.user.role,
                employeeId: req.user.employeeId,
              },
              notes: notes || 'Audit verified that CAP actions are effective on the shop floor.',
              timestamp: now.toISOString(),
            });
          } else if (decision === 'APPROVE' || decision === 'CLOSE') {
            newStatus = 'Closed';
            current.actualCompletedAt = now;
            current.rejectionReason = '';
            capUpdate.status = 'CLOSED';
            capUpdate.verifiedEffective = true;
            capUpdate.verifiedAt = now.toISOString();
            capUpdate.verifiedBy = req.user.name;
            capUpdate.verificationNotes = notes || 'Audit verified Before/After photos and approved closure of ticket.';
            timeline.push({
              action: 'CLOSED',
              performedBy: {
                name: req.user.name,
                role: req.user.role,
                employeeId: req.user.employeeId,
              },
              notes: notes || 'Audit verified Before/After photos and approved closure of ticket.',
              timestamp: now.toISOString(),
            });
          } else {
            const reason = rejectionReason || notes;
            newStatus = 'Rejected / Rework';
            current.rejectionReason = reason;
            capUpdate.status = 'REJECTED';
            capUpdate.verifiedEffective = false;
            capUpdate.rejectionReason = reason;
            timeline.push({
              action: 'REJECTED',
              performedBy: {
                name: req.user.name,
                role: req.user.role,
                employeeId: req.user.employeeId,
              },
              notes: `Audit rejected resolution and returned to line for rework. Reason: ${reason}`,
              timestamp: now.toISOString(),
            });
          }

          current.status = newStatus;
          current.cap = capUpdate;
          current.description = setWorkflowStatusInDescription(current.description, newStatus);
          current.timeline = timeline;
          current.updatedAt = now;

          const updated = await current.save();
          mockStore.updateComplaint(current._id.toString(), current.toObject());

          const actionLabel =
            decision === 'START_REVIEW'
              ? 'moved to Under Review'
              : decision === 'VERIFY'
              ? 'verified as effective'
              : decision === 'APPROVE' || decision === 'CLOSE'
              ? 'approved and closed'
              : 'sent back for rework';

          return res.status(200).json({
            success: true,
            message: `NC Defect ${updated.complaintId} successfully ${actionLabel}.`,
            complaint: formatComplaintOutput(updated.toObject()),
          });
        }
      } catch (dbErr) {
        console.error('[ComplaintController:verifyComplaint] MongoDB exception:', dbErr.message);
      }
    }

    // Fallback to mockStore
    const complaint = mockStore.findComplaintById(paramId);
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }

    const timeline = parseTimeline(complaint.timeline);
    let newStatus = complaint.status;
    const capUpdate = (complaint.cap && typeof complaint.cap === 'object') ? { ...complaint.cap } : {};

    if (decision === 'START_REVIEW') {
      newStatus = 'Under Review';
      capUpdate.status = 'UNDER_REVIEW';
      timeline.push({
        action: 'UNDER_REVIEW',
        performedBy: {
          name: req.user.name,
          role: req.user.role,
          employeeId: req.user.employeeId,
        },
        notes: notes || 'Auditor initiated review and on-site audit of submitted CAP.',
        timestamp: now.toISOString(),
      });
    } else if (decision === 'VERIFY') {
      newStatus = 'Verified';
      capUpdate.status = 'VERIFIED_EFFECTIVE';
      capUpdate.verifiedEffective = true;
      capUpdate.verifiedAt = now.toISOString();
      capUpdate.verifiedBy = req.user.name;
      timeline.push({
        action: 'VERIFIED',
        performedBy: {
          name: req.user.name,
          role: req.user.role,
          employeeId: req.user.employeeId,
        },
        notes: notes || 'Audit verified that CAP actions are effective on the shop floor.',
        timestamp: now.toISOString(),
      });
    } else if (decision === 'APPROVE' || decision === 'CLOSE') {
      newStatus = 'Closed';
      capUpdate.status = 'CLOSED';
      capUpdate.verifiedEffective = true;
      capUpdate.verifiedAt = now.toISOString();
      capUpdate.verifiedBy = req.user.name;
      timeline.push({
        action: 'CLOSED',
        performedBy: {
          name: req.user.name,
          role: req.user.role,
          employeeId: req.user.employeeId,
        },
        notes: notes || 'Audit verified Before/After photos and approved closure of ticket.',
        timestamp: now.toISOString(),
      });
    } else {
      const reason = rejectionReason || notes;
      newStatus = 'Rejected / Rework';
      capUpdate.status = 'REJECTED';
      capUpdate.verifiedEffective = false;
      capUpdate.rejectionReason = reason;
      timeline.push({
        action: 'REJECTED',
        performedBy: {
          name: req.user.name,
          role: req.user.role,
          employeeId: req.user.employeeId,
        },
        notes: `Audit rejected resolution and returned to line for rework. Reason: ${reason}`,
        timestamp: now.toISOString(),
      });
    }

    const updated = mockStore.updateComplaint(complaint.id, {
      status: toDbStatus(newStatus),
      cap: capUpdate,
      timeline,
      actualCompletedAt: decision === 'APPROVE' || decision === 'CLOSE' ? now.toISOString() : undefined,
      updatedAt: now.toISOString(),
    });

    return res.status(200).json({
      success: true,
      message: `Complaint ${updated.complaintId} has been ${
        decision === 'VERIFY'
          ? 'Verified Effective'
          : decision === 'APPROVE' || decision === 'CLOSE'
          ? 'Approved & Closed'
          : decision === 'START_REVIEW'
          ? 'placed Under Review'
          : 'Rejected & Returned to line'
      }.`,
      complaint: formatComplaintOutput(updated),
    });
  } catch (error) {
    console.error('[ComplaintController:verifyComplaint] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error verifying complaint.',
    });
  }
};

// @desc    Add direct remark/comment to ticket timeline
// @route   POST /api/complaints/:id/timeline
// @access  Private
const addTimelineComment = async (req, res) => {
  try {
    const paramId = req.params.id;
    const { comment } = req.body;
    const now = new Date();

    if (!comment || !comment.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Comment text cannot be empty.',
      });
    }

    if (isMongoConnected()) {
      try {
        const query = { $or: [{ complaintId: paramId }] };
        if (paramId && typeof paramId === 'string' && paramId.match(/^[0-9a-fA-F]{24}$/)) {
          query.$or.push({ _id: paramId });
        }
        const current = await Complaint.findOne(query);

        if (current) {
          const timeline = parseTimeline(current.timeline);
          timeline.push({
            action: 'COMMENT_ADDED',
            performedBy: {
              name: req.user.name,
              role: req.user.role,
              employeeId: req.user.employeeId,
            },
            notes: comment.trim(),
            timestamp: now.toISOString(),
          });

          current.timeline = timeline;
          current.updatedAt = now;
          const updated = await current.save();

          mockStore.updateComplaint(current._id.toString(), {
            timeline,
            updatedAt: now.toISOString(),
          });

          return res.status(200).json({
            success: true,
            message: 'Remark posted to timeline successfully.',
            timeline,
            complaint: formatComplaintOutput(updated.toObject()),
          });
        }
      } catch (dbErr) {
        console.error('[ComplaintController:addTimelineComment] MongoDB error:', dbErr.message);
      }
    }

    const complaint = mockStore.getComplaintById(paramId);
    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found.',
      });
    }

    complaint.timeline.push({
      action: 'COMMENT_ADDED',
      performedBy: {
        name: req.user.name,
        role: req.user.role,
        employeeId: req.user.employeeId,
      },
      notes: comment.trim(),
      timestamp: now,
    });
    mockStore.updateComplaint(complaint._id, complaint);

    return res.status(200).json({
      success: true,
      message: 'Remark recorded in ticket audit trail.',
      timeline: complaint.timeline,
      complaint: formatComplaintOutput(complaint),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to append comment to timeline.',
      error: error.message,
    });
  }
};

// @desc    Get KPI metrics for dashboard cards
// @route   GET /api/complaints/stats/kpi
// @access  Private
const getKpiStats = async (req, res) => {
  try {
    const now = new Date();

    if (isMongoConnected()) {
      try {
        const query = { isDeleted: { $ne: true } };

        if (req.user && (req.user.role === 'ACTION_PERSON' || req.user.role === 'SUPERVISOR')) {
          const userEmpId = (req.user.employeeId || '').toUpperCase();
          const userId = String(req.user.id || req.user._id || '');

          const orConditions = [];
          if (userEmpId) orConditions.push({ 'assignedTo.employeeId': userEmpId });
          if (userId) orConditions.push({ 'assignedTo.userId': userId });

          if (orConditions.length > 0) {
            query.$or = orConditions;
          } else {
            query._id = null;
          }
        }

        const allComplaints = await Complaint.find(query).select('status deadlineTimestamp assignedTo department isDeleted').lean();

        if (allComplaints) {
          const draftTickets = allComplaints.filter((c) => c.status === 'Draft').length;
          const openTickets = allComplaints.filter((c) => ['Open', 'Assigned', 'In Progress'].includes(c.status)).length;
          const capSubmitted = allComplaints.filter((c) => ['CAP Submitted', 'Under Verification'].includes(c.status)).length;
          const underReview = allComplaints.filter((c) => c.status === 'Under Review').length;
          const rejectedRework = allComplaints.filter((c) => ['Rejected / Rework', 'Rejected / Sent Back'].includes(c.status)).length;
          const verifiedTickets = allComplaints.filter((c) => c.status === 'Verified').length;
          const closedTickets = allComplaints.filter((c) => c.status === 'Closed').length;

          const overdueCount = allComplaints.filter(
            (c) => !['Closed', 'Verified'].includes(c.status) && new Date(c.deadlineTimestamp) < now
          ).length;
          const dueSoonCount = allComplaints.filter((c) => {
            if (['Closed', 'Verified'].includes(c.status)) return false;
            const diff = new Date(c.deadlineTimestamp) - now;
            return diff >= 0 && diff <= 4 * 3600 * 1000;
          }).length;
          const openDeadlineCount = allComplaints.filter((c) => {
            if (['Closed', 'Verified'].includes(c.status)) return false;
            const diff = new Date(c.deadlineTimestamp) - now;
            return diff > 4 * 3600 * 1000;
          }).length;

          return res.status(200).json({
            success: true,
            metrics: {
              total: allComplaints.length,
              draft: draftTickets,
              open: openTickets,
              capSubmitted,
              underReview,
              rejectedRework,
              verified: verifiedTickets,
              closed: closedTickets,
              activeTickets: openTickets + rejectedRework,
              underVerification: capSubmitted + underReview,
              closedTickets: closedTickets + verifiedTickets,
              overdueCount,
              dueSoonCount,
              openDeadlineCount,
              closedDeadlineCount: closedTickets + verifiedTickets,
            },
          });
        }
      } catch (dbErr) {
        console.error('[ComplaintController:getKpiStats] MongoDB error:', dbErr.message);
      }
    }

    const allComplaints = mockStore.getComplaints().filter((c) => !c.isDeleted);
    const draftTickets = allComplaints.filter((c) => c.status === 'Draft').length;
    const openTickets = allComplaints.filter((c) => ['Open', 'Assigned', 'In Progress'].includes(c.status)).length;
    const capSubmitted = allComplaints.filter((c) => ['CAP Submitted', 'Under Verification'].includes(c.status)).length;
    const underReview = allComplaints.filter((c) => c.status === 'Under Review').length;
    const rejectedRework = allComplaints.filter((c) => ['Rejected / Rework', 'Rejected / Sent Back'].includes(c.status)).length;
    const verifiedTickets = allComplaints.filter((c) => c.status === 'Verified').length;
    const closedTickets = allComplaints.filter((c) => c.status === 'Closed').length;

    const overdueCount = allComplaints.filter(
      (c) => !['Closed', 'Verified'].includes(c.status) && new Date(c.deadlineTimestamp) < now
    ).length;
    const dueSoonCount = allComplaints.filter((c) => {
      if (['Closed', 'Verified'].includes(c.status)) return false;
      const diff = new Date(c.deadlineTimestamp) - now;
      return diff >= 0 && diff <= 4 * 3600 * 1000;
    }).length;
    const openDeadlineCount = allComplaints.filter((c) => {
      if (['Closed', 'Verified'].includes(c.status)) return false;
      const diff = new Date(c.deadlineTimestamp) - now;
      return diff > 4 * 3600 * 1000;
    }).length;

    res.status(200).json({
      success: true,
      metrics: {
        total: allComplaints.length,
        draft: draftTickets,
        open: openTickets,
        capSubmitted,
        underReview,
        rejectedRework,
        verified: verifiedTickets,
        closed: closedTickets,
        activeTickets: openTickets + rejectedRework,
        underVerification: capSubmitted + underReview,
        closedTickets: closedTickets + verifiedTickets,
        overdueCount,
        dueSoonCount,
        openDeadlineCount,
        closedDeadlineCount: closedTickets + verifiedTickets,
      },
    });
  } catch (error) {
    const allComplaints = mockStore.getComplaints();
    const now = new Date();
    res.status(200).json({
      success: true,
      metrics: {
        total: allComplaints.length,
        activeTickets: allComplaints.filter((c) => ['Assigned', 'In Progress'].includes(c.status)).length,
        underVerification: allComplaints.filter((c) => c.status === 'Under Verification').length,
        closedTickets: allComplaints.filter((c) => c.status === 'Closed').length,
        overdueCount: allComplaints.filter((c) => c.status !== 'Closed' && new Date(c.deadlineTimestamp) < now).length,
      },
    });
  }
};

// @desc    Get executive oversight metrics for Admin monitoring Auditor and Supervisor activities and inactions
// @route   GET /api/complaints/admin/oversight
// @access  Private (Admin or Auditor)
const getAdminOversightStats = async (req, res) => {
  try {
    const now = new Date();

    let allComplaints = [];
    let allUsers = [];

    if (isMongoConnected()) {
      try {
        const [complaintsDocs, usersDocs] = await Promise.all([
          Complaint.find({ isDeleted: { $ne: true } }).sort({ createdAt: -1 }).lean(),
          User.find({ isActive: true }).lean(),
        ]);

        if (complaintsDocs) {
          allComplaints = complaintsDocs.map(formatComplaintOutput);
        }
        if (usersDocs) {
          allUsers = usersDocs.map((u) => ({ ...u, _id: u._id.toString(), id: u._id.toString() }));
        }
      } catch (dbErr) {
        console.warn('[ComplaintController:getAdminOversightStats] MongoDB notice:', dbErr.message);
      }
    }

    // If zero complaints, keep genuine empty data (do not inject mock data)
    if (allUsers.length === 0) {
      allUsers = mockStore.getUsers();
    }

    const auditors = allUsers.filter((u) => u.role === 'AUDITOR');
    const supervisors = allUsers.filter(
      (u) => u.role === 'ACTION_PERSON' || u.role === 'SUPERVISOR'
    );

    const breachedTickets = allComplaints.filter(
      (c) => c.status !== 'Closed' && new Date(c.deadlineTimestamp) < now
    );
    const unstartedTickets = allComplaints.filter((c) => ['Open', 'Assigned'].includes(c.status));
    const pendingVerificationTickets = allComplaints.filter((c) =>
      ['CAP Submitted', 'Under Review', 'Verified', 'Under Verification'].includes(c.status)
    );
    const rejectedTickets = allComplaints.filter((c) =>
      ['Rejected / Rework', 'Rejected / Sent Back'].includes(c.status)
    );
    const closed = allComplaints.filter((c) => c.status === 'Closed');

    const auditorActivity = {
      totalDefectsLogged: allComplaints.length,
      severityBreakdown: {
        critical: allComplaints.filter((c) => c.priority === 'CRITICAL').length,
        high: allComplaints.filter((c) => c.priority === 'HIGH').length,
        medium: allComplaints.filter((c) => c.priority === 'MEDIUM').length,
        low: allComplaints.filter((c) => c.priority === 'LOW').length,
      },
      pendingAuditorSignOff: pendingVerificationTickets.length,
      closedComplaints: closed.length,
      rejectedCount: rejectedTickets.length,
      auditorsList: auditors.map((aud) => {
        const loggedByAud = allComplaints.filter(
          (c) =>
            c.createdBy?.employeeId === aud.employeeId ||
            (aud._id && c.createdBy?.userId === aud._id.toString())
        );
        return {
          _id: aud._id || aud.id,
          name: aud.name,
          employeeId: aud.employeeId,
          department: aud.department,
          designation: aud.designation,
          email: aud.email,
          mobileNumber: aud.mobileNumber,
          ticketsLogged: loggedByAud.length,
        };
      }),
    };

    const supervisorScorecard = supervisors.map((sup) => {
      const assignedTickets = allComplaints.filter((c) => {
        const cAssignedId = c.assignedTo?.userId ? c.assignedTo.userId.toString() : '';
        const cAssignedEmp = (c.assignedTo?.employeeId || '').toUpperCase();
        const supEmp = (sup.employeeId || '').toUpperCase();
        const cDept = (c.department || '').trim().toLowerCase();
        const supDept = (sup.department || '').trim().toLowerCase();

        return (
          (sup._id && cAssignedId === sup._id.toString()) ||
          (supEmp && cAssignedEmp === supEmp)
        );
      });

      const unstarted = assignedTickets.filter((c) => ['Open', 'Assigned'].includes(c.status));
      const inProgress = assignedTickets.filter((c) => c.status === 'In Progress');
      const underVerification = assignedTickets.filter((c) =>
        ['CAP Submitted', 'Under Review', 'Verified', 'Under Verification'].includes(c.status)
      );
      const closedTickets = assignedTickets.filter((c) => c.status === 'Closed');
      const rejected = assignedTickets.filter((c) =>
        ['Rejected / Rework', 'Rejected / Sent Back'].includes(c.status)
      );
      const overdue = assignedTickets.filter(
        (c) => c.status !== 'Closed' && new Date(c.deadlineTimestamp) < now
      );

      const capResolved = assignedTickets.filter((c) => ['Closed', 'Verified'].includes(c.status)).length;
      const capSubmitted = assignedTickets.filter((c) =>
        ['CAP Submitted', 'Under Review', 'Under Verification'].includes(c.status)
      ).length;
      const overdueCount = overdue.length;
      const complianceRate = assignedTickets.length > 0
        ? Math.max(0, Math.min(100, Math.round(((capResolved * 100 + capSubmitted * 50 - overdueCount * 20) / assignedTickets.length))))
        : null;

      return {
        _id: sup._id || sup.id,
        name: sup.name,
        employeeId: sup.employeeId,
        department: sup.department,
        designation: sup.designation,
        email: sup.email,
        mobileNumber: sup.mobileNumber,
        totalAssigned: assignedTickets.length,
        unstartedCount: unstarted.length,
        inProgressCount: inProgress.length,
        underVerificationCount: underVerification.length,
        closedCount: closedTickets.length,
        rejectedCount: rejected.length,
        overdueCount: overdue.length,
        complianceRate,
        hasBreachedSla: overdue.length > 0,
        hasUnstartedDefects: unstarted.length > 0,
        hasUnresolvedRejections: rejected.length > 0,
      };
    });

    const recentActivityStream = [];
    allComplaints.forEach((complaint) => {
      if (Array.isArray(complaint.timeline)) {
        complaint.timeline.forEach((tl) => {
          recentActivityStream.push({
            id: tl._id || tl.id || `${complaint.complaintId}-${tl.timestamp}`,
            complaintId: complaint.complaintId,
            category: complaint.category,
            department: complaint.department,
            location: complaint.location,
            priority: complaint.priority,
            currentStatus: complaint.status,
            action: tl.action,
            notes: tl.notes,
            performedBy: tl.performedBy,
            timestamp: tl.timestamp,
          });
        });
      }
    });

    recentActivityStream.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const latestEvents = recentActivityStream.slice(0, 60);

    res.status(200).json({
      success: true,
      timestamp: now,
      bottlenecks: {
        totalBreachedSlas: breachedTickets.length,
        totalUnstartedTickets: unstartedTickets.length,
        totalPendingAuditorSignOffs: pendingVerificationTickets.length,
        totalRejectedAwaitingRework: rejectedTickets.length,
        breachedTickets: breachedTickets.map((c) => ({
          _id: c._id || c.id,
          complaintId: c.complaintId,
          category: c.category,
          department: c.department,
          location: c.location,
          priority: c.priority,
          assignedTo: c.assignedTo?.name,
          deadlineTimestamp: c.deadlineTimestamp,
          hoursOverdue: Math.round((now - new Date(c.deadlineTimestamp)) / (1000 * 60 * 60)),
        })),
        unstartedTickets: unstartedTickets.map((c) => ({
          _id: c._id || c.id,
          complaintId: c.complaintId,
          category: c.category,
          department: c.department,
          location: c.location,
          priority: c.priority,
          assignedTo: c.assignedTo?.name,
          createdAt: c.createdAt,
          hoursWaiting: Math.round((now - new Date(c.createdAt)) / (1000 * 60 * 60)),
        })),
        pendingVerificationTickets: pendingVerificationTickets.map((c) => ({
          _id: c._id || c.id,
          complaintId: c.complaintId,
          category: c.category,
          department: c.department,
          assignedTo: c.assignedTo?.name,
          updatedAt: c.updatedAt,
        })),
      },
      auditorActivity,
      supervisorScorecard,
      activityStream: latestEvents,
    });
  } catch (error) {
    console.error('[ComplaintController:getAdminOversightStats] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate admin oversight metrics.',
      error: error.message,
    });
  }
};

// @desc    Reassign defect ticket to a different supervisor
// @route   PATCH /api/complaints/:id/reassign
// @access  Private (Auditor or Admin)
const reassignComplaint = async (req, res) => {
  try {
    const paramId = req.params.id;
    const { assignedToUserId, notes } = req.body;
    const now = new Date();

    if (!assignedToUserId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide the target Line In-Charge / Supervisor to assign this task to.',
      });
    }

    let supervisor = null;

    const lookupSupervisorId = assignedToUserId;

    if (isMongoConnected()) {
      try {
        const supQuery = {
          $or: [
            { employeeId: lookupSupervisorId.toUpperCase() },
            { email: lookupSupervisorId.toLowerCase() },
          ],
        };
        if (lookupSupervisorId.match(/^[0-9a-fA-F]{24}$/)) {
          supQuery.$or.unshift({ _id: lookupSupervisorId });
        }
        const supUser = await User.findOne(supQuery).lean();
        if (supUser) {
          supervisor = { ...supUser, id: supUser._id.toString() };
        }
      } catch (e) {
        // fallback
      }
    }

    if (!supervisor) {
      supervisor =
        mockStore.findUserById(lookupSupervisorId) ||
        mockStore.getUsers().find(
          (u) =>
            u.employeeId === lookupSupervisorId ||
            u._id === lookupSupervisorId ||
            (u.email && u.email.toLowerCase() === lookupSupervisorId.toLowerCase())
        );
    }

    if (!supervisor) {
      return res.status(400).json({
        success: false,
        message: 'Selected Line In-Charge was not found in the Master Contact list.',
      });
    }

    const assignedTo = {
      userId: supervisor?.id || supervisor?._id || '',
      employeeId: supervisor?.employeeId || '',
      name: supervisor?.name || '',
      department: supervisor?.department || '',
      designation: supervisor?.designation || '',
      mobileNumber: supervisor?.mobileNumber || '',
    };

    if (isMongoConnected()) {
      try {
        const query = { $or: [{ complaintId: paramId }] };
        if (paramId && typeof paramId === 'string' && paramId.match(/^[0-9a-fA-F]{24}$/)) {
          query.$or.push({ _id: paramId });
        }
        const current = await Complaint.findOne(query);

        if (current) {
          const timeline = parseTimeline(current.timeline);
          timeline.push({
            action: 'REASSIGNED',
            performedBy: {
              userId: req.user.id || req.user._id,
              employeeId: req.user.employeeId,
              name: req.user.name,
              role: req.user.role,
            },
            notes:
              notes ||
              `Task reassigned to Line In-Charge ${supervisor.name} (${supervisor.employeeId} - ${supervisor.department})`,
            timestamp: now.toISOString(),
          });

          current.assignedTo = assignedTo;
          current.timeline = timeline;
          current.updatedAt = now;

          const updated = await current.save();
          mockStore.updateComplaint(current._id.toString(), {
            assignedTo,
            timeline,
            updatedAt: now.toISOString(),
          });

          return res.status(200).json({
            success: true,
            message: `NC Defect ${updated.complaintId} reassigned to ${supervisor.name} successfully.`,
            complaint: formatComplaintOutput(updated.toObject()),
          });
        }
      } catch (dbErr) {
        console.error('[ComplaintController:reassignComplaint] MongoDB error:', dbErr.message);
      }
    }

    const complaint = mockStore.getComplaintById(paramId);
    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint ticket not found.',
      });
    }

    complaint.assignedTo = assignedTo;
    complaint.timeline.push({
      action: 'REASSIGNED',
      performedBy: {
        userId: req.user._id || req.user.id,
        employeeId: req.user.employeeId,
        name: req.user.name,
        role: req.user.role,
      },
      notes:
        notes ||
        `Task reassigned to Line In-Charge ${supervisor.name} (${supervisor.employeeId} - ${supervisor.department})`,
      timestamp: now,
    });
    mockStore.updateComplaint(complaint._id, complaint);

    return res.status(200).json({
      success: true,
      message: `Task successfully assigned to ${supervisor.name} (${supervisor.department}).`,
      complaint: formatComplaintOutput(complaint),
    });
  } catch (error) {
    console.error('[ComplaintController:reassignComplaint] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reassign defect task.',
      error: error.message,
    });
  }
};

// @desc    Soft-delete / archive complaint defect log (preserves all historical data, CAP, photos for reports)
// @route   DELETE /api/complaints/:id
// @access  Private (Auditor or Admin)
const deleteComplaint = async (req, res) => {
  try {
    const paramId = req.params.id;
    let existingComplaint = null;

    const actorName = req.user?.name || 'Administrator';
    const actorEmpId = req.user?.employeeId || 'ADMIN';
    const actorRole = req.user?.role || 'ADMIN';
    const deletedDate = new Date();
    const deletedByInfo = {
      name: actorName,
      employeeId: actorEmpId,
      role: actorRole,
      userId: req.user?.id || req.user?._id || '',
    };
    const deletedReason = req.body?.reason || 'Non-conformance archived / deleted by authorized user';

    // Soft-delete complaint in MongoDB while preserving all photos, CAP, root cause, and history
    if (isMongoConnected()) {
      try {
        const query = { $or: [{ complaintId: paramId }] };
        if (paramId && typeof paramId === 'string' && paramId.match(/^[0-9a-fA-F]{24}$/)) {
          query.$or.push({ _id: paramId });
        }
        const doc = await Complaint.findOne(query);
        if (doc) {
          doc.isDeleted = true;
          doc.deletedAt = deletedDate;
          doc.deletedBy = deletedByInfo;
          doc.deletedReason = deletedReason;
          if (!Array.isArray(doc.timeline)) doc.timeline = [];
          doc.timeline.push({
            action: 'DELETED',
            performedBy: deletedByInfo,
            notes: `Record archived / soft-deleted by ${actorName}. ${deletedReason}`,
            timestamp: deletedDate,
          });
          await doc.save();
          existingComplaint = doc.toObject();
        }
      } catch (err) {
        console.error('[ComplaintController:deleteComplaint] MongoDB exception:', err.message);
      }
    }

    if (!existingComplaint) {
      existingComplaint = mockStore.getComplaintById ? mockStore.getComplaintById(paramId) : mockStore.getComplaint(paramId);
    }

    // Soft-delete in mock store
    mockStore.deleteComplaint(paramId, deletedByInfo, deletedReason);

    const ncId = existingComplaint?.complaintId || paramId;
    const ncTitle = existingComplaint?.title || 'Defect Entry';
    const ncDept = existingComplaint?.department || 'N/A';
    const ncBuyer = existingComplaint?.buyer || 'N/A';

    // Log who deleted the record with brief & complete details
    await logEvent({
      req,
      userId: actorEmpId,
      userName: actorName,
      userRole: actorRole,
      action: 'NC_DELETED',
      actionLabel: 'Defect Record Archived / Deleted',
      category: 'COMPLAINT',
      severity: 'CRITICAL',
      entityType: 'COMPLAINT',
      entityId: ncId,
      relatedNcId: ncId,
      details: `Record ${ncId} ("${ncTitle}") was archived / soft-deleted by ${actorName} (${actorEmpId} • ${actorRole}). Department: ${ncDept}, Buyer: ${ncBuyer}. All historical photos, CAP records, and audit details permanently preserved for reporting.`,
      payload: {
        deletedBy: deletedByInfo,
        deletedRecord: {
          complaintId: ncId,
          title: ncTitle,
          department: ncDept,
          buyer: ncBuyer,
          severity: existingComplaint?.severity,
          stage: existingComplaint?.stage,
        },
        deletedAt: deletedDate.toISOString(),
      },
    });

    return res.status(200).json({
      success: true,
      message: `Defect log ${paramId} archived / deleted successfully by ${actorName}. All historical details preserved in reports.`,
      id: paramId,
      complaint: existingComplaint ? formatComplaintOutput(existingComplaint) : null,
      deletedBy: deletedByInfo,
    });
  } catch (error) {
    console.error('[ComplaintController:deleteComplaint] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete complaint log.',
      error: error.message,
    });
  }
};

const getDepartmentComplianceStats = async (req, res) => {
  try {
    let allComplaints = [];

    // Fetch complaints from MongoDB if connected
    if (isMongoConnected()) {
      try {
        const dbTickets = await Complaint.find({ isDeleted: { $ne: true } }).sort({ createdAt: -1 }).lean();
        if (Array.isArray(dbTickets)) {
          allComplaints = dbTickets.map(formatComplaintOutput);
        }
      } catch (err) {
        console.warn('[ComplaintController:getDepartmentComplianceStats] MongoDB notice:', err.message);
      }
    }

    // Keep real database complaints (do not inject mock records when 0)

    const thresholds = mockStore.getComplianceThresholds();
    const now = new Date();

    // Standard Factory Departments master list
    const standardDepts = ['HR', 'Production', 'EHS', 'Stores', 'Maintenance', 'Quality', 'EDP'];

    // Normalized map to canonical department names
    const normalizeDeptName = (name) => {
      const lower = (name || '').trim().toLowerCase();
      if (lower === 'store' || lower === 'stores') return 'Stores';
      if (lower === 'hr' || lower === 'human resources') return 'HR';
      if (lower === 'ehs' || lower === 'environment health & safety' || lower === 'safety') return 'EHS';
      if (lower === 'maintenance' || lower === 'maintannce') return 'Maintenance';
      if (lower === 'production' || lower === 'prod') return 'Production';
      if (lower === 'quality' || lower === 'qa' || lower === 'qc') return 'Quality';
      if (lower === 'edp' || lower === 'it' || lower === 'systems') return 'EDP';
      return (name || '').trim() || 'General';
    };

    // Discover real departments from database table and existing complaints
    const foundDepts = new Set();
    if (isMongoConnected()) {
      try {
        const dbDepts = await Department.find().select('name').lean();
        if (Array.isArray(dbDepts)) {
          dbDepts.forEach((d) => {
            if (d.name && d.name.trim()) foundDepts.add(normalizeDeptName(d.name));
          });
        }
      } catch (e) {}
    }

    allComplaints.forEach((c) => {
      if (c.department && c.department.trim()) {
        foundDepts.add(normalizeDeptName(c.department));
      }
    });

    if (!isMongoConnected()) {
      mockStore.getDepartments().forEach((d) => {
        if (d.name && d.name.trim()) foundDepts.add(normalizeDeptName(d.name));
      });
    }

    const combinedDepts = foundDepts.size > 0
      ? Array.from(foundDepts)
      : Array.from(new Set([...Array.from(foundDepts), ...standardDepts]));

    const departmentStats = combinedDepts.map((deptName) => {
      const deptComplaints = allComplaints.filter((c) => {
        return normalizeDeptName(c.department).toLowerCase() === deptName.toLowerCase();
      });

      const totalNC = deptComplaints.length;
      const closedNC = deptComplaints.filter((c) => c.status === 'Closed').length;
      const verifiedNC = deptComplaints.filter((c) => c.status === 'Verified').length;
      const capSubmittedNC = deptComplaints.filter((c) =>
        ['CAP Submitted', 'Under Review', 'Under Verification'].includes(c.status)
      ).length;
      const openNC = deptComplaints.filter((c) => !['Closed', 'Verified'].includes(c.status)).length;
      const overdueNC = deptComplaints.filter((c) => {
        return !['Closed', 'Verified'].includes(c.status) && new Date(c.deadlineTimestamp) < now;
      }).length;
      const rejectedNC = deptComplaints.filter((c) =>
        ['Rejected / Rework', 'Rejected / Sent Back'].includes(c.status) || c.cap?.status === 'REJECTED'
      ).length;
      const draftNC = deptComplaints.filter((c) => c.status === 'Draft').length;

      // When department has NO NCs logged, do NOT assign default fake 100%
      if (totalNC === 0) {
        return {
          department: deptName,
          score: null,
          hasNC: false,
          totalNC: 0,
          openNC: 0,
          overdueNC: 0,
          rejectedNC: 0,
          capPercent: null,
          closedNC: 0,
          verifiedNC: 0,
          capSubmittedNC: 0,
          underReviewNC: 0,
          draftNC: 0,
          statusLevel: 'NO_DATA',
          statusColor: 'slate',
          statusEmoji: '⚪',
          riskScore: 'None',
          riskColor: 'slate',
          riskEmoji: '⚪',
          riskLevel: 0,
          criticalNC: 0,
          majorNC: 0,
          overdueCap: 0,
        };
      }

      // ── NC / CAP Driven Compliance Scoring ─────────────────────────────────
      // Resolved CAP (Closed/Verified) = 100 pts per item
      // In-Progress CAP (CAP Submitted/Under Review) = 50 pts per item
      // Unresolved Open NC = 0 pts
      // Overdue Penalty = -20 pts per breached item
      const capResolved = closedNC + verifiedNC;
      const capPercent = Math.round((capResolved / totalNC) * 100);

      const rawScore = ((capResolved * 100) + (capSubmittedNC * 50) - (overdueNC * 20)) / totalNC;
      const complianceScore = Math.max(0, Math.min(100, Math.round(rawScore)));

      // Threshold classification based on actual NC/CAP resolution
      let statusLevel = 'CRITICAL';
      let statusColor = 'rose';
      let statusEmoji = '🔴';
      if (complianceScore >= thresholds.highThreshold) {
        statusLevel = 'HIGH';
        statusColor = 'emerald';
        statusEmoji = '🟢';
      } else if (complianceScore >= thresholds.moderateThreshold) {
        statusLevel = 'MODERATE';
        statusColor = 'amber';
        statusEmoji = '🟡';
      }

      // Dynamic Risk Rating based on NC Severity and Overdue Status
      let riskScore = 'Low';
      let riskColor = 'emerald';
      let riskEmoji = '🟢';
      let riskLevel = 1;
      const hasCriticalNC = deptComplaints.some((c) => (c.priority || '').toUpperCase() === 'CRITICAL' && !['Closed', 'Verified'].includes(c.status));

      if (overdueNC > 0 || hasCriticalNC) {
        riskScore = 'Critical';
        riskColor = 'rose';
        riskEmoji = '🔴';
        riskLevel = 4;
      } else if (capPercent < 50 || openNC > 3) {
        riskScore = 'High';
        riskColor = 'orange';
        riskEmoji = '🟠';
        riskLevel = 3;
      } else if (openNC > 0) {
        riskScore = 'Medium';
        riskColor = 'amber';
        riskEmoji = '🟡';
        riskLevel = 2;
      }

      return {
        department: deptName,
        score: complianceScore,
        hasNC: true,
        openNC,
        overdueNC,
        rejectedNC,
        capPercent,
        totalNC,
        closedNC,
        verifiedNC,
        capSubmittedNC,
        draftNC,
        statusLevel,
        statusColor,
        statusEmoji,
        riskScore,
        riskColor,
        riskEmoji,
        riskLevel,
        criticalNC: deptComplaints.filter((c) => (c.priority || '').toUpperCase() === 'CRITICAL').length,
        majorNC: deptComplaints.filter((c) => (c.priority || '').toUpperCase() === 'HIGH').length,
        overdueCap: overdueNC,
      };
    });

    // Sort: Departments with actual NC activity first, sorted by score descending, followed by empty departments
    departmentStats.sort((a, b) => {
      if (a.hasNC && !b.hasNC) return -1;
      if (!a.hasNC && b.hasNC) return 1;
      if (a.score !== null && b.score !== null) return b.score - a.score;
      return a.department.localeCompare(b.department);
    });

    // Factory Overall Compliance Score (calculated solely across departments with NCs)
    const activeDepts = departmentStats.filter((d) => d.hasNC && d.score !== null);
    const overallScore = activeDepts.length > 0
      ? Math.round(activeDepts.reduce((acc, d) => acc + d.score, 0) / activeDepts.length)
      : null;

    const totalPlantNC = allComplaints.length;
    const totalOpenNC = allComplaints.filter((c) => !['Closed', 'Verified'].includes(c.status)).length;
    const totalOverdueNC = allComplaints.filter((c) => !['Closed', 'Verified'].includes(c.status) && new Date(c.deadlineTimestamp) < now).length;
    const totalRejectedNC = allComplaints.filter((c) => ['Rejected / Rework', 'Rejected / Sent Back'].includes(c.status) || c.cap?.status === 'REJECTED').length;
    const totalClosedNC = allComplaints.filter((c) => ['Closed', 'Verified'].includes(c.status)).length;
    const avgCapPercent = totalPlantNC > 0
      ? Math.round((totalClosedNC / totalPlantNC) * 100)
      : null;

    // Total audits from real database
    let totalAudits = 0;
    try {
      if (isMongoConnected()) {
        totalAudits = await Audit.countDocuments();
      }
    } catch (e) {
      totalAudits = 0;
    }

    // Dynamic 6-month trend generated strictly from actual database complaints
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mName = monthNames[d.getMonth()];
      const year = d.getFullYear();
      const monthIdx = d.getMonth();

      const inMonth = allComplaints.filter((c) => {
        const cDate = new Date(c.createdAt || c.created_at);
        return cDate.getFullYear() === year && cDate.getMonth() === monthIdx;
      });

      const mOpen = inMonth.filter((c) => !['Closed', 'Verified'].includes(c.status)).length;
      const mClosed = inMonth.filter((c) => ['Closed', 'Verified'].includes(c.status)).length;
      const mCompliance = inMonth.length > 0
        ? Math.round((mClosed / inMonth.length) * 100)
        : null;

      monthlyTrend.push({
        month: mName,
        openNC: mOpen,
        closedNC: mClosed,
        compliance: mCompliance,
      });
    }

    return res.status(200).json({
      success: true,
      thresholds,
      overallScore,
      totalPlantNC,
      totalOpenNC,
      totalOverdueNC,
      totalRejectedNC,
      totalAudits,
      avgCapPercent,
      monthlyTrend,
      departments: departmentStats,
    });
  } catch (error) {
    console.error('[ComplaintController:getDepartmentComplianceStats] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to calculate department compliance statistics.',
      error: error.message,
    });
  }
};

const updateComplianceThresholds = async (req, res) => {
  try {
    const { highThreshold, moderateThreshold } = req.body;

    const high = Number(highThreshold);
    const mod = Number(moderateThreshold);

    if (isNaN(high) || high < 50 || high > 100) {
      return res.status(400).json({
        success: false,
        message: 'High Compliance Threshold (Green) must be a number between 50 and 100.',
      });
    }

    if (isNaN(mod) || mod < 20 || mod >= high) {
      return res.status(400).json({
        success: false,
        message: `Moderate Threshold (Amber) must be between 20 and ${high - 1}.`,
      });
    }

    const updated = mockStore.updateComplianceThresholds({
      highThreshold: high,
      moderateThreshold: mod,
      updatedBy: req.user?.name || 'Administrator',
    });

    return res.status(200).json({
      success: true,
      message: 'Department compliance thresholds updated successfully.',
      thresholds: updated,
    });
  } catch (error) {
    console.error('[ComplaintController:updateComplianceThresholds] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update compliance thresholds.',
      error: error.message,
    });
  }
};

// @desc    Get all audit rounds and top metrics
// @route   GET /api/complaints/admin/audits
// @access  Private
const getAudits = async (req, res) => {
  try {
    let audits = [];
    let complaints = [];

    if (isMongoConnected()) {
      try {
        const [auditsDocs, complaintsDocs] = await Promise.all([
          Audit.find().sort({ createdAt: -1 }).lean(),
          Complaint.find({ isDeleted: { $ne: true } }).select('status').lean(),
        ]);
        if (auditsDocs) {
          audits = auditsDocs.map((a) => ({ ...a, id: a._id.toString(), _id: a._id.toString() }));
        }
        if (complaintsDocs) {
          complaints = complaintsDocs;
        }
      } catch (e) {
        console.warn('[ComplaintController:getAudits] MongoDB query notice:', e.message);
      }
    }

    if (audits.length === 0) {
      audits = mockStore.getAudits();
    }
    if (complaints.length === 0) {
      complaints = mockStore.getComplaints();
    }

    const completedAudits = audits.filter((a) => a.status === 'Completed').length;
    const openAudits = audits.filter((a) => a.status !== 'Completed').length;
    const ncsFound = complaints.length;
    const closedCount = complaints.filter((c) => c.status === 'Closed' || c.status === 'Verified').length;
    const ncClosureRate = ncsFound > 0 ? Math.round((closedCount / ncsFound) * 100) : 100;

    return res.status(200).json({
      success: true,
      stats: {
        completedAudits,
        openAudits,
        ncsFound,
        ncClosureRate,
      },
      audits,
    });
  } catch (error) {
    console.error('[ComplaintController:getAudits] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch audits.',
      error: error.message,
    });
  }
};

// @desc    Update checklist item status in an audit round
// @route   PUT /api/complaints/admin/audits/:id/checklist
// @access  Private
const updateAuditChecklist = async (req, res) => {
  try {
    const { id } = req.params;
    const { department, itemId, status, notes } = req.body;

    const updated = mockStore.updateAuditChecklist(id, department, itemId, status, notes);
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Audit round not found or invalid item ID.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Audit checklist item updated.',
      audit: updated,
    });
  } catch (error) {
    console.error('[ComplaintController:updateAuditChecklist] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update checklist item.',
      error: error.message,
    });
  }
};

// @desc    Create a new audit round
// @route   POST /api/complaints/admin/audits
// @access  Private (AUDITOR or ADMIN)
const createAuditRound = async (req, res) => {
  try {
    const { title, date, departments, leadAuditor } = req.body;
    if (!title || !date) {
      return res.status(400).json({
        success: false,
        message: 'Audit title and date are required.',
      });
    }

    let newAudit;
    if (isMongoConnected()) {
      const created = await Audit.create({
        title,
        date: date || new Date(),
        departments: departments || ['HR', 'Production', 'EHS'],
        leadAuditor: leadAuditor || req.user?.name || 'Auditor',
        status: 'Scheduled',
      });
      newAudit = { ...created.toObject(), id: created._id.toString(), _id: created._id.toString() };
      mockStore.createAudit(newAudit);
    } else {
      newAudit = mockStore.createAudit({
        title,
        date,
        departments: departments || ['HR', 'Production', 'EHS'],
        leadAuditor: leadAuditor || req.user?.name || 'Auditor',
      });
    }

    return res.status(201).json({
      success: true,
      message: 'New audit round created successfully.',
      audit: newAudit,
    });
  } catch (error) {
    console.error('[ComplaintController:createAuditRound] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create audit round.',
      error: error.message,
    });
  }
};

module.exports = {
  createComplaint,
  getComplaints,
  getComplaintById,
  markInProgress,
  pauseProgress,
  submitAction,
  verifyComplaint,
  addTimelineComment,
  getKpiStats,
  getAdminOversightStats,
  reassignComplaint,
  deleteComplaint,
  getDepartmentComplianceStats,
  updateComplianceThresholds,
  getAudits,
  updateAuditChecklist,
  createAuditRound,
  formatComplaintOutput,
};
