const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema(
  {
    serialNo: {
      type: Number,
      required: false,
    },
    name: {
      type: String,
      required: [true, 'Certification name is required'],
      trim: true,
    },
    certificateNumber: {
      type: String,
      trim: true,
      default: '',
    },
    issueDate: {
      type: Date,
      required: [true, 'Issue date (From) is required'],
    },
    expiryDate: {
      type: Date,
      required: [true, 'Expiry date (To) is required'],
    },
    unitId: {
      type: String,
      enum: ['UNIT-1', 'UNIT-2', 'UNASSIGNED', null],
      default: 'UNASSIGNED',
    },
    unitName: {
      type: String,
      default: 'Unassigned',
    },
    issuingAgency: {
      type: String,
      trim: true,
      default: '',
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    documentUrl: {
      type: String,
      default: null,
    },
    documentName: {
      type: String,
      default: null,
    },
    documentType: {
      type: String,
      default: null,
    },
    documentSize: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['VALID', 'EXPIRING_SOON', 'EXPIRED'],
      default: 'VALID',
    },
    daysRemaining: {
      type: Number,
      default: 0,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: String,
      default: 'System Admin',
    },
    updatedBy: {
      type: String,
      default: 'System Admin',
    },
  },
  {
    timestamps: true,
  }
);

// Helper to compute validity status and remaining calendar days
function computeCertificateStatus(expiryDate) {
  if (!expiryDate) return { status: 'VALID', daysRemaining: 0 };
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const exp = new Date(expiryDate);
  const expDay = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate());

  const diffMs = expDay.getTime() - today.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  let status = 'VALID';
  if (daysRemaining < 0) {
    status = 'EXPIRED';
  } else if (daysRemaining <= 90) {
    status = 'EXPIRING_SOON';
  } else {
    status = 'VALID';
  }

  return { status, daysRemaining };
}

certificateSchema.methods.recalculateStatus = function () {
  const { status, daysRemaining } = computeCertificateStatus(this.expiryDate);
  this.status = status;
  this.daysRemaining = daysRemaining;
  return { status, daysRemaining };
};

const Certificate = mongoose.models.Certificate || mongoose.model('Certificate', certificateSchema);

module.exports = Certificate;
module.exports.certificateSchema = certificateSchema;
module.exports.computeCertificateStatus = computeCertificateStatus;

