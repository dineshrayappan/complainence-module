import React, { createContext, useContext, useEffect } from 'react';

const ThemeContext = createContext({
  theme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
  isDark: false,
});

export const ThemeProvider = ({ children }) => {
  useEffect(() => {
    try {
      localStorage.removeItem('garment_qms_theme');
    } catch (e) {
      // ignore
    }

    const root = document.documentElement;
    const body = document.body;

    root.classList.remove('dark');
    root.classList.add('light');
    root.style.colorScheme = 'light';

    if (body) {
      body.classList.remove('dark');
      body.classList.add('light');
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: 'light', setTheme: () => {}, toggleTheme: () => {}, isDark: false }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
