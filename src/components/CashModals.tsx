import { useState } from "react";
import { useStore, fmtCurrency } from "../store";
import { CashSession } from "../types";
import { Modal, Button, Field, inputClass, useToast } from "./ui";

/** Ouverture de caisse : fond de caisse (espèces mises dans le tiroir au départ). */
export function OpenCashModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { openCashSession } = useStore();
  const { push } = useToast();
  const [floatAmount, setFloatAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    const amount = floatAmount === "" ? 0 : Number(floatAmount);
    if (!Number.isFinite(amount) || amount < 0) return push("Fond de caisse invalide", "error");
    setBusy(true);
    const ok = await openCashSession(amount);
    setBusy(false);
    if (ok) { push("Caisse ouverte"); setFloatAmount(""); onClose(); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Ouvrir la caisse" size="sm"
      footer={<div className="flex gap-2 justify-end"><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={submit} disabled={busy}>Ouvrir la caisse</Button></div>}>
      <Field label="Fond de caisse (espèces dans le tiroir)" hint="Comptez les espèces présentes avant la première vente. Laissez vide si le tiroir est vide.">
        <input autoFocus type="number" min="0" inputMode="decimal" className={inputClass} placeholder="0" value={floatAmount}
          onChange={e => setFloatAmount(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void submit(); }} />
      </Field>
    </Modal>
  );
}

/** Fermeture de caisse : comptage physique comparé aux espèces attendues. */
export function CloseCashModal({ session, onClose }: { session: CashSession | null; onClose: () => void }) {
  const { closeCashSession } = useStore();
  const { push } = useToast();
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!session) return null;

  const s = session.summary;
  const countedNum = counted === "" ? NaN : Number(counted);
  const diff = Number.isFinite(countedNum) ? countedNum - s.expectedCash : null;

  const submit = async () => {
    if (busy || diff === null) return;
    setBusy(true);
    const closed = await closeCashSession(session.id, countedNum, note);
    setBusy(false);
    if (!closed) return;
    const d = closed.difference ?? 0;
    push(Math.abs(d) < 0.005 ? "Caisse fermée — aucun écart" : `Caisse fermée — écart de ${d > 0 ? "+" : ""}${fmtCurrency(d)}`, Math.abs(d) < 0.005 ? "success" : "info");
    setCounted(""); setNote("");
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Fermer la caisse" size="md"
      footer={<div className="flex gap-2 justify-end"><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="danger" onClick={submit} disabled={busy || diff === null}>Fermer la caisse</Button></div>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Stat label="Ventes" value={`${s.salesCount} · ${fmtCurrency(s.salesTotal)}`} />
          <Stat label="Fond de caisse" value={fmtCurrency(session.openingFloat)} />
          <Stat label="Encaissé en espèces" value={fmtCurrency(s.cashIn)} />
          <Stat label="Remboursements" value={fmtCurrency(s.refunds)} />
          {s.settlements > 0 && <Stat label="Créances encaissées" value={fmtCurrency(s.settlements)} />}
          {s.creditGranted > 0 && <Stat label="Vendu à crédit" value={fmtCurrency(s.creditGranted)} />}
        </div>
        {Object.keys(s.byMethod).length > 0 && (
          <div className="text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
            {Object.entries(s.byMethod).map(([m, v]) => <span key={m}>{m} : <b>{fmtCurrency(v)}</b></span>)}
          </div>
        )}
        <div className="p-3 rounded-xl bg-slate-900 text-white flex justify-between items-center">
          <span className="font-semibold">Espèces attendues dans le tiroir</span>
          <span className="text-xl font-black">{fmtCurrency(s.expectedCash)}</span>
        </div>
        <Field label="Espèces comptées">
          <input autoFocus type="number" min="0" inputMode="decimal" className={inputClass} placeholder="Montant compté" value={counted} onChange={e => setCounted(e.target.value)} />
        </Field>
        {diff !== null && (
          <div className={`p-3 rounded-xl text-sm font-semibold ${Math.abs(diff) < 0.005 ? "bg-emerald-50 text-emerald-700" : diff < 0 ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>
            {Math.abs(diff) < 0.005 ? "Aucun écart : la caisse est juste." : diff < 0 ? `Il manque ${fmtCurrency(-diff)} dans le tiroir.` : `Il y a ${fmtCurrency(diff)} en trop dans le tiroir.`}
          </div>
        )}
        <Field label="Commentaire (facultatif)">
          <input className={inputClass} placeholder="Explication d'un éventuel écart" value={note} onChange={e => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="p-3 bg-slate-50 rounded-xl"><div className="text-[10px] uppercase text-slate-500 font-semibold">{label}</div><div className="font-bold mt-0.5">{value}</div></div>;
}
