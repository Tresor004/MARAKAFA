import { useState } from "react";
import { useStore, fmtCurrency, fmtDate } from "../store";
import { Card, Button, Modal, Field, inputClass, EmptyState, Badge, SearchSelect } from "../components/ui";
import { IconPlus, IconTrash } from "../components/Icons";
import { useToast, useConfirm } from "../components/ui";

export default function Losses() {
  const { losses, products, currentUser, requestOrExec } = useStore();
  const { push } = useToast();
  const confirm = useConfirm();
  const isAdmin = currentUser?.role === "admin";
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [reason, setReason] = useState("Péremption");

  const save = () => {
    const p = products.find(x => x.id === productId);
    if (!p || quantity <= 0) return push("Produit et quantité requis", "error");
    if (quantity > p.stock) return push("La quantité dépasse le stock disponible", "error");
    const lossData = { productId: p.id, productName: p.name, quantity, unitPrice: p.cost, total: quantity * p.cost, reason, date: new Date().toISOString().slice(0, 10), notedBy: currentUser?.name || "" };
    const ok = requestOrExec({
      kind: "loss.add", module: "Pertes", action: "Déclarer une perte",
      description: `${quantity} ${p.unit} de ${p.name} — motif : ${reason}`,
      details: { produit: p.name, quantité: String(quantity), motif: reason, valeur: fmtCurrency(quantity * p.cost) },
      payload: lossData,
    });
    push(ok ? "Perte enregistrée · stock mis à jour" : "Action en attente de validation par l'administrateur");
    setOpen(false); setProductId(""); setQuantity(0);
  };
  const remove = async (id: string) => {
    const loss = losses.find(l => l.id === id);
    const ok = await confirm({ title: "Supprimer cette perte", message: "Voulez-vous vraiment supprimer cette entrée de perte ?", confirmLabel: "Supprimer", variant: "danger" });
    if (!ok) return;
    const ok2 = requestOrExec({
      kind: "loss.delete", module: "Pertes", action: "Supprimer une perte",
      description: `Suppression de ${loss?.productName || ""} (motif : ${loss?.reason || "?"})`,
      details: { produit: loss?.productName || "", motif: loss?.reason || "" },
      payload: { id },
    });
    push(ok2 ? "Entrée supprimée" : "Action en attente de validation par l'administrateur");
  };

  const totalLoss = losses.reduce((a, b) => a + b.total, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900">Pertes & Péremptions</h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">{losses.length} entrée{losses.length > 1 ? "s" : ""} · Total : <b className="text-rose-700">{fmtCurrency(totalLoss)}</b></p>
        </div>
        <Button variant="danger" onClick={() => setOpen(true)} className="w-full sm:w-auto"><IconPlus size={16} /> Déclarer une perte</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Card className="p-4 sm:p-5 bg-gradient-to-br from-rose-50 to-white col-span-2 lg:col-span-1">
          <div className="text-[11px] font-semibold uppercase text-rose-700">Total pertes</div>
          <div className="text-xl sm:text-2xl font-black text-rose-900 mt-1">{fmtCurrency(totalLoss)}</div>
        </Card>
        <Card className="p-4 sm:p-5">
          <div className="text-[11px] font-semibold uppercase text-slate-500">Par péremption</div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1">{losses.filter(l => l.reason === "Péremption").length}</div>
        </Card>
        <Card className="p-4 sm:p-5">
          <div className="text-[11px] font-semibold uppercase text-slate-500">Casse / autre</div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1">{losses.filter(l => l.reason !== "Péremption").length}</div>
        </Card>
      </div>

      {/* Desktop table */}
      <Card className="overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-slate-600 uppercase text-xs border-b border-slate-200">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Produit</th>
                <th className="py-3 px-4">Motif</th>
                <th className="py-3 px-4 text-right">Qté</th>
                <th className="py-3 px-4 text-right">Valeur</th>
                <th className="py-3 px-4 hidden lg:table-cell">Déclaré par</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {losses.map(l => (
                <tr key={l.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className="py-3 px-4 text-slate-600">{fmtDate(l.date)}</td>
                  <td className="py-3 px-4 font-semibold">{l.productName}</td>
                  <td className="py-3 px-4"><Badge tone={l.reason === "Péremption" ? "amber" : "rose"}>{l.reason}</Badge></td>
                  <td className="py-3 px-4 text-right">{l.quantity}</td>
                  <td className="py-3 px-4 text-right font-bold text-rose-700">{fmtCurrency(l.total)}</td>
                  <td className="py-3 px-4 text-slate-600 hidden lg:table-cell">{l.notedBy}</td>
                  <td className="py-3 px-4 text-right">
                    {isAdmin ? (
                      <button onClick={() => remove(l.id)} className="p-2 rounded-lg hover:bg-rose-50 text-rose-600 inline-flex" title="Supprimer (admin)"><IconTrash size={16} /></button>
                    ) : (
                      <span className="text-[10px] text-slate-400">Admin requis</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {losses.length === 0 && <EmptyState title="Aucune perte déclarée" subtitle="Super ! Aucune perte pour le moment." />}
      </Card>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {losses.length === 0 && <Card className="p-6"><EmptyState title="Aucune perte déclarée" subtitle="Super ! Aucune perte pour le moment." /></Card>}
        {losses.map(l => (
          <Card key={l.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-bold text-slate-900 truncate">{l.productName}</div>
                <div className="text-xs text-slate-500 mt-0.5">{fmtDate(l.date)} · {l.quantity} unité{l.quantity > 1 ? "s" : ""}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Par {l.notedBy}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-black text-rose-700">{fmtCurrency(l.total)}</div>
                <div className="mt-1"><Badge tone={l.reason === "Péremption" ? "amber" : "rose"}>{l.reason}</Badge></div>
              </div>
            </div>
            {isAdmin && (
              <div className="flex pt-3 mt-3 border-t border-slate-100">
                <button onClick={() => remove(l.id)} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold transition active:scale-[.97]"><IconTrash size={14} /> Supprimer</button>
              </div>
            )}
          </Card>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Déclarer une perte / péremption">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Produit concerné">
            <SearchSelect value={productId} onChange={setProductId}
              options={products.filter(p => p.stock > 0).map(p => ({ value: p.id, label: `${p.name} (stock: ${p.stock})` }))} />
          </Field>
          <Field label="Motif">
            <SearchSelect value={reason} onChange={setReason}
              options={[
                { value: "Péremption", label: "Péremption" },
                { value: "Casse", label: "Casse" },
                { value: "Détérioration", label: "Détérioration" },
                { value: "Vol", label: "Vol" },
                { value: "Erreur de caisse", label: "Erreur de caisse" },
                { value: "Autre", label: "Autre" },
              ]} />
          </Field>
          <Field label="Quantité perdue"><input type="number" className={inputClass} value={quantity} onChange={e => setQuantity(+e.target.value)} /></Field>
          {productId && (() => { const p = products.find(x => x.id === productId); return p ? <Field label="Valeur estimée"><div className="py-2 font-bold text-rose-700">{fmtCurrency((p?.cost || 0) * quantity)}</div></Field> : null; })()}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
          <Button variant="danger" onClick={save}>Confirmer la perte</Button>
        </div>
      </Modal>
    </div>
  );
}
