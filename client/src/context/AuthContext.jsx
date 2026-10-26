import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  // Purge any legacy persistent auth credentials in localStorage so fresh visits do not auto-login
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('garment_qms_user');
      localStorage.removeItem('garment_qms_token');
    } catch (e) {}
  }

  const [user, setUser] = useState(() => {
    try {
      const savedUser = sessionStorage.getItem('garment_qms_user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch (e) {
      return null;
    }
  });
  const [token, setToken] = useState(() => {
    try {
      return sessionStorage.getItem('garment_qms_token');
    } catch (e) {
      return null;
    }
  });
  const [loading, setLoading] = useState(() => {
    try {
      const hasToken = !!sessionStorage.getItem('garment_qms_token');
      const hasUser = !!sessionStorage.getItem('garment_qms_user');
      return hasToken && !hasUser;
    } catch (e) {
      return false;
    }
  });

  // Initialize and verify saved session
  useEffect(() => {
    let active = true;

    const initAuth = async () => {
      const storedToken = sessionStorage.getItem('garment_qms_token');
      if (storedToken) {
        try {
          const res = await authService.getMe();
          if (active && res.data?.success && res.data.user) {
            setUser(res.data.user);
            sessionStorage.setItem('garment_qms_user', JSON.stringify(res.data.user));
            return;
          }
        } catch (err) {
          console.warn('Session verification notice (clearing stale token):', err?.message);
          sessionStorage.removeItem('garment_qms_token');
          sessionStorage.removeItem('garment_qms_user');
          if (active) {
            setToken(null);
            setUser(null);
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      } else {
        if (active) {
          setLoading(false);
        }
      }
    };

    initAuth();

    return () => {
      active = false;
    };
  }, []);

  const switchUser = async () => {
    return { success: false, message: 'Role switching disabled in production mode.' };
  };

  const login = async (identifier, password, expectedRole, unitId) => {
    try {
      const res = await authService.login({ identifier, password, expectedRole, unitId });
      if (res.data?.success && res.data.user) {
        const canonicalUnit = (res.data.user.unitId === 'UNIT-2' || unitId === 'UNIT-2') ? 'UNIT-2' : 'UNIT-1';
        sessionStorage.setItem('garment_qms_token', res.data.token);
        sessionStorage.setItem('garment_qms_user', JSON.stringify(res.data.user));
        sessionStorage.setItem('garment_qms_active_unit', canonicalUnit);
        localStorage.setItem('garment_qms_active_unit', canonicalUnit);
        setToken(res.data.token);
        setUser(res.data.user);
        return { success: true, user: res.data.user };
      }
      return {
        success: false,
        message: res.data?.message || 'Authentication failed. Please check credentials.',
      };
    } catch (err) {
      return {
        success: false,
        message: err.response?.data?.message || 'Login failed. Please verify your Employee ID / Email and password.',
      };
    }
  };

  const register = async (userData) => {
    try {
      const res = await authService.register(userData);
      if (res.data?.success && res.data.user) {
        sessionStorage.setItem('garment_qms_token', res.data.token);
        sessionStorage.setItem('garment_qms_user', JSON.stringify(res.data.user));
        setToken(res.data.token);
        setUser(res.data.user);
        return { success: true, user: res.data.user };
      }
      return {
        success: false,
        message: res.data?.message || 'Registration failed.',
      };
    } catch (err) {
      return {
        success: false,
        message: err.response?.data?.message || 'Registration failed. Please check the entered data.',
      };
    }
  };

  const logout = async () => {
    try {
      const storedUser = user || JSON.parse(sessionStorage.getItem('garment_qms_user') || '{}');
      const userId = storedUser._id || storedUser.id || storedUser.employeeId;
      if (userId) {
        await authService.logout({
          userId,
          userName: storedUser.name,
          employeeId: storedUser.employeeId,
          userRole: storedUser.role,
        });
      }
    } catch (e) {
      console.warn('[AuthContext:logout] server notice:', e.message);
    } finally {
      sessionStorage.removeItem('garment_qms_token');
      sessionStorage.removeItem('garment_qms_user');
      sessionStorage.removeItem('garment_qms_cached_complaints');
      localStorage.removeItem('garment_qms_token');
      localStorage.removeItem('garment_qms_user');
      localStorage.removeItem('garment_qms_cached_complaints');
      setToken(null);
      setUser(null);
    }
  };

  const isOwner = user?.role === 'OWNER' || Boolean(user?.isOwner);
  const isUniversal =
    isOwner ||
    user?.isUniversal ||
    user?.hasAllRoles ||
    user?.employeeId === 'ALL-001' ||
    user?.email === 'all@factory.com';
  const isAdmin = user?.role === 'ADMIN' || isOwner || isUniversal;
  const isAuditor = user?.role === 'AUDITOR' || user?.role === 'ADMIN' || isOwner || isUniversal;
  const isActionPerson = user?.role === 'ACTION_PERSON' || user?.role === 'SUPERVISOR' || isOwner || isUniversal;
  const isSupervisor = isActionPerson;

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        register,
        logout,
        switchUser,
        isOwner,
        isAdmin,
        isAuditor,
        isActionPerson,
        isSupervisor,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
