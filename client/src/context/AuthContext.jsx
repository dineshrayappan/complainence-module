import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('garment_qms_token'));
  const [loading, setLoading] = useState(false);

  // Initialize and verify saved session
  useEffect(() => {
    let active = true;

    const initAuth = async () => {
      const storedToken = localStorage.getItem('garment_qms_token');
      if (storedToken) {
        try {
          const res = await authService.getMe();
          if (active && res.data?.success && res.data.user) {
            setUser(res.data.user);
            return;
          }
        } catch (err) {
          console.warn('Session verification notice (clearing stale token):', err?.message);
          localStorage.removeItem('garment_qms_token');
          if (active) {
            setToken(null);
            setUser(null);
          }
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

  const login = async (identifier, password, expectedRole) => {
    try {
      const res = await authService.login({ identifier, password, expectedRole });
      if (res.data?.success && res.data.user) {
        localStorage.setItem('garment_qms_token', res.data.token);
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
        localStorage.setItem('garment_qms_token', res.data.token);
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

  const logout = () => {
    localStorage.removeItem('garment_qms_token');
    localStorage.removeItem('garment_qms_cached_complaints');
    setToken(null);
    setUser(null);
  };

  const isUniversal =
    user?.isUniversal ||
    user?.hasAllRoles ||
    user?.employeeId === 'ALL-001' ||
    user?.email === 'all@factory.com';
  const isAdmin = user?.role === 'ADMIN' || isUniversal;
  const isAuditor = user?.role === 'AUDITOR' || user?.role === 'ADMIN' || isUniversal;
  const isActionPerson = user?.role === 'ACTION_PERSON' || user?.role === 'SUPERVISOR' || isUniversal;
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
