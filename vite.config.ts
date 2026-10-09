import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
base: "/MARAKAFA/",
plugins: [react(), tailwindcss(), viteSingleFile()],
server: {
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
});
