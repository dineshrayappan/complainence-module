const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
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

// @desc    Calculate individual member KPI scores based on monthly login days, absent days, and work duration
// @route   GET /api/audit-logs/member-kpi
// @access  Private (ADMIN, SUPERADMIN)
const getMemberKpiStats = async (req, res) => {
  try {
    const {
      month = getTodayISTString().slice(0, 7), // default 'YYYY-MM' (e.g. '2026-11')
      startDate,
      endDate,
      department = 'ALL',
      search = '',
      unitId,
      tier = 'ALL',
    } = req.query;

    const todayDate = getTodayISTString();
    const currentYearMonth = todayDate.slice(0, 7);

    let isCustomRange = false;
    let targetStartDate = '';
    let targetEndDate = '';
    let rangeLabel = '';
    let targetMonth = month;
    let year = parseInt(todayDate.slice(0, 4), 10);
    let monthNum = parseInt(todayDate.slice(5, 7), 10);

    // Format helper for display
    const formatDisplayDate = (dStr) => {
      try {
        const [y, m, d] = dStr.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        return dateObj.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
      } catch {
        return dStr;
      }
    };

    if (startDate && endDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      isCustomRange = true;
      if (startDate <= endDate) {
        targetStartDate = startDate;
        targetEndDate = endDate;
      } else {
        targetStartDate = endDate;
        targetEndDate = startDate;
      }
      rangeLabel = `${formatDisplayDate(targetStartDate)} – ${formatDisplayDate(targetEndDate)}`;
      targetMonth = targetStartDate.slice(0, 7);
      year = parseInt(targetStartDate.slice(0, 4), 10);
      monthNum = parseInt(targetStartDate.slice(5, 7), 10);
    } else {
      // Month mode
      if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
        targetMonth = currentYearMonth;
      }
      const [yearStr, monthNumStr] = targetMonth.split('-');
      year = parseInt(yearStr, 10);
      monthNum = parseInt(monthNumStr, 10);
      const daysInMonth = new Date(year, monthNum, 0).getDate();
      targetStartDate = `${targetMonth}-01`;
      targetEndDate = `${targetMonth}-${String(daysInMonth).padStart(2, '0')}`;
      rangeLabel = new Date(year, monthNum - 1, 1).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      });
    }

    // Build day list for calendar breakdown across targetStartDate to targetEndDate
    const daysInRangeList = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let curr = new Date(targetStartDate + 'T00:00:00Z');
    const endD = new Date(targetEndDate + 'T00:00:00Z');
    let dayCounter = 1;
    while (curr <= endD && dayCounter <= 366) {
      const y = curr.getUTCFullYear();
      const m = String(curr.getUTCMonth() + 1).padStart(2, '0');
      const d = String(curr.getUTCDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;
      const dObj = new Date(y, curr.getUTCMonth(), curr.getUTCDate());
      const dayOfWeek = dayNames[dObj.getDay()];
      const isPastOrToday = dateStr <= todayDate;
      const isFuture = dateStr > todayDate;

      daysInRangeList.push({
        dayNumber: dayCounter,
        date: dateStr,
        dayOfWeek,
        isPastOrToday,
        isFuture,
        isSunday: dObj.getDay() === 0,
      });

      curr.setUTCDate(curr.getUTCDate() + 1);
      dayCounter++;
    }

    const totalDaysInRange = daysInRangeList.length;
    let elapsedDays = daysInRangeList.filter((d) => d.isPastOrToday).length;
    if (elapsedDays === 0 && totalDaysInRange > 0 && targetStartDate <= todayDate) {
      elapsedDays = 1;
    }

    if (!isMongoConnected()) {
      await connectDB();
    }

    let rawUsers = [];
    let rangeAttendances = [];

    if (isMongoConnected()) {
      try {
        const queryUsers = { isDeleted: { $ne: true } };
        if (unitId && unitId !== 'ALL') {
          queryUsers.$or = [
            { unitId: unitId },
            { assignedUnits: unitId },
          ];
        }

        const [usersList, attendancesList] = await Promise.all([
          User.find(queryUsers).sort({ name: 1 }).lean(),
          Attendance.find({
            date: { $gte: targetStartDate, $lte: targetEndDate },
          }).lean(),
        ]);

        rawUsers = usersList;
        rangeAttendances = attendancesList;
      } catch (dbErr) {
        console.warn('⚠️ [AuditLogController:getMemberKpiStats] MongoDB error:', dbErr.message);
        rawUsers = mockStore.getUsers();
      }
    } else {
      rawUsers = mockStore.getUsers();
    }

    // Helper to format minutes as "Xh Ym" or "Ym"
    const formatDuration = (totalMins) => {
      if (!totalMins || totalMins <= 0) return '0m';
      const hrs = Math.floor(totalMins / 60);
      const mins = Math.round(totalMins % 60);
      if (hrs === 0) return `${mins}m`;
      if (mins === 0) return `${hrs}h`;
      return `${hrs}h ${mins}m`;
    };

    // Helper to format IST timestamp
    const formatIST = (dateVal) => {
      if (!dateVal) return null;
      try {
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return null;
        return d.toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });
      } catch {
        return null;
      }
    };

    // Process attendance duration
    const processedAtts = rangeAttendances.map((att) => {
      let durationMins = 15;
      if (att.lastLoginAt && att.loginTimestamp) {
        const diffMs = new Date(att.lastLoginAt).getTime() - new Date(att.loginTimestamp).getTime();
        const computed = Math.round(diffMs / 60000);
        durationMins = Math.max(15, Math.min(840, computed));
      } else if (att.updatedAt && att.createdAt) {
        const diffMs = new Date(att.updatedAt).getTime() - new Date(att.createdAt).getTime();
        const computed = Math.round(diffMs / 60000);
        durationMins = Math.max(15, Math.min(840, computed));
      }
      return {
        ...att,
        durationMinutes: durationMins,
      };
    });

    // Calculate score and breakdown for each member
    let memberScores = rawUsers.map((u) => {
      const empId = (u.employeeId || '').toUpperCase().trim();
      const uId = u._id ? u._id.toString() : String(u.id || '');

      const userAtts = processedAtts.filter((a) =>
        (a.employeeId && a.employeeId.toUpperCase().trim() === empId) ||
        (a.userId && a.userId === uId) ||
        (a.user && a.user.toString() === uId)
      );

      // Map by date string
      const dateAttMap = new Map();
      userAtts.forEach((a) => {
        if (!dateAttMap.has(a.date)) {
          dateAttMap.set(a.date, { ...a });
        } else {
          // Merge if multiple logins on same date
          const existing = dateAttMap.get(a.date);
          existing.durationMinutes = (existing.durationMinutes || 0) + (a.durationMinutes || 0);
          if (a.lastLoginAt && (!existing.lastLoginAt || new Date(a.lastLoginAt) > new Date(existing.lastLoginAt))) {
            existing.lastLoginAt = a.lastLoginAt;
          }
        }
      });

      const loginDates = new Set(userAtts.filter((a) => a.status === 'Present' || a.loginTimestamp).map((a) => a.date));
      const loginDays = loginDates.size;
      const absentDays = Math.max(0, elapsedDays - loginDays);
      const totalDurationMinutes = Array.from(dateAttMap.values()).reduce(
        (sum, a) => sum + (a.durationMinutes || 0),
        0
      );
      const avgDailyDurationMinutes = loginDays > 0 ? Math.round(totalDurationMinutes / loginDays) : 0;

      // KPI formula
      // 1. Attendance Consistency Rate: 50% max
      const attendanceRatio = elapsedDays > 0 ? loginDays / elapsedDays : 0;
      const loginScore = Math.min(50, Math.round(attendanceRatio * 50));

      // 2. Work Session Duration: 50% max (benchmark: 240 mins / 4.0 hrs average daily active session)
      const durationScore = loginDays > 0 ? Math.min(50, Math.round((avgDailyDurationMinutes / 240) * 50)) : 0;

      // 3. Overall KPI Score (0 - 100)
      const kpiScore = Math.min(100, Math.max(0, loginScore + durationScore));

      // Performance Tier
      let tierCode = 'NEEDS_ATTENTION';
      let tierLabel = 'Needs Attention';
      let tierGrade = 'Grade C';
      let tierColor = 'rose';

      if (kpiScore >= 85) {
        tierCode = 'EXCEPTIONAL';
        tierLabel = 'Exceptional';
        tierGrade = 'Grade A+';
        tierColor = 'emerald';
      } else if (kpiScore >= 70) {
        tierCode = 'GOOD';
        tierLabel = 'Good';
        tierGrade = 'Grade A';
        tierColor = 'indigo';
      } else if (kpiScore >= 50) {
        tierCode = 'AVERAGE';
        tierLabel = 'Average';
        tierGrade = 'Grade B';
        tierColor = 'amber';
      }

      // Generate day-by-day attendance calendar for this member across range
      const dailyBreakdown = daysInRangeList.map((dayInfo) => {
        const att = dateAttMap.get(dayInfo.date);
        const isPresent = Boolean(att && (att.status === 'Present' || att.loginTimestamp));
        let status = 'Upcoming';
        if (isPresent) {
          status = 'Present';
        } else if (dayInfo.isPastOrToday) {
          status = 'Absent';
        }

        const durationMins = isPresent ? (att.durationMinutes || 15) : 0;

        return {
          date: dayInfo.date,
          dayNumber: dayInfo.dayNumber,
          dayOfWeek: dayInfo.dayOfWeek,
          isPastOrToday: dayInfo.isPastOrToday,
          isFuture: dayInfo.isFuture,
          isSunday: dayInfo.isSunday,
          isPresent,
          status,
          loginTimeIST: isPresent ? formatIST(att.loginTimestamp || att.createdAt) : null,
          lastActiveIST: isPresent ? formatIST(att.lastLoginAt || att.updatedAt) : null,
          durationMinutes: durationMins,
          durationFormatted: isPresent ? formatDuration(durationMins) : '0m',
        };
      });

      return {
        id: u._id ? u._id.toString() : u.id,
        employeeId: u.employeeId,
        name: u.name,
        email: u.email,
        role: u.role === 'SUPERVISOR' ? 'ACTION_PERSON' : u.role,
        department: u.department || 'General',
        designation: u.designation || '',
        unitId: u.unitId || 'UNIT-1',
        unitName: u.unitName || (u.unitId === 'UNIT-2' ? 'Unit 2' : 'Unit 1'),
        loginDays,
        absentDays,
        totalDurationMinutes,
        totalDurationHours: (totalDurationMinutes / 60).toFixed(1),
        totalDurationFormatted: formatDuration(totalDurationMinutes),
        avgDailyDurationMinutes,
        avgDailyDurationFormatted: formatDuration(avgDailyDurationMinutes) + (loginDays > 0 ? '/day' : ''),
        loginScore,
        durationScore,
        kpiScore,
        attendancePercentage: elapsedDays > 0 ? Math.round((loginDays / elapsedDays) * 100) : 0,
        tier: {
          code: tierCode,
          label: tierLabel,
          grade: tierGrade,
          color: tierColor,
        },
        dailyBreakdown,
      };
    });

    // Apply Filters
    if (department && department !== 'ALL') {
      memberScores = memberScores.filter(
        (m) => (m.department || '').toLowerCase() === department.toLowerCase()
      );
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      memberScores = memberScores.filter(
        (m) =>
          (m.name || '').toLowerCase().includes(q) ||
          (m.employeeId || '').toLowerCase().includes(q) ||
          (m.department || '').toLowerCase().includes(q) ||
          (m.role || '').toLowerCase().includes(q)
      );
    }

    if (tier && tier !== 'ALL') {
      memberScores = memberScores.filter((m) => m.tier.code === tier);
    }

    // Sort by default: Highest KPI Score descending, then loginDays descending
    memberScores.sort((a, b) => b.kpiScore - a.kpiScore || b.loginDays - a.loginDays);

    // Compute Plant-wide Summary Statistics
    const totalMembers = memberScores.length;
    const totalKpiSum = memberScores.reduce((sum, m) => sum + m.kpiScore, 0);
    const avgKpiScore = totalMembers > 0 ? Math.round(totalKpiSum / totalMembers) : 0;
    const totalLoginDaysSum = memberScores.reduce((sum, m) => sum + m.loginDays, 0);
    const avgLoginDays = totalMembers > 0 ? (totalLoginDaysSum / totalMembers).toFixed(1) : 0;
    const totalMinutesLogged = memberScores.reduce((sum, m) => sum + m.totalDurationMinutes, 0);
    const totalHoursLogged = (totalMinutesLogged / 60).toFixed(1);
    const topPerformer = memberScores.length > 0 && memberScores[0].kpiScore > 0 ? {
      name: memberScores[0].name,
      employeeId: memberScores[0].employeeId,
      department: memberScores[0].department,
      kpiScore: memberScores[0].kpiScore,
      grade: memberScores[0].tier.grade,
      loginDays: memberScores[0].loginDays,
    } : null;

    const tierCounts = {
      EXCEPTIONAL: memberScores.filter((m) => m.tier.code === 'EXCEPTIONAL').length,
      GOOD: memberScores.filter((m) => m.tier.code === 'GOOD').length,
      AVERAGE: memberScores.filter((m) => m.tier.code === 'AVERAGE').length,
      NEEDS_ATTENTION: memberScores.filter((m) => m.tier.code === 'NEEDS_ATTENTION').length,
    };

    return res.status(200).json({
      success: true,
      rangeMode: isCustomRange ? 'CUSTOM' : 'MONTH',
      month: targetMonth,
      monthLabel: rangeLabel,
      rangeLabel,
      startDate: targetStartDate,
      endDate: targetEndDate,
      daysInMonth: totalDaysInRange,
      daysInRange: totalDaysInRange,
      elapsedDays,
      todayDate,
      summary: {
        totalMembers,
        avgKpiScore,
        avgLoginDays,
        totalHoursLogged,
        totalMinutesLogged,
        topPerformer,
        tierCounts,
      },
      members: memberScores,
    });
  } catch (err) {
    console.error('❌ [AuditLogController:getMemberKpiStats] Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to calculate individual member KPI scores.',
      error: err.message,
    });
  }
};

module.exports = {
  getAuditLogs,
  getUserLoginTimes,
  getMemberKpiStats,
  exportAuditLogs,
  clearAuditLogs,
};
