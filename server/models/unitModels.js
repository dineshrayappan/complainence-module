const mongoose = require('mongoose');

// Schemas
const Complaint = require('./Complaint');
const ComplianceTask = require('./ComplianceTask');
const Audit = require('./Audit');
const Department = require('./Department');
const User = require('./User');
const AuditLog = require('./AuditLog');
const Attendance = require('./Attendance');

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
 * Internal helper to retrieve or register a Mongoose model bound to a unit-specific collection.
 */
const getOrCreateUnitModel = (modelPrefix, schema, collectionName) => {
  if (mongoose.models[modelPrefix]) {
    return mongoose.models[modelPrefix];
  }
  return mongoose.model(modelPrefix, schema, collectionName);
};

// Unit 1 & Unit 2 NC / CAP Records
const getComplaintModel = (unitId) => {
  const norm = normalizeUnit(unitId);
  const collName = `${norm}_nc_records`;
  const modelName = `${norm.toUpperCase()}_NC_Record`;
  return getOrCreateUnitModel(modelName, Complaint.schema, collName);
};

// Unit 1 & Unit 2 Tasks
const getTaskModel = (unitId) => {
  const norm = normalizeUnit(unitId);
  const collName = `${norm}_tasks`;
  const modelName = `${norm.toUpperCase()}_Task`;
  return getOrCreateUnitModel(modelName, ComplianceTask.schema, collName);
};

// Unit 1 & Unit 2 Audits
const getAuditModel = (unitId) => {
  const norm = normalizeUnit(unitId);
  const collName = `${norm}_audits`;
  const modelName = `${norm.toUpperCase()}_Audit`;
  return getOrCreateUnitModel(modelName, Audit.schema, collName);
};

// Unit 1 & Unit 2 Departments
const getDepartmentModel = (unitId) => {
  const norm = normalizeUnit(unitId);
  const collName = `${norm}_departments`;
  const modelName = `${norm.toUpperCase()}_Department`;
  return getOrCreateUnitModel(modelName, Department.schema, collName);
};

// Unit 1 & Unit 2 Users
const getUserModel = (unitId) => {
  const norm = normalizeUnit(unitId);
  const collName = `${norm}_users`;
  const modelName = `${norm.toUpperCase()}_User`;
  return getOrCreateUnitModel(modelName, User.schema, collName);
};

// Unit 1 & Unit 2 Audit Logs
const getAuditLogModel = (unitId) => {
  const norm = normalizeUnit(unitId);
  const collName = `${norm}_auditlogs`;
  const modelName = `${norm.toUpperCase()}_AuditLog`;
  return getOrCreateUnitModel(modelName, AuditLog.schema, collName);
};

// Unit 1 & Unit 2 Attendances
const getAttendanceModel = (unitId) => {
  const norm = normalizeUnit(unitId);
  const collName = `${norm}_attendances`;
  const modelName = `${norm.toUpperCase()}_Attendance`;
  return getOrCreateUnitModel(modelName, Attendance.schema, collName);
};

module.exports = {
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
};
