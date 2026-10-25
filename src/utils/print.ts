/**
 * Impression d'un document HTML autonome dans un iframe invisible (étiquettes, tickets…).
 * Évite d'imprimer toute l'interface et ne dépend d'aucun style de la page.
 */
export function printHtml(html: string, title = "Impression"): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) { frame.remove(); return; }

  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${html}</body></html>`);
  doc.close();

  const cleanup = () => setTimeout(() => frame.remove(), 500);
  win.addEventListener("afterprint", cleanup);
  // Laisse le temps au navigateur de mettre en page avant d'ouvrir la boîte de dialogue
  setTimeout(() => { win.focus(); win.print(); setTimeout(cleanup, 60_000); }, 150);
}
