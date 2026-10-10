const mongoose = require('mongoose');

const auditSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    audit_number: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    department: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      default: 'Scheduled',
    },
    auditor: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    checklist: {
      type: Array,
      default: [],
    },
    findings_count: {
      type: Number,
      default: 0,
    },
    scheduled_date: {
      type: Date,
      default: Date.now,
    },
    completed_date: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
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

module.exports = mongoose.models.Audit || mongoose.model('Audit', auditSchema);
