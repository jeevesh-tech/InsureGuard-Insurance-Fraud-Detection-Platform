import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In real mode the Claims API is reached through the Cloud Load Balancer on the same
// origin (/api/*). For local dev against a remote/local API, proxy /api to it.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,

    proxy: process.env.VITE_DEV_API_TARGET
      ? { '/api': { target: process.env.VITE_DEV_API_TARGET, changeOrigin: true } }
      : undefined,
  },
});
