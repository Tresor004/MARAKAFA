import { useState } from "react";
import { useStore, fmtCurrency } from "../store";
import { Customer } from "../types";
import { Card, Button, Modal, Field, inputClass, Badge, EmptyState } from "../components/ui";
import { IconPlus, IconEdit, IconTrash, IconSearch, IconClose } from "../components/Icons";
import { useToast, useConfirm } from "../components/ui";

export default function Customers() {
  const { customers, requestOrExec } = useStore();
  const { push } = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<Partial<Customer>>({});
  const [search, setSearch] = useState("");

  const q = search.toLowerCase().trim();
  const filtered = customers.filter(c =>
    !q ||
    c.name.toLowerCase().includes(q) ||
    (c.phone || "").toLowerCase().includes(q) ||
    (c.address || "").toLowerCase().includes(q)
  );

  const openAdd = () => { setEditing(null); setForm({}); setOpen(true); };
  const openEdit = (c: Customer) => { setEditing(c); setForm({ ...c }); setOpen(true); };
  const save = () => {
    if (!form.name) return push("Le nom est requis", "error");
    if (editing) {
      const ok = requestOrExec({ kind: "customer.update", module: "Clients", action: "Modifier un client", description: `Modification de « ${form.name} »`, details: { nom: form.name || "" }, payload: { id: editing.id, data: form } });
      push(ok ? "Client modifié" : "Action en attente de validation");
    } else {
      const ok = requestOrExec({ kind: "customer.add", module: "Clients", action: "Ajouter un client", description: `Nouveau client « ${form.name} »`, details: { nom: form.name || "", téléphone: form.phone || "" }, payload: form });
      push(ok ? "Client ajouté" : "Action en attente de validation");
    }
    setOpen(false);
  };
  const remove = async (c: Customer) => {
    const ok = await confirm({
      title: "Supprimer le client",
      message: `Voulez-vous vraiment supprimer « ${c.name} » de votre liste de clients ?`,
      confirmLabel: "Supprimer",
      variant: "danger",
    });
    if (!ok) return;
    const ok2 = requestOrExec({ kind: "customer.delete", module: "Clients", action: "Supprimer un client", description: `Suppression de « ${c.name} »`, details: { nom: c.name }, payload: { id: c.id } });
    push(ok2 ? "Client supprimé" : "Action en attente de validation");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900">Gestion des clients</h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">{customers.length} client{customers.length > 1 ? "s" : ""} · Cumul : <b>{fmtCurrency(customers.reduce((a, b) => a + b.totalPurchases, 0))}</b></p>
        </div>
        <Button onClick={openAdd} className="w-full sm:w-auto"><IconPlus size={16} /> Nouveau client</Button>
      </div>

      {/* Search bar */}
      <Card className="p-4">
        <div className="relative">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className={inputClass + " pl-9 pr-9"}
            placeholder="Rechercher par nom, téléphone ou adresse..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
              <IconClose size={14} />
            </button>
          )}
        </div>
        {q && (
          <p className="text-xs text-slate-500 mt-2">{filtered.length} résultat{filtered.length > 1 ? "s" : ""} pour « {search} »</p>
        )}
      </Card>

      {/* Desktop table */}
      <Card className="overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-slate-600 uppercase text-xs border-b border-slate-200">
                <th className="py-3 px-4">Nom</th>
                <th className="py-3 px-4">Téléphone</th>
                <th className="py-3 px-4 hidden lg:table-cell">Adresse</th>
                <th className="py-3 px-4 text-right">Achats cumulés</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className="py-3 px-4 font-semibold">{c.name}</td>
                  <td className="py-3 px-4 text-slate-600">{c.phone}</td>
                  <td className="py-3 px-4 text-slate-600 hidden lg:table-cell">{c.address}</td>
                  <td className="py-3 px-4 text-right"><Badge tone="emerald">{fmtCurrency(c.totalPurchases)}</Badge></td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(c)} className="p-2 rounded-lg hover:bg-slate-100 inline-flex"><IconEdit size={16} /></button>
                    <button onClick={() => remove(c)} className="p-2 rounded-lg hover:bg-rose-50 text-rose-600 inline-flex"><IconTrash size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <EmptyState title={q ? "Aucun résultat" : "Aucun client"} subtitle={q ? "Essayez une autre recherche" : undefined} />}
      </Card>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 && <Card className="p-6"><EmptyState title={q ? "Aucun résultat" : "Aucun client"} subtitle={q ? "Essayez une autre recherche" : undefined} /></Card>}
        {filtered.map(c => (
          <Card key={c.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-bold text-slate-900 truncate">{c.name}</div>
                {c.phone && <div className="text-xs text-slate-500 mt-0.5">{c.phone}</div>}
                {c.address && <div className="text-xs text-slate-500">{c.address}</div>}
              </div>
              <Badge tone="emerald">{fmtCurrency(c.totalPurchases)}</Badge>
            </div>
            <div className="flex gap-2 pt-3 mt-3 border-t border-slate-100">
              <button onClick={() => openEdit(c)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition active:scale-[.97]"><IconEdit size={14} /> Modifier</button>
              <button onClick={() => remove(c)} className="flex items-center justify-center p-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition active:scale-[.97]"><IconTrash size={14} /></button>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Modifier le client" : "Nouveau client"}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nom complet"><input className={inputClass} value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Téléphone"><input className={inputClass} value={form.phone || ""} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Adresse"><input className={inputClass} value={form.address || ""} onChange={e => setForm({ ...form, address: e.target.value })} /></Field>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={save}>{editing ? "Enregistrer" : "Créer le client"}</Button>
        </div>
      </Modal>
    </div>
  );
}
