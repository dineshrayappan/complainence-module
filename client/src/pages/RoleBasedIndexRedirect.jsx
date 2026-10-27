import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';

export const RoleBasedIndexRedirect = () => {
  const { user, isAdmin, isAuditor } = useAuth();
  const { basePath } = useCompany();
  const isSupervisor = user?.role === 'SUPERVISOR' || user?.role === 'ACTION_PERSON' || (!isAdmin && !isAuditor);

  if (isSupervisor) {
    return <Navigate to={`${basePath}/nc-cap`} replace />;
  }

  return <Navigate to={`${basePath}/dashboard`} replace />;
};

export default RoleBasedIndexRedirect;
