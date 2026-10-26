import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { unitService } from '../services/api';

const UnitContext = createContext(null);

export const UnitProvider = ({ children }) => {
  const { user, isAdmin, isOwner } = useAuth();
  const isCompanyAdmin = isAdmin || isOwner || user?.employeeId === 'ALL-001' || user?.email === 'all@factory.com';

  const [units, setUnits] = useState([
    { unitId: 'UNIT-1', name: 'Unit 1', code: 'U1', description: 'Primary Manufacturing / Plant 1' },
    { unitId: 'UNIT-2', name: 'Unit 2', code: 'U2', description: 'Secondary Plant / Facility 2' },
  ]);
  const [unassignedCounts, setUnassignedCounts] = useState({ ncCount: 0, userCount: 0, taskCount: 0 });
  const [loadingUnits, setLoadingUnits] = useState(false);

  // Initialize active unit based on user permissions
  const [activeUnitId, setActiveUnitIdState] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('garment_qms_active_unit') || localStorage.getItem('garment_qms_active_unit');
      if (saved) return saved;
    }
    return 'ALL';
  });

  // Keep activeUnitId synchronized with logged-in user's assignment
  useEffect(() => {
    if (!user) {
      setActiveUnitIdState('ALL');
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('garment_qms_active_unit');
      }
      return;
    }

    if (!isCompanyAdmin) {
      // Non-admin user is strictly locked to their assigned unit (or fallback to legacy null)
      const userUnit = user.unitId || 'UNIT-1';
      setActiveUnitIdState(userUnit);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('garment_qms_active_unit', userUnit);
      }
    } else {
      // Company Admin: verify saved preference is valid or keep ALL
      const saved = sessionStorage.getItem('garment_qms_active_unit');
      if (!saved) {
        setActiveUnitIdState('ALL');
        sessionStorage.setItem('garment_qms_active_unit', 'ALL');
      }
    }
  }, [user, isCompanyAdmin]);

  // Fetch real units and unassigned statistics from backend
  const fetchUnits = useCallback(async () => {
    if (!user) return;
    try {
      setLoadingUnits(true);
      const res = await unitService.getUnits();
      if (res.data?.success && Array.isArray(res.data.data)) {
        setUnits(res.data.data);
        if (res.data.unassigned) {
          setUnassignedCounts(res.data.unassigned);
        }
      }
    } catch (err) {
      console.warn('[UnitContext] Failed to load units:', err.message);
    } finally {
      setLoadingUnits(false);
    }
  }, [user]);

  useEffect(() => {
    fetchUnits();
  }, [fetchUnits]);

  // Switching units for Company Admin
  const switchUnit = useCallback(
    (newUnitId) => {
      if (!isCompanyAdmin && user?.unitId && newUnitId !== user.unitId) {
        console.warn('[UnitContext] Cross-unit switch prevented for non-admin user.');
        return;
      }
      setActiveUnitIdState(newUnitId);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('garment_qms_active_unit', newUnitId);
        localStorage.setItem('garment_qms_active_unit', newUnitId);
      }
    },
    [isCompanyAdmin, user]
  );

  const activeUnit = units.find((u) => u.unitId === activeUnitId) || (activeUnitId === 'ALL' ? { unitId: 'ALL', name: 'All Units (Company Wide)' } : { unitId: activeUnitId, name: activeUnitId });

  return (
    <UnitContext.Provider
      value={{
        units,
        activeUnitId,
        activeUnit,
        switchUnit,
        refreshUnits: fetchUnits,
        unassignedCounts,
        loadingUnits,
        isCompanyAdmin,
      }}
    >
      {children}
    </UnitContext.Provider>
  );
};

export const useUnit = () => {
  const context = useContext(UnitContext);
  if (!context) {
    throw new Error('useUnit must be used within a UnitProvider');
  }
  return context;
};

export default useUnit;
