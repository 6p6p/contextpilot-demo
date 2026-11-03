import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'API_PROXY_');
  return {
    root: fileURLToPath(new URL('.', import.meta.url)),
    plugins: [react()],
    server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: {
      '/api': { target: process.env.API_PROXY_TARGET || env.API_PROXY_TARGET || 'http://127.0.0.1:3001' },
    } },
    build: { outDir: '../../dist/web', emptyOutDir: true },
  };
});
