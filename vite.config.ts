import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  const sandboxId = 'iinom48t4xlc7mamby18e';
  
  // The platform proxy seems to pick a port dynamically or it's hard to predict which port it will use
  // if the previous ports are "in use" (maybe from previous processes).
  // Let's try to use a dynamic port or just use the environment variable if available.
  // But Vite's allowedHosts needs to match the host header.
  // The host header is {port}-{sandboxId}.e2b.app.
  // Since we don't know the port in advance (it's picked by Vite when port is in use),
  // we can use `*` in allowedHosts which should match everything.
  // But the warning says: "Blocked request. This host (...) is not allowed. To allow this host, add ... to `server.allowedHosts`".
  // If `*` is in allowedHosts, it should work. Let's check if `*` is supported in Vite's allowedHosts.
  // Vite docs say: "allowedHosts: string[] | true". If true, it allows all hosts.
  
  return {
    server: {
      host: '0.0.0.0',
      // We'll let Vite pick the port (default 5173)
      allowedHosts: true, // This should allow ANY host header!
      cors: true,
    },
    plugins: [
      react(),
      VitePWA({
        strategies: 'generateSW',
        registerType: 'autoUpdate',
        includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'favicon.svg'],
        manifest: {
          name: 'Creditbridge — HFCC to WSU Transfer Guide',
          short_name: 'Creditbridge',
          description:
            'See which Henry Ford College courses may transfer to Wayne State University and may fit WSU General Education requirements. Works offline.',
          theme_color: '#0b6e4f',
          background_color: '#f6f8f7',
          display: 'standalone',
          start_url: '.',
          scope: '.',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,json,png,svg,ico,woff2}'],
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          navigateFallback: 'index.html',
        },
        devOptions: { enabled: false },
      }),
    ],
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    },
  };
});