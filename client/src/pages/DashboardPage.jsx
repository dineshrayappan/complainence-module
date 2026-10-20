import React from 'react';
import { useNavigate } from 'react-router-dom';
import AuditProDashboard from '../components/AuditProDashboard';
import { useAppContext } from '../context/AppContext';

export const DashboardPage = () => {
  const navigate = useNavigate();
  const { handleOpenDetailModal, setIsNewModalOpen, showToast } = useAppContext();

  const handleNavigateSection = (sec) => {
    if (sec === 'cap') {
      navigate('/nc-cap?tab=cap-submitted');
    } else if (sec === 'nc' || sec === 'nc-cap') {
      navigate('/nc-cap');
    } else if (sec === 'reports') {
      navigate('/reports');
    } else if (sec === 'work-operations') {
      navigate('/work-operations');
    } else if (sec === 'departments') {
      navigate('/departments');
    } else if (sec === 'requirements') {
      navigate('/requirements');
    } else if (sec === 'settings') {
      navigate('/settings');
    } else {
      navigate(`/${sec}`);
    }
  };

  const handleDrilldownDepartment = (deptName) => {
    if (showToast) {
      showToast(`Filtered NC register for ${deptName} department.`);
    }
    navigate(`/nc-cap?search=${encodeURIComponent(deptName)}`);
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
