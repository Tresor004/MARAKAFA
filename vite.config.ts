import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mode « pages » (npm run dev:pages / build:pages) : version GitHub Pages, sans serveur,
// données dans le localStorage du navigateur (voir src/local). Sinon : API Laravel.
export default defineConfig(({ mode }) => ({
  // "/" par défaut (Laravel sert l'interface à la racine). Pour GitHub Pages : VITE_BASE=/MARAKAFA/
  base: process.env.VITE_BASE || "/",
  plugins: [react(), tailwindcss(), viteSingleFile()],
  define: mode === "pages" ? { "import.meta.env.VITE_STORAGE": JSON.stringify("local") } : {},
  server: {
    // En développement, /api est relayé vers Laravel (php artisan serve)
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    assetsInlineLimit: 100000000,
  },
}));
