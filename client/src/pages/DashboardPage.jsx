import React from 'react';
import { useNavigate } from 'react-router-dom';
import AuditProDashboard from '../components/AuditProDashboard';
import { useAppContext } from '../context/AppContext';

export const DashboardPage = () => {
  const navigate = useNavigate();
  const { handleOpenDetailModal, setIsNewModalOpen, showToast } = useAppContext();

  const handleNavigateSection = (sec) => {
    if (sec === 'cap') {
      navigate('/compliance/nc-cap?tab=cap-submitted');
    } else if (sec === 'nc' || sec === 'nc-cap') {
      navigate('/compliance/nc-cap');
    } else if (sec === 'reports') {
      navigate('/compliance/reports');
    } else if (sec === 'work-operations') {
      navigate('/compliance/work-operations');
    } else if (sec === 'departments' || sec === 'department') {
      navigate('/compliance/department');
    } else if (sec === 'requirements') {
      navigate('/compliance/requirements');
    } else if (sec === 'settings' || sec === 'admin') {
      navigate('/compliance/admin');
    } else if (sec === 'auditor') {
      navigate('/compliance/dashboard');
    } else {
      navigate(`/compliance/${sec.replace(/^\//, '')}`);
    }
  };

  const handleDrilldownDepartment = (deptName) => {
    if (showToast) {
      showToast(`Filtered NC register for ${deptName} department.`);
    }
    navigate(`/compliance/nc-cap?search=${encodeURIComponent(deptName)}`);
  };

  return (
    <AuditProDashboard
      onNavigateSection={handleNavigateSection}
      onDrilldownDepartment={handleDrilldownDepartment}
      onOpenNewComplaint={() => setIsNewModalOpen(true)}
      onViewComplaint={handleOpenDetailModal}
    />
  );
};

export default DashboardPage;
