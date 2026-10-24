const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/complaintController');
const { verifyToken, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Safe Multer upload handlers that catch errors and allow base64 fallback
const safeUploadBeforePhoto = (req, res, next) => {
  upload.any()(req, res, (err) => {
    if (err) {
      console.warn('[Multer:uploadBeforePhoto] Warning:', err.message);
      if (req.body && (req.body.beforePhoto || req.body.beforePhotoUrl || req.body.beforePhotoBase64 || req.body.beforePhotoFile)) {
        return next();
      }
      return res.status(400).json({
        success: false,
        message: `Photo upload error: ${err.message}`,
      });
    }
    if (Array.isArray(req.files) && req.files.length > 0) {
      req.file =
        req.files.find((f) => f.fieldname === 'beforePhoto' || f.fieldname === 'beforePhotoFile') ||
        req.files[0];
    }
    next();
  });
};

const safeUploadAfterPhoto = (req, res, next) => {
  upload.any()(req, res, (err) => {
    if (err) {
      console.warn('[Multer:uploadAfterPhoto] Warning:', err.message);
      if (req.body && (req.body.afterPhoto || req.body.afterPhotoUrl || req.body.afterPhotoBase64 || req.body.afterPhotoFile)) {
        return next();
      }
      return res.status(400).json({
        success: false,
        message: `Photo upload error: ${err.message}`,
      });
    }
    if (Array.isArray(req.files) && req.files.length > 0) {
      req.file =
        req.files.find((f) => f.fieldname === 'afterPhoto' || f.fieldname === 'afterPhotoFile') ||
        req.files[0];
    }
    next();
  });
};

// Admin executive oversight & monitoring endpoint (must be declared before :id)
router.get('/admin/oversight', verifyToken, requireRole(['ADMIN', 'AUDITOR']), getAdminOversightStats);

// Department-wise compliance scoreboard & configurable thresholds (must be declared before :id)
router.get('/admin/department-compliance', verifyToken, getDepartmentComplianceStats);
router.put('/admin/compliance-thresholds', verifyToken, requireRole(['ADMIN']), updateComplianceThresholds);

// Audit Management routes (must be declared before :id)
router.get('/admin/audits', verifyToken, getAudits);
router.put('/admin/audits/:id/checklist', verifyToken, requireRole(['AUDITOR', 'ADMIN']), updateAuditChecklist);
router.post('/admin/audits', verifyToken, requireRole(['AUDITOR', 'ADMIN']), createAuditRound);

// KPI Stats endpoint (must be declared before :id)
router.get('/stats/kpi', verifyToken, getKpiStats);

// Complaints CRUD & List
router.get('/', verifyToken, getComplaints);
router.get('/:id', verifyToken, getComplaintById);

// Create Complaint (AUDITOR or ADMIN role strictly enforced + Multer file upload for Before Photo)
router.post(
  '/',
  verifyToken,
  requireRole(['AUDITOR', 'ADMIN']),
  safeUploadBeforePhoto,
  createComplaint
);

// Reassign task to a different supervisor (AUDITOR or ADMIN)
router.patch(
  '/:id/reassign',
  verifyToken,
  requireRole(['AUDITOR', 'ADMIN']),
  reassignComplaint
);

// Update status to In Progress (Action Person, Supervisor, Auditor, or Admin)
router.patch('/:id/in-progress', verifyToken, markInProgress);

// Pause or stop floor containment back to Open status (Action Person, Supervisor, Auditor, or Admin)
router.patch('/:id/stop-work', verifyToken, pauseProgress);

// Submit Action Resolution (ACTION_PERSON or SUPERVISOR role strictly enforced + Multer file upload for After Photo)
router.post(
  '/:id/submit-action',
  verifyToken,
  requireRole(['ACTION_PERSON', 'SUPERVISOR', 'ADMIN', 'AUDITOR']),
  safeUploadAfterPhoto,
  submitAction
);
router.post(
  '/:id/action',
  verifyToken,
  requireRole(['ACTION_PERSON', 'SUPERVISOR', 'ADMIN', 'AUDITOR']),
  safeUploadAfterPhoto,
  submitAction
);


// Audit Verification Gateway: Approve & Close OR Reject & Return (AUDITOR or ADMIN)
router.post(
  '/:id/verify',
  verifyToken,
  requireRole(['AUDITOR', 'ADMIN']),
  verifyComplaint
);

// Direct timeline remarks / communication thread
router.post('/:id/timeline', verifyToken, addTimelineComment);

// Delete Defect Log (AUDITOR or ADMIN strictly enforced)
router.delete(
  '/:id',
  verifyToken,
  requireRole(['AUDITOR', 'ADMIN']),
  deleteComplaint
);

module.exports = router;
