import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// Force la locale française pour l'affichage des sélecteurs de date natifs (JJ/MM/AAAA)
document.documentElement.lang = "fr-FR";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Service worker (installation sur l'écran d'accueil + secours hors-ligne de l'interface).
// Désactivé en développement pour ne pas masquer les modifications ; ne met jamais l'API en cache.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch((err) => console.warn("[Hi-Market] Service Worker non enregistré :", err));
  });
}
