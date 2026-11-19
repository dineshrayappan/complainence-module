import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';

export const RoleBasedIndexRedirect = () => {
  const { user, isAdmin, isAuditor } = useAuth();
  const { basePath } = useCompany();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);

  const isCreateIntent =
    searchParams.get('action') === 'new' ||
    searchParams.get('redirect') === 'new-compliance' ||
    searchParams.get('create') === 'true' ||
    location.pathname.endsWith('/create') ||
    location.pathname.endsWith('/raise-nc') ||
    location.pathname.endsWith('/create-compliance');

  if (isCreateIntent) {
    return <Navigate to={`${basePath}/nc-cap?action=new`} replace state={{ openNewComplaint: true }} />;
  }

  const isSupervisor = user?.role === 'SUPERVISOR' || user?.role === 'ACTION_PERSON' || (!isAdmin && !isAuditor);

  if (isSupervisor) {
    return <Navigate to={`${basePath}/nc-cap`} replace />;
  }

  return <Navigate to={`${basePath}/dashboard`} replace />;
};

export default RoleBasedIndexRedirect;
