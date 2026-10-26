const express = require('express');
const router = express.Router();
const {
  getLineSupervisors,
  getAllUsers,
  getTodayAttendance,
  createUser,
  updateUser,
  resetUserPassword,
  toggleUserStatus,
  checkUserDependencies,
  deleteUser,
  getArchivedUsers,
  getUserNcHistory,
  restoreUser,
} = require('../controllers/userController');
const { verifyToken, requireRole } = require('../middleware/auth');

// Responsible Persons master contact list (for assignment dropdown)
router.get('/line-supervisors', verifyToken, getLineSupervisors);

// Daily Attendance status endpoint for Admin & Auditor oversight
router.get('/attendance/today', verifyToken, getTodayAttendance);

// Archived / Soft-Deleted Users (Must be defined before /:id)
router.get('/archived', verifyToken, requireRole(['ADMIN']), getArchivedUsers);

// Users Directory (Admin and internal authenticated users)
router.get('/', verifyToken, getAllUsers);

// Admin-Only User & Credential Management
router.post('/', verifyToken, requireRole(['ADMIN']), createUser);
router.put('/:id', verifyToken, requireRole(['ADMIN']), updateUser);
router.patch('/:id/reset-password', verifyToken, requireRole(['ADMIN']), resetUserPassword);
router.patch('/:id/toggle-status', verifyToken, requireRole(['ADMIN']), toggleUserStatus);
router.get('/:id/dependencies', verifyToken, requireRole(['ADMIN']), checkUserDependencies);
router.get('/:id/nc-history', verifyToken, requireRole(['ADMIN']), getUserNcHistory);
router.patch('/:id/restore', verifyToken, requireRole(['ADMIN']), restoreUser);
router.delete('/:id', verifyToken, requireRole(['ADMIN']), deleteUser);

module.exports = router;
