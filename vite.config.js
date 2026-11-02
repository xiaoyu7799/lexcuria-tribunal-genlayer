import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Configured for https://xiaoyu7799.github.io/lexcuria-tribunal-genlayer/
export default defineConfig({
  base: "/lexcuria-tribunal-genlayer/",
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
