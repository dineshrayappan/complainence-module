const express = require('express');
const router = express.Router();
const {
  getAuditLogs,
  getAuditLogStats,
  createAuditLog,
  clearAuditLogs,
  exportAuditLogs,
} = require('../controllers/auditLogController');
const { verifyToken, requireRole } = require('../middleware/auth');

// All audit log routes require authentication
router.use(verifyToken);

// Aggregate stats (Admin only)
router.get('/stats', requireRole(['ADMIN', 'SUPERADMIN']), getAuditLogStats);

// Export logs (Admin only)
router.get('/export', requireRole(['ADMIN', 'SUPERADMIN']), exportAuditLogs);

// Query event logs with filtering and pagination (Admin only)
router.get('/', requireRole(['ADMIN', 'SUPERADMIN']), getAuditLogs);

// Manually submit an event record (Admin, Auditor, or Authenticated system action)
router.post('/', createAuditLog);

// Clear event logs (Admin only)
router.delete('/', requireRole(['ADMIN', 'SUPERADMIN']), clearAuditLogs);

module.exports = router;
