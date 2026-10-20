import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import DepartmentWorkOperations from '../components/DepartmentWorkOperations';
import { useAuth } from '../context/AuthContext';

export const WorkOperationsPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAdmin, isAuditor } = useAuth();

  const dept = searchParams.get('dept') || 'ALL';

  return (
    <DepartmentWorkOperations
      initialDepartment={dept}
      onBackToScorecard={isAdmin || isAuditor ? () => navigate('/dashboard') : undefined}
    />
  );
};

export default WorkOperationsPage;
