/**
 * Centralized Company Workspace Registry
 * Manages company workspaces, unique URL slugs, isolated database names, and active status.
 */

const DEFAULT_COMPANIES = [
  {
    id: 'esstee',
    name: 'Esstee Exports',
    slug: 'esstee',
    // Primary database hosting all active project records
    dbName: process.env.ESSTEE_DB_NAME || 'compliance_module',
    fallbackDbName: 'compliance_module',
    status: 'active',
    description: 'Esstee Garments & Quality Assurance Division',
    themeColor: '#4f46e5', // Indigo
  },
  {
    id: 'texplus',
    name: 'Texplus Apparels',
    slug: 'texplus',
    dbName: process.env.TEXPLUS_DB_NAME || 'compliance_texplus',
    status: 'active',
    description: 'Texplus Quality & Production Operations',
    themeColor: '#0ea5e9', // Sky/Cyan
  },
];

// In-memory registry with support for runtime registration
const companyRegistry = new Map(
  DEFAULT_COMPANIES.map((c) => [c.slug.toLowerCase(), { ...c }])
);

/**
 * Find company by URL slug (case-insensitive)
 */
const getCompanyBySlug = (slug) => {
  if (!slug) return null;
  const cleanSlug = String(slug).trim().toLowerCase();
  return companyRegistry.get(cleanSlug) || null;
};

/**
 * Returns all registered companies with safe public metadata
 */
const getAllCompanies = () => {
  return Array.from(companyRegistry.values()).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    status: c.status,
    description: c.description,
    themeColor: c.themeColor,
  }));
};

/**
 * Checks if a company slug is registered and currently active
 */
const isCompanyActive = (slug) => {
  const comp = getCompanyBySlug(slug);
  return Boolean(comp && comp.status === 'active');
};

/**
 * Dynamically register or update a company workspace
 */
const registerCompany = ({ id, name, slug, dbName, status = 'active', description = '' }) => {
  if (!slug || !name) {
    throw new Error('Company slug and name are required.');
  }
  const cleanSlug = String(slug).trim().toLowerCase();
  const entry = {
    id: id || cleanSlug,
    name,
    slug: cleanSlug,
    dbName: dbName || `compliance_${cleanSlug}`,
    status: status === 'inactive' ? 'inactive' : 'active',
    description,
  };
  companyRegistry.set(cleanSlug, entry);
  return entry;
};

module.exports = {
  DEFAULT_COMPANIES,
  getCompanyBySlug,
  getAllCompanies,
  isCompanyActive,
  registerCompany,
};
