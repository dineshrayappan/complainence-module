const express = require('express');
const router = express.Router();
const {
  getDepartments,
  createDepartment,
  deleteDepartment,
  checkDepartmentDependencies,
} = require('../controllers/departmentController');
const { verifyToken, requireRole } = require('../middleware/auth');

// Public/Authenticated view of departments
router.get('/', verifyToken, getDepartments);

// Admin-Only Department Management & Deletion
router.get('/:id/dependencies', verifyToken, requireRole(['ADMIN']), checkDepartmentDependencies);
router.post('/', verifyToken, requireRole(['ADMIN']), createDepartment);
router.delete('/:id', verifyToken, requireRole(['ADMIN']), deleteDepartment);

module.exports = router;
