const express = require('express');
const router = express.Router();
const {
  getUnits,
  createUnit,
  updateUnit,
  getUnassignedRecords,
  assignRecords,
} = require('../controllers/unitController');
const { verifyToken, requireRole } = require('../middleware/auth');

// Public endpoint for unit list (used by QR compliance raising)
router.get('/public', getUnits);

// All unit routes below require authenticated session
router.use(verifyToken);

router.get('/', getUnits);
router.post('/', requireRole(['ADMIN', 'OWNER']), createUnit);
router.get('/unassigned', requireRole(['ADMIN', 'OWNER']), getUnassignedRecords);
router.post('/assign-records', requireRole(['ADMIN', 'OWNER']), assignRecords);
router.put('/:id', requireRole(['ADMIN', 'OWNER']), updateUnit);

module.exports = router;
