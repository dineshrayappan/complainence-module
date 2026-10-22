import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const RoleBasedIndexRedirect = () => {
  const { user, isAdmin, isAuditor } = useAuth();
  const isSupervisor = user?.role === 'SUPERVISOR' || user?.role === 'ACTION_PERSON' || (!isAdmin && !isAuditor);

  if (isSupervisor) {
    return <Navigate to="/compliance/nc-cap" replace />;
  }

  return <Navigate to="/compliance/dashboard" replace />;
};

export default RoleBasedIndexRedirect;
