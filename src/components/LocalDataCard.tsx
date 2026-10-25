import { useRef, useState } from "react";
import { Card, Button, useToast, useConfirm } from "./ui";
import { IconDownload, IconRefresh, IconTrash } from "./Icons";
import { exportData, importData, resetData } from "../local/db";

/**
 * Version GitHub Pages (stockage local) : les données ne vivent que dans ce navigateur.
 * Cette carte permet de les sauvegarder dans un fichier, de les restaurer (autre poste, autre navigateur) ou de repartir de zéro.
 */
export default function LocalDataCard() {
  const { push } = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const blob = new Blob([await exportData()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `hi-market-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      push("Sauvegarde téléchargée");
    } catch (e) { push(e instanceof Error ? e.message : "Export impossible", "error"); }
    setBusy(false);
  };

  const restore = async (file: File) => {
    const ok = await confirm({
      title: "Restaurer une sauvegarde",
      message: "Toutes les données actuelles de ce navigateur seront remplacées par celles du fichier. Continuer ?",
      confirmLabel: "Restaurer", variant: "danger",
    });
    if (!ok) return;
    try {
      importData(await file.text());
      push("Sauvegarde restaurée : reconnectez-vous.");
      setTimeout(() => window.location.reload(), 800);
    } catch (e) { push(e instanceof Error ? e.message : "Fichier invalide", "error"); }
  };

  const reset = async () => {
    const ok = await confirm({
      title: "Effacer toutes les données",
      message: "Produits, ventes, employés, paramètres… tout sera supprimé de ce navigateur et l'application repartira vierge (compte admin@himarket.sn / admin123). Pensez à télécharger une sauvegarde avant. Continuer ?",
      confirmLabel: "Tout effacer", variant: "danger",
    });
    if (!ok) return;
    resetData();
    window.location.reload();
  };

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-lg font-black text-slate-900 mb-1">Données de ce navigateur</h2>
      <p className="text-sm text-slate-500 mb-4">
        Cette version fonctionne sans serveur : toutes les données sont enregistrées dans ce navigateur, sur cet appareil uniquement.
        Vider le cache du navigateur les efface. Téléchargez régulièrement une sauvegarde ; elle permet aussi de transférer les données sur un autre poste.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={download} disabled={busy}><IconDownload size={16} /> Télécharger une sauvegarde</Button>
        <Button variant="outline" onClick={() => fileRef.current?.click()}><IconRefresh size={16} /> Restaurer une sauvegarde</Button>
        <Button variant="danger" onClick={reset}><IconTrash size={16} /> Tout effacer</Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void restore(f); }} />
      </div>
    </Card>
  );
}
