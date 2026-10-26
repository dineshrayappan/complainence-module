const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const mockStore = require('../config/mockStore');
const { isMongoConnected, connectDB } = require('../config/db');
const { logEvent } = require('../utils/eventLogger');
const {
  getAuditLogModel,
  getUserModel,
  getCanonicalUnitId,
  getCanonicalUnitName,
} = require('../models/unitModels');
const {
  getDailyAttendanceMap,
  evaluateUserDailyAttendance,
  getTodayISTString,
} = require('../utils/attendanceHelper');

// Helper to resolve unit strictly to UNIT-1 or UNIT-2
const resolveAuditRequestUnit = (req) => {
  const candidate = req.query?.unitId || req.body?.unitId || req.activeUnitId || req.user?.unitId || 'UNIT-1';
  return getCanonicalUnitId(candidate);
};

// @desc    Get audit trail & activity log history with search, category filtering & pagination
// @route   GET /api/audit-logs
// @access  Private (ADMIN only)
const getAuditLogs = async (req, res) => {
  try {
    const {
      search = '',
      category = 'ALL',
      severity = 'ALL',
      timeframe = 'all',
      userId = '',
      page = 1,
      limit = 50,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;
    const targetUnit = resolveAuditRequestUnit(req);

    if (!isMongoConnected()) {
      await connectDB();
    }

    if (isMongoConnected()) {
      try {
        const AuditLogModel = getAuditLogModel(targetUnit);
        const query = {};
        const andConditions = [];

        if (category && category !== 'ALL') {
          if (category === 'DELETIONS') {
            andConditions.push({
              $or: [
                { action: { $regex: /DELET/i } },
                { action_label: { $regex: /delet/i } },
                { details: { $regex: /permanently deleted|deleted by/i } },
              ],
            });
          } else {
            query.category = category.toUpperCase();
          }
        }

        if (severity && severity !== 'ALL') {
          query.severity = severity.toUpperCase();
        }

        if (userId && userId.trim()) {
          query.user_id = { $regex: new RegExp(`^${userId.trim()}$`, 'i') };
        }

        if (timeframe && timeframe !== 'all') {
          const now = Date.now();
          if (timeframe === 'today') {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            query.created_at = { $gte: d };
          } else if (timeframe === '7days') {
            query.created_at = { $gte: new Date(now - 7 * 24 * 3600 * 1000) };
          } else if (timeframe === '30days') {
            query.created_at = { $gte: new Date(now - 30 * 24 * 3600 * 1000) };
          }
        }

        if (search && search.trim()) {
          const q = search.trim();
          andConditions.push({
            $or: [
              { user_name: { $regex: q, $options: 'i' } },
              { user_id: { $regex: q, $options: 'i' } },
              { action_label: { $regex: q, $options: 'i' } },
              { action: { $regex: q, $options: 'i' } },
              { details: { $regex: q, $options: 'i' } },
              { entity_name: { $regex: q, $options: 'i' } },
              { related_nc_id: { $regex: q, $options: 'i' } },
            ],
          });
        }

        if (andConditions.length > 0) {
          query.$and = andConditions;
        }

        const [total, docs] = await Promise.all([
          AuditLogModel.countDocuments(query),
          AuditLogModel.find(query).sort({ created_at: -1 }).skip(skip).limit(limitNum).lean(),
        ]);

        return res.status(200).json({
          success: true,
          unitId: targetUnit,
          unitName: getCanonicalUnitName(targetUnit),
          logs: docs.map((d) => ({
            ...d,
            id: d._id ? d._id.toString() : d.id,
          })),
          total,
          page: pageNum,
          totalPages: Math.ceil(total / limitNum) || 1,
          mode: 'MONGODB',
        });
      } catch (dbErr) {
        console.warn('⚠️ [AuditLogController] MongoDB query failed, falling back to mockStore:', dbErr.message);
      }
    }

    // In-Memory Fallback
    const result = mockStore.getAuditLogs({
      search,
      category,
      severity,
      timeframe,
      userId,
      page: pageNum,
      limit: limitNum,
    });

    return res.status(200).json({
      success: true,
      unitId: targetUnit,
      unitName: getCanonicalUnitName(targetUnit),
      ...result,
      mode: 'IN_MEMORY',
    });
  } catch (err) {
    console.error('❌ [AuditLogController:getAuditLogs] Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve activity log history.',
      error: err.message,
    });
  }
};

// @desc    Track user login times and sign-in history across all plant personnel
// @route   GET /api/audit-logs/logins
// @access  Private (ADMIN only)
const getUserLoginTimes = async (req, res) => {
  try {
    const { timeframe = 'all', search = '', limit = 100 } = req.query;
    const todayDate = getTodayISTString();
    const attendanceMap = await getDailyAttendanceMap(todayDate);
    const targetUnit = resolveAuditRequestUnit(req);

    let rawUsers = [];
    let recentLogins = [];

    if (!isMongoConnected()) {
      await connectDB();
    }

    if (isMongoConnected()) {
      try {
        const UserModel = getUserModel(targetUnit);
        const AuditLogModel = getAuditLogModel(targetUnit);

        const [mongoUsers, mongoLogs] = await Promise.all([
          UserModel.find({ isDeleted: { $ne: true } }).sort({ role: 1, name: 1 }).lean(),
          AuditLogModel.find({
            $or: [
              { category: 'AUTH' },
              { action: { $regex: /^AUTH_/ } },
            ],
          })
            .sort({ created_at: -1 })
            .limit(parseInt(limit, 10) || 100)
            .lean(),
        ]);

        rawUsers = mongoUsers;
        recentLogins = mongoLogs.map((l) => ({
          ...l,
          id: l._id ? l._id.toString() : l.id,
        }));
      } catch (dbErr) {
        console.warn('⚠️ [AuditLogController:getUserLoginTimes] MongoDB error, using fallback:', dbErr.message);
        rawUsers = mockStore.getUsers();
        recentLogins = mockStore.getLoginHistory({ timeframe, limit });
      }
    } else {
      rawUsers = mockStore.getUsers();
      recentLogins = mockStore.getLoginHistory({ timeframe, limit });
    }

    // Compile roster with precise login tracking data for every user
    let roster = rawUsers.map((u) => {
      const att = evaluateUserDailyAttendance(u, attendanceMap, todayDate);
      const isPresent = att.isPresent;

      // Find user's latest login event from recentLogins
      const userLatestLogin = recentLogins.find(
        (l) =>
          (l.user_id && (l.user_id === u.employeeId || l.user_id === String(u._id || u.id))) ||
          (l.user_name && l.user_name === u.name)
      );

      const effectiveLogin = att.loginTimestamp || u.lastLoginAt || userLatestLogin?.created_at || null;
      const effectiveLogout = u.lastLogoutAt || null;

      let sessionDuration = null;
      if (isPresent && effectiveLogin) {
        const diffMs = Math.max(0, Date.now() - new Date(effectiveLogin).getTime());
        const diffMins = Math.floor(diffMs / 60000);
        const hrs = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        sessionDuration = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
      } else if (effectiveLogout && effectiveLogin && new Date(effectiveLogout) >= new Date(effectiveLogin)) {
        const diffMs = Math.max(0, new Date(effectiveLogout).getTime() - new Date(effectiveLogin).getTime());
        const diffMins = Math.floor(diffMs / 60000);
        const hrs = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        sessionDuration = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
      }

      const formatISTHelper = (dateVal) => {
        if (!dateVal) return null;
        try {
          const d = new Date(dateVal);
          if (isNaN(d.getTime())) return null;
          return d.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          });
        } catch {
          return null;
        }
      };

      return {
        id: u._id ? u._id.toString() : u.id,
        employeeId: u.employeeId,
        name: u.name,
        email: u.email,
        role: u.role === 'SUPERVISOR' ? 'ACTION_PERSON' : u.role,
        department: u.department,
        designation: u.designation,
        unitId: targetUnit,
        unitName: getCanonicalUnitName(targetUnit),
        isActive: typeof u.isActive !== 'undefined' ? u.isActive : true,
        isPresent,
        attendanceStatus: isPresent ? 'Present' : 'Absent',
        attendanceDate: att.date,
        loginTimestamp: effectiveLogin,
        lastLoginAt: effectiveLogin,
        lastLogoutAt: effectiveLogout,
        lastLoginIST: formatISTHelper(effectiveLogin),
        lastLogoutIST: formatISTHelper(effectiveLogout),
        sessionDuration,
        lastIpAddress: userLatestLogin?.ip_address || '127.0.0.1',
      };
    });

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      roster = roster.filter(
        (u) =>
          (u.name || '').toLowerCase().includes(q) ||
          (u.employeeId || '').toLowerCase().includes(q) ||
          (u.department || '').toLowerCase().includes(q) ||
          (u.designation || '').toLowerCase().includes(q) ||
          (u.role || '').toLowerCase().includes(q)
      );
    }

    const totalUsers = roster.length;
    const loggedTodayCount = roster.filter((u) => u.isPresent || u.loginTimestamp).length;
    const activeNowCount = roster.filter((u) => u.isPresent).length;
    const absentCount = roster.filter((u) => !u.isPresent).length;
    const neverLoggedInCount = roster.filter((u) => !u.lastLoginAt).length;

    return res.status(200).json({
      success: true,
      unitId: targetUnit,
      unitName: getCanonicalUnitName(targetUnit),
      stats: {
        totalUsers,
        loggedTodayCount,
        activeNowCount,
        absentCount,
        neverLoggedInCount,
        todayDate,
      },
      roster,
      recentLogins,
    });
  } catch (err) {
    console.error('❌ [AuditLogController:getUserLoginTimes] Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve login times and attendance records.',
      error: err.message,
    });
  }
};

// @desc    Export past activity logs as CSV
// @route   GET /api/audit-logs/export
// @access  Private (ADMIN only)
const exportAuditLogs = async (req, res) => {
  try {
    let list = [];
    const targetUnit = resolveAuditRequestUnit(req);

    if (!isMongoConnected()) {
      await connectDB();
    }

    if (isMongoConnected()) {
      try {
        const AuditLogModel = getAuditLogModel(targetUnit);
        list = await AuditLogModel.find().sort({ created_at: -1 }).limit(1000).lean();
      } catch (dbErr) {
        list = mockStore.getAuditLogs({ limit: 1000 }).logs;
      }
    } else {
      list = mockStore.getAuditLogs({ limit: 1000 }).logs;
    }

    const headers = [
      'Timestamp (ISO)',
      'Timestamp (IST)',
      'Event ID',
      'Severity',
      'Category',
      'Action Label',
      'Action Code',
      'Actor Name',
      'Actor Employee ID',
      'Actor Role',
      'Entity Type',
      'Entity ID',
      'Related NC ID',
      'Details',
      'IP Address',
    ];

    const rows = list.map((l) => {
      const d = new Date(l.created_at);
      const istTime = d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      return [
        `"${d.toISOString()}"`,
        `"${istTime}"`,
        `"${l.id || l._id || ''}"`,
        `"${l.severity || 'INFO'}"`,
        `"${l.category || 'SYSTEM'}"`,
        `"${(l.action_label || '').replace(/"/g, '""')}"`,
        `"${l.action || ''}"`,
        `"${(l.user_name || '').replace(/"/g, '""')}"`,
        `"${l.user_id || ''}"`,
        `"${l.user_role || ''}"`,
        `"${l.entity_type || ''}"`,
        `"${l.entity_id || ''}"`,
        `"${l.related_nc_id || ''}"`,
        `"${(l.details || '').replace(/"/g, '""')}"`,
        `"${l.ip_address || ''}"`,
      ];
    });

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="compliance_${targetUnit.toLowerCase()}_audit_log.csv"`);
    return res.status(200).send(csvContent);
  } catch (err) {
    console.error('❌ [AuditLogController:exportAuditLogs] Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to export log history.',
    });
  }
};

// @desc    Clear or truncate logs (Admin privilege with safety logging)
// @route   DELETE /api/audit-logs
// @access  Private (ADMIN only)
const clearAuditLogs = async (req, res) => {
  try {
    const targetUnit = resolveAuditRequestUnit(req);

    await logEvent({
      req,
      unitId: targetUnit,
      action: 'AUDIT_LOG_PURGE',
      actionLabel: 'Log History Cleared',
      category: 'SECURITY',
      severity: 'CRITICAL',
      details: `Administrator ${req.user?.name || req.user?.employeeId || 'ADMIN'} cleared past records log history for ${getCanonicalUnitName(targetUnit)}.`,
    });

    if (isMongoConnected()) {
      try {
        const AuditLogModel = getAuditLogModel(targetUnit);
        await AuditLogModel.deleteMany({});
      } catch (dbErr) {
        console.warn('⚠️ [AuditLogController] MongoDB clear failed:', dbErr.message);
      }
    }

    mockStore.clearAuditLogs();

    return res.status(200).json({
      success: true,
      message: `Past log records cleared successfully for ${getCanonicalUnitName(targetUnit)}.`,
    });
  } catch (err) {
    console.error('❌ [AuditLogController:clearAuditLogs] Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to clear log records.',
    });
  }
};

module.exports = {
  getAuditLogs,
  getUserLoginTimes,
  exportAuditLogs,
  clearAuditLogs,
};
