import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const DAY = 60 * 60 * 24;

/**
 * Public path the app is served from. '/' for a domain root; set VITE_BASE=/repo-name/ when
 * hosting under a sub-path such as GitHub Pages. Always starts and ends with a slash.
 */
const trimmed = (process.env.VITE_BASE ?? '').replace(/^\/+|\/+$/g, '');
const base = trimmed ? `/${trimmed}/` : '/';
const icon = (name: string) => `${base}icons/${name}`;

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // "prompt" lets the app show its own "Update available" flow instead of reloading silently.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png', 'offline.html'],
      manifest: {
        id: base,
        name: 'NearMe — Everything Around You',
        short_name: 'NearMe',
        description: "Discover places. Find services. Know what's happening nearby.",
        theme_color: '#F5F3ED',
        background_color: '#F5F3ED',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: `${base}?source=pwa`,
        scope: base,
        lang: 'en',
        categories: ['navigation', 'travel', 'lifestyle', 'utilities'],
        icons: [
          { src: icon('icon-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: icon('icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: icon('maskable-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Deep links surfaced on long-press of the installed app icon.
        shortcuts: [
          { name: 'Explore map', short_name: 'Map', url: `${base}map`, icons: [{ src: icon('icon-192.png'), sizes: '192x192' }] },
          { name: 'NearMe Live', short_name: 'Live', url: `${base}live`, icons: [{ src: icon('icon-192.png'), sizes: '192x192' }] },
          { name: 'Emergency services', short_name: 'Emergency', url: `${base}emergency`, icons: [{ src: icon('icon-192.png'), sizes: '192x192' }] },
          { name: 'Saved places', short_name: 'Saved', url: `${base}saved`, icons: [{ src: icon('icon-192.png'), sizes: '192x192' }] },
        ],
      },
      workbox: {
        // Bump when cached response shapes change so old runtime caches are dropped.
        cacheId: 'nearme-v1',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // 404.html exists only as a deep-link fallback for static hosts; the worker never needs it.
        globIgnores: ['**/404.html'],
        navigateFallback: `${base}index.html`,
        importScripts: [`${base}sw-push.js`],
        runtimeCaching: [
          {
            // Map style, glyphs and sprites change rarely.
            urlPattern: ({ url }) => url.hostname === 'tiles.openfreemap.org' && !url.pathname.endsWith('.pbf'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'map-style', expiration: { maxEntries: 80, maxAgeSeconds: 7 * DAY } },
          },
          {
            // Vector tiles: cache-first so recently browsed areas still render offline.
            urlPattern: ({ url }) => url.pathname.endsWith('.pbf'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 600, maxAgeSeconds: 14 * DAY, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Place data and geocoding: fresh when online, last good answer when offline.
            urlPattern: ({ url }) =>
              /overpass|nominatim\.openstreetmap\.org|photon\.komoot\.io|commons\.wikimedia\.org|wikidata\.org/.test(url.hostname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'place-data',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 120, maxAgeSeconds: 2 * DAY },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 300, maxAgeSeconds: 30 * DAY, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // MapLibre's worker is an ES module with its own imports; keep it that way when bundling.
  worker: { format: 'es' },
  server: { port: 5173, host: true },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 1200 },
});
