/**
 * Client-Side Centralized Company Workspace Registry
 * Defines valid company workspaces, URL slugs, and branding.
 */

export const REGISTERED_COMPANIES = [
  {
    id: 'esstee',
    name: 'Esstee Exports',
    slug: 'esstee',
    code: 'EST',
    status: 'active',
    description: 'Esstee Garments & Quality Assurance Division',
    themeColor: '#4f46e5',
    logoInitials: 'EE',
  },
  {
    id: 'texplus',
    name: 'Texplus Apparels',
    slug: 'texplus',
    code: 'TXP',
    status: 'active',
    description: 'Texplus Quality & Production Operations',
    themeColor: '#0ea5e9',
    logoInitials: 'TP',
  },
];

export const DEFAULT_COMPANY_SLUG = 'esstee';

export const getCompanyBySlug = (slug) => {
  if (!slug) return null;
  const clean = String(slug).trim().toLowerCase();
  return REGISTERED_COMPANIES.find((c) => c.slug === clean) || null;
};

export const isCompanyValid = (slug) => {
  return Boolean(getCompanyBySlug(slug));
};

export const isCompanyActive = (slug) => {
  const company = getCompanyBySlug(slug);
  return Boolean(company && company.status === 'active');
};
