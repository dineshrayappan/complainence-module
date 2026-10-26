import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { unitService } from '../services/api';

const UnitContext = createContext(null);

const DEFAULT_UNITS = [
  { unitId: 'UNIT-1', name: 'Unit 1', code: 'U1', description: 'Primary Plant / Unit 1 Facility' },
  { unitId: 'UNIT-2', name: 'Unit 2', code: 'U2', description: 'Secondary Plant / Unit 2 Facility' },
];

export const UnitProvider = ({ children }) => {
  const { user, isAdmin, isOwner } = useAuth();
  const isCompanyAdmin = isAdmin || isOwner || user?.employeeId === 'ADM-001' || user?.email === 'admin@factory.com';

  const [units, setUnits] = useState(DEFAULT_UNITS);
  const [unassignedCounts, setUnassignedCounts] = useState({ ncCount: 0, userCount: 0, taskCount: 0 });
  const [loadingUnits, setLoadingUnits] = useState(false);

  // Initialize active unit: strictly 'UNIT-1' or 'UNIT-2' (defaults to 'UNIT-1')
  const [activeUnitId, setActiveUnitIdState] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('garment_qms_active_unit') || localStorage.getItem('garment_qms_active_unit');
      if (saved === 'UNIT-1' || saved === 'UNIT-2') return saved;
    }
    return 'UNIT-1';
  });

  // Keep activeUnitId synchronized with logged-in user's assignment
  useEffect(() => {
    if (!user) {
      setActiveUnitIdState('UNIT-1');
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('garment_qms_active_unit', 'UNIT-1');
      }
      return;
    }

    if (!isCompanyAdmin) {
      // Non-admin user is strictly locked to their assigned unit (default Unit 1)
      const userUnit = (user.unitId === 'UNIT-2' ? 'UNIT-2' : 'UNIT-1');
      setActiveUnitIdState(userUnit);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('garment_qms_active_unit', userUnit);
      }
    } else {
      // Company Admin: verify saved preference is strictly UNIT-1 or UNIT-2
      const saved = sessionStorage.getItem('garment_qms_active_unit');
      if (saved !== 'UNIT-1' && saved !== 'UNIT-2') {
        setActiveUnitIdState('UNIT-1');
        sessionStorage.setItem('garment_qms_active_unit', 'UNIT-1');
      }
    }
  }, [user, isCompanyAdmin]);

  // Fetch units from backend (strictly Unit 1 & Unit 2)
  const fetchUnits = useCallback(async () => {
    if (!user) return;
    try {
      setLoadingUnits(true);
      const res = await unitService.getUnits();
      if (res.data?.success && Array.isArray(res.data.data)) {
        const filtered = res.data.data.filter((u) => u.unitId === 'UNIT-1' || u.unitId === 'UNIT-2');
        if (filtered.length > 0) {
          setUnits(filtered);
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

  // Switching units strictly between UNIT-1 and UNIT-2
  const switchUnit = useCallback(
    (newUnitId) => {
      const cleanId = (newUnitId === 'UNIT-2' ? 'UNIT-2' : 'UNIT-1');
      if (!isCompanyAdmin && user?.unitId && cleanId !== user.unitId) {
        console.warn('[UnitContext] Cross-unit switch prevented for non-admin user.');
        return;
      }
      setActiveUnitIdState(cleanId);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('garment_qms_active_unit', cleanId);
        localStorage.setItem('garment_qms_active_unit', cleanId);
      }
    },
    [isCompanyAdmin, user]
  );

  const activeUnit = units.find((u) => u.unitId === activeUnitId) || units[0] || DEFAULT_UNITS[0];

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
