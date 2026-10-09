import { useState, useMemo } from "react";
import { useStore, fmtCurrency, fmtDate } from "../store";
import { Product } from "../types";
import { Modal, Button, Field, inputClass, Card, Badge, EmptyState, SearchSelect } from "../components/ui";
import { IconPlus, IconEdit, IconTrash, IconSearch } from "../components/Icons";
import { useToast, useConfirm } from "../components/ui";

export default function Products() {
  const { products, categories, addCategory, deleteCategory, renameCategory, requestOrExec, notifyAll, isAdmin } = useStore();
  const { push } = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("Toutes");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Partial<Product>>({});

  // Category modal
  const [catOpen, setCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState("");

  const filterCategories = useMemo(() => ["Toutes", ...categories], [categories]);
  const filtered = products.filter(p =>
    (cat === "Toutes" || p.category === cat) &&
    (p.name.toLowerCase().includes(search.toLowerCase()) || (p.barcode || "").includes(search))
  );

  const openAdd = () => { setEditing(null); setForm({ category: categories[0] || "Divers", unit: "pièce", price: 0, cost: 0, stock: 0, minStock: 5 }); setOpen(true); };
  const openEdit = (p: Product) => { setEditing(p); setForm({ ...p }); setOpen(true); };

  const save = () => {
    if (!form.name || !form.category) return push("Le nom et la catégorie sont requis", "error");
    if (editing) {
      const ok = requestOrExec({
        kind: "product.update", module: "Produits", action: "Modifier un produit",
        description: `Modification de « ${form.name} »`,
        details: { produit: form.name || "", catégorie: form.category || "" },
        payload: { id: editing.id, data: form },
      });
      push(ok ? "Produit modifié avec succès" : "Action en attente de validation");
    } else {
      const ok = requestOrExec({
        kind: "product.add", module: "Produits", action: "Ajouter un produit",
        description: `Ajout de « ${form.name} » — ${fmtCurrency(form.price || 0)}`,
        details: { produit: form.name || "", catégorie: form.category || "", prix: fmtCurrency(form.price || 0) },
        payload: form,
      });
      if (ok && isAdmin) notifyAll("Nouveau produit", `Le produit « ${form.name} » a été ajouté au catalogue.`, "info");
      push(ok ? "Produit ajouté avec succès" : "Action en attente de validation");
    }
    setOpen(false);
  };

  const remove = async (p: Product) => {
    const ok = await confirm({
      title: "Supprimer le produit",
      message: `Voulez-vous vraiment supprimer « ${p.name} » ? Cette action est irréversible.`,
      confirmLabel: "Supprimer",
      variant: "danger",
    });
    if (!ok) return;
    const ok2 = requestOrExec({
      kind: "product.delete", module: "Produits", action: "Supprimer un produit",
      description: `Suppression de « ${p.name} »`, details: { produit: p.name },
      payload: { id: p.id },
    });
    push(ok2 ? "Produit supprimé" : "Action en attente de validation");
  };

  // --- Category handlers
  const handleAddCategory = () => {
    const trimmed = newCatName.trim();
    if (!trimmed) return push("Le nom de la catégorie ne peut pas être vide", "error");
    if (categories.some(c => c.toLowerCase() === trimmed.toLowerCase())) return push("Cette catégorie existe déjà", "error");
    addCategory(trimmed);
    setNewCatName("");
    push(`Catégorie « ${trimmed} » ajoutée`);
  };

  const handleDeleteCategory = async (name: string) => {
    const count = products.filter(p => p.category === name).length;
    const ok = await confirm({
      title: "Supprimer la catégorie",
      message: count > 0
        ? `La catégorie « ${name} » contient ${count} produit${count > 1 ? "s" : ""}. Les produits ne seront pas supprimés mais garderont cette catégorie jusqu'à modification manuelle. Continuer ?`
        : `Voulez-vous vraiment supprimer la catégorie « ${name} » ?`,
      confirmLabel: "Supprimer",
      variant: "danger",
    });
    if (!ok) return;
    deleteCategory(name);
    push(`Catégorie « ${name} » supprimée`);
    if (cat === name) setCat("Toutes");
  };

  const startRename = (name: string) => { setEditingCat(name); setEditCatName(name); };
  const cancelRename = () => { setEditingCat(null); setEditCatName(""); };
  const handleRename = () => {
    if (!editingCat) return;
    const trimmed = editCatName.trim();
    if (!trimmed) return push("Le nom ne peut pas être vide", "error");
    if (trimmed === editingCat) return cancelRename();
    if (categories.some(c => c.toLowerCase() === trimmed.toLowerCase() && c !== editingCat)) return push("Ce nom existe déjà", "error");
    const count = products.filter(p => p.category === editingCat).length;
    renameCategory(editingCat, trimmed);
    push(`Catégorie renommée en « ${trimmed} »${count > 0 ? ` · ${count} produit${count > 1 ? "s" : ""} mis à jour` : ""}`);
    if (cat === editingCat) setCat(trimmed);
    cancelRename();
  };

  const productCountForCat = (name: string) => products.filter(p => p.category === name).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900">Gestion des produits</h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">{products.length} référence{products.length > 1 ? "s" : ""} · {categories.length} catégorie{categories.length > 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" onClick={() => { setCatOpen(true); setNewCatName(""); cancelRename(); }} className="flex-1 sm:flex-none">
            <IconPlus size={16} /> <span className="sm:inline">Catégorie</span>
          </Button>
          <Button onClick={openAdd} className="flex-1 sm:flex-none"><IconPlus size={16} /> Produit</Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={inputClass + " pl-9"} placeholder="Rechercher par nom, code-barres..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <SearchSelect value={cat} onChange={setCat} className="sm:w-52"
            options={filterCategories.map(c => ({ value: c, label: c }))}
            allLabel="Toutes" />
        </div>
      </Card>

      {/* Desktop table */}
      <Card className="hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-slate-600 uppercase text-xs border-b border-slate-200">
                <th className="py-3 px-4">Produit</th>
                <th className="py-3 px-4 hidden lg:table-cell">Catégorie</th>
                <th className="py-3 px-4 text-right">Prix</th>
                <th className="py-3 px-4 text-right hidden lg:table-cell">Coût</th>
                <th className="py-3 px-4 text-right">Stock</th>
                <th className="py-3 px-4 hidden xl:table-cell">Péremption</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const low = p.stock <= p.minStock;
                return (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{p.name}</div>
                      <div className="text-xs text-slate-500 font-mono">{p.barcode || "—"}</div>
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell"><Badge>{p.category}</Badge></td>
                    <td className="py-3 px-4 text-right font-bold">{fmtCurrency(p.price)}</td>
                    <td className="py-3 px-4 text-right text-slate-600 hidden lg:table-cell">{fmtCurrency(p.cost)}</td>
                    <td className="py-3 px-4 text-right">
                      <Badge tone={low ? "rose" : p.stock < p.minStock * 2 ? "amber" : "emerald"}>{p.stock} {p.unit}</Badge>
                    </td>
                    <td className="py-3 px-4 text-slate-600 text-xs hidden xl:table-cell">{p.expiryDate ? fmtDate(p.expiryDate) : "—"}</td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button onClick={() => openEdit(p)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 inline-flex"><IconEdit size={16} /></button>
                      <button onClick={() => remove(p)} className="p-2 rounded-lg hover:bg-rose-50 text-rose-600 inline-flex"><IconTrash size={16} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <EmptyState title="Aucun produit trouvé" subtitle="Essayez une autre recherche" />}
      </Card>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 && <Card className="p-6"><EmptyState title="Aucun produit trouvé" subtitle="Essayez une autre recherche" /></Card>}
        {filtered.map(p => {
          const low = p.stock <= p.minStock;
          return (
            <Card key={p.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 truncate">{p.name}</div>
                  <div className="text-[11px] text-slate-500 font-mono mt-0.5">{p.barcode || "—"}</div>
                  <div className="mt-1"><Badge>{p.category}</Badge></div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-black text-slate-900">{fmtCurrency(p.price)}</div>
                  <div className="mt-1"><Badge tone={low ? "rose" : p.stock < p.minStock * 2 ? "amber" : "emerald"}>{p.stock} {p.unit}</Badge></div>
                </div>
              </div>
              <div className="flex gap-2 pt-3 mt-3 border-t border-slate-100">
                <button onClick={() => openEdit(p)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition active:scale-[.97]"><IconEdit size={14} /> Modifier</button>
                <button onClick={() => remove(p)} className="flex items-center justify-center p-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition active:scale-[.97]"><IconTrash size={14} /></button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* ── Product modal ── */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Modifier le produit" : "Nouveau produit"} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nom du produit"><input className={inputClass} value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex : Riz Basmati 5kg" /></Field>
          <Field label="Catégorie">
            <SearchSelect value={form.category || ""} onChange={v => setForm({ ...form, category: v })}
              options={categories.map(c => ({ value: c, label: c }))} />
          </Field>
          <Field label="Unité"><input className={inputClass} value={form.unit || ""} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="pièce, kg, L..." /></Field>
          <Field label="Prix de vente (FCFA)"><input type="number" className={inputClass} value={form.price || 0} onChange={e => setForm({ ...form, price: +e.target.value })} /></Field>
          <Field label="Coût d'achat (FCFA)"><input type="number" className={inputClass} value={form.cost || 0} onChange={e => setForm({ ...form, cost: +e.target.value })} /></Field>
          <Field label="Stock actuel"><input type="number" className={inputClass} value={form.stock || 0} onChange={e => setForm({ ...form, stock: +e.target.value })} /></Field>
          <Field label="Stock minimum"><input type="number" className={inputClass} value={form.minStock || 0} onChange={e => setForm({ ...form, minStock: +e.target.value })} /></Field>
          <Field label="Date de péremption" ><input type="date" lang="fr-FR" className={inputClass} value={form.expiryDate || ""} onChange={e => setForm({ ...form, expiryDate: e.target.value })} /></Field>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={save}>{editing ? "Enregistrer" : "Créer le produit"}</Button>
        </div>
      </Modal>

      {/* ── Category management modal ── */}
      <Modal
        open={catOpen}
        onClose={() => { setCatOpen(false); cancelRename(); }}
        title="Gestion des catégories"
        footer={
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-slate-400">{categories.length} catégorie{categories.length > 1 ? "s" : ""}</span>
            <Button variant="ghost" onClick={() => { setCatOpen(false); cancelRename(); }}>Fermer</Button>
          </div>
        }
      >
        {/* Add new category */}
        <div className="mb-5">
          <Field label="Nouvelle catégorie">
            <div className="flex gap-2">
              <input
                className={inputClass}
                placeholder="Ex : Conserves, Surgelés, Cosmétiques..."
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAddCategory(); }}
              />
              <Button onClick={handleAddCategory} className="flex-shrink-0">
                <IconPlus size={14} /> Ajouter
              </Button>
            </div>
          </Field>
        </div>

        {/* List */}
        <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
          {categories.length === 0 && (
            <div className="text-center py-10 text-slate-500 text-sm">
              Aucune catégorie. Créez-en une ci-dessus.
            </div>
          )}
          {categories.map(c => {
            const count = productCountForCat(c);
            const isEditing = editingCat === c;
            return (
              <div
                key={c}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  isEditing
                    ? "border-slate-900 bg-slate-50 shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                {isEditing ? (
                  <>
                    <input
                      className={inputClass + " flex-1 !py-1.5"}
                      value={editCatName}
                      onChange={e => setEditCatName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") cancelRename(); }}
                      autoFocus
                    />
                    <button
                      onClick={handleRename}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition active:scale-95"
                    >
                      OK
                    </button>
                    <button
                      onClick={cancelRename}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200 transition active:scale-95"
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900">{c}</div>
                      <div className="text-[11px] text-slate-500">{count} produit{count > 1 ? "s" : ""}</div>
                    </div>
                    <button
                      onClick={() => startRename(c)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition"
                      title="Renommer"
                    >
                      <IconEdit size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(c)}
                      className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition"
                      title="Supprimer"
                    >
                      <IconTrash size={14} />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
