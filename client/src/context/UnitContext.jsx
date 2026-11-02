import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { unitService } from '../services/api';

const UnitContext = createContext(null);

const DEFAULT_UNITS = [
  { unitId: 'UNIT-1', name: 'Unit 1', code: 'U1', description: 'Primary Plant / Unit 1 Facility' },
  { unitId: 'UNIT-2', name: 'Unit 2', code: 'U2', description: 'Secondary Plant / Unit 2 Facility' },
];

const BOTH_UNITS_OPTION = {
  unitId: 'BOTH',
  name: 'Both Units',
  code: 'ALL',
  description: 'Consolidated View Across Both Plants (Unit 1 & Unit 2)',
};

export const UnitProvider = ({ children }) => {
  const { user, isAdmin, isOwner, isAuditor } = useAuth();
  const isCompanyAdmin = Boolean(isAdmin || isOwner || user?.employeeId === 'ADM-001' || user?.email === 'admin@factory.com');

  // Can the user switch units? Admins, Owners, and Auditors with access to Both Units
  const canSwitchUnits = Boolean(
    isCompanyAdmin ||
    user?.role === 'ADMIN' ||
    user?.role === 'OWNER' ||
    user?.unitId === 'BOTH' ||
    user?.unitId === 'ALL' ||
    (Array.isArray(user?.assignedUnits) && user?.assignedUnits.includes('UNIT-1') && user?.assignedUnits.includes('UNIT-2')) ||
    isAuditor || user?.role === 'AUDITOR'
  );

  const [units, setUnits] = useState(DEFAULT_UNITS);
  const [unassignedCounts, setUnassignedCounts] = useState({ ncCount: 0, userCount: 0, taskCount: 0 });
  const [loadingUnits, setLoadingUnits] = useState(false);

  // Initialize active unit: 'UNIT-1', 'UNIT-2', or 'BOTH'
  const [activeUnitId, setActiveUnitIdState] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('garment_qms_active_unit') || localStorage.getItem('garment_qms_active_unit');
      if (saved === 'UNIT-1' || saved === 'UNIT-2' || saved === 'BOTH') return saved;
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

    if (!canSwitchUnits) {
      // User is strictly locked to their assigned unit (default Unit 1)
      const userUnit = (user.unitId === 'UNIT-2' ? 'UNIT-2' : 'UNIT-1');
      setActiveUnitIdState(userUnit);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('garment_qms_active_unit', userUnit);
        localStorage.setItem('garment_qms_active_unit', userUnit);
      }
    } else {
      // User can switch units: verify saved preference is valid ('UNIT-1', 'UNIT-2', 'BOTH')
      const saved = sessionStorage.getItem('garment_qms_active_unit') || localStorage.getItem('garment_qms_active_unit');
      if (saved !== 'UNIT-1' && saved !== 'UNIT-2' && saved !== 'BOTH') {
        const defaultChoice = user.unitId === 'UNIT-2' ? 'UNIT-2' : (user.unitId === 'BOTH' ? 'BOTH' : 'UNIT-1');
        setActiveUnitIdState(defaultChoice);
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('garment_qms_active_unit', defaultChoice);
          localStorage.setItem('garment_qms_active_unit', defaultChoice);
        }
      } else {
        setActiveUnitIdState(saved);
      }
    }
  }, [user, canSwitchUnits]);

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

  // Switching units between UNIT-1, UNIT-2, and BOTH
  const switchUnit = useCallback(
    (newUnitId) => {
      const cleanId = (newUnitId === 'UNIT-2' || newUnitId === 'BOTH') ? newUnitId : 'UNIT-1';
      if (!canSwitchUnits && user?.unitId && cleanId !== user.unitId) {
        console.warn('[UnitContext] Cross-unit switch prevented for restricted user.');
        return;
      }
      setActiveUnitIdState(cleanId);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('garment_qms_active_unit', cleanId);
        localStorage.setItem('garment_qms_active_unit', cleanId);
      }
    },
    [canSwitchUnits, user]
  );

  const availableUnits = canSwitchUnits
    ? [DEFAULT_UNITS[0], DEFAULT_UNITS[1], BOTH_UNITS_OPTION]
    : units;

  const activeUnit = availableUnits.find((u) => u.unitId === activeUnitId) || availableUnits[0] || DEFAULT_UNITS[0];

  return (
    <UnitContext.Provider
      value={{
        units: availableUnits,
        activeUnitId,
        activeUnit,
        switchUnit,
        refreshUnits: fetchUnits,
        unassignedCounts,
        loadingUnits,
        isCompanyAdmin,
        canSwitchUnits,
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
