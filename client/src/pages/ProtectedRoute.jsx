import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const ProtectedRoute = ({ allowedRoles, children }) => {
  const { user, loading: authLoading, isOwner, isAdmin, isAuditor } = useAuth();
  const location = useLocation();

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center font-sans">
        <div className="w-9 h-9 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin mb-3" />
        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">Restoring verified session...</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/compliance/login" state={{ from: location }} replace />;
  }

  // Executive Owner has omni-access to all routes
  if (isOwner || user.role === 'OWNER') {
    return children;
  }

  // If specific roles are required (e.g. ['ADMIN', 'AUDITOR'] or ['ADMIN'])
  if (allowedRoles && allowedRoles.length > 0) {
    const isSupervisor = user.role === 'SUPERVISOR' || user.role === 'ACTION_PERSON' || (!isAdmin && !isAuditor);

    const hasAllowedRole = allowedRoles.some((role) => {
      if (role === 'ADMIN') return isAdmin;
      if (role === 'AUDITOR') return isAuditor || isAdmin;
      if (role === 'SUPERVISOR' || role === 'ACTION_PERSON') return isSupervisor;
      return user.role === role;
    });

    if (!hasAllowedRole) {
      // Redirect supervisor to nc-cap, admin/auditor to dashboard
      const fallbackTarget = isSupervisor ? '/compliance/nc-cap' : '/compliance/dashboard';
      return <Navigate to={fallbackTarget} replace />;
    }
  }

  return children;
};

export default ProtectedRoute;
