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
