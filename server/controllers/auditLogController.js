const AuditLog = require('../models/AuditLog');
const mockStore = require('../config/mockStore');
const { isMongoConnected } = require('../config/db');
const { logEvent } = require('../utils/eventLogger');

// @desc    Get system event & audit logs with filters and pagination
// @route   GET /api/audit-logs
// @access  Private (ADMIN only)
const getAuditLogs = async (req, res) => {
  try {
    const {
      search = '',
      category = 'ALL',
      severity = 'ALL',
      timeframe = 'all',
      page = 1,
      limit = 50,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    // Use MongoDB if connected
    if (isMongoConnected()) {
      try {
        const query = {};

        if (category && category !== 'ALL') {
          query.category = category.toUpperCase();
        }

        if (severity && severity !== 'ALL') {
          query.severity = severity.toUpperCase();
        }

        if (timeframe && timeframe !== 'all') {
          let maxAgeMs = 0;
          if (timeframe === '1h') maxAgeMs = 3600 * 1000;
          else if (timeframe === '24h') maxAgeMs = 24 * 3600 * 1000;
          else if (timeframe === '7d') maxAgeMs = 7 * 24 * 3600 * 1000;

          if (maxAgeMs > 0) {
            query.created_at = { $gte: new Date(Date.now() - maxAgeMs) };
          }
        }

        if (search && search.trim()) {
          const s = search.trim();
          const regex = new RegExp(s, 'i');
          query.$or = [
            { action_label: regex },
            { action: regex },
            { user_name: regex },
            { user_id: regex },
            { details: regex },
            { entity_id: regex },
            { entity_name: regex },
            { ip_address: regex },
          ];
        }

        const [total, logs] = await Promise.all([
          AuditLog.countDocuments(query),
          AuditLog.find(query)
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean(),
        ]);

        return res.status(200).json({
          success: true,
          logs: logs.map((l) => ({
            ...l,
            id: l._id ? String(l._id) : l.id,
          })),
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum) || 1,
          mode: 'MONGODB',
        });
      } catch (dbErr) {
        console.warn('⚠️ [AuditLogController] MongoDB query failed, falling back to mockStore:', dbErr.message);
      }
    }

    // In-Memory resilient fallback
    const result = mockStore.getAuditLogs({
      search,
      category,
      severity,
      timeframe,
      page: pageNum,
      limit: limitNum,
    });

    return res.status(200).json({
      success: true,
      ...result,
      mode: 'IN_MEMORY',
    });
  } catch (err) {
    console.error('❌ [AuditLogController] Error in getAuditLogs:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve event logs. ' + err.message,
    });
  }
};

// @desc    Get aggregate event stats & activity metrics
// @route   GET /api/audit-logs/stats
// @access  Private (ADMIN only)
const getAuditLogStats = async (req, res) => {
  try {
    if (isMongoConnected()) {
      try {
        const now = Date.now();
        const oneDayAgo = new Date(now - 24 * 3600 * 1000);

        const [
          total,
          todayCount,
          criticalCount,
          warningCount,
          successCount,
          infoCount,
          categoriesRaw,
          topActorsRaw,
        ] = await Promise.all([
          AuditLog.countDocuments(),
          AuditLog.countDocuments({ created_at: { $gte: oneDayAgo } }),
          AuditLog.countDocuments({ severity: 'CRITICAL' }),
          AuditLog.countDocuments({ severity: 'WARNING' }),
          AuditLog.countDocuments({ severity: 'SUCCESS' }),
          AuditLog.countDocuments({ severity: 'INFO' }),
          AuditLog.aggregate([
            { $group: { _id: '$category', count: { $sum: 1 } } },
          ]),
          AuditLog.aggregate([
            { $group: { _id: '$user_name', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 },
          ]),
        ]);

        const categoryCounts = {
          AUTH: 0,
          USER_MGMT: 0,
          NC_DEFECT: 0,
          WORK_TASK: 0,
          DEPARTMENT: 0,
          SECURITY: 0,
          SYSTEM: 0,
        };

        categoriesRaw.forEach((c) => {
          if (c._id) categoryCounts[c._id.toUpperCase()] = c.count;
        });

        const activeUsers = topActorsRaw.map((a) => ({
          name: a._id || 'Unknown',
          count: a.count,
        }));

        const latestDoc = await AuditLog.findOne().sort({ created_at: -1 }).select('created_at').lean();

        return res.status(200).json({
          success: true,
          stats: {
            total,
            todayCount,
            criticalCount,
            warningCount,
            successCount,
            infoCount,
            categoryCounts,
            activeUsers,
            lastEventTimestamp: latestDoc?.created_at || null,
          },
          mode: 'MONGODB',
        });
      } catch (dbErr) {
        console.warn('⚠️ [AuditLogController] MongoDB stats failed, falling back:', dbErr.message);
      }
    }

    // In-memory fallback stats
    const stats = mockStore.getAuditLogStats();
    return res.status(200).json({
      success: true,
      stats,
      mode: 'IN_MEMORY',
    });
  } catch (err) {
    console.error('❌ [AuditLogController] Error in getAuditLogStats:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve event log metrics.',
    });
  }
};

// @desc    Manually record custom administrative/system event
// @route   POST /api/audit-logs
// @access  Private (ADMIN or Authenticated)
const createAuditLog = async (req, res) => {
  try {
    const {
      action,
      actionLabel,
      category = 'SYSTEM',
      severity = 'INFO',
      entityType = 'SYSTEM',
      entityId = null,
      entityName = null,
      details = '',
      payload = {},
    } = req.body;

    if (!action || !actionLabel) {
      return res.status(400).json({
        success: false,
        message: 'Action and actionLabel are required.',
      });
    }

    const recorded = await logEvent({
      req,
      action,
      actionLabel,
      category,
      severity,
      entityType,
      entityId,
      entityName,
      details,
      payload,
    });

    return res.status(201).json({
      success: true,
      log: recorded,
      message: 'Event logged successfully.',
    });
  } catch (err) {
    console.error('❌ [AuditLogController] Error in createAuditLog:', err);
    return res.status(500).json({
      success: false,
      message: 'Could not create event record.',
    });
  }
};

// @desc    Clear or truncate logs (Admin privilege with safety logging)
// @route   DELETE /api/audit-logs
// @access  Private (ADMIN only)
const clearAuditLogs = async (req, res) => {
  try {
    // Before clearing, log the critical action itself
    await logEvent({
      req,
      action: 'AUDIT_LOG_PURGE',
      actionLabel: 'Event Logs Cleared by Admin',
      category: 'SECURITY',
      severity: 'CRITICAL',
      entityType: 'SYSTEM',
      entityId: 'AUDIT_TRAIL',
      details: `Administrator ${req.user?.name || req.user?.employeeId || 'ADMIN'} requested system event log clearance.`,
    });

    if (isMongoConnected()) {
      try {
        await AuditLog.deleteMany({});
      } catch (dbErr) {
        console.warn('⚠️ [AuditLogController] MongoDB delete failed:', dbErr.message);
      }
    }

    mockStore.clearAuditLogs();

    // Re-seed a single baseline entry so the trail retains continuity
    await logEvent({
      req,
      action: 'AUDIT_TRAIL_REINITIALIZED',
      actionLabel: 'Audit Trail Reinitialized',
      category: 'SYSTEM',
      severity: 'INFO',
      entityType: 'SYSTEM',
      details: 'Audit trail reset and reinitialized under executive order.',
    });

    return res.status(200).json({
      success: true,
      message: 'Audit logs cleared and reinitialized.',
    });
  } catch (err) {
    console.error('❌ [AuditLogController] Error in clearAuditLogs:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to clear logs.',
    });
  }
};

// @desc    Export audit logs in CSV or JSON format
// @route   GET /api/audit-logs/export
// @access  Private (ADMIN only)
const exportAuditLogs = async (req, res) => {
  try {
    const { format = 'csv' } = req.query;
    let list = [];

    if (isMongoConnected()) {
      try {
        list = await AuditLog.find().sort({ created_at: -1 }).lean();
      } catch (dbErr) {
        list = mockStore.getAuditLogs({ limit: 500 }).logs;
      }
    } else {
      list = mockStore.getAuditLogs({ limit: 500 }).logs;
    }

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="garment_qms_audit_events.json"');
      return res.status(200).send(JSON.stringify(list, null, 2));
    }

    // CSV format
    const headers = [
      'Timestamp',
      'Event ID',
      'Severity',
      'Category',
      'Action Label',
      'Action Code',
      'Actor Name',
      'Actor Role',
      'Actor ID',
      'Entity Type',
      'Entity ID',
      'Details',
      'IP Address',
      'SHA256 Hash',
    ];

    const rows = list.map((l) => [
      `"${new Date(l.created_at).toISOString()}"`,
      `"${l.id || l._id || ''}"`,
      `"${l.severity || 'INFO'}"`,
      `"${l.category || 'SYSTEM'}"`,
      `"${(l.action_label || '').replace(/"/g, '""')}"`,
      `"${l.action || ''}"`,
      `"${(l.user_name || '').replace(/"/g, '""')}"`,
      `"${l.user_role || ''}"`,
      `"${l.user_id || ''}"`,
      `"${l.entity_type || ''}"`,
      `"${l.entity_id || ''}"`,
      `"${(l.details || '').replace(/"/g, '""')}"`,
      `"${l.ip_address || ''}"`,
      `"${l.tamper_hash || ''}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="garment_qms_audit_events.csv"');
    return res.status(200).send(csvContent);
  } catch (err) {
    console.error('❌ [AuditLogController] Error exporting logs:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to export event logs.',
    });
  }
};

module.exports = {
  getAuditLogs,
  getAuditLogStats,
  createAuditLog,
  clearAuditLogs,
  exportAuditLogs,
};
