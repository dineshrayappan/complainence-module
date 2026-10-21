const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true, index: true },
    user_name: { type: String, required: true },
    user_role: { type: String, required: true },
    action: { type: String, required: true, index: true },
    action_label: { type: String, required: true },
    category: {
      type: String,
      default: 'SYSTEM',
      enum: ['AUTH', 'USER_MGMT', 'NC_DEFECT', 'WORK_TASK', 'DEPARTMENT', 'SECURITY', 'SYSTEM'],
      index: true,
    },
    severity: {
      type: String,
      default: 'INFO',
      enum: ['INFO', 'SUCCESS', 'WARNING', 'CRITICAL'],
      index: true,
    },
    entity_type: { type: String, default: 'SYSTEM' },
    entity_id: { type: String },
    entity_name: { type: String },
    related_nc_id: { type: String },
    details: { type: String },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip_address: { type: String, default: '127.0.0.1' },
    is_immutable: { type: Boolean, default: true },
    created_at: { type: Date, default: Date.now, index: true },
  },
  {
    timestamps: false,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform(doc, ret) {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

auditLogSchema.index({ created_at: -1 });
auditLogSchema.index({ category: 1, created_at: -1 });
auditLogSchema.index({ user_id: 1, created_at: -1 });

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
