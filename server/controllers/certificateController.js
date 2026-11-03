const fs = require('fs');
const path = require('path');
const { getCertificateModel } = require('../models/unitModels');
const { computeCertificateStatus } = require('../models/Certificate');
const { isMongoConnected, connectDB } = require('../config/db');
const { logEvent } = require('../utils/eventLogger');

const CERT_UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'certificates');

// Ensure upload directory exists
if (!fs.existsSync(CERT_UPLOADS_DIR)) {
  try {
    fs.mkdirSync(CERT_UPLOADS_DIR, { recursive: true });
  } catch (err) {
    console.warn('[CertificateController] Notice creating uploads dir:', err.message);
  }
}

// 11 Standard Factory Accreditations Provided by User
const INITIAL_CERTIFICATES = [
  {
    serialNo: 1,
    name: 'WRAP (HO)',
    certificateNumber: 'WRAP-HO-2026',
    issueDate: new Date('2026-07-24T00:00:00.000Z'),
    expiryDate: new Date('2027-07-24T23:59:59.999Z'),
    unitId: 'UNASSIGNED',
    unitName: 'Unassigned',
    issuingAgency: 'Worldwide Responsible Accredited Production (WRAP)',
    description: 'WRAP Facility Accreditation for Head Office & Apparel Manufacturing Standards',
  },
  {
    serialNo: 2,
    name: 'WRAP (UNIT-II)',
    certificateNumber: 'WRAP-U2-2026',
    issueDate: new Date('2026-06-09T00:00:00.000Z'),
    expiryDate: new Date('2027-06-09T23:59:59.999Z'),
    unitId: 'UNIT-2',
    unitName: 'Unit 2',
    issuingAgency: 'Worldwide Responsible Accredited Production (WRAP)',
    description: 'WRAP Facility Accreditation for Plant Unit 2 Production Operations',
  },
  {
    serialNo: 3,
    name: 'BSCI',
    certificateNumber: 'BSCI-2026-9812',
    issueDate: new Date('2026-06-16T00:00:00.000Z'),
    expiryDate: new Date('2028-01-23T23:59:59.999Z'),
    unitId: 'UNASSIGNED',
    unitName: 'Unassigned',
    issuingAgency: 'amfori BSCI',
    description: 'Business Social Compliance Initiative Social Audit & Fair Workplace Standard',
  },
  {
    serialNo: 4,
    name: 'GOTS',
    certificateNumber: 'GOTS-2026-4412',
    issueDate: new Date('2026-04-29T00:00:00.000Z'),
    expiryDate: new Date('2026-12-25T23:59:59.999Z'),
    unitId: 'UNASSIGNED',
    unitName: 'Unassigned',
    issuingAgency: 'Global Organic Textile Standard',
    description: 'Global Organic Textile Standard for organic fiber ecology & social criteria',
  },
  {
    serialNo: 5,
    name: 'OCS, GRS',
    certificateNumber: 'OCS-GRS-2025-1102',
    issueDate: new Date('2025-12-26T00:00:00.000Z'),
    expiryDate: new Date('2026-12-25T23:59:59.999Z'),
    unitId: 'UNASSIGNED',
    unitName: 'Unassigned',
    issuingAgency: 'Textile Exchange / Control Union',
    description: 'Organic Content Standard & Global Recycled Standard Dual Chain of Custody Accreditation',
  },
  {
    serialNo: 6,
    name: 'GRTS',
    certificateNumber: 'GRTS-2026-3021',
    issueDate: new Date('2026-08-24T00:00:00.000Z'),
    expiryDate: new Date('2026-12-25T23:59:59.999Z'),
    unitId: 'UNASSIGNED',
    unitName: 'Unassigned',
    issuingAgency: 'Global Recycled & Traceable Standard',
    description: 'Recycled fiber trace verification and environmental sustainability standard',
  },
  {
    serialNo: 7,
    name: 'ISO 9001:2015',
    certificateNumber: 'ISO-9001-2026-7781',
    issueDate: new Date('2026-09-21T00:00:00.000Z'),
    expiryDate: new Date('2027-09-02T23:59:59.999Z'),
    unitId: 'UNASSIGNED',
    unitName: 'Unassigned',
    issuingAgency: 'International Organization for Standardization (ISO)',
    description: 'Quality Management System Requirements for Garment Manufacturing & Export',
  },
  {
    serialNo: 8,
    name: 'ISO 14001:2015',
    certificateNumber: 'ISO-14001-2026-7782',
    issueDate: new Date('2026-09-21T00:00:00.000Z'),
    expiryDate: new Date('2027-09-17T23:59:59.999Z'),
    unitId: 'UNASSIGNED',
    unitName: 'Unassigned',
    issuingAgency: 'International Organization for Standardization (ISO)',
    description: 'Environmental Management System Standards for Sustainable Plant Operations',
  },
  {
    serialNo: 9,
    name: 'FAIR TRADE',
    certificateNumber: 'FT-2022-5501',
    issueDate: new Date('2022-06-02T00:00:00.000Z'),
    expiryDate: new Date('2028-06-02T23:59:59.999Z'),
    unitId: 'UNASSIGNED',
    unitName: 'Unassigned',
    issuingAgency: 'Fair Trade USA / Fairtrade International',
    description: 'Fair Trade Certified Ethical Production, Community Development & Worker Welfare',
  },
  {
    serialNo: 10,
    name: 'OEKO-TEX',
    certificateNumber: 'OEKO-2026-8819',
    issueDate: new Date('2026-02-10T00:00:00.000Z'),
    expiryDate: new Date('2027-01-31T23:59:59.999Z'),
    unitId: 'UNASSIGNED',
    unitName: 'Unassigned',
    issuingAgency: 'OEKO-TEX International Association',
    description: 'STANDARD 100 by OEKO-TEX Confidence in Textiles Testing for Harmful Substances',
  },
  {
    serialNo: 11,
    name: 'PEFC',
    certificateNumber: 'PEFC-2022-9904',
    issueDate: new Date('2022-09-13T00:00:00.000Z'),
    expiryDate: new Date('2027-09-12T23:59:59.999Z'),
    unitId: 'UNASSIGNED',
    unitName: 'Unassigned',
    issuingAgency: 'Programme for the Endorsement of Forest Certification',
    description: 'Chain of Custody for Sustainable Raw Material & Packaging Sourcing',
  },
];

// Helper to seed initial certificates if missing
async function ensureInitialCertificates(CertificateModel) {
  try {
    const existing = await CertificateModel.find({ isDeleted: { $ne: true } }).lean();
    if (!existing || existing.length === 0) {
      console.log('[CertificateController] Initializing 11 standard compliance certificates...');
      const docsToInsert = INITIAL_CERTIFICATES.map((c) => {
        const { status, daysRemaining } = computeCertificateStatus(c.expiryDate);
        return {
          ...c,
          status,
          daysRemaining,
        };
      });
      await CertificateModel.insertMany(docsToInsert);
      console.log(`[CertificateController] Seeded ${docsToInsert.length} certification records.`);
    } else {
      // Check if any of the 11 are missing by name
      const existingNames = new Set(existing.map((e) => e.name.trim().toLowerCase()));
      const missing = INITIAL_CERTIFICATES.filter(
        (c) => !existingNames.has(c.name.trim().toLowerCase())
      );
      if (missing.length > 0) {
        const docsToInsert = missing.map((c) => {
          const { status, daysRemaining } = computeCertificateStatus(c.expiryDate);
          return {
            ...c,
            status,
            daysRemaining,
          };
        });
        await CertificateModel.insertMany(docsToInsert);
        console.log(`[CertificateController] Added ${docsToInsert.length} missing certification records.`);
      }
    }
  } catch (err) {
    console.warn('[CertificateController] Seeding notice:', err.message);
  }
}

// In-Memory fallback store for resilient local operation if MongoDB offline
let inMemoryCertificates = null;

function getInMemoryStore() {
  if (!inMemoryCertificates) {
    inMemoryCertificates = INITIAL_CERTIFICATES.map((c, i) => {
      const { status, daysRemaining } = computeCertificateStatus(c.expiryDate);
      return {
        _id: `cert-${i + 1}`,
        id: `cert-${i + 1}`,
        ...c,
        status,
        daysRemaining,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });
  }
  return inMemoryCertificates;
}

// Helper to format certificate document
function formatCertificate(doc) {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  const { status, daysRemaining } = computeCertificateStatus(obj.expiryDate);

  const cleanUnitId = obj.unitId === 'UNIT-2' ? 'UNIT-2' : obj.unitId === 'UNIT-1' ? 'UNIT-1' : 'UNASSIGNED';
  const cleanUnitName = cleanUnitId === 'UNIT-2' ? 'Unit 2' : cleanUnitId === 'UNIT-1' ? 'Unit 1' : 'Unassigned';

  // Expiry notification categories
  const isExpiring30 = daysRemaining >= 0 && daysRemaining <= 30;
  const isExpiring60 = daysRemaining >= 0 && daysRemaining <= 60;
  const isExpiring90 = daysRemaining >= 0 && daysRemaining <= 90;

  return {
    _id: obj._id ? String(obj._id) : obj.id,
    id: obj._id ? String(obj._id) : obj.id,
    serialNo: obj.serialNo || 0,
    name: obj.name,
    certificateNumber: obj.certificateNumber || '',
    issueDate: obj.issueDate,
    expiryDate: obj.expiryDate,
    unitId: cleanUnitId,
    unitName: cleanUnitName,
    issuingAgency: obj.issuingAgency || '',
    description: obj.description || '',
    documentUrl: obj.documentUrl || null,
    documentName: obj.documentName || null,
    documentType: obj.documentType || null,
    documentSize: obj.documentSize || 0,
    status,
    daysRemaining,
    isExpiring30,
    isExpiring60,
    isExpiring90,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

// @desc    Get all certificates with filtering, search, and dashboard metric counts
// @route   GET /api/certificates
// @access  Private (Admin only)
const getCertificates = async (req, res) => {
  try {
    const { search, status, unitId } = req.query;

    if (!isMongoConnected()) {
      await connectDB();
    }

    let certificates = [];

    if (isMongoConnected()) {
      try {
        const CertificateModel = getCertificateModel(req.companyDb);
        await ensureInitialCertificates(CertificateModel);

        const filter = { isDeleted: { $ne: true } };

        if (unitId && unitId !== 'ALL' && unitId !== 'BOTH') {
          if (unitId === 'UNASSIGNED') {
            filter.$or = [{ unitId: 'UNASSIGNED' }, { unitId: null }, { unitId: '' }];
          } else {
            filter.unitId = unitId;
          }
        }

        if (search) {
          const regex = new RegExp(search.trim(), 'i');
          const searchClause = [
            { name: regex },
            { certificateNumber: regex },
            { issuingAgency: regex },
            { description: regex },
          ];
          if (filter.$or) {
            filter.$and = [{ $or: filter.$or }, { $or: searchClause }];
            delete filter.$or;
          } else {
            filter.$or = searchClause;
          }
        }

        const rawDocs = await CertificateModel.find(filter).sort({ serialNo: 1, createdAt: 1 }).lean();
        certificates = rawDocs.map(formatCertificate);
      } catch (dbErr) {
        console.warn('[CertificateController:getCertificates] MongoDB notice:', dbErr.message);
      }
    }

    if (!certificates || certificates.length === 0) {
      // In-Memory store fallback
      let memList = getInMemoryStore().filter((c) => !c.isDeleted);
      if (unitId && unitId !== 'ALL' && unitId !== 'BOTH') {
        if (unitId === 'UNASSIGNED') {
          memList = memList.filter((c) => !c.unitId || c.unitId === 'UNASSIGNED');
        } else {
          memList = memList.filter((c) => c.unitId === unitId);
        }
      }
      if (search) {
        const q = search.trim().toLowerCase();
        memList = memList.filter(
          (c) =>
            (c.name && c.name.toLowerCase().includes(q)) ||
            (c.certificateNumber && c.certificateNumber.toLowerCase().includes(q)) ||
            (c.issuingAgency && c.issuingAgency.toLowerCase().includes(q))
        );
      }
      certificates = memList.map(formatCertificate);
    }

    // Filter by calculated status if specified
    if (status && status !== 'ALL') {
      certificates = certificates.filter((c) => c.status === status.toUpperCase());
    }

    // Compute overall KPI metric counts across all non-deleted certificates
    let allCerts = certificates;
    if (isMongoConnected()) {
      try {
        const CertificateModel = getCertificateModel(req.companyDb);
        const allRaw = await CertificateModel.find({ isDeleted: { $ne: true } }).lean();
        allCerts = allRaw.map(formatCertificate);
      } catch (_) {}
    } else {
      allCerts = getInMemoryStore().filter((c) => !c.isDeleted).map(formatCertificate);
    }

    let validCount = 0;
    let expiringSoonCount = 0;
    let expiredCount = 0;
    let expiring30Count = 0;
    let expiring60Count = 0;
    let expiring90Count = 0;

    for (const c of allCerts) {
      if (c.status === 'EXPIRED') {
        expiredCount++;
      } else if (c.status === 'EXPIRING_SOON') {
        expiringSoonCount++;
        if (c.daysRemaining <= 30) expiring30Count++;
        else if (c.daysRemaining <= 60) expiring60Count++;
        else if (c.daysRemaining <= 90) expiring90Count++;
      } else {
        validCount++;
      }
    }

    const metrics = {
      total: allCerts.length,
      valid: validCount,
      expiringSoon: expiringSoonCount,
      expired: expiredCount,
      expiring30: expiring30Count,
      expiring60: expiring60Count,
      expiring90: expiring90Count,
    };

    return res.status(200).json({
      success: true,
      count: certificates.length,
      metrics,
      certificates,
    });
  } catch (err) {
    console.error('[CertificateController:getCertificates] Error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve certificates.',
      error: err.message,
    });
  }
};

// @desc    Get single certificate by ID
// @route   GET /api/certificates/:id
// @access  Private (Admin only)
const getCertificateById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isMongoConnected()) {
      await connectDB();
    }

    let cert = null;
    if (isMongoConnected()) {
      try {
        const CertificateModel = getCertificateModel(req.companyDb);
        cert = await CertificateModel.findById(id).lean();
      } catch (_) {}
    }

    if (!cert) {
      cert = getInMemoryStore().find((c) => String(c._id) === String(id) || String(c.id) === String(id));
    }

    if (!cert || cert.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Certificate not found.',
      });
    }

    return res.status(200).json({
      success: true,
      certificate: formatCertificate(cert),
    });
  } catch (err) {
    console.error('[CertificateController:getCertificateById] Error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve certificate details.',
      error: err.message,
    });
  }
};

// @desc    Create a new certificate
// @route   POST /api/certificates
// @access  Private (Admin only)
const createCertificate = async (req, res) => {
  try {
    const {
      name,
      certificateNumber,
      issueDate,
      expiryDate,
      unitId,
      issuingAgency,
      description,
      documentUrl: bodyDocUrl,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Certification name is mandatory.',
      });
    }

    if (!issueDate || !expiryDate) {
      return res.status(400).json({
        success: false,
        message: 'Issue date (From) and Expiry date (To) are mandatory.',
      });
    }

    const parsedIssueDate = new Date(issueDate);
    const parsedExpiryDate = new Date(expiryDate);

    if (isNaN(parsedIssueDate.getTime()) || isNaN(parsedExpiryDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Please provide valid dates in standard format (YYYY-MM-DD or DD/MM/YYYY).',
      });
    }

    const normUnitId = unitId === 'UNIT-2' ? 'UNIT-2' : unitId === 'UNIT-1' ? 'UNIT-1' : 'UNASSIGNED';
    const normUnitName = normUnitId === 'UNIT-2' ? 'Unit 2' : normUnitId === 'UNIT-1' ? 'Unit 1' : 'Unassigned';

    // Handle document upload (file from multer or base64 data URL)
    let docUrl = bodyDocUrl || null;
    let docName = req.body.documentName || null;
    let docType = req.body.documentType || null;
    let docSize = 0;

    const uploadedFile = req.file || (req.files && req.files[0]);
    if (uploadedFile) {
      const originalName = uploadedFile.originalname || 'certificate.pdf';
      const ext = path.extname(originalName) || '.pdf';
      const safePrefix = name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 24);
      const filename = `cert_${safePrefix}_${Date.now()}${ext}`;
      const diskPath = path.join(CERT_UPLOADS_DIR, filename);

      try {
        fs.writeFileSync(diskPath, uploadedFile.buffer);
        const mime = uploadedFile.mimetype || (ext.toLowerCase() === '.pdf' ? 'application/pdf' : 'image/jpeg');
        const b64DataUrl = `data:${mime};base64,${uploadedFile.buffer.toString('base64')}`;

        docUrl = b64DataUrl; // Self-contained and permanent across environments
        docName = originalName;
        docType = mime;
        docSize = uploadedFile.size || uploadedFile.buffer.length;
      } catch (fileErr) {
        console.warn('[CertificateController:createCertificate] File save notice:', fileErr.message);
      }
    }

    const { status, daysRemaining } = computeCertificateStatus(parsedExpiryDate);

    const newCertData = {
      name: name.trim(),
      certificateNumber: (certificateNumber || '').trim(),
      issueDate: parsedIssueDate,
      expiryDate: parsedExpiryDate,
      unitId: normUnitId,
      unitName: normUnitName,
      issuingAgency: (issuingAgency || '').trim(),
      description: (description || '').trim(),
      documentUrl: docUrl,
      documentName: docName,
      documentType: docType,
      documentSize: docSize,
      status,
      daysRemaining,
      isDeleted: false,
      createdBy: req.user?.name || req.user?.employeeId || 'System Administrator',
      updatedBy: req.user?.name || req.user?.employeeId || 'System Administrator',
    };

    if (!isMongoConnected()) {
      await connectDB();
    }

    let createdDoc = null;
    if (isMongoConnected()) {
      try {
        const CertificateModel = getCertificateModel(req.companyDb);
        const count = await CertificateModel.countDocuments();
        newCertData.serialNo = count + 1;
        createdDoc = await CertificateModel.create(newCertData);
      } catch (dbErr) {
        console.warn('[CertificateController:createCertificate] DB save notice:', dbErr.message);
      }
    }

    if (!createdDoc) {
      const store = getInMemoryStore();
      const fakeId = `cert-${Date.now()}`;
      newCertData._id = fakeId;
      newCertData.id = fakeId;
      newCertData.serialNo = store.length + 1;
      newCertData.createdAt = new Date();
      newCertData.updatedAt = new Date();
      store.push(newCertData);
      createdDoc = newCertData;
    }

    // Log to audit trail
    await logEvent({
      req,
      userId: req.user?.employeeId || 'ADMIN',
      userName: req.user?.name || 'Administrator',
      userRole: req.user?.role || 'ADMIN',
      action: 'CERTIFICATE_CREATE',
      actionLabel: 'Create Compliance Certificate',
      category: 'ADMIN',
      severity: 'INFO',
      entityType: 'CERTIFICATE',
      entityId: String(createdDoc._id || createdDoc.id),
      entityName: createdDoc.name,
      details: `Added new certification '${createdDoc.name}' (${createdDoc.certificateNumber || 'No #'}) assigned to ${createdDoc.unitName}.`,
    });

    return res.status(201).json({
      success: true,
      message: `Certificate '${createdDoc.name}' created successfully.`,
      certificate: formatCertificate(createdDoc),
    });
  } catch (err) {
    console.error('[CertificateController:createCertificate] Error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to create certificate.',
      error: err.message,
    });
  }
};

// @desc    Update an existing certificate
// @route   PUT /api/certificates/:id
// @access  Private (Admin only)
const updateCertificate = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      certificateNumber,
      issueDate,
      expiryDate,
      unitId,
      issuingAgency,
      description,
      documentUrl: bodyDocUrl,
    } = req.body;

    if (!isMongoConnected()) {
      await connectDB();
    }

    let existingDoc = null;
    let CertificateModel = null;

    if (isMongoConnected()) {
      try {
        CertificateModel = getCertificateModel(req.companyDb);
        existingDoc = await CertificateModel.findById(id);
      } catch (_) {}
    }

    if (!existingDoc) {
      existingDoc = getInMemoryStore().find((c) => String(c._id) === String(id) || String(c.id) === String(id));
    }

    if (!existingDoc || existingDoc.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Certificate not found.',
      });
    }

    // Update basic fields
    if (name && name.trim()) existingDoc.name = name.trim();
    if (typeof certificateNumber !== 'undefined') existingDoc.certificateNumber = certificateNumber.trim();
    if (typeof issuingAgency !== 'undefined') existingDoc.issuingAgency = issuingAgency.trim();
    if (typeof description !== 'undefined') existingDoc.description = description.trim();

    if (issueDate) {
      const p = new Date(issueDate);
      if (!isNaN(p.getTime())) existingDoc.issueDate = p;
    }
    if (expiryDate) {
      const p = new Date(expiryDate);
      if (!isNaN(p.getTime())) existingDoc.expiryDate = p;
    }

    if (typeof unitId !== 'undefined') {
      const normUnitId = unitId === 'UNIT-2' ? 'UNIT-2' : unitId === 'UNIT-1' ? 'UNIT-1' : 'UNASSIGNED';
      existingDoc.unitId = normUnitId;
      existingDoc.unitName = normUnitId === 'UNIT-2' ? 'Unit 2' : normUnitId === 'UNIT-1' ? 'Unit 1' : 'Unassigned';
    }

    // Handle document upload / replacement
    const uploadedFile = req.file || (req.files && req.files[0]);
    if (uploadedFile) {
      const originalName = uploadedFile.originalname || 'certificate.pdf';
      const ext = path.extname(originalName) || '.pdf';
      const safePrefix = existingDoc.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 24);
      const filename = `cert_${safePrefix}_${Date.now()}${ext}`;
      const diskPath = path.join(CERT_UPLOADS_DIR, filename);

      try {
        fs.writeFileSync(diskPath, uploadedFile.buffer);
        const mime = uploadedFile.mimetype || (ext.toLowerCase() === '.pdf' ? 'application/pdf' : 'image/jpeg');
        const b64DataUrl = `data:${mime};base64,${uploadedFile.buffer.toString('base64')}`;

        existingDoc.documentUrl = b64DataUrl;
        existingDoc.documentName = originalName;
        existingDoc.documentType = mime;
        existingDoc.documentSize = uploadedFile.size || uploadedFile.buffer.length;
      } catch (fileErr) {
        console.warn('[CertificateController:updateCertificate] File write notice:', fileErr.message);
      }
    } else if (bodyDocUrl) {
      existingDoc.documentUrl = bodyDocUrl;
      if (req.body.documentName) existingDoc.documentName = req.body.documentName;
      if (req.body.documentType) existingDoc.documentType = req.body.documentType;
    }

    // Recompute validity status
    const { status, daysRemaining } = computeCertificateStatus(existingDoc.expiryDate);
    existingDoc.status = status;
    existingDoc.daysRemaining = daysRemaining;
    existingDoc.updatedBy = req.user?.name || req.user?.employeeId || 'System Administrator';

    if (existingDoc.save && typeof existingDoc.save === 'function') {
      await existingDoc.save();
    }

    // Log update
    await logEvent({
      req,
      userId: req.user?.employeeId || 'ADMIN',
      userName: req.user?.name || 'Administrator',
      userRole: req.user?.role || 'ADMIN',
      action: 'CERTIFICATE_UPDATE',
      actionLabel: 'Update Compliance Certificate',
      category: 'ADMIN',
      severity: 'INFO',
      entityType: 'CERTIFICATE',
      entityId: String(existingDoc._id || existingDoc.id),
      entityName: existingDoc.name,
      details: `Updated certification details for '${existingDoc.name}'. Plant unit: ${existingDoc.unitName}.`,
    });

    return res.status(200).json({
      success: true,
      message: `Certificate '${existingDoc.name}' updated successfully.`,
      certificate: formatCertificate(existingDoc),
    });
  } catch (err) {
    console.error('[CertificateController:updateCertificate] Error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to update certificate.',
      error: err.message,
    });
  }
};

// @desc    Delete (soft-delete) a certificate
// @route   DELETE /api/certificates/:id
// @access  Private (Admin only)
const deleteCertificate = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isMongoConnected()) {
      await connectDB();
    }

    let existingDoc = null;
    let CertificateModel = null;

    if (isMongoConnected()) {
      try {
        CertificateModel = getCertificateModel(req.companyDb);
        existingDoc = await CertificateModel.findById(id);
      } catch (_) {}
    }

    if (!existingDoc) {
      existingDoc = getInMemoryStore().find((c) => String(c._id) === String(id) || String(c.id) === String(id));
    }

    if (!existingDoc || existingDoc.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Certificate not found.',
      });
    }

    existingDoc.isDeleted = true;
    if (existingDoc.save && typeof existingDoc.save === 'function') {
      await existingDoc.save();
    }

    await logEvent({
      req,
      userId: req.user?.employeeId || 'ADMIN',
      userName: req.user?.name || 'Administrator',
      userRole: req.user?.role || 'ADMIN',
      action: 'CERTIFICATE_DELETE',
      actionLabel: 'Archive Compliance Certificate',
      category: 'ADMIN',
      severity: 'WARNING',
      entityType: 'CERTIFICATE',
      entityId: String(existingDoc._id || existingDoc.id),
      entityName: existingDoc.name,
      details: `Archived certification record '${existingDoc.name}'.`,
    });

    return res.status(200).json({
      success: true,
      message: `Certificate '${existingDoc.name}' removed successfully.`,
    });
  } catch (err) {
    console.error('[CertificateController:deleteCertificate] Error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to delete certificate.',
      error: err.message,
    });
  }
};

// @desc    Download certificate document
// @route   GET /api/certificates/:id/download
// @access  Private (Admin only)
const downloadCertificate = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isMongoConnected()) {
      await connectDB();
    }

    let cert = null;
    if (isMongoConnected()) {
      try {
        const CertificateModel = getCertificateModel(req.companyDb);
        cert = await CertificateModel.findById(id).lean();
      } catch (_) {}
    }

    if (!cert) {
      cert = getInMemoryStore().find((c) => String(c._id) === String(id) || String(c.id) === String(id));
    }

    if (!cert || cert.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Certificate not found.',
      });
    }

    if (!cert.documentUrl) {
      return res.status(404).json({
        success: false,
        message: 'No document attached to this certificate record yet.',
      });
    }

    const safeName = (cert.documentName || `${cert.name.replace(/[^a-zA-Z0-9]/g, '_')}_Certificate.pdf`).replace(/[^\w.-]/g, '_');

    // Case 1: Data URI stored
    if (cert.documentUrl.startsWith('data:')) {
      const match = cert.documentUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const mime = match[1];
        const buffer = Buffer.from(match[2], 'base64');
        res.setHeader('Content-Type', mime);
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
        res.setHeader('Content-Length', buffer.length);
        return res.send(buffer);
      }
    }

    // Case 2: Disk path stored
    if (cert.documentUrl.includes('/uploads/')) {
      const filename = cert.documentUrl.split('/uploads/')[1].split('?')[0];
      const diskPath = path.join(__dirname, '..', 'uploads', filename);
      if (fs.existsSync(diskPath)) {
        return res.download(diskPath, safeName);
      }
    }

    return res.redirect(cert.documentUrl);
  } catch (err) {
    console.error('[CertificateController:downloadCertificate] Error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to download certificate file.',
      error: err.message,
    });
  }
};

module.exports = {
  getCertificates,
  getCertificateById,
  createCertificate,
  updateCertificate,
  deleteCertificate,
  downloadCertificate,
  ensureInitialCertificates,
};

