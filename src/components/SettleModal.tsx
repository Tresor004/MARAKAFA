import { useEffect, useState } from "react";
import { Customer } from "../types";
import { api, errMsg } from "../api";
import { useStore, fmtCurrency, fmtDate } from "../store";
import { Modal, Button, Field, inputClass, useToast, SearchSelect } from "./ui";
import { PAYMENT_METHODS, CASH_METHOD } from "../constants";

interface Account {
  balance: number;
  creditLimit: number | null;
  openSales: { id: string; invoiceNo: string; date: string; total: number; balanceDue: number }[];
  payments: { id: string; date: string; amount: number; method: string; userName: string }[];
}

/** Encaissement d'une créance : le client règle tout ou partie de ce qu'il doit (dettes les plus anciennes d'abord). */
export default function SettleModal({ customer, saleId, onClose }: { customer: Customer | null; saleId?: string; onClose: () => void }) {
  const { settleCustomer } = useStore();
  const { push } = useToast();
  const [acc, setAcc] = useState<Account | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>(CASH_METHOD);
  const [target, setTarget] = useState<string>(saleId ?? "");
  const [busy, setBusy] = useState(false);

  // Dépend de l'identifiant (pas de l'objet) : un rafraîchissement des données ne doit pas écraser le montant en cours de saisie.
  const customerId = customer?.id;
  useEffect(() => {
    if (!customerId) return;
    setAcc(null); setLoadErr(""); setAmount(""); setTarget(saleId ?? "");
    api<Account>("GET", `/customers/${customerId}/account`)
      .then(a => { setAcc(a); const open = saleId ? a.openSales.find(s => s.id === saleId)?.balanceDue : a.balance; setAmount(open ? String(open) : ""); })
      .catch(e => setLoadErr(errMsg(e)));
  }, [customerId, saleId]);

  if (!customer) return null;
  const due = target ? acc?.openSales.find(s => s.id === target)?.balanceDue ?? 0 : acc?.balance ?? 0;
  const amt = Number(amount);

  const submit = async () => {
    if (busy || !acc) return;
    if (!(amt > 0)) return push("Saisissez un montant", "error");
    if (amt > due + 0.004) return push("Le montant dépasse ce que le client doit", "error");
    setBusy(true);
    const ok = await settleCustomer(customer.id, { amount: amt, method, saleId: target || undefined });
    setBusy(false);
    if (ok) { push(`Règlement de ${fmtCurrency(amt)} enregistré`); onClose(); }
  };

  return (
    <Modal open onClose={onClose} title={`Encaisser — ${customer.name}`} size="md"
      footer={<div className="flex gap-2 justify-end"><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="success" onClick={submit} disabled={busy || !acc || !(amt > 0)}>Encaisser</Button></div>}>
      {loadErr && <p className="text-sm text-rose-600">{loadErr}</p>}
      {!acc && !loadErr && <p className="text-sm text-slate-500">Chargement…</p>}
      {acc && acc.openSales.length === 0 && <p className="text-sm text-slate-600">Ce client ne doit rien.</p>}
      {acc && acc.openSales.length > 0 && (
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex justify-between items-center">
            <span className="text-sm font-semibold text-rose-700">Total dû</span>
            <span className="text-xl font-black text-rose-700">{fmtCurrency(acc.balance)}</span>
          </div>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600 uppercase"><tr><th className="py-2 px-3 text-left">Facture</th><th className="py-2 px-3 text-left">Date</th><th className="py-2 px-3 text-right">Reste dû</th></tr></thead>
              <tbody>
                {acc.openSales.map(s => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="py-2 px-3 font-mono text-xs">{s.invoiceNo}</td><td className="py-2 px-3 text-slate-600">{fmtDate(s.date)}</td>
                    <td className="py-2 px-3 text-right font-semibold">{fmtCurrency(s.balanceDue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Appliquer à">
              <SearchSelect value={target} onChange={v => { setTarget(v); const d = v ? acc.openSales.find(s => s.id === v)?.balanceDue : acc.balance; if (d) setAmount(String(d)); }}
                allLabel="Les plus anciennes d'abord" options={acc.openSales.map(s => ({ value: s.id, label: `${s.invoiceNo} · ${fmtCurrency(s.balanceDue)}` }))} />
            </Field>
            <Field label="Mode de paiement">
              <SearchSelect value={method} onChange={setMethod} options={PAYMENT_METHODS.map(m => ({ value: m, label: m }))} />
            </Field>
          </div>
          <Field label="Montant encaissé" hint={`Maximum : ${fmtCurrency(due)}`}>
            <input type="number" min="0" max={due} step="any" inputMode="decimal" className={inputClass} value={amount} onChange={e => setAmount(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") void submit(); }} />
          </Field>
          {acc.payments.length > 0 && (
            <details className="text-xs text-slate-600">
              <summary className="cursor-pointer font-semibold">Derniers règlements ({acc.payments.length})</summary>
              <ul className="mt-2 space-y-1">{acc.payments.slice(0, 8).map(p => <li key={p.id} className="flex justify-between"><span>{fmtDate(p.date)} · {p.method} · {p.userName}</span><b>{fmtCurrency(p.amount)}</b></li>)}</ul>
            </details>
          )}
        </div>
      )}
    </Modal>
  );
}
