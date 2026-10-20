import React from 'react';
import { useNavigate } from 'react-router-dom';
import RequirementsComplianceView from '../components/RequirementsComplianceView';

export const RequirementsPage = () => {
  const navigate = useNavigate();

  const handleSelectRequirement = (clause) => {
    navigate(`/nc-cap?search=${encodeURIComponent(clause)}`);
  };

  return (
    <RequirementsComplianceView onSelectRequirement={handleSelectRequirement} />
  );
};

export default RequirementsPage;
