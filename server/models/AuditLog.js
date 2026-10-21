const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true },
    user_name: { type: String, required: true },
    user_role: { type: String, required: true },
    action: { type: String, required: true },
    action_label: { type: String, required: true },
    category: { type: String, default: 'SYSTEM' }, // 'AUTH' | 'USER_MGMT' | 'NC_DEFECT' | 'WORK_TASK' | 'DEPARTMENT' | 'SECURITY' | 'SYSTEM'
    severity: { type: String, default: 'INFO' }, // 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL'
    entity_type: { type: String, default: 'NC' },
    entity_id: { type: String },
    entity_name: { type: String },
    related_nc_id: { type: String },
    details: { type: String },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip_address: { type: String, default: '127.0.0.1' },
    is_immutable: { type: Boolean, default: true },
    tamper_hash: { type: String },
    created_at: { type: Date, default: Date.now },
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
  }
);

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
