import { useCallback, useEffect, useState } from "react";
import { api, errMsg } from "../api";
import { useStore } from "../store";
import { StockMovement, StockMovementType } from "../types";
import { Badge, Button, Card, EmptyState, inputClass, SearchSelect } from "./ui";
import { IconSearch } from "./Icons";

export const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  sale: "Vente", sale_return: "Retour client", purchase: "Achat", purchase_cancel: "Achat annulé",
  loss: "Perte", loss_cancel: "Perte annulée", inventory: "Inventaire", adjustment: "Ajustement", initial: "Stock initial",
};

const TONES: Record<StockMovementType, "slate" | "emerald" | "rose" | "amber" | "sky"> = {
  sale: "sky", sale_return: "emerald", purchase: "emerald", purchase_cancel: "rose",
  loss: "rose", loss_cancel: "emerald", inventory: "amber", adjustment: "slate", initial: "slate",
};

const PER_PAGE = 30;

/** Journal des mouvements de stock : qui, quand, pourquoi, stock avant / après. Données lues sur le serveur (filtrées et paginées). */
export default function StockJournal() {
  const { products } = useStore();
  const [rows, setRows] = useState<StockMovement[]>([]);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [qApplied, setQApplied] = useState("");
  const [type, setType] = useState("");
  const [productId, setProductId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Recherche texte : on attend la fin de la saisie pour ne pas solliciter l'API à chaque lettre
  useEffect(() => { const t = setTimeout(() => { setQApplied(q.trim()); setPage(1); }, 350); return () => clearTimeout(t); }, [q]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const p = new URLSearchParams({ page: String(page), perPage: String(PER_PAGE) });
    if (qApplied) p.set("q", qApplied);
    if (type) p.set("type", type);
    if (productId) p.set("productId", productId);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    try {
      const r = await api<{ data: StockMovement[]; total: number; lastPage: number }>("GET", `/stock-movements?${p}`);
      setRows(r.data); setTotal(r.total); setLastPage(r.lastPage);
    } catch (e) { setError(errMsg(e)); }
    setLoading(false);
  }, [page, qApplied, type, productId, from, to]);

  // `products` est rechargé après chaque opération qui touche au stock (vente, achat, ajustement…) → le journal reste à jour
  useEffect(() => { void load(); }, [load, products]);

  const reset = () => { setQ(""); setQApplied(""); setType(""); setProductId(""); setFrom(""); setTo(""); setPage(1); };
  const filtered = !!(qApplied || type || productId || from || to);
  const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <div className="relative xl:col-span-2">
            <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={inputClass + " pl-9"} placeholder="Produit, motif, référence, employé…" value={q} onChange={e => setQ(e.target.value)} aria-label="Rechercher dans le journal" />
          </div>
          <SearchSelect value={productId} onChange={v => { setProductId(v); setPage(1); }} allLabel="Tous les produits"
            options={products.map(p => ({ value: p.id, label: p.name }))} />
          <select className={inputClass} value={type} onChange={e => { setType(e.target.value); setPage(1); }} aria-label="Type de mouvement">
            <option value="">Tous les types</option>
            {(Object.keys(MOVEMENT_LABELS) as StockMovementType[]).map(t => <option key={t} value={t}>{MOVEMENT_LABELS[t]}</option>)}
          </select>
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <input type="date" className={inputClass + " !py-2 !text-xs"} value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} aria-label="Du" />
            <span>→</span>
            <input type="date" className={inputClass + " !py-2 !text-xs"} value={to} onChange={e => { setTo(e.target.value); setPage(1); }} aria-label="Au" />
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
          <span><b className="text-slate-900">{total}</b> mouvement{total > 1 ? "s" : ""}{loading && " · chargement…"}</span>
          {filtered && <button onClick={reset} className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold text-slate-700">Effacer les filtres</button>}
        </div>
      </Card>

      {error && <Card className="p-4 text-sm text-rose-700 bg-rose-50 border-rose-200">{error} <button className="underline ml-2" onClick={() => void load()}>Réessayer</button></Card>}

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-slate-600 uppercase text-xs border-b border-slate-200">
                <th className="py-3 px-4">Date</th><th className="py-3 px-4">Produit</th><th className="py-3 px-4">Type</th>
                <th className="py-3 px-4 text-right">Variation</th><th className="py-3 px-4 text-right hidden sm:table-cell">Avant → Après</th>
                <th className="py-3 px-4 hidden lg:table-cell">Motif / référence</th><th className="py-3 px-4 hidden md:table-cell">Par</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(m => (
                <tr key={m.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className="py-2.5 px-4 text-xs text-slate-600 whitespace-nowrap">{fmtDateTime(m.date)}</td>
                  <td className="py-2.5 px-4 font-semibold">{m.productName}</td>
                  <td className="py-2.5 px-4"><Badge tone={TONES[m.type]}>{MOVEMENT_LABELS[m.type] ?? m.type}</Badge></td>
                  <td className={`py-2.5 px-4 text-right font-bold ${m.quantity > 0 ? "text-emerald-700" : m.quantity < 0 ? "text-rose-700" : "text-slate-500"}`}>
                    {m.quantity > 0 ? "+" : ""}{m.quantity}
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-600 hidden sm:table-cell whitespace-nowrap">{m.stockBefore} → <b className="text-slate-900">{m.stockAfter}</b></td>
                  <td className="py-2.5 px-4 text-xs text-slate-600 hidden lg:table-cell">
                    {m.referenceLabel && <span className="font-mono mr-1">{m.referenceLabel}</span>}{m.reason}
                  </td>
                  <td className="py-2.5 px-4 text-xs text-slate-600 hidden md:table-cell">{m.userName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && rows.length === 0 && !error && <EmptyState title="Aucun mouvement" subtitle={filtered ? "Modifiez les filtres" : "Les ventes, achats, pertes et ajustements apparaîtront ici"} />}
      </Card>

      {lastPage > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <Button variant="outline" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}>← Précédent</Button>
          <span className="text-slate-600">Page <b>{page}</b> / {lastPage}</span>
          <Button variant="outline" disabled={page >= lastPage || loading} onClick={() => setPage(p => p + 1)}>Suivant →</Button>
        </div>
      )}
    </div>
  );
}
