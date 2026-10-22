const express = require('express');
const router = express.Router();
const {
  login,
  register,
  getMe,
  logout,
  updateOwnerPassword,
} = require('../controllers/authController');
const { verifyToken, requireOwner } = require('../middleware/auth');

router.post('/login', login);
router.post('/register', register);
router.post('/logout', logout);
router.get('/me', verifyToken, getMe);
router.patch('/owner/password', verifyToken, requireOwner, updateOwnerPassword);

module.exports = router;
