import { useMemo, useState } from "react";
import { Sale } from "../types";
import { useStore, fmtCurrency } from "../store";
import { Modal, Button, Field, inputClass, useToast, SearchSelect } from "./ui";
import { PAYMENT_METHODS, RETURN_REASONS, CASH_METHOD } from "../constants";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Retour / annulation de vente (avoir). La valeur remboursée est celle réellement payée (remises déduites) ;
 * si la vente a un solde impayé, il est réduit en premier. Un caissier envoie une demande, l'administrateur valide.
 */
export default function ReturnModal({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  const { requestOrExec, isAdmin } = useStore();
  const { push } = useToast();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [restock, setRestock] = useState(true);
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<string>(CASH_METHOD);
  const [busy, setBusy] = useState(false);

  const lines = useMemo(() => (sale?.items ?? []).map(it => {
    const returned = it.returnedQuantity ?? 0;
    const remaining = Math.max(0, Math.round((it.quantity - returned) * 1000) / 1000);
    return { it, remaining, unit: it.quantity > 0 ? it.total / it.quantity : 0 };
  }), [sale]);

  if (!sale) return null;

  const chosen = lines.map(l => {
    const q = Math.min(l.remaining, Math.max(0, Number((qty[l.it.id ?? l.it.productId] ?? "").replace(",", ".")) || 0));
    return { ...l, q, value: r2(q * l.unit) };
  });
  const total = r2(chosen.reduce((a, c) => a + c.value, 0));
  const balance = sale.balanceDue ?? 0;
  const creditReduction = r2(Math.min(balance, total));
  const cashRefund = r2(total - creditReduction);
  const anyLeft = lines.some(l => l.remaining > 0);
  const keyOf = (l: { it: { id?: string; productId: string } }) => l.it.id ?? l.it.productId;

  const fillAll = () => setQty(Object.fromEntries(lines.map(l => [keyOf(l), String(l.remaining)])));

  const submit = async () => {
    if (busy || total <= 0) return;
    const items = chosen.filter(c => c.q > 0 && c.it.id).map(c => ({ saleItemId: c.it.id!, quantity: c.q }));
    if (items.length === 0) return push("Choisissez au moins un article à retourner", "error");
    setBusy(true);
    const res = await requestOrExec({
      kind: "sale.return",
      module: "Ventes",
      action: "Retour client",
      description: `Retour sur la facture ${sale.invoiceNo} : ${chosen.filter(c => c.q > 0).map(c => `${c.q} × ${c.it.name}`).join(", ")} (${fmtCurrency(total)})`,
      details: {
        facture: sale.invoiceNo,
        client: sale.customerName || "Client passage",
        articles: chosen.filter(c => c.q > 0).map(c => `${c.q} × ${c.it.name}`).join(", "),
        "valeur retournée": fmtCurrency(total),
        remboursement: cashRefund > 0 ? `${fmtCurrency(cashRefund)} (${method})` : "aucun (déduit de la créance)",
        "remise en stock": restock ? "oui" : "non",
        motif: reason || "—",
      },
      payload: { saleId: sale.id, items, restock, refundMethod: cashRefund > 0 ? method : null, reason: reason || null },
    });
    setBusy(false);
    if (res === "error") return;
    push(res === "done" ? "Retour enregistré" : "Demande de retour envoyée à l'administrateur", res === "done" ? "success" : "info");
    setQty({}); setReason(""); setRestock(true);
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={`Retour — ${sale.invoiceNo}`} size="lg"
      footer={<div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button variant="danger" onClick={submit} disabled={busy || total <= 0}>{isAdmin ? "Enregistrer le retour" : "Demander le retour"}</Button>
      </div>}>
      {!anyLeft ? (
        <p className="text-sm text-slate-600">Tous les articles de cette vente ont déjà été retournés.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">Indiquez la quantité retournée pour chaque article.</p>
            <button onClick={fillAll} className="text-xs font-semibold text-slate-700 underline">Tout retourner</button>
          </div>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600 uppercase">
                <tr><th className="py-2 px-3 text-left">Article</th><th className="py-2 px-3 text-right">Vendu</th><th className="py-2 px-3 text-right w-28">À retourner</th><th className="py-2 px-3 text-right">Valeur</th></tr>
              </thead>
              <tbody>
                {chosen.map(c => (
                  <tr key={keyOf(c)} className="border-t border-slate-100">
                    <td className="py-2 px-3">{c.it.name}{(c.it.returnedQuantity ?? 0) > 0 && <div className="text-[11px] text-rose-600">déjà retourné : {c.it.returnedQuantity}</div>}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{c.it.quantity}</td>
                    <td className="py-2 px-3 text-right">
                      {c.remaining > 0 ? (
                        <input type="number" min="0" max={c.remaining} step="any" inputMode="decimal" aria-label={`Quantité retournée ${c.it.name}`}
                          className={inputClass + " !py-1 text-right"} value={qty[keyOf(c)] ?? ""} placeholder={`0 – ${c.remaining}`}
                          onChange={e => setQty(q => ({ ...q, [keyOf(c)]: e.target.value }))} />
                      ) : <span className="text-xs text-slate-400">tout retourné</span>}
                    </td>
                    <td className="py-2 px-3 text-right font-semibold">{c.q > 0 ? fmtCurrency(c.value) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Motif">
              <input className={inputClass} list="return-reasons" placeholder="Ex. produit défectueux" value={reason} onChange={e => setReason(e.target.value)} />
              <datalist id="return-reasons">{RETURN_REASONS.map(r => <option key={r} value={r} />)}</datalist>
            </Field>
            {cashRefund > 0 && (
              <Field label="Remboursement par">
                <SearchSelect value={method} onChange={setMethod} options={PAYMENT_METHODS.map(m => ({ value: m, label: m }))} />
              </Field>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={restock} onChange={e => setRestock(e.target.checked)} className="w-4 h-4 rounded" />
            Remettre les articles en stock <span className="text-xs text-slate-500">(décocher si le produit est abîmé / périmé)</span>
          </label>

          <div className="p-3 rounded-xl bg-slate-900 text-white space-y-1">
            <div className="flex justify-between font-black text-lg"><span>Valeur retournée</span><span>{fmtCurrency(total)}</span></div>
            {creditReduction > 0 && <div className="flex justify-between text-sm text-slate-300"><span>Déduit de la créance du client</span><span>{fmtCurrency(creditReduction)}</span></div>}
            <div className="flex justify-between text-sm text-slate-300"><span>À rembourser</span><span>{fmtCurrency(cashRefund)}</span></div>
          </div>
          {!isAdmin && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">Un retour modifie la comptabilité : il sera appliqué après validation par un administrateur.</p>}
        </div>
      )}
    </Modal>
  );
}
