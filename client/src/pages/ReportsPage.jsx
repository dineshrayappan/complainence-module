import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import ReportsView from '../components/ReportsView';
import { useAppContext } from '../context/AppContext';

export const ReportsPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { complaints = [], handleOpenDetailModal } = useAppContext();

  const initialTab = searchParams.get('tab') || 'audit-register';

  const handleNavigateNC = (targetTab, filterVal) => {
    const params = new URLSearchParams();
    if (targetTab) params.set('tab', targetTab);
    if (filterVal) params.set('search', filterVal);
    navigate(`/nc-cap?${params.toString()}`);
  };

  return (
    <ReportsView
      complaints={complaints}
      initialTab={initialTab}
      onViewDetails={handleOpenDetailModal}
      onNavigateNC={handleNavigateNC}
    />
  );
};

export default ReportsPage;
