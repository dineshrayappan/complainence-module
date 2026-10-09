const express = require('express');
const router = express.Router();
const {
  getTasks,
  createTask,
  updateTask,
  startTask,
  completeTask,
  deleteTask,
  getEmployeeWorkStatus,
} = require('../controllers/taskController');
const { verifyToken, requireRole } = require('../middleware/auth');

// Live status of department employees (Admin / Auditor / Supervisor live oversight)
router.get('/live-status', verifyToken, getEmployeeWorkStatus);

// List: every authenticated user sees their own tasks; ADMIN/AUDITOR see all.
// Filtering (state, department) is done server-side in the controller.
router.get('/', verifyToken, getTasks);

// Scheduling new recurring work is an audit/admin responsibility.
router.post('/', verifyToken, requireRole(['ADMIN', 'AUDITOR']), createTask);

// Start work: employee clicks start when ready to begin
router.post('/:id/start', verifyToken, startTask);

// Update / complete: controller checks authorization and mandates proof of completion
router.put('/:id', verifyToken, updateTask);
router.post('/:id/complete', verifyToken, completeTask);

// Deletion is restricted to the same elevated roles as creation.
router.delete('/:id', verifyToken, requireRole(['ADMIN', 'AUDITOR']), deleteTask);

module.exports = router;
