import { useState, useMemo, useRef } from "react";
import { useStore, fmtCurrency, fmtDate } from "../store";
import { Sale, SaleItem, Product } from "../types";
import { Card, Button, Modal, inputClass, Badge, EmptyState, SearchSelect } from "../components/ui";
import { IconPlus, IconTrash, IconSearch, IconPrinter, IconMinus, IconClose } from "../components/Icons";
import { useToast } from "../components/ui";
// jsPDF removed — printing via browser print only

export default function Sales({ initialTab = "pos" }: { initialTab?: "pos" | "history" }) {
  const { products, sales, customers, currentUser, addSale, shopSettings: ss } = useStore();
  const { push } = useToast();
  const [tab, setTab] = useState<"pos" | "history">(initialTab);
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [rawInputs, setRawInputs] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState<string | undefined>();
  const [paymentMethod, setPaymentMethod] = useState("Espèces");
  const [paid, setPaid] = useState<number>(0);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const invoiceRef = useRef<HTMLDivElement>(null);

  // Feedback visuel : ID du dernier produit ajouté au panier
  const [flashedProduct, setFlashedProduct] = useState<string | null>(null);

  // History filters
  const [histSearch, setHistSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [detailSale, setDetailSale] = useState<Sale | null>(null);

  const filteredProducts = useMemo(() => products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) || (p.barcode || "").includes(search)
  ), [products, search]);

  const subtotal = cart.reduce((a, b) => a + b.total, 0);
  const total = subtotal;
  const change = Math.max((paid || total) - total, 0);

  const addToCart = (p: Product) => {
    if (p.stock <= 0) return push("Stock insuffisant", "error");
    setCart(c => {
      const existing = c.find(i => i.productId === p.id);
      if (existing) {
        if (existing.quantity >= p.stock) { push("Stock insuffisant", "error"); return c; }
        return c.map(i => i.productId === p.id ? { ...i, quantity: i.quantity + 1, total: +((i.quantity + 1) * i.price).toFixed(2) } : i);
      }
      return [...c, { productId: p.id, name: p.name, quantity: 1, price: p.price, total: p.price }];
    });
    // Feedback visuel mobile : flash pendant 600ms
    setFlashedProduct(p.id);
    setTimeout(() => setFlashedProduct(null), 600);
  };

  const changeQty = (productId: string, delta: number) => {
    setCart(c => c.flatMap(i => {
      if (i.productId !== productId) return [i];
      const newQty = +(i.quantity + delta).toFixed(3);
      if (newQty <= 0) return [];
      return [{ ...i, quantity: newQty, total: +(newQty * i.price).toFixed(2) }];
    }));
  };

  const setItemQty = (productId: string, raw: string) => {
    const val = raw.replace(",", ".");
    const num = parseFloat(val);
    if (isNaN(num)) return;
    const sanitized = val === "" || val === "." ? 0 : num;
    setCart(c => c.map(i => {
      if (i.productId !== productId) return i;
      const product = products.find(p => p.id === productId);
      const clamped = Math.min(Math.max(0, sanitized), product?.stock ?? 999999);
      const qty = +clamped.toFixed(3);
      return { ...i, quantity: qty, total: +(qty * i.price).toFixed(2) };
    }));
  };

  const removeItem = (productId: string) => {
    setCart(c => c.filter(i => i.productId !== productId));
    setRawInputs(r => { const n = { ...r }; delete n[productId]; return n; });
  };

  const clearCart = () => { setCart([]); setPaid(0); setRawInputs({}); };

  const confirmSale = () => {
    const validItems = cart.filter(i => i.quantity > 0 && !isNaN(i.quantity));
    if (validItems.length === 0) return push("Le panier est vide", "error");
    const customer = customers.find(c => c.id === customerId);
    const sale = addSale(validItems, customerId, customer?.name, paymentMethod, paid || undefined);
    setLastSale(sale);
    setCart([]);
    setPaid(0);
    setRawInputs({});
    push("Vente enregistrée !");
  };

  const printInvoice = () => {
    if (!lastSale) return;
    window.print();
  };

  // PDF generation removed — printing only via browser print

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900">Caisse & Ventes</h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">Caissier : <b>{currentUser?.name}</b> · {new Date().toLocaleDateString("fr-FR")}</p>
        </div>
        <div className="grid grid-cols-2 sm:inline-flex bg-white border border-slate-200 rounded-xl p-1 text-sm w-full sm:w-auto">
          <button onClick={() => setTab("pos")} className={`px-3 sm:px-4 py-2 sm:py-1.5 rounded-lg font-medium transition ${tab === "pos" ? "bg-slate-900 text-white" : "text-slate-700"}`}>Nouvelle vente</button>
          <button onClick={() => setTab("history")} className={`px-3 sm:px-4 py-2 sm:py-1.5 rounded-lg font-medium transition ${tab === "history" ? "bg-slate-900 text-white" : "text-slate-700"}`}>Historique ({sales.length})</button>
        </div>
      </div>

      {tab === "pos" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-4">
              <div className="relative">
                <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input className={inputClass + " pl-9"} placeholder="Rechercher un produit (nom, code-barres)..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold">Catalogue ({filteredProducts.length})</h3>
                <span className="text-xs text-slate-500">Cliquez sur un produit pour l'ajouter</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[500px] overflow-y-auto">
                {filteredProducts.map(p => (
                  <button key={p.id} onClick={() => addToCart(p)} disabled={p.stock === 0}
                    className={`text-left border rounded-xl p-3 transition disabled:opacity-50 disabled:cursor-not-allowed ${
                      flashedProduct === p.id
                        ? "border-emerald-500 bg-emerald-50 scale-[.97]"
                        : "border-slate-200 hover:border-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-semibold text-sm text-slate-900 line-clamp-2 min-h-[2.5rem]">{p.name}</div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-slate-900 font-bold">{fmtCurrency(p.price)}</span>
                      <Badge tone={p.stock > 0 ? "emerald" : "rose"}>{p.stock}</Badge>
                    </div>
                  </button>
                ))}
                {filteredProducts.length === 0 && <div className="col-span-full text-center text-slate-500 py-8">Aucun produit</div>}
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="p-5 lg:sticky lg:top-24">
              <h3 className="font-bold text-slate-900 mb-3">Panier ({cart.length})</h3>
              <div className="space-y-2 max-h-[320px] overflow-y-auto">
                {cart.length === 0 && <p className="text-slate-500 text-sm py-8 text-center">Votre panier est vide.</p>}
                {cart.map(it => {
                  const stockProduct = products.find(p => p.id === it.productId);
                  const maxStock = stockProduct?.stock ?? 999999;
                  const displayValue = rawInputs[it.productId] ?? String(it.quantity);
                  return (
                  <div key={it.productId} className="p-3 rounded-xl bg-slate-50 space-y-2">
                    {/* Row 1: product name + total + remove */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-900 leading-snug">{it.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {fmtCurrency(it.price)} × {it.quantity}
                          {maxStock < 999999 && <span className="text-slate-400 ml-1">· Stock: {maxStock}</span>}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-bold text-slate-900">{fmtCurrency(it.total)}</div>
                        <button onClick={() => removeItem(it.productId)} className="text-rose-600 text-[11px] hover:underline">Retirer</button>
                      </div>
                    </div>
                    {/* Row 2: quantity controls */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => { setRawInputs(r => { const n = { ...r }; delete n[it.productId]; return n; }); changeQty(it.productId, -1); }}
                        className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100 flex-shrink-0 active:scale-95 transition"
                        title="-1"
                      >
                        <IconMinus size={12} />
                      </button>
                      <input
                        type="number"
                        step="0.001"
                        min="0.001"
                        max={maxStock}
                        value={displayValue}
                        onChange={e => {
                          setRawInputs(r => ({ ...r, [it.productId]: e.target.value }));
                          setItemQty(it.productId, e.target.value);
                        }}
                        onBlur={() => {
                          setRawInputs(r => { const n = { ...r }; delete n[it.productId]; return n; });
                          if (!it.quantity || it.quantity <= 0 || isNaN(it.quantity)) removeItem(it.productId);
                        }}
                        className="flex-1 min-w-0 text-center text-sm font-bold border border-slate-300 rounded-lg py-1.5 px-1 outline-none focus:border-slate-800 focus:ring-2 focus:ring-slate-800/10 transition [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      <button
                        onClick={() => { setRawInputs(r => { const n = { ...r }; delete n[it.productId]; return n; }); changeQty(it.productId, 1); }}
                        className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center flex-shrink-0 active:scale-95 transition"
                        title="+1"
                      >
                        <IconPlus size={12} />
                      </button>
                    </div>
                  </div>
                )})}
              </div>

              <div className="border-t border-slate-200 mt-4 pt-4 space-y-2 text-sm">
                <div className="flex justify-between items-center text-slate-600 gap-2"><span className="flex-shrink-0">Client :</span>
                  <SearchSelect value={customerId || ""} onChange={v => setCustomerId(v || undefined)}
                    className="flex-1 min-w-0"
                    options={customers.map(c => ({ value: c.id, label: c.name }))}
                    allLabel="Client passage" />
                </div>
                <div className="flex justify-between items-center text-slate-600 gap-2"><span className="flex-shrink-0">Paiement :</span>
                  <SearchSelect value={paymentMethod} onChange={setPaymentMethod}
                    className="flex-1 min-w-0"
                    options={[
                      { value: "Espèces", label: "Espèces" },
                      { value: "Carte bancaire", label: "Carte bancaire" },
                      { value: "Wave", label: "Wave" },
                      { value: "Orange Money", label: "Orange Money" },
                      { value: "Chèque", label: "Chèque" },
                    ]} />
                </div>
                <div className="flex justify-between text-slate-600"><span>Montant reçu :</span>
                  <input type="number" className="w-40 border border-slate-300 rounded-lg px-2 py-1 text-sm text-right" placeholder={String(total)} value={paid} onChange={e => setPaid(+e.target.value)} />
                </div>
                <div className="flex justify-between text-slate-600"><span>Monnaie :</span><span className="font-bold">{fmtCurrency(change)}</span></div>
                <div className="border-t pt-2 flex justify-between text-lg font-black"><span>Total</span><span>{fmtCurrency(total)}</span></div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button variant="ghost" onClick={clearCart} disabled={cart.length === 0} className="w-full"><IconTrash size={16} /> Vider</Button>
                <Button variant="success" onClick={confirmSale} disabled={cart.length === 0} className="w-full">Valider la vente</Button>
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === "history" && (() => {
        const q = histSearch.toLowerCase().trim();
        const filtered = sales.filter(s => {
          if (q && !s.invoiceNo.toLowerCase().includes(q) && !(s.customerName || "").toLowerCase().includes(q)) return false;
          if (dateFrom && s.date < dateFrom) return false;
          if (dateTo && s.date > dateTo) return false;
          return true;
        });
        const hasFilters = !!(q || dateFrom || dateTo);
        const clearFilters = () => { setHistSearch(""); setDateFrom(""); setDateTo(""); };
        const filteredTotal = filtered.reduce((a, b) => a + b.total, 0);

        return (
        <div className="space-y-4">
          {/* Search & date filters */}
          <Card className="p-4">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className={inputClass + " pl-9"}
                  placeholder="Rechercher par n° de facture ou nom du client..."
                  value={histSearch}
                  onChange={e => setHistSearch(e.target.value)}
                />
                {histSearch && (
                  <button onClick={() => setHistSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                    <IconClose size={14} />
                  </button>
                )}
              </div>
              <div className="flex gap-2 items-center">
                <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium flex-1 md:flex-none">
                  <span>Du</span>
                  <input type="date" lang="fr-FR" className={inputClass + " !py-1.5 !text-xs flex-1 md:w-36"} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium flex-1 md:flex-none">
                  <span>Au</span>
                  <input type="date" lang="fr-FR" className={inputClass + " !py-1.5 !text-xs flex-1 md:w-36"} value={dateTo} onChange={e => setDateTo(e.target.value)} />
                </div>
                {hasFilters && (
                  <button onClick={clearFilters} className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition whitespace-nowrap flex-shrink-0">
                    ✕
                  </button>
                )}
              </div>
            </div>
            {/* Summary */}
            <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
              <span><b className="text-slate-900">{filtered.length}</b> facture{filtered.length > 1 ? "s" : ""} trouvée{filtered.length > 1 ? "s" : ""}</span>
              <span>Total : <b className="text-slate-900">{fmtCurrency(filteredTotal)}</b></span>
              {hasFilters && <span className="text-amber-700">Filtres actifs</span>}
            </div>
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-slate-600 uppercase text-xs border-b border-slate-200">
                    <th className="py-3 px-4">Facture</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 hidden md:table-cell">Client</th>
                    <th className="py-3 px-4 hidden sm:table-cell">Caissier</th>
                    <th className="py-3 px-4 hidden lg:table-cell">Paiement</th>
                    <th className="py-3 px-4 text-right">Total</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => (
                    <tr
                      key={s.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 cursor-pointer"
                      onClick={() => setDetailSale(s)}
                    >
                      <td className="py-3 px-4 font-mono text-xs">
                        <div>{s.invoiceNo}</div>
                        <div className="sm:hidden text-[11px] text-slate-500 font-sans mt-0.5">{s.userName} · {s.paymentMethod}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{fmtDate(s.date)}</td>
                      <td className="py-3 px-4 hidden md:table-cell">{s.customerName || "Client passage"}</td>
                      <td className="py-3 px-4 text-slate-600 hidden sm:table-cell">{s.userName}</td>
                      <td className="py-3 px-4 hidden lg:table-cell"><Badge tone="sky">{s.paymentMethod}</Badge></td>
                      <td className="py-3 px-4 text-right font-bold">{fmtCurrency(s.total)}</td>
                      <td className="py-3 px-4 text-right" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => { setLastSale(s); setTimeout(() => window.print(), 200); }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-900 hover:text-white text-slate-700 text-xs font-semibold transition"
                          title="Imprimer la facture"
                        >
                          <IconPrinter size={14} /> <span className="hidden sm:inline">Imprimer</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <EmptyState
                title={hasFilters ? "Aucune facture trouvée" : "Aucune vente"}
                subtitle={hasFilters ? "Modifiez votre recherche ou les filtres de date" : "Les ventes apparaîtront ici"}
              />
            )}
          </Card>
        </div>
      );})()}

      {/* ── Sale detail modal (mobile-friendly) ── */}
      <Modal open={!!detailSale} onClose={() => setDetailSale(null)} title={detailSale?.invoiceNo || "Détails"} size="md">
        {detailSale && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 bg-slate-50 rounded-xl"><div className="text-[10px] uppercase text-slate-500 font-semibold">Date</div><div className="font-bold mt-0.5">{fmtDate(detailSale.date)}</div></div>
              <div className="p-3 bg-slate-50 rounded-xl"><div className="text-[10px] uppercase text-slate-500 font-semibold">Paiement</div><div className="font-bold mt-0.5">{detailSale.paymentMethod}</div></div>
              <div className="p-3 bg-slate-50 rounded-xl"><div className="text-[10px] uppercase text-slate-500 font-semibold">Client</div><div className="font-bold mt-0.5">{detailSale.customerName || "Client passage"}</div></div>
              <div className="p-3 bg-slate-50 rounded-xl"><div className="text-[10px] uppercase text-slate-500 font-semibold">Caissier</div><div className="font-bold mt-0.5">{detailSale.userName}</div></div>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600 uppercase">
                  <tr><th className="py-2 px-3 text-left">Article</th><th className="py-2 px-3 text-right">Qté</th><th className="py-2 px-3 text-right">Total</th></tr>
                </thead>
                <tbody>
                  {detailSale.items.map(it => (
                    <tr key={it.productId} className="border-t border-slate-100">
                      <td className="py-2 px-3">{it.name}</td>
                      <td className="py-2 px-3 text-right text-slate-600">{it.quantity}</td>
                      <td className="py-2 px-3 text-right font-semibold">{fmtCurrency(it.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between items-center p-3 bg-slate-900 text-white rounded-xl">
              <span className="font-black text-lg">TOTAL</span>
              <span className="font-black text-xl">{fmtCurrency(detailSale.total)}</span>
            </div>
            <div className="text-xs text-slate-500">Monnaie rendue : {fmtCurrency(detailSale.change)}</div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setDetailSale(null)}>Fermer</Button>
              <Button variant="outline" onClick={() => { setLastSale(detailSale); setDetailSale(null); setTimeout(() => window.print(), 200); }}>
                <IconPrinter size={14} /> Imprimer
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Invoice overlay for print */}
      {lastSale && (() => {
        const cur = ss.currency || "FCFA";
        const shopName = ss.name || "Hi-Market";
        // Sous le nom : IFU et RCCM (au lieu du type de commerce)
        const idParts = [ss.ifu ? "IFU : " + ss.ifu : "", ss.rccm ? "RCCM : " + ss.rccm : ""].filter(Boolean);
        const contactParts = [ss.phone ? "Tél: " + ss.phone : "", ss.phone2, ss.email ? "Email: " + ss.email : ""].filter(Boolean);
        const locParts = [[ss.city, ss.country].filter(Boolean).join(", ")].filter(Boolean);
        const taxAmt = ss.taxRate > 0 ? Math.round(lastSale.total * ss.taxRate / 100) : 0;
        const grandTotal = lastSale.total + taxAmt;
        const thanks = ss.thankYouMessage || `Merci pour votre visite à ${shopName} ! À bientôt.`;
        return (
        <div className="print-only">
          <style>{`@media print { body * { visibility: hidden; } .print-area, .print-area * { visibility: visible; } .print-area { position: absolute; left: 0; top: 0; width: 100%; } @page { margin: 10mm; } }`}</style>
          <div className="print-area" ref={invoiceRef} style={{ background: "white", padding: "20mm", color: "#0f172a", fontFamily: "system-ui, sans-serif" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #0f172a", paddingBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {ss.logo && <img src={ss.logo} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover" }} />}
                <div>
                  <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, letterSpacing: 2 }}>{shopName}</h1>
                  {idParts.length > 0 && <div style={{ fontSize: 11, color: "#475569", marginTop: 4, fontWeight: 600 }}>{idParts.join("  ·  ")}</div>}
                  {contactParts.length > 0 && <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{contactParts.join(" · ")}</div>}
                  {(ss.address || locParts.length > 0) && <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>{[ss.address, ...locParts].filter(Boolean).join(", ")}</div>}
                </div>
              </div>
              <div style={{ background: "#0f172a", color: "white", padding: "10px 16px", borderRadius: 8, textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 10, opacity: 0.8 }}>FACTURE</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{lastSale.invoiceNo}</div>
                <div style={{ fontSize: 11, marginTop: 2 }}>Date : {fmtDate(lastSale.date)}</div>
              </div>
            </div>
            <div style={{ marginTop: 18, fontSize: 12 }}>
              <div style={{ fontWeight: 700, textTransform: "uppercase", fontSize: 11, color: "#475569" }}>Client</div>
              <div style={{ marginTop: 4, fontWeight: 600 }}>{lastSale.customerName || "Client passage"}</div>
              {(() => { const c = customers.find(x => x.id === lastSale.customerId); return c ? <div style={{ color: "#475569" }}>{c.phone} · {c.address}</div> : null; })()}
            </div>
            <table style={{ width: "100%", marginTop: 20, borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f1f5f9" }}>
                  <th style={{ padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #cbd5e1" }}>Désignation</th>
                  <th style={{ padding: "8px 10px", textAlign: "right", borderBottom: "1px solid #cbd5e1" }}>Qté</th>
                  <th style={{ padding: "8px 10px", textAlign: "right", borderBottom: "1px solid #cbd5e1" }}>PU ({cur})</th>
                  <th style={{ padding: "8px 10px", textAlign: "right", borderBottom: "1px solid #cbd5e1" }}>Total ({cur})</th>
                </tr>
              </thead>
              <tbody>
                {lastSale.items.map(it => (
                  <tr key={it.productId}>
                    <td style={{ padding: "6px 10px", borderBottom: "1px solid #e2e8f0" }}>{it.name}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", borderBottom: "1px solid #e2e8f0" }}>{it.quantity}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", borderBottom: "1px solid #e2e8f0" }}>{new Intl.NumberFormat("fr-SN").format(it.price)}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", borderBottom: "1px solid #e2e8f0", fontWeight: 600 }}>{new Intl.NumberFormat("fr-SN").format(it.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginLeft: "auto", marginTop: 20, width: 300, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "#f1f5f9" }}>
                <span>Sous-total</span><span>{new Intl.NumberFormat("fr-SN").format(lastSale.total)} {cur}</span>
              </div>
              {ss.taxRate > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "#f8fafc" }}>
                  <span>TVA ({ss.taxRate}%)</span><span>{new Intl.NumberFormat("fr-SN").format(taxAmt)} {cur}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px", background: "#0f172a", color: "white", fontSize: 15, fontWeight: 800 }}>
                <span>TOTAL</span><span>{new Intl.NumberFormat("fr-SN").format(grandTotal)} {cur}</span>
              </div>
            </div>
            <div style={{ marginTop: 20, fontSize: 11, color: "#475569" }}>
              <div>Mode de paiement : <b>{lastSale.paymentMethod}</b></div>
              <div>Montant reçu : <b>{new Intl.NumberFormat("fr-SN").format(lastSale.paid)} {cur}</b> · Monnaie : <b>{new Intl.NumberFormat("fr-SN").format(lastSale.change)} {cur}</b></div>
              <div>Caissier(e) : <b>{lastSale.userName}</b></div>
            </div>
            <div style={{ marginTop: 24, textAlign: "center", fontSize: 10, color: "#94a3b8" }}>
              <div>{thanks}</div>
              {ss.invoiceFooter && <div style={{ marginTop: 3 }}>{ss.invoiceFooter}</div>}
              <div style={{ marginTop: 3 }}>Facture générée par {shopName} © {new Date().getFullYear()}</div>
            </div>
          </div>
        </div>
      );})()}

      <Modal open={!!lastSale && tab === "pos" && cart.length === 0 && !!lastSale && false} onClose={() => setLastSale(null)} title="Vente validée">
        <p className="text-sm text-slate-600">Vente {lastSale?.invoiceNo} enregistrée avec succès.</p>
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="outline" onClick={printInvoice}><IconPrinter size={16} /> Imprimer</Button>
          <Button variant="ghost" onClick={() => setLastSale(null)}>Fermer</Button>
        </div>
      </Modal>
    </div>
  );
}
