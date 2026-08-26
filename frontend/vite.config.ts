import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Mirrors production, where Nginx serves the built app at /spacereserve/ —
  // asset URLs in the built index.html resolve correctly either way.
  base: '/spacereserve/',
  server: {
    proxy: {
      // Scoped to the API path only, NOT the whole /spacereserve prefix —
      // the frontend's own routes live under /spacereserve/ too (see `base`
      // above), so proxying everything would swallow the SPA's own
      // index.html/asset requests into the backend and 404.
      '/spacereserve/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
