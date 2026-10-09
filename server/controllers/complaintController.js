const fs = require('fs');
const path = require('path');
const { supabase, isSupabaseConfigured } = require('../config/supabase');
const mockStore = require('../config/mockStore');
const { computeDepartmentNCScore } = require('../utils/scoringEngine');

// Database constraint adapter: Supabase check constraint complaints_status_check
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

// Helper to convert any image path (including disk files in /uploads) into a self-contained data URL
const ensureDataUrl = (photoPath) => {
  if (!photoPath) return photoPath;
  if (
    photoPath.startsWith('data:image/') ||
    photoPath.startsWith('http://') ||
    photoPath.startsWith('https://')
  ) {
    return photoPath;
  }
  if (photoPath.startsWith('/uploads/') || !photoPath.includes('/')) {
    const filename = photoPath.replace(/^\/uploads\//, '');
    const diskPath = path.join(__dirname, '..', 'uploads', filename);
    if (fs.existsSync(diskPath)) {
      try {
        const ext = path.extname(filename).toLowerCase();
        let mime = 'image/jpeg';
        if (ext === '.png') mime = 'image/png';
        else if (ext === '.webp') mime = 'image/webp';
        else if (ext === '.svg') mime = 'image/svg+xml';
        const fileBuf = fs.readFileSync(diskPath);
        return `data:${mime};base64,${fileBuf.toString('base64')}`;
      } catch (e) {
        // fallback
      }
    }
  }
  return photoPath;
};

// Helper to ensure all complaint outputs have self-contained data URLs and compatible identifiers
const formatComplaintOutput = (complaint) => {
  if (!complaint) return null;
  const obj = typeof complaint.toObject === 'function' ? complaint.toObject() : { ...complaint };
  obj._id = obj.id || obj._id;
  obj.id = obj.id || obj._id;

  if (obj.beforePhoto) {
    obj.beforePhoto = ensureDataUrl(obj.beforePhoto);
  }
  if (obj.afterPhoto) {
    obj.afterPhoto = ensureDataUrl(obj.afterPhoto);
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

// Helper to extract photo data URL from base64, memory buffer, disk file, or URL
const extractPhotoPayload = (req, fieldName, base64FieldName) => {
  if (req.body && req.body[base64FieldName] && req.body[base64FieldName].startsWith('data:image/')) {
    return ensureDataUrl(req.body[base64FieldName]);
  }
  if (req.file) {
    try {
      const mime = req.file.mimetype || 'image/jpeg';
      if (req.file.buffer) {
        return ensureDataUrl(`data:${mime};base64,${req.file.buffer.toString('base64')}`);
      }
      if (req.file.path && fs.existsSync(req.file.path)) {
        const fileBuf = fs.readFileSync(req.file.path);
        return ensureDataUrl(`data:${mime};base64,${fileBuf.toString('base64')}`);
      }
    } catch (e) {}
    if (req.file.filename) {
      return ensureDataUrl(getFileUrl(req, req.file.filename));
    }
  }
  if (req.body && req.body[fieldName]) {
    return ensureDataUrl(req.body[fieldName]);
  }
  if (req.body && req.body[`${fieldName}Url`]) {
    return ensureDataUrl(req.body[`${fieldName}Url`]);
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
    const beforePhotoUrl = extractPhotoPayload(req, 'beforePhoto', 'beforePhotoBase64');

    if (!beforePhotoUrl) {
      return res.status(400).json({
        success: false,
        message: 'Mandatory Before Photo proof is required (via device camera or upload).',
      });
    }

    const createdByData = {
      userId: req.user?.id || req.user?._id || 'usr-aud-001',
      employeeId: req.user?.employeeId || 'AUD-001',
      name: req.user?.name || 'Quality Auditor',
      role: req.user?.role || 'AUDITOR',
    };

    const supervisorIdMap = {
      '6ab21322cd50706ee2a84637': 'SUP-101',
      '6ab21322cd50706ee2a84638': 'SUP-102',
      '6ab21322cd50706ee2a84639': 'SUP-103',
      '6ab21322cd50706ee2a84640': 'SUP-104',
      '6ab21322cd50706ee2a84641': 'SUP-105',
      '6ab21322cd50706ee2a84642': 'SUP-106',
      '6ab21322cd50706ee2a84643': 'SUP-107',
      '6ab21322cd50706ee2a84644': 'SUP-108',
      '6ab21322cd50706ee2a84645': 'SUP-109',
      '6ab21322cd50706ee2a84646': 'SUP-110',
    };
    const lookupSupervisorId = supervisorIdMap[targetSupervisorId] || targetSupervisorId;

    // Lookup supervisor from Supabase or mockStore
    let supervisor = null;

    if (isSupabaseConfigured && supabase && lookupSupervisorId) {
      try {
        const { data: sups } = await supabase
          .from('users')
          .select('*')
          .or(`id.eq.${lookupSupervisorId},employeeId.eq.${lookupSupervisorId},email.eq.${lookupSupervisorId}`)
          .limit(1);

        if (sups && sups.length > 0) {
          supervisor = sups[0];
        }
      } catch (e) {
        // fallback
      }
    }

    if (!supervisor && department) {
      supervisor = mockStore.getUsers().find(
        (u) => u.role === 'ACTION_PERSON' && (u.department || '').toLowerCase().includes(department.toLowerCase())
      );
    }

    if (!supervisor) {
      supervisor =
        mockStore.findUserById(lookupSupervisorId) ||
        mockStore.getUsers().find((u) => u.employeeId === lookupSupervisorId) ||
        mockStore.getUsers().find((u) => u.role === 'ACTION_PERSON') || {
          _id: 'usr-sup-001',
          id: 'usr-sup-001',
          employeeId: 'SUP-001',
          name: 'Rajesh Kumar',
          department: department || 'Production',
          designation: 'Production Floor In-Charge',
          mobileNumber: '+91 98111 22334',
        };
    }

    const assignedToData = {
      userId: supervisor.id || supervisor._id || 'usr-sup-001',
      employeeId: supervisor.employeeId || 'SUP-001',
      name: supervisor.name || 'Rajesh Kumar',
      department: supervisor.department || department || 'Production',
      designation: supervisor.designation || 'Production Floor In-Charge',
      mobileNumber: supervisor.mobileNumber || '+91 98111 22334',
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

    if (isSupabaseConfigured && supabase) {
      try {
        const basePayload = {
          complaintId,
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
          afterPhoto: null,
          assignedTo: assignedToData,
          createdBy: createdByData,
          deadlineHours: hours,
          deadlineTimestamp: deadlineTimestamp.toISOString(),
          status: toDbStatus(rawWorkflowStatus),
          actionNotes: '',
          feedbackRemarks: '',
          rejectionReason: '',
          timeline: initialTimeline,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        };

        let inserted = null;
        let baseData = null;
        let baseErr = null;
        const res1 = await supabase.from('complaints').insert([basePayload]).select().single();
        if (res1.error && res1.error.message && res1.error.message.includes('column')) {
          console.warn('[ComplaintController:createComplaint] Schema missing extended column, retrying with base columns:', res1.error.message);
          const fallbackPayload = {
            complaintId,
            category: category || 'Stitching Fault',
            department: department || supervisor.department || 'Production',
            location: location || 'Production Floor',
            priority: effectivePriority,
            description: enrichedDescription,
            beforePhoto: beforePhotoUrl,
            afterPhoto: null,
            assignedTo: assignedToData,
            createdBy: createdByData,
            deadlineHours: hours,
            deadlineTimestamp: deadlineTimestamp.toISOString(),
            status: toDbStatus(rawWorkflowStatus),
            actionNotes: '',
            feedbackRemarks: '',
            rejectionReason: '',
            timeline: initialTimeline,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          };
          const res2 = await supabase.from('complaints').insert([fallbackPayload]).select().single();
          baseData = res2.data;
          baseErr = res2.error;
        } else {
          baseData = res1.data;
          baseErr = res1.error;
        }
        if (baseErr) {
          console.error('[ComplaintController:createComplaint] Supabase insert error:', baseErr.message);
          throw baseErr;
        }
        inserted = {
          ...baseData,
          requirement: effectiveRequirement,
          riskSeverity: effectivePriority,
          capRequired: isCapRequired,
          verificationMethod: effectiveVerification,
        };

        initialCap.responsiblePerson = assignedToData;

        if (inserted) {
          mockStore.createComplaint({
            ...inserted,
            _id: inserted.id,
            complaintId: inserted.complaintId,
            requirement: effectiveRequirement,
            riskSeverity: effectivePriority,
            capRequired: isCapRequired,
            verificationMethod: effectiveVerification,
            cap: initialCap,
          });
          return res.status(201).json({
            success: true,
            message: `NC Defect ${inserted.complaintId} created and assigned successfully.`,
            complaint: formatComplaintOutput({
              ...inserted,
              requirement: effectiveRequirement,
              riskSeverity: effectivePriority,
              capRequired: isCapRequired,
              verificationMethod: effectiveVerification,
              cap: initialCap,
            }),
          });
        }
      } catch (dbErr) {
        console.error('[ComplaintController:createComplaint] Supabase exception:', dbErr);
        return res.status(500).json({
          success: false,
          message: `Database error: ${dbErr.message}`,
          error: dbErr.message,
        });
      }
    }

    initialCap.responsiblePerson = assignedToData;

    // Fallback when Supabase is not configured
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
    const { status, category, priority, department, search, tab, deadlineCondition, deadline } = req.query;
    const now = new Date();

    if (isSupabaseConfigured && supabase) {
      try {
        let query = supabase.from('complaints').select('*');

        // RBAC filtering for Supervisor / Action Person (Strict Personal Assignment Isolation across ALL tabs)
        if (req.user && (req.user.role === 'ACTION_PERSON' || req.user.role === 'SUPERVISOR')) {
          const userEmpId = req.user.employeeId;
          const userId = req.user.id || req.user._id;

          let orFilters = [];
          if (userEmpId) orFilters.push(`assignedTo->>employeeId.eq.${userEmpId}`);
          if (userId) orFilters.push(`assignedTo->>userId.eq.${userId}`);

          if (orFilters.length > 0) {
            query = query.or(orFilters.join(','));
          } else {
            query = query.eq('id', 'no-match');
          }
        }

        // 1. Workflow Status / Tab filtering
        if (tab === 'draft') {
          query = query.eq('status', 'Draft');
        } else if (tab === 'open') {
          query = query.in('status', ['Open', 'Assigned', 'In Progress']);
        } else if (tab === 'cap-submitted') {
          query = query.in('status', ['CAP Submitted', 'Under Verification']);
        } else if (tab === 'under-review') {
          query = query.eq('status', 'Under Review');
        } else if (tab === 'rejected-rework') {
          query = query.in('status', ['Rejected / Rework', 'Rejected / Sent Back']);
        } else if (tab === 'verified') {
          query = query.eq('status', 'Verified');
        } else if (tab === 'closed') {
          query = query.in('status', ['Closed', 'Verified']);
        } else if (tab === 'action-pending') {
          query = query.in('status', ['Open', 'Assigned', 'In Progress', 'Rejected / Rework', 'Rejected / Sent Back']);
        } else if (tab === 'under-verification') {
          query = query.in('status', ['CAP Submitted', 'Under Review', 'Under Verification']);
        } else if (tab === 'overdue') {
          query = query.not('status', 'in', '("Closed","Verified")').lt('deadlineTimestamp', now.toISOString());
        } else if (status && status !== 'all' && status !== 'All Statuses') {
          query = query.eq('status', status);
        }

        // 2. Decoupled Deadline Condition filter: Open | Overdue | Due Soon | Closed
        const dCond = deadlineCondition || deadline;
        if (dCond && dCond !== 'All Deadlines') {
          if (dCond === 'Overdue') {
            query = query.not('status', 'in', '("Closed","Verified")').lt('deadlineTimestamp', now.toISOString());
          } else if (dCond === 'Due Soon') {
            const fourHoursLater = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString();
            query = query.not('status', 'in', '("Closed","Verified")').gte('deadlineTimestamp', now.toISOString()).lte('deadlineTimestamp', fourHoursLater);
          } else if (dCond === 'Open') {
            const fourHoursLater = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString();
            query = query.not('status', 'in', '("Closed","Verified")').gt('deadlineTimestamp', fourHoursLater);
          } else if (dCond === 'Closed') {
            query = query.in('status', ['Closed', 'Verified']);
          }
        }

        if (category) query = query.eq('category', category);
        if (priority) query = query.eq('priority', priority);
        if (department) query = query.eq('department', department);

        if (search) {
          const s = `%${search}%`;
          query = query.or(`complaintId.ilike.${s},location.ilike.${s},description.ilike.${s},category.ilike.${s},assignedTo->>name.ilike.${s}`);
        }

        const { data, error } = await query.order('createdAt', { ascending: false });

        if (error) {
          console.error('[ComplaintController:getComplaints] Supabase query error:', error.message);
          return res.status(500).json({
            success: false,
            message: 'Database query error: ' + error.message,
            error: error.message,
          });
        }

        if (data) {
          // Keep in-memory store strictly synchronized as a warm cache
          mockStore.syncWithSupabase(data);

          return res.status(200).json({
            success: true,
            count: data.length,
            complaints: data.map(formatComplaintOutput),
          });
        }
      } catch (dbErr) {
        console.error('[ComplaintController:getComplaints] Supabase query exception:', dbErr.message);
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

    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('complaints')
          .select('*')
          .or(`id.eq.${paramId},complaintId.eq.${paramId}`)
          .maybeSingle();

        if (!error && data) {
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

          mockStore.createComplaint({ ...data, _id: data.id, complaintId: data.complaintId });
          return res.status(200).json({
            success: true,
            complaint: formatComplaintOutput(data),
          });
        }
      } catch (e) {
        // fallback
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
    const paramId = req.params.id;
    const now = new Date();

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: current, error: findErr } = await supabase
          .from('complaints')
          .select('*')
          .or(`id.eq.${paramId},complaintId.eq.${paramId}`)
          .maybeSingle();

        if (findErr) {
          console.error('[ComplaintController:markInProgress] Supabase find error:', findErr.message);
          return res.status(500).json({
            success: false,
            message: 'Database error looking up complaint: ' + findErr.message,
            error: findErr.message,
          });
        }

        if (!current) {
          return res.status(404).json({
            success: false,
            message: 'Complaint not found in database.',
          });
        }

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
          notes: 'Supervisor initiated work and containment on the shop floor.',
          timestamp: now.toISOString(),
        });

        const updatePayload = {
          status: toDbStatus('In Progress'),
          description: setWorkflowStatusInDescription(current.description, 'In Progress'),
          timeline,
          updatedAt: now.toISOString(),
        };

        const { data: updated, error: updateErr } = await supabase
          .from('complaints')
          .update(updatePayload)
          .eq('id', current.id)
          .select()
          .single();

        if (updateErr) {
          console.error('[ComplaintController:markInProgress] Supabase update error:', updateErr.message);
          return res.status(500).json({
            success: false,
            message: 'Failed to update complaint status in database: ' + updateErr.message,
            error: updateErr.message,
          });
        }

        if (updated) {
          mockStore.updateComplaint(current.id, updatePayload);
          return res.status(200).json({
            success: true,
            message: `Complaint ${updated.complaintId} marked in progress.`,
            complaint: formatComplaintOutput(updated),
          });
        }
      } catch (dbErr) {
        console.error('[ComplaintController:markInProgress] Supabase exception:', dbErr.message);
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
      notes: 'Supervisor initiated work and containment on the shop floor.',
      timestamp: now.toISOString(),
    });
    const updated = mockStore.updateComplaint(complaint.id, {
      status: 'In Progress',
      timeline,
      updatedAt: now.toISOString(),
    });
    return res.status(200).json({
      success: true,
      message: `Complaint ${updated.complaintId} marked in progress.`,
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
        userId: req.user?.id || req.user?._id || 'usr-sup-001',
        employeeId: req.user?.employeeId || 'SUP-001',
        name: req.user?.name || 'Line Supervisor',
        role: req.user?.role || 'ACTION_PERSON',
        department: req.user?.department || 'Production',
        designation: req.user?.designation || 'In-Charge',
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

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: current, error: findErr } = await supabase
          .from('complaints')
          .select('*')
          .or(`id.eq.${paramId},complaintId.eq.${paramId}`)
          .maybeSingle();

        if (findErr) {
          console.error('[ComplaintController:submitAction] Supabase lookup error:', findErr.message);
          return res.status(500).json({
            success: false,
            message: 'Database error looking up complaint: ' + findErr.message,
            error: findErr.message,
          });
        }

        if (!current) {
          return res.status(404).json({
            success: false,
            message: 'Complaint not found in database.',
          });
        }

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

        const updatePayload = {
          afterPhoto: afterPhotoUrl,
          actionNotes: finalActionNotes,
          feedbackRemarks: finalFeedbackRemarks,
          actualCompletedAt: now.toISOString(),
          status: toDbStatus('CAP Submitted'),
          cap: structuredCap,
          description: setWorkflowStatusInDescription(current.description, 'CAP Submitted'),
          timeline,
          updatedAt: now.toISOString(),
        };

        const { data: updated, error: updateErr } = await supabase
          .from('complaints')
          .update(updatePayload)
          .eq('id', current.id)
          .select()
          .single();

        if (updateErr) {
          console.error('[ComplaintController:submitAction] Supabase update error:', updateErr.message);
          return res.status(500).json({
            success: false,
            message: 'Failed to record action in database: ' + updateErr.message,
            error: updateErr.message,
          });
        }

        if (updated) {
          mockStore.updateComplaint(current.id, {
            ...updatePayload,
            cap: structuredCap,
            immediateCorrection: finalImmediateCorrection,
            rootCause: finalRootCause,
            correctiveAction: finalCorrectiveAction,
            preventiveAction: finalPreventiveAction,
            capResponsiblePerson: respPerson,
            capTargetDate: targetDate || now.toISOString(),
          });
          return res.status(200).json({
            success: true,
            message: `Resolution for ${updated.complaintId} submitted for audit verification.`,
            complaint: formatComplaintOutput({ ...updated, cap: structuredCap }),
          });
        }
      } catch (dbErr) {
        console.error('[ComplaintController:submitAction] Supabase exception:', dbErr.message);
        return res.status(500).json({
          success: false,
          message: 'Database exception: ' + dbErr.message,
          error: dbErr.message,
        });
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

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: current, error: findErr } = await supabase
          .from('complaints')
          .select('*')
          .or(`id.eq.${paramId},complaintId.eq.${paramId}`)
          .maybeSingle();

        if (findErr) {
          console.error('[ComplaintController:verifyComplaint] Supabase find error:', findErr.message);
          return res.status(500).json({
            success: false,
            message: 'Database error looking up complaint: ' + findErr.message,
            error: findErr.message,
          });
        }

        if (!current) {
          return res.status(404).json({
            success: false,
            message: 'Complaint not found in database.',
          });
        }

        const timeline = parseTimeline(current.timeline);
        let newStatus = current.status;
        let updatePayload = { updatedAt: now.toISOString() };
        const capUpdate = (current.cap && typeof current.cap === 'object') ? { ...current.cap } : {};

        if (decision === 'START_REVIEW') {
          newStatus = 'Under Review';
          updatePayload.status = newStatus;
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
          updatePayload.status = newStatus;
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
          updatePayload.status = newStatus;
          updatePayload.actualCompletedAt = now.toISOString();
          updatePayload.rejectionReason = '';
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
          updatePayload.status = newStatus;
          updatePayload.rejectionReason = reason;
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

        updatePayload.status = toDbStatus(newStatus);
        updatePayload.cap = capUpdate;
        updatePayload.description = setWorkflowStatusInDescription(current.description, newStatus);
        updatePayload.timeline = timeline;

        const { data: updated, error: updateErr } = await supabase
          .from('complaints')
          .update(updatePayload)
          .eq('id', current.id)
          .select()
          .single();

        if (updateErr) {
          console.error('[ComplaintController:verifyComplaint] Supabase update error:', updateErr.message);
          return res.status(500).json({
            success: false,
            message: 'Failed to record audit decision in database: ' + updateErr.message,
            error: updateErr.message,
          });
        }

        if (updated) {
          mockStore.updateComplaint(current.id, { ...updatePayload, cap: capUpdate });
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
            complaint: formatComplaintOutput({ ...updated, cap: capUpdate }),
          });
        }
      } catch (dbErr) {
        console.error('[ComplaintController:verifyComplaint] Supabase exception:', dbErr.message);
        return res.status(500).json({
          success: false,
          message: 'Database exception: ' + dbErr.message,
          error: dbErr.message,
        });
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

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: current, error: findErr } = await supabase
          .from('complaints')
          .select('*')
          .or(`id.eq.${paramId},complaintId.eq.${paramId}`)
          .maybeSingle();

        if (findErr) {
          console.error('[ComplaintController:addTimelineComment] Supabase find error:', findErr.message);
          return res.status(500).json({
            success: false,
            message: 'Database error looking up complaint: ' + findErr.message,
            error: findErr.message,
          });
        }

        if (!current) {
          return res.status(404).json({
            success: false,
            message: 'Complaint not found in database.',
          });
        }

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

        const { data: updated, error: updateErr } = await supabase
          .from('complaints')
          .update({ timeline, updatedAt: now.toISOString() })
          .eq('id', current.id)
          .select()
          .single();

        if (updateErr) {
          console.error('[ComplaintController:addTimelineComment] Supabase update error:', updateErr.message);
          return res.status(500).json({
            success: false,
            message: 'Failed to record remark in database: ' + updateErr.message,
            error: updateErr.message,
          });
        }

        if (updated) {
          mockStore.updateComplaint(current.id, { timeline: updated.timeline, updatedAt: now.toISOString() });
          return res.status(200).json({
            success: true,
            message: 'Remark recorded in ticket audit trail.',
            timeline: updated.timeline,
            complaint: formatComplaintOutput(updated),
          });
        }
      } catch (dbErr) {
        console.error('[ComplaintController:addTimelineComment] Supabase exception:', dbErr.message);
        return res.status(500).json({
          success: false,
          message: 'Database exception: ' + dbErr.message,
          error: dbErr.message,
        });
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

    if (isSupabaseConfigured && supabase) {
      try {
        let query = supabase.from('complaints').select('status, deadlineTimestamp, assignedTo, department');

        if (req.user && (req.user.role === 'ACTION_PERSON' || req.user.role === 'SUPERVISOR')) {
          const userEmpId = req.user.employeeId;
          const userId = req.user.id || req.user._id;

          let orFilters = [];
          if (userEmpId) orFilters.push(`assignedTo->>employeeId.eq.${userEmpId}`);
          if (userId) orFilters.push(`assignedTo->>userId.eq.${userId}`);

          if (orFilters.length > 0) {
            query = query.or(orFilters.join(','));
          } else {
            query = query.eq('id', 'no-match');
          }
        }

        const { data: allComplaints, error } = await query;

        if (!error && allComplaints) {
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
        console.warn('[ComplaintController:getKpiStats] Supabase notice:', dbErr.message);
      }
    }

    const allComplaints = mockStore.getComplaints();
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

    if (isSupabaseConfigured && supabase) {
      try {
        const [complaintsRes, usersRes] = await Promise.all([
          supabase.from('complaints').select('*').order('createdAt', { ascending: false }),
          supabase.from('users').select('*').eq('isActive', true),
        ]);

        if (!complaintsRes.error && complaintsRes.data) {
          allComplaints = complaintsRes.data.map(formatComplaintOutput);
        }
        if (!usersRes.error && usersRes.data) {
          allUsers = usersRes.data.map((u) => ({ ...u, _id: u.id }));
        }
      } catch (dbErr) {
        console.warn('[ComplaintController:getAdminOversightStats] Supabase notice:', dbErr.message);
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

      const closedOnTime = closedTickets.filter((c) => {
        if (!c.actualCompletedAt) return true;
        return new Date(c.actualCompletedAt) <= new Date(c.deadlineTimestamp);
      }).length;
      const complianceRate = closedTickets.length > 0 ? Math.round((closedOnTime / closedTickets.length) * 100) : 100;

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

    const supervisorIdMap = {
      '6ab21322cd50706ee2a84637': 'SUP-101',
      '6ab21322cd50706ee2a84638': 'SUP-102',
      '6ab21322cd50706ee2a84639': 'SUP-103',
      '6ab21322cd50706ee2a84640': 'SUP-104',
      '6ab21322cd50706ee2a84641': 'SUP-105',
      '6ab21322cd50706ee2a84642': 'SUP-106',
      '6ab21322cd50706ee2a84643': 'SUP-107',
      '6ab21322cd50706ee2a84644': 'SUP-108',
      '6ab21322cd50706ee2a84645': 'SUP-109',
      '6ab21322cd50706ee2a84646': 'SUP-110',
    };
    const lookupSupervisorId = supervisorIdMap[assignedToUserId] || assignedToUserId;

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: sups } = await supabase
          .from('users')
          .select('*')
          .or(`id.eq.${lookupSupervisorId},employeeId.eq.${lookupSupervisorId},email.eq.${lookupSupervisorId}`)
          .limit(1);

        if (sups && sups.length > 0) {
          supervisor = sups[0];
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
      userId: supervisor.id || supervisor._id || 'usr-sup-001',
      employeeId: supervisor.employeeId || 'SUP-001',
      name: supervisor.name || 'Rajesh Kumar',
      department: supervisor.department || 'Production',
      designation: supervisor.designation || 'Production Floor In-Charge',
      mobileNumber: supervisor.mobileNumber || '+91 98111 22334',
    };

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: current, error: findErr } = await supabase
          .from('complaints')
          .select('*')
          .or(`id.eq.${paramId},complaintId.eq.${paramId}`)
          .maybeSingle();

        if (findErr) {
          console.error('[ComplaintController:reassignComplaint] Supabase lookup error:', findErr.message);
          return res.status(500).json({
            success: false,
            message: 'Database error looking up complaint: ' + findErr.message,
            error: findErr.message,
          });
        }

        if (!current) {
          return res.status(404).json({
            success: false,
            message: 'Complaint not found in database.',
          });
        }

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

        const { data: updated, error: updateErr } = await supabase
          .from('complaints')
          .update({
            assignedTo,
            timeline,
            updatedAt: now.toISOString(),
          })
          .eq('id', current.id)
          .select()
          .single();

        if (updateErr) {
          console.error('[ComplaintController:reassignComplaint] Supabase update error:', updateErr.message);
          return res.status(500).json({
            success: false,
            message: 'Failed to update assignment in database: ' + updateErr.message,
            error: updateErr.message,
          });
        }

        if (updated) {
          mockStore.updateComplaint(current.id, {
            assignedTo,
            timeline: updated.timeline,
            updatedAt: now.toISOString(),
          });
          return res.status(200).json({
            success: true,
            message: `Task successfully assigned to ${supervisor.name} (${supervisor.department}).`,
            complaint: formatComplaintOutput(updated),
          });
        }
      } catch (dbErr) {
        console.error('[ComplaintController:reassignComplaint] Supabase exception:', dbErr.message);
        return res.status(500).json({
          success: false,
          message: 'Database exception: ' + dbErr.message,
          error: dbErr.message,
        });
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

// @desc    Delete complaint / defect log
// @route   DELETE /api/complaints/:id
// @access  Private (Auditor or Admin)
const deleteComplaint = async (req, res) => {
  try {
    const paramId = req.params.id;

    // Delete from Supabase if configured
    if (isSupabaseConfigured && supabase) {
      try {
        const { error: delErr } = await supabase
          .from('complaints')
          .delete()
          .or(`id.eq.${paramId},complaintId.eq.${paramId}`);

        if (delErr) {
          console.error('[ComplaintController:deleteComplaint] Supabase delete error:', delErr.message);
          return res.status(500).json({
            success: false,
            message: 'Failed to delete complaint from database: ' + delErr.message,
            error: delErr.message,
          });
        }
      } catch (err) {
        console.error('[ComplaintController:deleteComplaint] Supabase exception:', err.message);
        return res.status(500).json({
          success: false,
          message: 'Database exception: ' + err.message,
          error: err.message,
        });
      }
    }

    // Delete from in-memory mock store
    mockStore.deleteComplaint(paramId);

    return res.status(200).json({
      success: true,
      message: `Defect log ${paramId} deleted successfully.`,
      id: paramId,
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

    // Fetch complaints from Supabase if configured
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: dbTickets, error: dbErr } = await supabase
          .from('complaints')
          .select('*')
          .order('createdAt', { ascending: false });

        if (!dbErr && Array.isArray(dbTickets)) {
          allComplaints = dbTickets.map(formatComplaintOutput);
        } else if (dbErr) {
          console.warn('[ComplaintController:getDepartmentComplianceStats] Supabase error:', dbErr.message);
        }
      } catch (err) {
        console.warn('[ComplaintController:getDepartmentComplianceStats] Supabase notice:', err.message);
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

    // Discover any other departments in complaints
    const foundDepts = new Set();
    allComplaints.forEach((c) => {
      if (c.department && c.department.trim()) {
        foundDepts.add(normalizeDeptName(c.department));
      }
    });

    const combinedDepts = Array.from(new Set([...standardDepts, ...Array.from(foundDepts)]));

    const departmentStats = combinedDepts.map((deptName) => {
      const deptComplaints = allComplaints.filter((c) => {
        return normalizeDeptName(c.department).toLowerCase() === deptName.toLowerCase();
      });

      const totalNC = deptComplaints.length;
      const openNC = deptComplaints.filter((c) => c.status !== 'Closed').length;
      const overdueNC = deptComplaints.filter((c) => {
        return c.status !== 'Closed' && new Date(c.deadlineTimestamp) < now;
      }).length;
      const closedNC = deptComplaints.filter((c) => c.status === 'Closed').length;
      const verifiedNC = deptComplaints.filter((c) => c.status === 'Verified').length;
      const capSubmittedNC = deptComplaints.filter((c) => c.status === 'CAP Submitted').length;
      const underReviewNC = deptComplaints.filter((c) => c.status === 'Under Review').length;
      const draftNC = deptComplaints.filter((c) => c.status === 'Draft').length;

      // ── Weighted Compliance & Risk Scoring (scoringEngine) ──────────────────
      // Maps NC priority → severity weight; NC workflow status → point score.
      // Compliance Score = Σ(achieved weighted pts) / Σ(max weighted pts) × 100
      // Risk Score = Critical / High / Medium / Low based on NC severity mix.
      const scoring = computeDepartmentNCScore(deptComplaints, now);
      const complianceScore = scoring.complianceScore;

      // CAP compliance calculation (kept for capPercent column)
      const capRequiredItems = deptComplaints.filter((c) => c.capRequired !== false);
      const capCompletedItems = capRequiredItems.filter((c) =>
        ['CAP Submitted', 'Under Review', 'Verified', 'Closed', 'Under Verification'].includes(c.status) ||
        (c.capPlan && (c.capPlan.immediateCorrection || c.capPlan.correctiveAction)) ||
        c.afterPhoto
      );
      const capPercent = capRequiredItems.length > 0
        ? Math.round((capCompletedItems.length / capRequiredItems.length) * 100)
        : totalNC > 0 ? 100 : 100;

      // Threshold level determination (for color coding)
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

      return {
        department: deptName,
        score: complianceScore,
        openNC,
        overdueNC,
        capPercent,
        totalNC,
        closedNC,
        verifiedNC,
        capSubmittedNC,
        underReviewNC,
        draftNC,
        statusLevel,
        statusColor,
        statusEmoji,
        // ── New weighted scoring fields ──────────────────────────────────────
        riskScore: scoring.riskScore,           // 'Low' | 'Medium' | 'High' | 'Critical'
        riskColor: scoring.riskColor,           // tailwind color name
        riskEmoji: scoring.riskEmoji,           // emoji indicator
        riskLevel: scoring.riskLevel,           // numeric 1-4 for sorting
        criticalNC: scoring.criticalNCCount,    // count of Critical-weight NCs
        majorNC: scoring.majorNCCount,          // count of Major-weight NCs
        overdueCap: scoring.overdueCAPCount,    // overdue CAP tickets
        weightedAchieved: scoring.weightedAchieved,
        weightedMax: scoring.weightedMax,
      };
    });

    // Sort by score descending (top performing first)
    departmentStats.sort((a, b) => b.score - a.score);

    // Factory Overall Compliance Score (average of active departments or 100% when clean)
    const validScores = departmentStats.filter((d) => d.totalNC > 0);
    const overallScore = validScores.length > 0
      ? Math.round(validScores.reduce((acc, d) => acc + d.score, 0) / validScores.length)
      : 100;

    const totalOpenNC = departmentStats.reduce((sum, d) => sum + d.openNC, 0);
    const totalOverdueNC = departmentStats.reduce((sum, d) => sum + d.overdueNC, 0);
    const avgCapPercent = departmentStats.length > 0
      ? Math.round(departmentStats.reduce((sum, d) => sum + d.capPercent, 0) / departmentStats.length)
      : 100;

    // Total audits from real database
    let totalAudits = 0;
    try {
      if (isSupabaseConfigured && supabase) {
        const { count } = await supabase.from('audits').select('*', { count: 'exact', head: true });
        totalAudits = count || 0;
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

      const mOpen = inMonth.filter((c) => c.status !== 'Closed').length;
      const mClosed = inMonth.filter((c) => c.status === 'Closed').length;
      const mCompliance = inMonth.length > 0
        ? Math.round((mClosed / inMonth.length) * 100)
        : 100;

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
      totalOpenNC,
      totalOverdueNC,
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
    const audits = mockStore.getAudits();
    return res.status(200).json({
      success: true,
      stats: {
        completedAudits: 24,
        openAudits: audits.filter((a) => a.status !== 'Completed').length || 3,
        ncsFound: 87,
        ncClosureRate: 91,
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

    const newAudit = mockStore.createAudit({
      title,
      date,
      departments: departments || ['HR', 'Production', 'EHS'],
      leadAuditor: leadAuditor || req.user?.name || 'Auditor',
    });

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
};
