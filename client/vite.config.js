import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import net from 'net';
import path from 'path';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let backendProcess = null;
const ensureBackendRunning = () => {
  if (backendProcess) return;
  const socket = new net.Socket();
  socket.setTimeout(600);

  const startBackend = () => {
    socket.destroy();
    if (backendProcess) return;
    const serverScript = path.resolve(__dirname, '../server/server.js');
    console.log('\n⚡ [Vite Proxy] Backend port 5000 offline -> Auto-starting backend server at:', serverScript);
    backendProcess = spawn(process.execPath, [serverScript], {
      cwd: path.resolve(__dirname, '../server'),
      stdio: 'inherit',
    });
    backendProcess.on('exit', () => {
      backendProcess = null;
    });
  };

  socket.on('connect', () => {
    socket.destroy();
  });
  socket.on('timeout', startBackend);
  socket.on('error', startBackend);
  socket.connect(5000, '127.0.0.1');
};

const backendAutoSupervisor = () => ({
  name: 'backend-auto-supervisor',
  configureServer() {
    ensureBackendRunning();
  },
});

// https://vitejs.dev/config/
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), backendAutoSupervisor()],
  server: {
    port: 5173,
    host: true, // Allow external mobile devices on local network to access
    proxy: {
      '/api': {
        target: process.env.SERVER_URL || 'http://localhost:5000',
        changeOrigin: true,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
        configure: (proxy) => {
          proxy.on('error', (err) => {
            if (err.code === 'ECONNREFUSED') {
              ensureBackendRunning();
            }
          });
        },
      },
      '/uploads': {
        target: process.env.SERVER_URL || 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
