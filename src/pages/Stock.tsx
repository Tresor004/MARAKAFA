import { useState, useMemo } from "react";
import { useStore, fmtCurrency, fmtDate } from "../store";
import { Card, Badge, EmptyState, Button, Modal, Field, inputClass } from "../components/ui";
import { IconPlus, IconMinus, IconSearch } from "../components/Icons";
import { useToast } from "../components/ui";

export default function Stock({ initialFilter = "all" }: { initialFilter?: "all" | "low" | "expiring" | "out" }) {
  const { products, requestOrExec } = useStore();
  const { push } = useToast();
  const [filter, setFilter] = useState<"all" | "low" | "expiring" | "out">(initialFilter);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [targetProduct, setTargetProduct] = useState<string | null>(null);
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [qty, setQty] = useState(0);
  const [reason, setReason] = useState("");

  const list = useMemo(() => {
    let items = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    if (filter === "low") items = items.filter(p => p.stock > 0 && p.stock <= p.minStock);
    if (filter === "out") items = items.filter(p => p.stock === 0);
    if (filter === "expiring") items = items.filter(p => p.expiryDate && (new Date(p.expiryDate).getTime() - Date.now()) / 86400000 <= 15);
    return items;
  }, [products, filter, search]);

  const totalValue = products.reduce((a, b) => a + b.stock * b.cost, 0);
  const lowCount = products.filter(p => p.stock <= p.minStock).length;

  const openModal = (productId: string, m: "add" | "remove") => { setTargetProduct(productId); setMode(m); setQty(0); setReason(""); setModalOpen(true); };

  const confirmAdjust = () => {
    if (!targetProduct || qty <= 0) return push("Quantité invalide", "error");
    const p = products.find(x => x.id === targetProduct);
    if (!p) return;
    if (mode === "remove" && qty > p.stock) return push("La quantité est supérieure au stock", "error");
    const label = mode === "add" ? "Ajout au stock" : "Retrait du stock";
    const ok = requestOrExec({
      kind: "stock.adjust", module: "Stocks", action: label,
      description: `${mode === "add" ? "+" : "-"}${qty} ${p.unit} de ${p.name}`,
      details: { produit: p.name, quantité: String(qty), motif: reason || (mode === "add" ? "Réception" : "Retrait"), stockAvant: String(p.stock) },
      payload: { productId: targetProduct, delta: mode === "add" ? qty : -qty },
    });
    push(ok ? `Stock ${mode === "add" ? "ajusté à la hausse" : "diminué"} : ${qty} ${p.unit}` : "Action en attente de validation par l'administrateur");
    setModalOpen(false);
  };

  const filterBtn = (key: typeof filter, label: string, count: number) => (
    <button onClick={() => setFilter(key)} className={`px-3 py-2 rounded-xl text-sm font-medium transition ${filter === key ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-700 hover:border-slate-400"}`}>
      {label} <span className="opacity-70">({count})</span>
    </button>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900">Gestion des stocks</h1>
        <p className="text-slate-500 text-xs sm:text-sm mt-1">Valeur du stock : <b>{fmtCurrency(totalValue)}</b> · Critique : <b>{lowCount}</b> article{lowCount > 1 ? "s" : ""}</p>
      </div>

      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={inputClass + " pl-9"} placeholder="Rechercher un article..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            {filterBtn("all", "Tous", products.length)}
            {filterBtn("low", "Critique", products.filter(p => p.stock > 0 && p.stock <= p.minStock).length)}
            {filterBtn("out", "Rupture", products.filter(p => p.stock === 0).length)}
            {filterBtn("expiring", "À péremption", products.filter(p => p.expiryDate && (new Date(p.expiryDate).getTime() - Date.now()) / 86400000 <= 15).length)}
          </div>
        </div>
      </Card>

      {/* Desktop table */}
      <Card className="hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-slate-600 uppercase text-xs border-b border-slate-200">
                <th className="py-3 px-4">Produit</th>
                <th className="py-3 px-4 text-right">Stock</th>
                <th className="py-3 px-4 text-right hidden lg:table-cell">Min.</th>
                <th className="py-3 px-4 text-right hidden lg:table-cell">Valeur stock</th>
                <th className="py-3 px-4 hidden lg:table-cell">Péremption</th>
                <th className="py-3 px-4 text-right">Ajustement</th>
              </tr>
            </thead>
            <tbody>
              {list.map(p => {
                const days = p.expiryDate ? Math.round((new Date(p.expiryDate).getTime() - Date.now()) / 86400000) : null;
                return (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="py-3 px-4">
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-xs text-slate-500">{p.category}</div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Badge tone={p.stock === 0 ? "rose" : p.stock <= p.minStock ? "amber" : "emerald"}>{p.stock} {p.unit}</Badge>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-600 hidden lg:table-cell">{p.minStock}</td>
                    <td className="py-3 px-4 text-right font-semibold hidden lg:table-cell">{fmtCurrency(p.stock * p.cost)}</td>
                    <td className="py-3 px-4 text-xs hidden lg:table-cell">
                      {p.expiryDate ? (
                        <span className={days !== null && days <= 15 ? "text-amber-700 font-semibold" : "text-slate-600"}>
                          {fmtDate(p.expiryDate)} {days !== null ? `(${days >= 0 ? days + " j" : "périmé"})` : ""}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button onClick={() => openModal(p.id, "add")} className="p-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 inline-flex" title="Ajouter"><IconPlus size={16} /></button>
                      <button onClick={() => openModal(p.id, "remove")} className="p-2 ml-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 inline-flex" title="Retirer"><IconMinus size={16} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {list.length === 0 && <EmptyState title="Aucun article" subtitle="Modifiez les filtres" />}
      </Card>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {list.length === 0 && <Card className="p-6"><EmptyState title="Aucun article" subtitle="Modifiez les filtres" /></Card>}
        {list.map(p => {
          const days = p.expiryDate ? Math.round((new Date(p.expiryDate).getTime() - Date.now()) / 86400000) : null;
          return (
            <Card key={p.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 truncate">{p.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{p.category}</div>
                </div>
                <Badge tone={p.stock === 0 ? "rose" : p.stock <= p.minStock ? "amber" : "emerald"}>{p.stock} {p.unit}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-3 text-xs">
                <div className="text-slate-500">Stock min. : <span className="text-slate-700 font-medium">{p.minStock}</span></div>
                <div className="text-slate-500 text-right">Valeur : <span className="text-slate-700 font-medium">{fmtCurrency(p.stock * p.cost)}</span></div>
                {p.expiryDate && (
                  <div className={`col-span-2 ${days !== null && days <= 15 ? "text-amber-700 font-semibold" : "text-slate-500"}`}>
                    Péremption : {fmtDate(p.expiryDate)} {days !== null ? `(${days >= 0 ? days + " j" : "périmé"})` : ""}
                  </div>
                )}
              </div>
              <div className="flex gap-2 pt-3 mt-3 border-t border-slate-100">
                <button onClick={() => openModal(p.id, "add")} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold transition active:scale-[.97]"><IconPlus size={14} /> Ajouter</button>
                <button onClick={() => openModal(p.id, "remove")} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition active:scale-[.97]"><IconMinus size={14} /> Retirer</button>
              </div>
            </Card>
          );
        })}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={mode === "add" ? "Ajouter au stock" : "Retirer du stock"}>
        {targetProduct && (() => {
          const p = products.find(x => x.id === targetProduct);
          if (!p) return null;
          return (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-xl p-4 text-sm">
                <div><b>Produit :</b> {p.name}</div>
                <div><b>Stock actuel :</b> {p.stock} {p.unit}</div>
              </div>
              <Field label="Quantité"><input type="number" className={inputClass} value={qty} onChange={e => setQty(+e.target.value)} placeholder="0" /></Field>
              <Field label="Motif / Commentaire"><input className={inputClass} value={reason} onChange={e => setReason(e.target.value)} placeholder={mode === "add" ? "Réception commande, inventaire..." : "Perte, casse, échantillon..."} /></Field>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setModalOpen(false)}>Annuler</Button>
                <Button variant={mode === "add" ? "success" : "danger"} onClick={confirmAdjust}>Confirmer</Button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
