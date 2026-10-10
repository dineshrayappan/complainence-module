const express = require('express');
const router = express.Router();
const {
  getLineSupervisors,
  getAllUsers,
  createUser,
  updateUser,
  resetUserPassword,
  toggleUserStatus,
  checkUserDependencies,
  deleteUser,
} = require('../controllers/userController');
const { verifyToken, requireRole } = require('../middleware/auth');

// Line In-Charges master contact list (for assignment dropdown)
router.get('/line-supervisors', verifyToken, getLineSupervisors);

// Users Directory (Admin and internal authenticated users)
router.get('/', verifyToken, getAllUsers);

// Admin-Only User & Credential Management
router.post('/', verifyToken, requireRole(['ADMIN']), createUser);
router.put('/:id', verifyToken, requireRole(['ADMIN']), updateUser);
router.patch('/:id/reset-password', verifyToken, requireRole(['ADMIN']), resetUserPassword);
router.patch('/:id/toggle-status', verifyToken, requireRole(['ADMIN']), toggleUserStatus);
router.get('/:id/dependencies', verifyToken, requireRole(['ADMIN']), checkUserDependencies);
router.delete('/:id', verifyToken, requireRole(['ADMIN']), deleteUser);

module.exports = router;
