import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Loft",
        short_name: "Loft",
        description: "Personal photo & video loft",
        // The installed app's splash and task-switcher colour. The in-page
        // <meta name="theme-color"> is media-query aware and overrides this at
        // runtime; the manifest value is the static fallback, so it uses the
        // light room to match the default system appearance on most phones.
        theme_color: "#F2F2F7",
        background_color: "#F2F2F7",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg}"],
        // These are server routes. Without the denylist the service worker
        // answers a navigation to /login with the cached app shell, so the
        // Cloudflare Access sign-in would never run.
        navigateFallbackDenylist: [/^\/login/, /^\/logout/, /^\/api\//, /^\/img\//, /^\/cdn-cgi\//],
        runtimeCaching: [
          {
            urlPattern: /\/img\/thumb\//,
            handler: "CacheFirst",
            options: {
              cacheName: "thumbs",
              expiration: { maxEntries: 5000, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /\/img\/preview\//,
            handler: "CacheFirst",
            options: {
              cacheName: "previews",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8787", changeOrigin: true },
      "/img": { target: "http://localhost:8787", changeOrigin: true },
    },
  },
});
