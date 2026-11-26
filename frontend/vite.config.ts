import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const srcDir = decodeURIComponent(new URL("./src", import.meta.url).pathname);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": srcDir,
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: "modern-compiler",
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("three")) return "three";
          if (id.includes("gsap")) return "motion";
          if (id.includes("@phosphor-icons")) return "icons";
          if (id.includes("@tanstack/react-query") || id.includes("zustand")) return "state";
          if (id.includes("i18next")) return "i18n";
          return "vendor";
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
