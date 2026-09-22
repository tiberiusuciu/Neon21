import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Prefer shared source in Vite so web doesn't depend on packages/shared/dist
    alias: {
      "@neon21/shared": new URL(
        "../../packages/shared/src/index.ts",
        import.meta.url
      ).pathname,
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
