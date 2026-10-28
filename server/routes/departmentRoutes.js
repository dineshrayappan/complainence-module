const express = require('express');
const router = express.Router();
const {
  getDepartments,
  createDepartment,
  deleteDepartment,
  checkDepartmentDependencies,
} = require('../controllers/departmentController');
const { verifyToken, requireRole } = require('../middleware/auth');

// Public view of departments for QR compliance raising
router.get('/public', getDepartments);

// Authenticated view of departments
router.get('/', (req, res, next) => {
  if (req.headers.authorization) {
    return verifyToken(req, res, next);
  }
  next();
}, getDepartments);

// Admin-Only Department Management & Deletion
router.get('/:id/dependencies', verifyToken, requireRole(['ADMIN']), checkDepartmentDependencies);
router.post('/', verifyToken, requireRole(['ADMIN']), createDepartment);
router.delete('/:id', verifyToken, requireRole(['ADMIN']), deleteDepartment);

module.exports = router;
