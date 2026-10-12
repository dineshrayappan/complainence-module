const { isMongoConnected } = require('../config/db');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const mockStore = require('../config/mockStore');

const BUSINESS_TIMEZONE = 'Asia/Kolkata';

/**
 * Returns the current business calendar date formatted as 'YYYY-MM-DD' in Asia/Kolkata (IST).
 * @param {Date} date
 * @returns {string} e.g. '2026-10-12'
 */
const getTodayISTString = (date = new Date()) => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: BUSINESS_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch (err) {
    // Fallback if environment lacks timezone data
    const d = new Date(date);
    // Add IST offset (+5:30 = 330 minutes)
    const istOffset = 330 * 60 * 1000;
    const istDate = new Date(d.getTime() + istOffset);
    return istDate.toISOString().slice(0, 10);
  }
};

/**
 * Records daily login attendance for an authenticated user on the current business date.
 * - If user logs in for the first time on this date -> creates record with status 'Present'.
 * - If user logs in again on the same date -> updates lastLoginAt without duplicating record.
 * - Operates safely and catches errors so login is never broken.
 * @param {Object} user
 * @param {Date} loginDate
 * @returns {Promise<Object>}
 */
const recordDailyLoginAttendance = async (user, loginDate = new Date()) => {
  if (!user) return null;

  const todayStr = getTodayISTString(loginDate);
  const employeeId = (user.employeeId || '').toUpperCase().trim();
  const userId = user._id ? user._id.toString() : String(user.id || '');
  const userName = user.name || '';
  const department = user.department || '';
  const role = user.role || 'ACTION_PERSON';

  let attendanceRecord = null;

  // 1. Persist to MongoDB if connected
  if (isMongoConnected() && employeeId) {
    try {
      // Find existing attendance for this user on today's date
      const existing = await Attendance.findOne({
        $or: [
          { employeeId, date: todayStr },
          ...(userId && userId.match(/^[0-9a-fA-F]{24}$/)
            ? [{ user: user._id, date: todayStr }]
            : []),
        ],
      });

      if (!existing) {
        // First login of the day: create attendance record marked Present
        attendanceRecord = await Attendance.create({
          user: user._id && userId.match(/^[0-9a-fA-F]{24}$/) ? user._id : undefined,
          userId,
          employeeId,
          name: userName,
          department,
          role,
          date: todayStr,
          status: 'Present',
          loginTimestamp: loginDate,
          lastLoginAt: loginDate,
          source: 'LOGIN',
        });
        console.log(`✅ [Daily Attendance] Marked '${employeeId}' (${userName}) as Present for ${todayStr} (1st login today).`);
      } else {
        // Subsequent login on the same day: preserve Present status and update lastLoginAt
        existing.status = 'Present';
        existing.lastLoginAt = loginDate;
        if (!existing.loginTimestamp) existing.loginTimestamp = loginDate;
        await existing.save();
        attendanceRecord = existing;
        console.log(`ℹ️ [Daily Attendance] User '${employeeId}' logged in again today (${todayStr}). Preserving Present status without duplicate.`);
      }

      // Update User document state
      try {
        if (userId && userId.match(/^[0-9a-fA-F]{24}$/)) {
          await User.findByIdAndUpdate(userId, {
            isPresent: true,
            lastLoginAt: loginDate,
          });
        } else {
          await User.updateMany({ employeeId }, {
            isPresent: true,
            lastLoginAt: loginDate,
          });
        }
      } catch (userErr) {
        // Non-critical, continue
      }
    } catch (dbErr) {
      console.warn('[AttendanceHelper:recordDailyLoginAttendance] MongoDB notice:', dbErr.message);
    }
  }

  // 2. Always sync with mockStore for fallback resilience
  try {
    mockStore.recordAttendance({
      userId,
      employeeId,
      name: userName,
      department,
      role,
    }, todayStr, loginDate);

    mockStore.updateUser(userId || employeeId, {
      isPresent: true,
      lastLoginAt: loginDate,
    });
  } catch (storeErr) {
    // Non-critical
  }

  return attendanceRecord;
};

/**
 * Returns a Map of all attendance records for a specific date (defaults to today in IST).
 * Keys are normalized employee IDs and user IDs for fast O(1) matching.
 * @param {string} dateString 'YYYY-MM-DD'
 * @returns {Promise<Map<string, Object>>}
 */
const getDailyAttendanceMap = async (dateString = getTodayISTString()) => {
  const map = new Map();

  // 1. Fetch from MongoDB if connected
  if (isMongoConnected()) {
    try {
      const records = await Attendance.find({ date: dateString }).lean();
      if (Array.isArray(records)) {
        for (const rec of records) {
          if (rec.employeeId) {
            map.set(rec.employeeId.toUpperCase().trim(), rec);
          }
          if (rec.userId) {
            map.set(String(rec.userId), rec);
          }
          if (rec.user) {
            map.set(String(rec.user), rec);
          }
        }
      }
    } catch (err) {
      console.warn('[AttendanceHelper:getDailyAttendanceMap] MongoDB query notice:', err.message);
    }
  }

  // 2. Supplement with mockStore if Map is empty or in fallback mode
  try {
    const mockRecords = mockStore.getAttendanceByDate(dateString);
    if (Array.isArray(mockRecords)) {
      for (const rec of mockRecords) {
        if (rec.employeeId && !map.has(rec.employeeId.toUpperCase().trim())) {
          map.set(rec.employeeId.toUpperCase().trim(), rec);
        }
        if (rec.userId && !map.has(String(rec.userId))) {
          map.set(String(rec.userId), rec);
        }
      }
    }
  } catch (err) {
    // Non-critical
  }

  return map;
};

/**
 * Evaluates the daily attendance status of a user for a given date.
 * If user has an attendance record for that date -> 'Present'.
 * Otherwise -> 'Absent' (daily reset is automatic because no record exists for the date).
 * @param {Object} user
 * @param {Map<string, Object>} attendanceMap
 * @param {string} dateString
 * @returns {{ isPresent: boolean, attendanceStatus: 'Present'|'Absent', loginTimestamp: Date|null, date: string }}
 */
const evaluateUserDailyAttendance = (user, attendanceMap, dateString = getTodayISTString()) => {
  if (!user) {
    return {
      isPresent: false,
      attendanceStatus: 'Absent',
      loginTimestamp: null,
      date: dateString,
    };
  }

  const empId = (user.employeeId || '').toUpperCase().trim();
  const userId = String(user._id || user.id || user.userId || '');

  let record = null;
  if (attendanceMap) {
    record = attendanceMap.get(empId) || (userId ? attendanceMap.get(userId) : null);
  }

  if (record && record.status === 'Present') {
    return {
      isPresent: true,
      status: 'Present',
      attendanceStatus: 'Present',
      loginTimestamp: record.loginTimestamp || record.lastLoginAt || null,
      date: dateString,
    };
  }

  return {
    isPresent: false,
    status: 'Absent',
    attendanceStatus: 'Absent',
    loginTimestamp: null,
    date: dateString,
  };
};

module.exports = {
  BUSINESS_TIMEZONE,
  getTodayISTString,
  recordDailyLoginAttendance,
  getDailyAttendanceMap,
  evaluateUserDailyAttendance,
};
