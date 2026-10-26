const AuditLog = require('../models/AuditLog');
const mockStore = require('../config/mockStore');
const { isMongoConnected } = require('../config/db');
const { getAuditLogModel, getCanonicalUnitId } = require('../models/unitModels');

/**
 * Centrally and non-blockingly record an application event.
 * Automatically saves to unit-specific collection (unit1_auditlogs or unit2_auditlogs)
 * as well as legacy AuditLog collection.
 */
async function logEvent(options = {}) {
  try {
    const {
      req,
      action = 'SYSTEM_EVENT',
      actionLabel = 'System Event',
      category = 'SYSTEM',
      severity = 'INFO',
      entityType = 'SYSTEM',
      entityId = null,
      entityName = null,
      relatedNcId = null,
      details = '',
      payload = {},
    } = options;

    let userId = options.userId || 'SYSTEM';
    let userName = options.userName || 'System Engine';
    let userRole = options.userRole || 'SYSTEM';
    let ipAddress = options.ipAddress || '127.0.0.1';

    if (req) {
      if (req.user) {
        userId = req.user.employeeId || req.user._id || req.user.id || userId;
        userName = req.user.name || userName;
        userRole = req.user.role || userRole;
      }
      ipAddress =
        req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.ip ||
        req.socket?.remoteAddress ||
        ipAddress;
    }

    const targetUnit = getCanonicalUnitId(options.unitId || req?.activeUnitId || req?.user?.unitId || 'UNIT-1');

    const timestamp = new Date();
    const eventRecord = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      user_id: String(userId),
      user_name: String(userName),
      user_role: String(userRole),
      action: String(action),
      action_label: String(actionLabel),
      category: String(category),
      severity: String(severity),
      entity_type: String(entityType),
      entity_id: entityId ? String(entityId) : null,
      entity_name: entityName ? String(entityName) : null,
      related_nc_id: relatedNcId ? String(relatedNcId) : null,
      unit_id: targetUnit,
      details: String(details || ''),
      payload: payload || {},
      ip_address: String(ipAddress),
      is_immutable: true,
      created_at: timestamp,
    };

    // Mirror to in-memory store
    if (typeof mockStore.addAuditLog === 'function') {
      mockStore.addAuditLog(eventRecord);
    }

    // Persist to MongoDB
    if (isMongoConnected()) {
      try {
        const UnitAuditLogModel = getAuditLogModel(targetUnit);
        await Promise.allSettled([
          UnitAuditLogModel.create(eventRecord),
          AuditLog.create(eventRecord),
        ]);
      } catch (dbErr) {
        console.warn('⚠️ [EventLogger] Notice persisting audit log:', dbErr.message);
      }
    }

    return eventRecord;
  } catch (err) {
    console.error('❌ [EventLogger] Failure recording event:', err.message);
    return null;
  }
}

module.exports = { logEvent };
