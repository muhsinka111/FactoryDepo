import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The API origin the dev/preview server proxies `/api/` to. Defaults to the
 * local API on :9091; override with VITE_PROXY_TARGET when a second API (for
 * example a worktree on another port) is serving the requests.
 */
const apiTarget = process.env.VITE_PROXY_TARGET ?? 'http://localhost:9091';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8080,
    proxy: {
      '/api/': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 8080,
    proxy: {
      '/api/': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
