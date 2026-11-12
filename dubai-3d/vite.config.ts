import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1200,
    assetsInlineLimit: 0,
    rollupOptions: { output: { manualChunks: { maplibre: ["maplibre-gl"], three: ["three"] } } },
  },
  worker: { format: "es" },
  server: { host: true },
});
