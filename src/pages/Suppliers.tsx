import { useState } from "react";
import { useStore, fmtCurrency, fmtDate } from "../store";
import { Supplier } from "../types";
import { Card, Button, Modal, Field, inputClass, EmptyState, Badge } from "../components/ui";
import { IconPlus, IconEdit, IconTrash, IconSearch, IconPhone, IconMapPin, IconBuilding } from "../components/Icons";
import { useToast, useConfirm } from "../components/ui";

export default function Suppliers() {
  const { suppliers, purchases, requestOrExec } = useStore();
  const { push } = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<Partial<Supplier>>({});
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  const openAdd = () => { setEditing(null); setForm({}); setOpen(true); };
  const openEdit = (s: Supplier) => { setEditing(s); setForm({ ...s }); setOpen(true); };
  const save = () => {
    if (!form.name) return push("Le nom est requis", "error");
    if (editing) {
      const ok = requestOrExec({ kind: "supplier.update", module: "Fournisseurs", action: "Modifier un fournisseur", description: `Modification de « ${form.name} »`, details: { nom: form.name || "" }, payload: { id: editing.id, data: form } });
      push(ok ? "Fournisseur modifié" : "Action en attente de validation");
    } else {
      const ok = requestOrExec({ kind: "supplier.add", module: "Fournisseurs", action: "Ajouter un fournisseur", description: `Nouveau fournisseur « ${form.name} »`, details: { nom: form.name || "", contact: form.contact || "" }, payload: form });
      push(ok ? "Fournisseur ajouté" : "Action en attente de validation");
    }
    setOpen(false);
  };
  const remove = async (s: Supplier) => {
    const ok = await confirm({
      title: "Supprimer le fournisseur",
      message: `Voulez-vous vraiment supprimer « ${s.name} » de votre liste de fournisseurs ?`,
      confirmLabel: "Supprimer",
      variant: "danger",
    });
    if (!ok) return;
    const ok2 = requestOrExec({ kind: "supplier.delete", module: "Fournisseurs", action: "Supprimer un fournisseur", description: `Suppression de « ${s.name} »`, details: { nom: s.name }, payload: { id: s.id } });
    push(ok2 ? "Fournisseur supprimé" : "Action en attente de validation");
    if (detailId === s.id) setDetailId(null);
  };

  const purchasesBySupplier = (id: string) => purchases.filter(p => p.supplierId === id);
  const totalBySupplier = (id: string) => purchasesBySupplier(id).reduce((a, b) => a + b.total, 0);

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.contact || "").toLowerCase().includes(search.toLowerCase()) ||
    (s.phone || "").includes(search)
  );

  const detail = detailId ? suppliers.find(s => s.id === detailId) : null;
  const detailPurchases = detailId ? purchasesBySupplier(detailId) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900">Fournisseurs</h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">{suppliers.length} partenaire{suppliers.length > 1 ? "s" : ""} enregistré{suppliers.length > 1 ? "s" : ""}</p>
        </div>
        <Button onClick={openAdd} className="w-full sm:w-auto"><IconPlus size={16} /> Nouveau fournisseur</Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider">Fournisseurs</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{suppliers.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider">Total achats</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{fmtCurrency(purchases.reduce((a, b) => a + b.total, 0))}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider">Commandes</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{purchases.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider">Moy. / fournisseur</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{suppliers.length ? fmtCurrency(Math.round(purchases.reduce((a, b) => a + b.total, 0) / suppliers.length)) : "—"}</div>
        </Card>
      </div>

      {/* Search */}
      <Card className="p-4">
        <div className="relative">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={inputClass + " pl-9"} placeholder="Rechercher par nom, contact, téléphone..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </Card>

      {/* Desktop table */}
      <Card className="overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-slate-600 uppercase text-xs border-b border-slate-200">
                <th className="py-3 px-4">Fournisseur</th>
                <th className="py-3 px-4 hidden lg:table-cell">Contact</th>
                <th className="py-3 px-4 hidden lg:table-cell">Téléphone</th>
                <th className="py-3 px-4 text-right">Achats</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const total = totalBySupplier(s.id);
                const count = purchasesBySupplier(s.id).length;
                return (
                  <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 cursor-pointer" onClick={() => setDetailId(s.id)}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-900 text-white font-bold flex items-center justify-center text-xs flex-shrink-0">
                          {s.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 truncate">{s.name}</div>
                          {s.address && <div className="text-[11px] text-slate-500 truncate flex items-center gap-1"><IconMapPin size={10} /> {s.address}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 hidden lg:table-cell">{s.contact || "—"}</td>
                    <td className="py-3 px-4 text-slate-600 hidden lg:table-cell">
                      {s.phone ? <span className="inline-flex items-center gap-1"><IconPhone size={12} /> {s.phone}</span> : "—"}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="font-bold text-slate-900">{fmtCurrency(total)}</div>
                      <div className="text-[11px] text-slate-500">{count} commande{count > 1 ? "s" : ""}</div>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <button onClick={() => openEdit(s)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 inline-flex"><IconEdit size={16} /></button>
                      <button onClick={() => remove(s)} className="p-2 rounded-lg hover:bg-rose-50 text-rose-600 inline-flex"><IconTrash size={16} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <EmptyState title="Aucun fournisseur" subtitle={search ? "Modifiez votre recherche" : "Ajoutez votre premier fournisseur"} />}
      </Card>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 && <Card className="p-6"><EmptyState title="Aucun fournisseur" subtitle={search ? "Modifiez votre recherche" : "Ajoutez votre premier fournisseur"} /></Card>}
        {filtered.map(s => {
          const total = totalBySupplier(s.id);
          const count = purchasesBySupplier(s.id).length;
          return (
            <Card key={s.id} className="p-4">
              <div className="flex items-start gap-3" onClick={() => setDetailId(s.id)}>
                <div className="w-10 h-10 rounded-xl bg-slate-900 text-white font-bold flex items-center justify-center text-sm flex-shrink-0">
                  {s.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-900 truncate">{s.name}</div>
                  {s.contact && <div className="text-xs text-slate-500 mt-0.5">{s.contact}</div>}
                  {s.phone && <div className="text-xs text-slate-500 flex items-center gap-1"><IconPhone size={11} /> {s.phone}</div>}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-black text-slate-900">{fmtCurrency(total)}</div>
                  <div className="text-[11px] text-slate-500">{count} cmd{count > 1 ? "s" : ""}</div>
                </div>
              </div>
              <div className="flex gap-2 pt-3 mt-3 border-t border-slate-100">
                <button onClick={() => setDetailId(s.id)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition active:scale-[.97]">Détails</button>
                <button onClick={() => openEdit(s)} className="flex items-center justify-center p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition active:scale-[.97]"><IconEdit size={14} /></button>
                <button onClick={() => remove(s)} className="flex items-center justify-center p-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition active:scale-[.97]"><IconTrash size={14} /></button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Detail slide-in panel */}
      <Modal open={!!detail} onClose={() => setDetailId(null)} title={detail?.name || "Fournisseur"}>
        {detail && (
          <div className="space-y-5">
            {/* Header card */}
            <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white font-black flex items-center justify-center text-lg flex-shrink-0 shadow">
                {detail.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-lg font-black text-slate-900">{detail.name}</div>
                <Badge tone="sky">{detail.contact || "Contact"}</Badge>
              </div>
              <div className="text-right">
                <div className="text-xl font-black text-slate-900">{fmtCurrency(totalBySupplier(detail.id))}</div>
                <div className="text-[11px] text-slate-500">{purchasesBySupplier(detail.id).length} commande{purchasesBySupplier(detail.id).length > 1 ? "s" : ""}</div>
              </div>
            </div>

            {/* Contact info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {detail.phone && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-200">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 flex-shrink-0"><IconPhone size={16} /></div>
                  <div><div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">Téléphone</div><div className="text-sm font-semibold text-slate-900">{detail.phone}</div></div>
                </div>
              )}
              {detail.address && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-200 sm:col-span-2">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 flex-shrink-0"><IconMapPin size={16} /></div>
                  <div><div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">Adresse</div><div className="text-sm font-semibold text-slate-900">{detail.address}</div></div>
                </div>
              )}
            </div>

            {/* Recent purchases */}
            <div>
              <h4 className="text-xs font-bold uppercase text-slate-700 tracking-wider mb-2 flex items-center gap-2"><IconBuilding size={14} /> Historique des commandes</h4>
              {detailPurchases.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">Aucune commande enregistrée avec ce fournisseur.</p>
              ) : (
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {detailPurchases.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{p.reference || p.id}</div>
                        <div className="text-[11px] text-slate-500">{fmtDate(p.date)} · {p.items.length} article{p.items.length > 1 ? "s" : ""}</div>
                      </div>
                      <div className="text-right font-bold text-slate-900">{fmtCurrency(p.total)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t border-slate-200">
              <Button variant="ghost" onClick={() => { setDetailId(null); openEdit(detail); }}>
                <IconEdit size={14} /> Modifier
              </Button>
              <Button variant="ghost" onClick={() => setDetailId(null)}>Fermer</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add / Edit modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Modifier le fournisseur" : "Nouveau fournisseur"}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nom du fournisseur"><input className={inputClass} value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Contact principal"><input className={inputClass} value={form.contact || ""} onChange={e => setForm({ ...form, contact: e.target.value })} /></Field>
          <Field label="Téléphone"><input className={inputClass} value={form.phone || ""} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field>

          <Field label="Adresse"><input className={inputClass} value={form.address || ""} onChange={e => setForm({ ...form, address: e.target.value })} /></Field>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={save}>{editing ? "Enregistrer" : "Créer le fournisseur"}</Button>
        </div>
      </Modal>
    </div>
  );
}
