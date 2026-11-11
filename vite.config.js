// Vite config: React plugin, and a dev proxy so the browser talks to the API on one origin.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Small assets are normally inlined as data: URLs, but the audio worklet must be a real file served from this site:
    // the content security policy only allows scripts from 'self'.
    assetsInlineLimit: (file) => (file.includes('beatMeterWorklet') ? false : undefined),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:4000',
      '/live': { target: 'ws://127.0.0.1:4000', ws: true },
    },
  },
});
