import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Rooms serves the plugin from /_plugins/goals/, so every URL in the build is relative.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true, target: "es2022", modulePreload: false },
  test: { environment: "jsdom" },
});
