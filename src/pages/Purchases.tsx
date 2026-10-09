import { useState } from "react";
import { useStore, fmtCurrency, fmtDate } from "../store";
import { PurchaseItem, Product, Purchase } from "../types";
import { Card, Button, Modal, Field, inputClass, EmptyState, Badge, SearchSelect } from "../components/ui";
import { IconPlus, IconTrash, IconSearch, IconDownload, IconEdit } from "../components/Icons";
import { useToast, useConfirm } from "../components/ui";
import jsPDF from "jspdf";

export default function Purchases() {
  const { products, purchases, suppliers, shopSettings: ss, currentUser, requestOrExec } = useStore();
  const { push } = useToast();
  const confirm = useConfirm();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [items, setItems] = useState<PurchaseItem[]>([]);

  const total = items.reduce((a, b) => a + b.total, 0);
  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  const isEditing = !!editingId;

  const openAdd = () => { setEditingId(null); setItems([]); setSupplierId(""); setSearch(""); setOpen(true); };
  const openEditModal = (p: Purchase) => { setEditingId(p.id); setItems([...p.items]); setSupplierId(p.supplierId); setSearch(""); setOpen(true); };
  const closeModal = () => { setOpen(false); setEditingId(null); };

  const addItem = (p: Product) => { setItems(it => [...it, { productId: p.id, name: p.name, quantity: 1, price: p.cost, total: p.cost }]); };
  const updateItem = (idx: number, field: "quantity" | "price", value: number) => {
    setItems(it => it.map((item, i) => { if (i !== idx) return item; const u = { ...item, [field]: value }; u.total = u.quantity * u.price; return u; }));
  };
  const removeItem = (idx: number) => setItems(it => it.filter((_, i) => i !== idx));

  const save = () => {
    if (!supplierId || items.length === 0) return push("Fournisseur et articles requis", "error");
    const supplier = suppliers.find(s => s.id === supplierId)!;
    const tot = items.reduce((a, b) => a + b.total, 0);
    if (isEditing) {
      const ok = requestOrExec({
        kind: "purchase.update", module: "Achats", action: "Modifier un bon d'achat",
        description: `Modification du bon ${items.length} articles — ${fmtCurrency(tot)} chez ${supplier.name}`,
        details: { fournisseur: supplier.name, articles: String(items.length), total: fmtCurrency(tot) },
        payload: { id: editingId!, data: { items, total: tot, supplierId: supplier.id, supplierName: supplier.name } },
      });
      push(ok ? "Bon d'achat modifié" : "Action en attente de validation");
    } else {
      const ok = requestOrExec({
        kind: "purchase.add", module: "Achats", action: "Nouvel achat fournisseur",
        description: `Achat de ${items.length} articles chez ${supplier.name} — ${fmtCurrency(tot)}`,
        details: { fournisseur: supplier.name, articles: String(items.length), total: fmtCurrency(tot) },
        payload: { items, supplierId: supplier.id, supplierName: supplier.name },
      });
      push(ok ? "Achat enregistré et stocks mis à jour" : "Action en attente de validation");
    }
    closeModal();
  };

  const handleDelete = async (p: Purchase) => {
    const ok = await confirm({ title: "Supprimer le bon d'achat", message: `Voulez-vous vraiment supprimer le bon « ${p.reference || p.id} » du fournisseur ${p.supplierName} ?`, confirmLabel: "Supprimer", variant: "danger" });
    if (!ok) return;
    const ok2 = requestOrExec({
      kind: "purchase.delete", module: "Achats", action: "Supprimer un bon d'achat",
      description: `Suppression du bon ${p.reference || p.id} — ${p.supplierName}`,
      details: { référence: p.reference || p.id, fournisseur: p.supplierName, total: fmtCurrency(p.total) },
      payload: { id: p.id },
    });
    push(ok2 ? "Bon d'achat supprimé" : "Action en attente de validation");
  };

  const exportPDF = (purchase: Purchase) => {
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageW = 210;
    const M = 15; // marge
    const shopName = ss.name || "Hi-Market";
    const cur = ss.currency || "FCFA";
    const ref = purchase.reference || purchase.id;
    // Formateur avec espace normal comme séparateur de milliers (évite le caractère spécial mal rendu en PDF)
    const nf = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    const supplier = suppliers.find(s => s.id === purchase.supplierId);

    // ---- En-tête : identité du commerce (gauche) + logo optionnel
    let headerX = M;
    if (ss.logo) {
      try {
        const fmt = ss.logo.includes("image/png") ? "PNG" : "JPEG";
        doc.addImage(ss.logo, fmt, M, 14, 16, 16);
        headerX = M + 20;
      } catch { /* logo invalide ignoré */ }
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42);
    doc.text(shopName, headerX, 22);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    let hy = 28;
    // Sous le nom : IFU et RCCM (au lieu du type de commerce)
    const idParts = [ss.ifu ? "IFU : " + ss.ifu : "", ss.rccm ? "RCCM : " + ss.rccm : ""].filter(Boolean);
    if (idParts.length) { doc.text(idParts.join("  ·  "), headerX, hy); hy += 4.5; }
    const contactParts = [ss.phone ? "Tél: " + ss.phone : "", ss.phone2, ss.email ? "Email: " + ss.email : ""].filter(Boolean);
    if (contactParts.length) { doc.text(contactParts.join(" · "), headerX, hy); hy += 4.5; }
    if (ss.address) { doc.text([ss.address, ss.city, ss.country].filter(Boolean).join(", "), headerX, hy); hy += 4.5; }

    // ---- Bloc "BON D'ACHAT" (droite, fond bleu nuit)
    const boxW = 60, boxX = pageW - M - boxW;
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(boxX, 14, boxW, 24, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("BON D'ACHAT", boxX + boxW - 4, 22, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("N° : " + ref, boxX + boxW - 4, 29, { align: "right" });
    doc.text("Date : " + fmtDate(purchase.date), boxX + boxW - 4, 34, { align: "right" });

    // ---- Ligne de séparation
    let y = Math.max(hy + 2, 44);
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.6);
    doc.line(M, y, pageW - M, y);
    y += 8;

    // ---- Bloc Fournisseur
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text("FOURNISSEUR", M, y);
    y += 5.5;
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(purchase.supplierName, M, y);
    if (supplier) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(71, 85, 105);
      const supLine = [supplier.contact, supplier.phone, supplier.address].filter(Boolean).join(" · ");
      if (supLine) { y += 5; doc.text(supLine, M, y); }
    }
    y += 10;

    // ---- En-tête du tableau
    const colDesX = M + 3;
    const colQteX = 118;
    const colPuX = 150;
    const colTotX = pageW - M - 3;
    doc.setFillColor(241, 245, 249);
    doc.rect(M, y - 5, pageW - 2 * M, 9, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("Désignation", colDesX, y);
    doc.text("Qté", colQteX, y, { align: "right" });
    doc.text(`PU (${cur})`, colPuX, y, { align: "right" });
    doc.text(`Total (${cur})`, colTotX, y, { align: "right" });
    y += 9;

    // ---- Lignes du tableau (zébrées)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    purchase.items.forEach((it, idx) => {
      if (y > 262) { doc.addPage(); y = 20; }
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(M, y - 4.5, pageW - 2 * M, 7, "F");
      }
      doc.setTextColor(30, 41, 59);
      doc.text(it.name.length > 52 ? it.name.slice(0, 51) + "…" : it.name, colDesX, y);
      doc.text(String(it.quantity), colQteX, y, { align: "right" });
      doc.text(nf(it.price), colPuX, y, { align: "right" });
      doc.setFont("helvetica", "bold");
      doc.text(nf(it.total), colTotX, y, { align: "right" });
      doc.setFont("helvetica", "normal");
      y += 7;
    });

    // ligne de fin de tableau
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(M, y - 2, pageW - M, y - 2);

    // ---- Bloc Total (droite)
    y += 4;
    const totW = 85, totX = pageW - M - totW;
    doc.setFillColor(241, 245, 249);
    doc.rect(totX, y, totW, 7, "F");
    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text("Nombre d'articles", totX + 4, y + 4.7);
    doc.setTextColor(15, 23, 42);
    doc.text(String(purchase.items.length), totX + totW - 4, y + 4.7, { align: "right" });
    y += 7;

    doc.setFillColor(15, 23, 42);
    doc.roundedRect(totX, y, totW, 11, 1.5, 1.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text("TOTAL ACHAT", totX + 4, y + 7);
    doc.setFontSize(11);
    doc.text(nf(purchase.total) + " " + cur, totX + totW - 4, y + 7, { align: "right" });
    y += 16;

    // ---- Gestionnaire (à gauche, en face du bloc total)
    const mgr = purchase.managerName || currentUser?.name || "";
    if (mgr) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(71, 85, 105);
      doc.text("Établi par : ", M, y);
      const lblW = doc.getTextWidth("Établi par : ");
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(mgr, M + lblW, y);
    }
    y += 12;

    // ---- Zone de signatures
    if (y > 248) { doc.addPage(); y = 30; }
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.3);
    const sigW = 70;
    // Fournisseur (gauche)
    doc.line(M, y + 14, M + sigW, y + 14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("Le Fournisseur", M, y + 19);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text(purchase.supplierName, M, y + 23.5);
    // Gestionnaire (droite)
    doc.line(pageW - M - sigW, y + 14, pageW - M, y + 14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("Le Gestionnaire", pageW - M - sigW, y + 19);
    if (mgr) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184);
      doc.text(mgr, pageW - M - sigW, y + 23.5);
    }

    // ---- Pied de page
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Bon d'achat généré par ${shopName} © ${new Date().getFullYear()}`,
      pageW / 2,
      288,
      { align: "center" }
    );

    doc.save(`${ref}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900">Achats fournisseurs</h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">{purchases.length} achat{purchases.length > 1 ? "s" : ""} · Total : <b>{fmtCurrency(purchases.reduce((a, b) => a + b.total, 0))}</b></p>
        </div>
        <Button onClick={openAdd} className="w-full sm:w-auto"><IconPlus size={16} /> Nouvel achat</Button>
      </div>

      {/* ── Desktop table (hidden on mobile) ── */}
      <Card className="overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-slate-600 uppercase text-xs border-b border-slate-200">
                <th className="py-3 px-4">Référence</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Fournisseur</th>
                <th className="py-3 px-4 hidden lg:table-cell">Gestionnaire</th>
                <th className="py-3 px-4 text-right hidden xl:table-cell">Articles</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map(p => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className="py-3 px-4 font-mono text-xs font-semibold">{p.reference || p.id}</td>
                  <td className="py-3 px-4 text-slate-600">{fmtDate(p.date)}</td>
                  <td className="py-3 px-4"><Badge>{p.supplierName}</Badge></td>
                  <td className="py-3 px-4 text-slate-600 hidden lg:table-cell">{p.managerName || "—"}</td>
                  <td className="py-3 px-4 text-right hidden xl:table-cell">{p.items.length}</td>
                  <td className="py-3 px-4 text-right font-bold">{fmtCurrency(p.total)}</td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <button onClick={() => openEditModal(p)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 inline-flex" title="Modifier"><IconEdit size={16} /></button>
                    <button onClick={() => exportPDF(p)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 inline-flex" title="Télécharger PDF"><IconDownload size={16} /></button>
                    <button onClick={() => handleDelete(p)} className="p-2 rounded-lg hover:bg-rose-50 text-rose-600 inline-flex" title="Supprimer"><IconTrash size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {purchases.length === 0 && <EmptyState title="Aucun achat" subtitle="Enregistrez vos commandes fournisseurs ici" />}
      </Card>

      {/* ── Mobile cards (hidden on desktop) ── */}
      <div className="md:hidden space-y-3">
        {purchases.length === 0 && (
          <Card className="p-6"><EmptyState title="Aucun achat" subtitle="Enregistrez vos commandes fournisseurs ici" /></Card>
        )}
        {purchases.map(p => (
          <Card key={p.id} className="p-4 space-y-3">
            {/* Row 1: ref + total */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-mono text-xs font-bold text-slate-900">{p.reference || p.id}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{fmtDate(p.date)}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-base font-black text-slate-900">{fmtCurrency(p.total)}</div>
                <div className="text-[11px] text-slate-500">{p.items.length} article{p.items.length > 1 ? "s" : ""}</div>
              </div>
            </div>
            {/* Row 2: supplier badge + manager */}
            <div className="flex items-center justify-between gap-2">
              <Badge>{p.supplierName}</Badge>
              {p.managerName && <span className="text-[11px] text-slate-500">Gest. : <b className="text-slate-700">{p.managerName}</b></span>}
            </div>
            {/* Row 3: actions */}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <button onClick={() => openEditModal(p)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition active:scale-[.97]">
                <IconEdit size={14} /> Modifier
              </button>
              <button onClick={() => exportPDF(p)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition active:scale-[.97]">
                <IconDownload size={14} /> PDF
              </button>
              <button onClick={() => handleDelete(p)} className="flex items-center justify-center p-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition active:scale-[.97]">
                <IconTrash size={14} />
              </button>
            </div>
          </Card>
        ))}
      </div>

      {/* ── Add / Edit modal ── */}
      <Modal
        open={open}
        onClose={closeModal}
        title={isEditing ? "Modifier le bon d'achat" : "Nouvel achat fournisseur"}
        size="lg"
        footer={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="text-lg font-black text-slate-900">Total : {fmtCurrency(total)}</div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={closeModal} className="flex-1 sm:flex-none">Annuler</Button>
              <Button variant="success" onClick={save} className="flex-1 sm:flex-none">{isEditing ? "Enregistrer" : "Enregistrer l'achat"}</Button>
            </div>
          </div>
        }
      >
        {/* Supplier + Reference */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <Field label="Fournisseur">
            <SearchSelect value={supplierId} onChange={setSupplierId}
              options={suppliers.map(s => ({ value: s.id, label: s.name }))} />
          </Field>
          <Field label="Référence" hint={isEditing ? "" : "Auto-générée"}>
            <input
              className={inputClass + " bg-slate-50 cursor-not-allowed"}
              value={isEditing ? (purchases.find(p => p.id === editingId)?.reference || "") : `BA-${new Date().getFullYear()}-${String(purchases.length + 1).padStart(4, "0")}`}
              readOnly disabled
            />
          </Field>
        </div>

        {/* Product search */}
        <div className="relative mb-3">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={inputClass + " pl-9"} placeholder="Rechercher un produit..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2 mb-4 max-h-28 overflow-y-auto">
          {filteredProducts.slice(0, 12).map(p => (
            <button key={p.id} onClick={() => addItem(p)} className="text-left text-xs border border-slate-200 rounded-lg p-2 hover:bg-slate-50 transition">
              <div className="font-semibold truncate">{p.name}</div>
              <div className="text-slate-500">Stock: {p.stock}</div>
            </button>
          ))}
        </div>

        {/* Items list — desktop table + mobile cards */}
        {/* Desktop */}
        <div className="border border-slate-200 rounded-xl overflow-hidden hidden sm:block">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-600">
              <tr>
                <th className="py-2 px-3 text-left">Produit</th>
                <th className="py-2 px-3 text-right w-20">Qté</th>
                <th className="py-2 px-3 text-right w-28">PU</th>
                <th className="py-2 px-3 text-right w-28">Total</th>
                <th className="py-2 px-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} className="border-t border-slate-100">
                  <td className="py-2 px-3 max-w-[160px] truncate">{it.name}</td>
                  <td className="py-2 px-3"><input type="number" className={inputClass + " !py-1 text-right"} value={it.quantity} onChange={e => updateItem(idx, "quantity", +e.target.value)} /></td>
                  <td className="py-2 px-3"><input type="number" className={inputClass + " !py-1 text-right"} value={it.price} onChange={e => updateItem(idx, "price", +e.target.value)} /></td>
                  <td className="py-2 px-3 text-right font-bold">{fmtCurrency(it.total)}</td>
                  <td className="py-2 px-3"><button onClick={() => removeItem(idx)} className="p-1.5 text-rose-600 rounded hover:bg-rose-50"><IconTrash size={14} /></button></td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={5} className="text-center text-slate-500 py-6">Aucun article ajouté</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Mobile items */}
        <div className="sm:hidden space-y-2">
          {items.length === 0 && <p className="text-center text-slate-500 text-sm py-6">Aucun article ajouté</p>}
          {items.map((it, idx) => (
            <div key={idx} className="p-3 rounded-xl bg-slate-50 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900 flex-1 min-w-0 leading-snug">{it.name}</div>
                <div className="text-right flex-shrink-0">
                  <div className="text-sm font-bold text-slate-900">{fmtCurrency(it.total)}</div>
                  <button onClick={() => removeItem(idx)} className="text-rose-600 text-[11px] hover:underline">Retirer</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Quantité">
                  <input type="number" className={inputClass + " !py-1.5 text-center text-sm"} value={it.quantity} onChange={e => updateItem(idx, "quantity", +e.target.value)} />
                </Field>
                <Field label="Prix unitaire">
                  <input type="number" className={inputClass + " !py-1.5 text-center text-sm"} value={it.price} onChange={e => updateItem(idx, "price", +e.target.value)} />
                </Field>
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
