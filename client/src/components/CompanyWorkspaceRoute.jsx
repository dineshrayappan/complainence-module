import React from 'react';
import { useParams, Outlet } from 'react-router-dom';
import { getCompanyBySlug } from '../config/companyRegistry';
import { CompanyProvider } from '../context/CompanyContext';
import WorkspaceNotFoundPage from '../pages/WorkspaceNotFoundPage';
import WorkspaceInactivePage from '../pages/WorkspaceInactivePage';

export default function CompanyWorkspaceRoute() {
  const { companySlug } = useParams();
  const company = getCompanyBySlug(companySlug);

  if (!company) {
    return <WorkspaceNotFoundPage />;
  }

  if (company.status !== 'active') {
    return <WorkspaceInactivePage />;
  }

  return (
    <CompanyProvider forcedSlug={company.slug}>
      <Outlet />
    </CompanyProvider>
  );
}
