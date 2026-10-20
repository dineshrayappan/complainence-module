import React from 'react';
import { useNavigate } from 'react-router-dom';
import DepartmentComplianceDashboard from '../components/DepartmentComplianceDashboard';
import { useAppContext } from '../context/AppContext';

export const DepartmentsPage = () => {
  const navigate = useNavigate();
  const { showToast } = useAppContext();

  const handleSelectDepartment = (deptName) => {
    if (showToast) {
      showToast(`Filtered NC register for ${deptName} department.`);
    }
    navigate(`/nc-cap?search=${encodeURIComponent(deptName)}`);
  };

  const handleNavigateWorkOperations = (dept) => {
    navigate(`/work-operations?dept=${encodeURIComponent(dept || 'ALL')}`);
  };

  return (
    <DepartmentComplianceDashboard
      onSelectDepartment={handleSelectDepartment}
      onClose={() => navigate('/dashboard')}
      onNavigateWorkOperations={handleNavigateWorkOperations}
    />
  );
};

export default DepartmentsPage;
