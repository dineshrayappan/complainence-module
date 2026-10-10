import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';

// https://vitejs.dev/config/
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // Allow external mobile devices on local network to access
    proxy: {
      '/api': {
        target: process.env.SERVER_URL || 'http://localhost:5000',
        changeOrigin: true,
      },
      '/uploads': {
        target: process.env.SERVER_URL || 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
