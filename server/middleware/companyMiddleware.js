const { getCompanyBySlug } = require('../config/companyRegistry');
const { getCompanyConnection, isMongoConnected } = require('../config/db');
const { companyContextStorage } = require('../models/unitModels');
const { ensureDefaultAdminUser } = require('../utils/defaultAdmin');

// Set of companies already checked for default admin initialization
const initializedCompanyDbs = new Set();

/**
 * Company Workspace Identification & Isolation Middleware
 * Resolves the company workspace from headers/body/query/path, validates active status,
 * binds the company's dedicated MongoDB database connection, and wraps execution in AsyncLocalStorage.
 */
const identifyCompany = async (req, res, next) => {
  try {
    // 1. Extract requested company slug
    const headerSlug =
      req.headers['x-company-slug'] ||
      req.headers['x-company-id'] ||
      req.headers['x-workspace-slug'];
    const querySlug = req.query?.companySlug || req.query?.company;
    const bodySlug = req.body?.companySlug;

    // Optional URL path match: e.g. /api/:companySlug/...
    let pathSlug = null;
    if (req.params?.companySlug) {
      pathSlug = req.params.companySlug;
    }

    const requestedSlug = (headerSlug || pathSlug || querySlug || bodySlug || '').toString().trim().toLowerCase();

    // Bypass company requirement for public health probes & company list/lookup
    const isPublicSystemRoute =
      req.path === '/health' ||
      req.path === '/api/health' ||
      req.path === '/api' ||
      req.path === '/' ||
      req.path === '/favicon.ico' ||
      req.path === '/api/companies' ||
      req.path === '/companies' ||
      req.path.startsWith('/api/companies') ||
      req.path.startsWith('/companies');

    if (isPublicSystemRoute && !requestedSlug) {
      return next();
    }

    // Default to 'esstee' for legacy calls to ensure 100% backward compatibility
    const targetSlug = requestedSlug || 'esstee';

    // 2. Validate company against centralized registry
    const company = getCompanyBySlug(targetSlug);
    if (!company) {
      return res.status(404).json({
        success: false,
        code: 'WORKSPACE_NOT_FOUND',
        message: `Workspace '${targetSlug}' Not Found. Please check your company URL.`,
      });
    }

    if (company.status !== 'active') {
      return res.status(403).json({
        success: false,
        code: 'WORKSPACE_INACTIVE',
        message: `Workspace '${company.name}' is currently deactivated. Please contact your system administrator.`,
      });
    }

    // 3. Resolve dedicated MongoDB database connection
    let companyDb = null;
    if (isMongoConnected()) {
      companyDb = getCompanyConnection(company.dbName, company.fallbackDbName);

      // Lazily initialize root admin for new company database if not yet checked
      if (companyDb && !initializedCompanyDbs.has(company.slug)) {
        initializedCompanyDbs.add(company.slug);
        ensureDefaultAdminUser(companyDb).catch((err) => {
          console.warn(`[Workspace: ${company.slug}] Admin initialization notice:`, err.message);
        });
      }
    }

    // 4. Attach company metadata and DB connection to request object
    req.company = company;
    req.companyDb = companyDb;

    // 5. Run downstream middleware and route handlers inside AsyncLocalStorage context
    companyContextStorage.run(
      {
        company,
        conn: companyDb,
        dbName: companyDb?.name || company.dbName,
      },
      () => {
        next();
      }
    );
  } catch (err) {
    console.error('[Company Middleware Error]:', err);
    res.status(500).json({
      success: false,
      message: 'Internal workspace resolution failure.',
    });
  }
};

module.exports = {
  identifyCompany,
};
