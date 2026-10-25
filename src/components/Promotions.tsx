import { useState } from "react";
import { useStore, fmtCurrency, fmtDate } from "../store";
import { Promotion } from "../types";
import { Badge, Button, Card, EmptyState, Field, Modal, SearchSelect, inputClass, useConfirm, useToast } from "./ui";
import { IconEdit, IconPlus, IconTrash } from "./Icons";

type Form = {
  name: string; type: "percent" | "amount"; value: string; scope: "all" | "category" | "product";
  categoryId: string; productId: string; minQuantity: string; startsOn: string; endsOn: string; active: boolean;
};

const EMPTY: Form = { name: "", type: "percent", value: "", scope: "all", categoryId: "", productId: "", minQuantity: "1", startsOn: "", endsOn: "", active: true };

const today = () => new Date().toISOString().slice(0, 10);

function statusOf(p: Promotion): { label: string; tone: "emerald" | "amber" | "rose" | "slate" } {
  if (!p.active) return { label: "Désactivée", tone: "slate" };
  if (p.running) return { label: "En cours", tone: "emerald" };
  if (p.endsOn && p.endsOn < today()) return { label: "Terminée", tone: "rose" };
  return { label: "Planifiée", tone: "amber" };
}

/** Gestion des promotions (remise en % ou montant par unité, ciblée sur tout / une catégorie / un produit, avec période et quantité minimale). */
export default function Promotions() {
  const { promotions, products, categoryList, requestOrExec } = useStore();
  const { push } = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);

  const openAdd = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (p: Promotion) => {
    setEditing(p);
    setForm({
      name: p.name, type: p.type, value: String(p.value), scope: p.scope, categoryId: p.categoryId ?? "", productId: p.productId ?? "",
      minQuantity: String(p.minQuantity), startsOn: p.startsOn ?? "", endsOn: p.endsOn ?? "", active: p.active,
    });
    setOpen(true);
  };

  const target = (p: Promotion) =>
    p.scope === "all" ? "Tous les produits" : p.scope === "category" ? `Catégorie : ${p.categoryName ?? "—"}` : `Produit : ${p.productName ?? "—"}`;
  const discount = (p: Promotion) => p.type === "percent" ? `-${p.value} %` : `-${fmtCurrency(p.value)} / unité`;

  const save = async () => {
    const value = Number(form.value.replace(",", "."));
    if (!form.name.trim()) return push("Donnez un nom à la promotion", "error");
    if (!Number.isFinite(value) || value <= 0) return push("La valeur de la remise doit être supérieure à 0", "error");
    if (form.type === "percent" && value > 100) return push("Un pourcentage ne peut pas dépasser 100", "error");
    if (form.scope === "category" && !form.categoryId) return push("Choisissez la catégorie concernée", "error");
    if (form.scope === "product" && !form.productId) return push("Choisissez le produit concerné", "error");
    if (form.startsOn && form.endsOn && form.endsOn < form.startsOn) return push("La date de fin précède la date de début", "error");

    const data = {
      name: form.name.trim(), type: form.type, value, scope: form.scope,
      categoryId: form.scope === "category" ? Number(form.categoryId) : null,
      productId: form.scope === "product" ? Number(form.productId) : null,
      minQuantity: Number(form.minQuantity.replace(",", ".")) || 0,
      startsOn: form.startsOn || null, endsOn: form.endsOn || null, active: form.active,
    };
    setBusy(true);
    const res = await requestOrExec(editing
      ? { kind: "promotion.update", module: "Promotions", action: "Modifier une promotion", description: `Modification de la promotion « ${data.name} »`,
          details: { promotion: data.name, remise: form.type === "percent" ? `${value} %` : fmtCurrency(value) }, payload: { id: editing.id, data } }
      : { kind: "promotion.add", module: "Promotions", action: "Nouvelle promotion", description: `Promotion « ${data.name} »`,
          details: { promotion: data.name, remise: form.type === "percent" ? `${value} %` : fmtCurrency(value) }, payload: data });
    setBusy(false);
    if (res === "error") return;
    push(res === "done" ? (editing ? "Promotion modifiée" : "Promotion créée") : "Action en attente de validation");
    setOpen(false);
  };

  const toggle = async (p: Promotion) => {
    const res = await requestOrExec({
      kind: "promotion.update", module: "Promotions", action: p.active ? "Désactiver une promotion" : "Activer une promotion",
      description: `${p.active ? "Désactivation" : "Activation"} de « ${p.name} »`, details: { promotion: p.name },
      payload: { id: p.id, data: { active: !p.active } },
    });
    if (res === "error") return;
    push(res === "done" ? (p.active ? "Promotion désactivée" : "Promotion activée") : "Action en attente de validation");
  };

  const remove = async (p: Promotion) => {
    const ok = await confirm({ title: "Supprimer la promotion", message: `Supprimer « ${p.name} » ? Les ventes déjà faites ne changent pas.`, confirmLabel: "Supprimer", variant: "danger" });
    if (!ok) return;
    const res = await requestOrExec({
      kind: "promotion.delete", module: "Promotions", action: "Supprimer une promotion",
      description: `Suppression de la promotion « ${p.name} »`, details: { promotion: p.name }, payload: { id: p.id },
    });
    if (res === "error") return;
    push(res === "done" ? "Promotion supprimée" : "Action en attente de validation");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600 max-w-2xl">
          Les promotions s'appliquent automatiquement en caisse. Quand plusieurs promotions concernent un même article, la plus avantageuse est retenue
          (elles ne se cumulent pas entre elles) ; une remise manuelle du caissier peut s'y ajouter.
        </p>
        <Button onClick={openAdd} className="flex-shrink-0"><IconPlus size={16} /> Promotion</Button>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-slate-600 uppercase text-xs border-b border-slate-200">
                <th className="py-3 px-4">Promotion</th><th className="py-3 px-4 hidden md:table-cell">Cible</th>
                <th className="py-3 px-4 text-right">Remise</th><th className="py-3 px-4 hidden lg:table-cell">Période</th>
                <th className="py-3 px-4">Statut</th><th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {promotions.map(p => {
                const st = statusOf(p);
                return (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="py-3 px-4"><div className="font-semibold">{p.name}</div><div className="md:hidden text-xs text-slate-500">{target(p)}</div></td>
                    <td className="py-3 px-4 text-slate-600 hidden md:table-cell">{target(p)}{p.minQuantity > 1 && <div className="text-xs text-slate-500">dès {p.minQuantity} unités</div>}</td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-700 whitespace-nowrap">{discount(p)}</td>
                    <td className="py-3 px-4 text-xs text-slate-600 hidden lg:table-cell">
                      {p.startsOn || p.endsOn ? `${p.startsOn ? fmtDate(p.startsOn) : "…"} → ${p.endsOn ? fmtDate(p.endsOn) : "…"}` : "Permanente"}
                    </td>
                    <td className="py-3 px-4"><Badge tone={st.tone}>{st.label}</Badge></td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button onClick={() => toggle(p)} className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 mr-1">{p.active ? "Désactiver" : "Activer"}</button>
                      <button onClick={() => openEdit(p)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 inline-flex" title="Modifier" aria-label="Modifier"><IconEdit size={16} /></button>
                      <button onClick={() => remove(p)} className="p-2 rounded-lg hover:bg-rose-50 text-rose-600 inline-flex" title="Supprimer" aria-label="Supprimer"><IconTrash size={16} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {promotions.length === 0 && <EmptyState title="Aucune promotion" subtitle="Créez une promotion pour baisser automatiquement des prix en caisse" />}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Modifier la promotion" : "Nouvelle promotion"} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2"><Field label="Nom"><input className={inputClass} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex : Soldes de la rentrée" /></Field></div>
          <Field label="Type de remise">
            <select className={inputClass} value={form.type} onChange={e => setForm({ ...form, type: e.target.value as Form["type"] })}>
              <option value="percent">Pourcentage (%)</option><option value="amount">Montant par unité</option>
            </select>
          </Field>
          <Field label={form.type === "percent" ? "Remise (%)" : "Remise par unité"}>
            <input type="number" min="0" step="any" className={inputClass} value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} />
          </Field>
          <Field label="S'applique à">
            <select className={inputClass} value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value as Form["scope"] })}>
              <option value="all">Tous les produits</option><option value="category">Une catégorie</option><option value="product">Un produit</option>
            </select>
          </Field>
          {form.scope === "category" && (
            <Field label="Catégorie">
              <SearchSelect value={form.categoryId} onChange={v => setForm({ ...form, categoryId: v })} options={categoryList.map(c => ({ value: c.id, label: c.name }))} placeholder="Choisir…" />
            </Field>
          )}
          {form.scope === "product" && (
            <Field label="Produit">
              <SearchSelect value={form.productId} onChange={v => setForm({ ...form, productId: v })} options={products.map(p => ({ value: p.id, label: p.name }))} placeholder="Choisir…" />
            </Field>
          )}
          <Field label="Quantité minimale" hint="Ex : 3 = la remise démarre à partir de 3 unités">
            <input type="number" min="0" step="any" className={inputClass} value={form.minQuantity} onChange={e => setForm({ ...form, minQuantity: e.target.value })} />
          </Field>
          <Field label="Début (optionnel)"><input type="date" lang="fr-FR" className={inputClass} value={form.startsOn} onChange={e => setForm({ ...form, startsOn: e.target.value })} /></Field>
          <Field label="Fin (optionnel)"><input type="date" lang="fr-FR" className={inputClass} value={form.endsOn} onChange={e => setForm({ ...form, endsOn: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
            <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> Promotion active
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={save} disabled={busy}>{editing ? "Enregistrer" : "Créer la promotion"}</Button>
        </div>
      </Modal>
    </div>
  );
}
