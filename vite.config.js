// Vite config: React plugin, and a dev proxy so the browser talks to the API on one origin.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/live': { target: 'ws://localhost:4000', ws: true },
    },
  },
});
