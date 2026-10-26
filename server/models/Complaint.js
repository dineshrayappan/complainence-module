const mongoose = require('mongoose');

const timelineItemSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
    },
    performedBy: {
      name: { type: String, default: 'System' },
      role: { type: String, default: 'SYSTEM' },
      employeeId: { type: String, default: '' },
    },
    notes: {
      type: String,
      default: '',
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const complaintSchema = new mongoose.Schema(
  {
    complaintId: {
      type: String,
      unique: true,
      index: true,
    },
    category: {
      type: String,
      required: [true, 'Defect category is required'],
      trim: true,
      default: 'Quality Defect',
    },
    department: {
      type: String,
      required: [true, 'Department is required'],
      trim: true,
    },
    unitId: {
      type: String,
      default: null,
      index: true,
      trim: true,
    },
    unitName: {
      type: String,
      default: '',
      trim: true,
    },
    location: {
      type: String,
      required: [true, 'Location is required'],
      trim: true,
      default: 'Production Floor',
    },
    priority: {
      type: String,
      default: 'Major',
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    requirement: {
      type: String,
      default: 'AQL 1.5 Workmanship Standard',
    },
    riskSeverity: {
      type: String,
      default: 'HIGH',
    },
    capRequired: {
      type: Boolean,
      default: false,
    },
    verificationMethod: {
      type: String,
      default: 'Physical Floor Re-inspection',
    },
    beforePhoto: {
      type: String,
      required: [true, 'Before Photo is required'],
    },
    afterPhoto: {
      type: String,
      default: null,
    },
    assignedTo: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    createdBy: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    deadlineHours: {
      type: Number,
      default: 16,
    },
    deadlineTimestamp: {
      type: Date,
    },
    actualCompletedAt: {
      type: Date,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    startedBy: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    status: {
      type: String,
      default: 'Open',
      index: true,
    },
    actionNotes: {
      type: String,
      default: '',
    },
    feedbackRemarks: {
      type: String,
      default: '',
    },
    rejectionReason: {
      type: String,
      default: '',
    },
    cap: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    timeline: [timelineItemSchema],
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    deletedReason: {
      type: String,
      default: '',
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

const { toBase64DataUrl } = require('../utils/base64Helper');

// Virtual property for overdue checking
complaintSchema.virtual('isCurrentlyOverdue').get(function () {
  if (['Closed', 'Verified'].includes(this.status)) return false;
  if (!this.deadlineTimestamp) return false;
  return new Date() > this.deadlineTimestamp;
});

// Enforce Base64 data URLs on all image fields before database validation
complaintSchema.pre('validate', function () {
  if (this.beforePhoto) {
    this.beforePhoto = toBase64DataUrl(this.beforePhoto);
  }
  if (this.afterPhoto) {
    this.afterPhoto = toBase64DataUrl(this.afterPhoto);
  }
  if (this.cap && this.cap.evidence) {
    this.cap.evidence = toBase64DataUrl(this.cap.evidence);
  }
});

// Auto-generate complaintId (CMP-XXXXX) if missing, set deadlineTimestamp, and ensure Base64 encoding
complaintSchema.pre('save', function () {
  if (this.isNew && !this.complaintId) {
    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    this.complaintId = `CMP-${randomSuffix}`;
  }

  if (this.isNew || this.isModified('deadlineHours') || !this.deadlineTimestamp) {
    const baseTime = this.createdAt || new Date();
    const durationMs = (this.deadlineHours || 16) * 60 * 60 * 1000;
    this.deadlineTimestamp = new Date(baseTime.getTime() + durationMs);
  }

  if (this.beforePhoto) {
    this.beforePhoto = toBase64DataUrl(this.beforePhoto);
  }
  if (this.afterPhoto) {
    this.afterPhoto = toBase64DataUrl(this.afterPhoto);
  }
  if (this.cap && this.cap.evidence) {
    this.cap.evidence = toBase64DataUrl(this.cap.evidence);
  }
});

module.exports = mongoose.models.Complaint || mongoose.model('Complaint', complaintSchema);
