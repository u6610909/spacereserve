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
      // Scoped to these two paths, NOT the whole /spacereserve prefix — the
      // frontend's own routes live under /spacereserve/ too (see `base`
      // above), so proxying everything would swallow the SPA's own
      // index.html/asset requests into the backend and 404.
      '/spacereserve/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      // Room photos (express.static in the backend, see lib/roomImages.ts) —
      // easy to forget since it's not under /api, and forgetting it doesn't
      // 404, it silently serves the SPA's own index.html instead (Vite's
      // dev-server history fallback), which fails at image-decode time, not
      // at the network-request level. Caught this exact failure mode while
      // testing the room-image feature: naturalWidth 0 despite a 200.
      '/spacereserve/uploads': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
