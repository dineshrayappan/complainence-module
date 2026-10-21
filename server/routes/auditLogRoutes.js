const express = require('express');
const router = express.Router();
const {
  getAuditLogs,
  getUserLoginTimes,
  exportAuditLogs,
  clearAuditLogs,
} = require('../controllers/auditLogController');
const { verifyToken, requireRole } = require('../middleware/auth');

// All audit routes require valid authentication
router.use(verifyToken);

// Track user login times across the application (Admin oversight)
router.get('/logins', requireRole(['ADMIN', 'SUPERADMIN']), getUserLoginTimes);

// Export past records log as CSV (Admin oversight)
router.get('/export', requireRole(['ADMIN', 'SUPERADMIN']), exportAuditLogs);

// Query activity log history & past records with search, category filtering & pagination
router.get('/', requireRole(['ADMIN', 'SUPERADMIN', 'AUDITOR']), getAuditLogs);

// Clear logs (Admin only)
router.delete('/', requireRole(['ADMIN', 'SUPERADMIN']), clearAuditLogs);

module.exports = router;
