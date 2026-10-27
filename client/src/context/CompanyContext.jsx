import React, { createContext, useContext, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { getCompanyBySlug, DEFAULT_COMPANY_SLUG } from '../config/companyRegistry';

const CompanyContext = createContext(null);

export const CompanyProvider = ({ children, forcedSlug = null }) => {
  const params = useParams();
  const rawSlug = forcedSlug || params.companySlug || DEFAULT_COMPANY_SLUG;
  const cleanSlug = String(rawSlug).trim().toLowerCase();

  const company = useMemo(() => getCompanyBySlug(cleanSlug), [cleanSlug]);

  // Keep sessionStorage in sync with active workspace
  React.useEffect(() => {
    if (company && typeof window !== 'undefined') {
      window.sessionStorage.setItem('garment_qms_company_slug', company.slug);
      window.localStorage.setItem('garment_qms_company_slug', company.slug);
    }
  }, [company]);

  const value = useMemo(
    () => ({
      company,
      companySlug: company ? company.slug : cleanSlug,
      companyName: company ? company.name : 'Compliance Workspace',
      basePath: company ? `/${company.slug}` : `/${cleanSlug}`,
      isValid: Boolean(company),
      isInactive: Boolean(company && company.status !== 'active'),
      isNotFound: !company,
    }),
    [company, cleanSlug]
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
};

export const useCompany = () => {
  const ctx = useContext(CompanyContext);
  if (!ctx) {
    // Graceful fallback if outside provider
    const slug = (typeof window !== 'undefined' && (
      window.location.pathname.split('/').filter(Boolean)[0] ||
      window.sessionStorage?.getItem('garment_qms_company_slug')
    )) || DEFAULT_COMPANY_SLUG;
    const comp = getCompanyBySlug(slug);
    return {
      company: comp,
      companySlug: comp ? comp.slug : slug,
      companyName: comp ? comp.name : 'Compliance Workspace',
      basePath: `/${comp ? comp.slug : slug}`,
      isValid: Boolean(comp),
      isInactive: Boolean(comp && comp.status !== 'active'),
      isNotFound: !comp,
    };
  }
  return ctx;
};
