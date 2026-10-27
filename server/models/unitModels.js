const mongoose = require('mongoose');
const { AsyncLocalStorage } = require('async_hooks');

// Company request context storage for zero-leakage multi-tenant database isolation
const companyContextStorage = new AsyncLocalStorage();

// Schemas
const Complaint = require('./Complaint');
const ComplianceTask = require('./ComplianceTask');
const Audit = require('./Audit');
const Department = require('./Department');
const User = require('./User');
const AuditLog = require('./AuditLog');
const Attendance = require('./Attendance');
const Unit = require('./Unit');

/**
 * Normalizes input unit identifier to 'unit1' or 'unit2'.
 * Defaults strictly to 'unit1' for safety and legacy preservation.
 */
const normalizeUnit = (unitId) => {
  if (!unitId) return 'unit1';
  const str = String(unitId).trim().toLowerCase();
  if (str === 'unit-2' || str === 'unit 2' || str === 'unit2' || str === 'u2' || str === '2') {
    return 'unit2';
  }
  return 'unit1';
};

/**
 * Normalizes input unit identifier to standard canonical code 'UNIT-1' or 'UNIT-2'.
 */
const getCanonicalUnitId = (unitId) => {
  return normalizeUnit(unitId) === 'unit2' ? 'UNIT-2' : 'UNIT-1';
};

/**
 * Normalizes input unit identifier to display name 'Unit 1' or 'Unit 2'.
 */
const getCanonicalUnitName = (unitId) => {
  return normalizeUnit(unitId) === 'unit2' ? 'Unit 2' : 'Unit 1';
};

/**
 * Internal helper to retrieve or register a Mongoose model bound to a target database connection.
 * Resolves connection from:
 * 1. Explicit targetConn argument
 * 2. AsyncLocalStorage company request context
 * 3. Default mongoose.connection (fallback)
 */
const getOrCreateUnitModel = (modelPrefix, schema, collectionName, targetConn = null) => {
  let conn = targetConn;
  if (!conn) {
    const store = companyContextStorage.getStore();
    conn = store?.conn || mongoose.connection;
  }

  const dbPrefix = (conn.name || 'default').replace(/[^a-zA-Z0-9_]/g, '_');
  const scopedKey = `${dbPrefix}_${modelPrefix}`;

  if (conn.models && conn.models[scopedKey]) {
    return conn.models[scopedKey];
  }
  return conn.model(scopedKey, schema, collectionName);
};

// Unit 1 & Unit 2 NC / CAP Records
const getComplaintModel = (unitId, targetConn = null) => {
  const norm = normalizeUnit(unitId);
  const collName = `${norm}_nc_records`;
  const modelName = `${norm.toUpperCase()}_NC_Record`;
  return getOrCreateUnitModel(modelName, Complaint.schema, collName, targetConn);
};

// Unit 1 & Unit 2 Tasks
const getTaskModel = (unitId, targetConn = null) => {
  const norm = normalizeUnit(unitId);
  const collName = `${norm}_tasks`;
  const modelName = `${norm.toUpperCase()}_Task`;
  return getOrCreateUnitModel(modelName, ComplianceTask.schema, collName, targetConn);
};

// Unit 1 & Unit 2 Audits
const getAuditModel = (unitId, targetConn = null) => {
  const norm = normalizeUnit(unitId);
  const collName = `${norm}_audits`;
  const modelName = `${norm.toUpperCase()}_Audit`;
  return getOrCreateUnitModel(modelName, Audit.schema, collName, targetConn);
};

// Unit 1 & Unit 2 Departments
const getDepartmentModel = (unitId, targetConn = null) => {
  const norm = normalizeUnit(unitId);
  const collName = `${norm}_departments`;
  const modelName = `${norm.toUpperCase()}_Department`;
  return getOrCreateUnitModel(modelName, Department.schema, collName, targetConn);
};

// Unit 1 & Unit 2 Users
const getUserModel = (unitId, targetConn = null) => {
  const norm = normalizeUnit(unitId);
  const collName = `${norm}_users`;
  const modelName = `${norm.toUpperCase()}_User`;
  return getOrCreateUnitModel(modelName, User.schema, collName, targetConn);
};

// Unit 1 & Unit 2 Audit Logs
const getAuditLogModel = (unitId, targetConn = null) => {
  const norm = normalizeUnit(unitId);
  const collName = `${norm}_auditlogs`;
  const modelName = `${norm.toUpperCase()}_AuditLog`;
  return getOrCreateUnitModel(modelName, AuditLog.schema, collName, targetConn);
};

// Unit 1 & Unit 2 Attendances
const getAttendanceModel = (unitId, targetConn = null) => {
  const norm = normalizeUnit(unitId);
  const collName = `${norm}_attendances`;
  const modelName = `${norm.toUpperCase()}_Attendance`;
  return getOrCreateUnitModel(modelName, Attendance.schema, collName, targetConn);
};

// Company-scoped root models (e.g. for users, complaints, units, etc.)
const getRootUserModel = (targetConn = null) => {
  return getOrCreateUnitModel('Root_User', User.schema, 'users', targetConn);
};

const getRootComplaintModel = (targetConn = null) => {
  return getOrCreateUnitModel('Root_Complaint', Complaint.schema, 'complaints', targetConn);
};

const getRootUnitModel = (targetConn = null) => {
  return getOrCreateUnitModel('Root_Unit', Unit.schema, 'units', targetConn);
};

const getRootDepartmentModel = (targetConn = null) => {
  return getOrCreateUnitModel('Root_Department', Department.schema, 'departments', targetConn);
};

const getRootAuditLogModel = (targetConn = null) => {
  return getOrCreateUnitModel('Root_AuditLog', AuditLog.schema, 'auditlogs', targetConn);
};

const getRootAttendanceModel = (targetConn = null) => {
  return getOrCreateUnitModel('Root_Attendance', Attendance.schema, 'attendances', targetConn);
};

module.exports = {
  companyContextStorage,
  normalizeUnit,
  getCanonicalUnitId,
  getCanonicalUnitName,
  getComplaintModel,
  getTaskModel,
  getAuditModel,
  getDepartmentModel,
  getUserModel,
  getAuditLogModel,
  getAttendanceModel,
  getRootUserModel,
  getRootComplaintModel,
  getRootUnitModel,
  getRootDepartmentModel,
  getRootAuditLogModel,
  getRootAttendanceModel,
};
