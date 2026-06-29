import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// For GitHub Pages project sites the app is served from /<repo>/, so set
// GH_BASE="/<repo>/" when building for Pages. Defaults to "/" for local dev,
// Vercel, and Netlify.
export default defineConfig({
  base: process.env.GH_BASE || "/",
  plugins: [react()],
  server: { port: 5173 },
});
