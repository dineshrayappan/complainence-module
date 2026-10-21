const crypto = require('crypto');
const AuditLog = require('../models/AuditLog');
const mockStore = require('../config/mockStore');
const { isMongoConnected } = require('../config/db');

/**
 * Generate a cryptographically secure tamper hash for an event
 */
const generateTamperHash = ({ timestamp, userId, action, entityId, details }) => {
  const payload = `${timestamp}|${userId || 'anon'}|${action}|${entityId || ''}|${details || ''}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
};

/**
 * Centrally log an operational, security, or compliance event.
 * Automatically saves to MongoDB when connected, and updates the in-memory mock store.
 *
 * @param {Object} options
 * @param {Object} [options.req] - Express request object for automatic IP and user context
 * @param {string} [options.userId] - Actor user ID or employee ID
 * @param {string} [options.userName] - Actor display name
 * @param {string} [options.userRole] - Actor role ('ADMIN', 'AUDITOR', 'SUPERVISOR', 'SYSTEM', etc.)
 * @param {string} options.action - Action constant (e.g., 'AUTH_LOGIN_SUCCESS', 'NC_CREATED')
 * @param {string} options.actionLabel - Human-friendly label (e.g., 'User Logged In', 'Defect NC Created')
 * @param {string} [options.category='SYSTEM'] - 'AUTH' | 'USER_MGMT' | 'NC_DEFECT' | 'WORK_TASK' | 'DEPARTMENT' | 'SECURITY' | 'SYSTEM'
 * @param {string} [options.severity='INFO'] - 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL'
 * @param {string} [options.entityType='SYSTEM'] - 'USER' | 'NC' | 'TASK' | 'DEPARTMENT' | 'AUTH' | 'SYSTEM'
 * @param {string} [options.entityId] - ID of the affected entity
 * @param {string} [options.entityName] - Name or code of the affected entity
 * @param {string} [options.relatedNcId] - Associated NC ticket ID if applicable
 * @param {string} [options.details] - Detailed text explanation of the event
 * @param {Object} [options.payload] - Additional arbitrary JSON payload
 * @param {string} [options.ipAddress] - IP address
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

    let userId = options.userId || 'system';
    let userName = options.userName || 'System Engine';
    let userRole = options.userRole || 'SYSTEM';
    let ipAddress = options.ipAddress || '127.0.0.1';

    // Auto-extract context from Express request if provided
    if (req) {
      if (req.user) {
        userId = req.user.employeeId || req.user._id || req.user.id || userId;
        userName = req.user.name || userName;
        userRole = req.user.role || userRole;
      }
      ipAddress =
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.ip ||
        req.connection?.remoteAddress ||
        ipAddress;
    }

    const timestamp = new Date();
    const tamperHash = generateTamperHash({
      timestamp: timestamp.toISOString(),
      userId,
      action,
      entityId,
      details,
    });

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
      details: String(details || ''),
      payload: payload || {},
      ip_address: String(ipAddress),
      is_immutable: true,
      tamper_hash: tamperHash,
      created_at: timestamp,
    };

    // Always mirror to in-memory store for instant UI response and resilient fallback
    if (typeof mockStore.addAuditLog === 'function') {
      mockStore.addAuditLog(eventRecord);
    }

    // Persist to MongoDB if active
    if (isMongoConnected()) {
      try {
        await AuditLog.create(eventRecord);
      } catch (dbErr) {
        console.warn('⚠️ [EventLogger] Could not persist to MongoDB, in-memory log preserved:', dbErr.message);
      }
    }

    return eventRecord;
  } catch (err) {
    // Non-blocking catch to ensure operational requests never fail because of logging
    console.error('❌ [EventLogger] Failure recording event:', err);
    return null;
  }
}

module.exports = {
  logEvent,
  generateTamperHash,
};
