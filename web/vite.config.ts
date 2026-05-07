import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    // Source maps only when running `vite` (dev), never for `vite build` (prod).
    // Production source maps leaked ~1.8MB and exposed full source.
    sourcemap: command !== 'build',
  },
}));
