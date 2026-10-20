import { useOutletContext } from 'react-router-dom';

/**
 * Custom hook to consume the shared application context from the active route layout.
 * Exposes: complaints, metrics, loading, isRefreshing, loadData, derivedCounts,
 * handleOpenDetailModal, handleOpenActionModal, handleStartProgress, handleDeleteComplaint,
 * handleOpenNewComplaintWithPrefill, setIsNewModalOpen, showToast.
 */
export const useAppContext = () => {
  return useOutletContext();
};

export default useAppContext;
