import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8080,
    proxy: {
      '/api/': {
        target: 'http://localhost:9091',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 8080,
    proxy: {
      '/api/': {
        target: 'http://localhost:9091',
        changeOrigin: true,
      },
    },
  },
});
