// Copie le build Vite (dist/) vers backend/public/ pour que Laravel serve l'interface complète.
//   dist/index.html  ->  backend/public/app.html   (page unique, servie par routes/web.php)
//   dist/manifest.json, sw.js, icons/  ->  backend/public/
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const target = join(root, "backend", "public");

if (!existsSync(join(dist, "index.html"))) {
  console.error("dist/index.html introuvable : lancez d'abord « vite build ».");
  process.exit(1);
}
mkdirSync(target, { recursive: true });
cpSync(join(dist, "index.html"), join(target, "app.html"));
for (const f of ["manifest.json", "sw.js"]) if (existsSync(join(dist, f))) cpSync(join(dist, f), join(target, f));
if (existsSync(join(dist, "icons"))) cpSync(join(dist, "icons"), join(target, "icons"), { recursive: true });
console.log("Interface publiée dans backend/public/app.html — lancez « npm run serve » puis ouvrez http://127.0.0.1:8000");
