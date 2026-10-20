import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  // Stamped into data URLs so browsers fetch fresh JSON after each deploy.
  define: { __DATA_VERSION__: JSON.stringify(String(Date.now())) },
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8787' },
  },
});
