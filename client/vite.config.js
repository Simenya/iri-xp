import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./", // relative paths, so the site works at any address (Netlify root or GitHub Pages sub-path)
  plugins: [react()],
  server: { port: 5174 },
});
