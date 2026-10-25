import { useState, useMemo, useRef, useCallback } from "react";
import { useStore, fmtCurrency, fmtDate } from "../store";
import { Sale, Product, Customer } from "../types";
import { Card, Button, Modal, inputClass, Badge, EmptyState, SearchSelect, useToast } from "../components/ui";
import { IconPlus, IconTrash, IconSearch, IconPrinter, IconMinus, IconClose, IconCamera, IconTag } from "../components/Icons";
import { priceLine } from "../utils/pricing";
import { useScanner, CameraScanner } from "../components/scan";
import InvoicePrint from "../components/InvoicePrint";
import ReturnModal from "../components/ReturnModal";
import SettleModal from "../components/SettleModal";
import { OpenCashModal, CloseCashModal } from "../components/CashModals";
import { PAYMENT_METHODS } from "../constants";

/** Ligne du panier : seuls produit, quantité et remise manuelle partent au serveur (qui recalcule tous les montants). */
interface Line { productId: string; quantity: number; discountPercent: number }

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function PaymentBadge({ sale }: { sale: Sale }) {
  const st = sale.paymentStatus ?? "paid";
  if (st === "paid") return null;
  return <Badge tone={st === "unpaid" ? "rose" : "amber"}>{st === "unpaid" ? "Impayé" : "Partiel"}</Badge>;
}

export default function Sales({ initialTab = "pos" }: { initialTab?: "pos" | "history" }) {
  const { products, sales, customers, promotions, cashSession, currentUser, addSale, shopSettings: ss, isAdmin, canAccess } = useStore();
  const { push } = useToast();
  const [tab, setTab] = useState<"pos" | "history">(initialTab);
  const [cart, setCart] = useState<Line[]>([]);
  const [rawInputs, setRawInputs] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState<string | undefined>();
  const [paymentMethod, setPaymentMethod] = useState("Espèces");
  /** "" = payé en totalité ; un nombre inférieur au total = paiement partiel / à crédit */
  const [paidInput, setPaidInput] = useState("");
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [flashedProduct, setFlashedProduct] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [openCash, setOpenCash] = useState(false);
  const [closeCash, setCloseCash] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // History
  const [histSearch, setHistSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "unpaid" | "returns">("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [returnSale, setReturnSale] = useState<Sale | null>(null);
  const [settleFor, setSettleFor] = useState<{ customer: Customer; saleId?: string } | null>(null);
  const detailSale = useMemo(() => sales.find(s => s.id === detailId) ?? null, [sales, detailId]);

  const productById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const maxManualDiscount = isAdmin ? 100 : ss.maxDiscountPercent;

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase().trim();
    return products.filter(p => !q || p.name.toLowerCase().includes(q) || (p.barcode || "").includes(q));
  }, [products, search]);

  // ───────── Aperçu des prix (le serveur recalcule à l'enregistrement) ─────────
  const priced = useMemo(() => cart.map(l => {
    const p = productById.get(l.productId);
    return p ? { line: l, product: p, ...priceLine(p, l.quantity, l.discountPercent, promotions, ss.taxRate) } : null;
  }).filter((x): x is NonNullable<typeof x> => !!x), [cart, productById, promotions, ss.taxRate]);

  const listTotal = r2(priced.reduce((a, x) => a + x.list, 0));
  const total = r2(priced.reduce((a, x) => a + x.total, 0));
  const discounts = r2(listTotal - total);
  const vat = r2(priced.reduce((a, x) => a + x.taxAmount, 0));

  const paidNum = paidInput.trim() === "" ? null : Number(paidInput.replace(",", "."));
  const paidValid = paidNum === null || (Number.isFinite(paidNum) && paidNum >= 0);
  const change = paidNum !== null && paidValid ? Math.max(0, r2(paidNum - total)) : 0;
  const creditDue = paidNum !== null && paidValid ? Math.max(0, r2(total - paidNum)) : 0;
  const customer = customers.find(c => c.id === customerId);
  const creditProblem =
    creditDue <= 0.004 ? "" :
    !ss.allowCredit ? "Le paiement partiel / à crédit est désactivé dans les paramètres." :
    !customer ? "Choisissez un client pour vendre à crédit." :
    customer.creditLimit != null && (customer.balance ?? 0) + creditDue > customer.creditLimit + 0.004
      ? `Plafond de crédit dépassé (plafond ${fmtCurrency(customer.creditLimit)}, déjà dû ${fmtCurrency(customer.balance ?? 0)}).` : "";
  const sessionBlocked = ss.requireCashSession && !cashSession;

  const addToCart = useCallback((p: Product) => {
    if (p.stock <= 0) return push("Stock insuffisant", "error");
    setCart(c => {
      const existing = c.find(i => i.productId === p.id);
      if (existing) {
        if (existing.quantity + 1 > p.stock) { push("Stock insuffisant", "error"); return c; }
        return c.map(i => i.productId === p.id ? { ...i, quantity: +(i.quantity + 1).toFixed(3) } : i);
      }
      return [...c, { productId: p.id, quantity: 1, discountPercent: 0 }];
    });
    setFlashedProduct(p.id);
    setTimeout(() => setFlashedProduct(null), 600);
  }, [push]);

  /** Code lu par une douchette ou la caméra → ajoute le produit correspondant. */
  const handleScan = useCallback((raw: string) => {
    const code = raw.trim();
    const p = products.find(x => x.barcode === code);
    if (!p) { push(`Code inconnu : ${code}`, "error"); return false; }
    addToCart(p);
    push(`${p.name} ajouté`);
    return true;
  }, [products, addToCart, push]);

  useScanner(handleScan, tab === "pos" && !cameraOpen && !openCash && !closeCash);

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const code = search.trim();
    if (!code) return;
    const exact = products.find(p => p.barcode === code);
    if (exact) { addToCart(exact); setSearch(""); return; }
    if (filteredProducts.length === 1) { addToCart(filteredProducts[0]); setSearch(""); return; }
    push(filteredProducts.length === 0 ? `Aucun produit pour « ${code} »` : "Plusieurs produits correspondent : précisez ou cliquez sur l'un d'eux", "error");
  };

  const updateLine = (productId: string, patch: Partial<Line>) =>
    setCart(c => c.map(i => i.productId === productId ? { ...i, ...patch } : i));

  const changeQty = (productId: string, delta: number) => {
    setCart(c => c.flatMap(i => {
      if (i.productId !== productId) return [i];
      const stock = productById.get(productId)?.stock ?? 999999;
      const newQty = +Math.min(i.quantity + delta, stock).toFixed(3);
      if (newQty <= 0) return [];
      return [{ ...i, quantity: newQty }];
    }));
  };

  const setItemQty = (productId: string, raw: string) => {
    const num = parseFloat(raw.replace(",", "."));
    if (isNaN(num)) return;
    const stock = productById.get(productId)?.stock ?? 999999;
    updateLine(productId, { quantity: +Math.min(Math.max(0, num), stock).toFixed(3) });
  };

  const removeItem = (productId: string) => {
    setCart(c => c.filter(i => i.productId !== productId));
    setRawInputs(r => { const n = { ...r }; delete n[productId]; return n; });
  };

  const clearCart = () => { setCart([]); setPaidInput(""); setRawInputs({}); };

  const [saving, setSaving] = useState(false);
  const confirmSale = async () => {
    if (saving) return; // évite le double encaissement sur double-clic
    const valid = cart.filter(i => i.quantity > 0 && !isNaN(i.quantity));
    if (valid.length === 0) return push("Le panier est vide", "error");
    if (!paidValid) return push("Montant reçu invalide", "error");
    if (creditProblem) return push(creditProblem, "error");
    if (sessionBlocked) return push("Ouvrez la caisse avant de vendre", "error");
    setSaving(true);
    // Le serveur recalcule prix, promotions, TVA, totaux et n° de facture ; le stock est décrémenté de façon atomique.
    const sale = await addSale(valid, customerId, paymentMethod, paidNum ?? undefined);
    setSaving(false);
    if (!sale) return; // refus du serveur (stock insuffisant, remise trop forte…) : le panier est conservé
    setLastSale(sale);
    setCart([]); setPaidInput(""); setRawInputs({});
    push(sale.balanceDue && sale.balanceDue > 0 ? `Vente enregistrée — ${fmtCurrency(sale.balanceDue)} à crédit` : "Vente enregistrée !");
    searchRef.current?.focus();
  };

  const printSale = (s: Sale) => { setLastSale(s); setTimeout(() => window.print(), 200); };

  // ───────────────────────── Barre de caisse ─────────────────────────
  const cashBar = canAccess("sales") && (
    <Card className={`p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${sessionBlocked ? "border-amber-300 bg-amber-50" : ""}`}>
      {cashSession ? (
        <>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
            <div className="min-w-0 text-sm">
              <div className="font-bold text-slate-900">Caisse ouverte <span className="font-normal text-slate-500">depuis {new Date(cashSession.openedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span></div>
              <div className="text-xs text-slate-600 flex flex-wrap gap-x-4">
                <span>Fond : <b>{fmtCurrency(cashSession.openingFloat)}</b></span>
                <span>Ventes : <b>{cashSession.summary.salesCount}</b> · {fmtCurrency(cashSession.summary.salesTotal)}</span>
                <span>Espèces attendues : <b>{fmtCurrency(cashSession.summary.expectedCash)}</b></span>
              </div>
            </div>
          </div>
          <Button variant="outline" onClick={() => setCloseCash(true)}>Fermer la caisse</Button>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3 flex-1 min-w-0 text-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400 flex-shrink-0" />
            <div>
              <div className="font-bold text-slate-900">Caisse fermée</div>
              <div className="text-xs text-slate-600">{sessionBlocked ? "L'ouverture de la caisse est obligatoire pour vendre." : "Ouvrez la caisse pour suivre vos espèces et détecter les écarts."}</div>
            </div>
          </div>
          <Button onClick={() => setOpenCash(true)}>Ouvrir la caisse</Button>
        </>
      )}
    </Card>
  );

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

      {cashBar}

      {tab === "pos" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input ref={searchRef} autoFocus className={inputClass + " pl-9"} aria-label="Rechercher ou scanner un produit"
                    placeholder="Rechercher ou scanner un code-barres…" value={search}
                    onChange={e => setSearch(e.target.value)} onKeyDown={onSearchKey} />
                </div>
                <Button variant="outline" onClick={() => setCameraOpen(true)} title="Scanner avec la caméra" aria-label="Scanner avec la caméra"><IconCamera size={16} /> <span className="hidden sm:inline">Caméra</span></Button>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Douchette : scannez directement, le produit est ajouté au panier. Entrée valide un code exact.</p>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold">Catalogue ({filteredProducts.length})</h3>
                <span className="text-xs text-slate-500">Cliquez sur un produit pour l'ajouter</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[500px] overflow-y-auto">
                {filteredProducts.map(p => {
                  const promo = priceLine(p, 1, 0, promotions, ss.taxRate).promotion;
                  const promoPrice = promo ? priceLine(p, Math.max(1, promo.minQuantity), 0, promotions, ss.taxRate).total / Math.max(1, promo.minQuantity) : p.price;
                  return (
                    <button key={p.id} onClick={() => addToCart(p)} disabled={p.stock === 0}
                      className={`text-left border rounded-xl p-3 transition disabled:opacity-50 disabled:cursor-not-allowed relative ${
                        flashedProduct === p.id ? "border-emerald-500 bg-emerald-50 scale-[.97]" : "border-slate-200 hover:border-slate-900 hover:bg-slate-50"}`}>
                      {promo && <span className="absolute -top-2 right-2 inline-flex items-center gap-1 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full"><IconTag size={10} /> PROMO</span>}
                      <div className="font-semibold text-sm text-slate-900 line-clamp-2 min-h-[2.5rem]">{p.name}</div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-slate-900 font-bold">
                          {promo && <span className="text-xs text-slate-400 line-through mr-1">{fmtCurrency(p.price)}</span>}
                          {fmtCurrency(promoPrice)}
                        </span>
                        <Badge tone={p.stock > 0 ? "emerald" : "rose"}>{p.stock}</Badge>
                      </div>
                      {promo && promo.minQuantity > 1 && <div className="text-[10px] text-emerald-700 mt-1">dès {promo.minQuantity} unités</div>}
                    </button>
                  );
                })}
                {filteredProducts.length === 0 && <div className="col-span-full text-center text-slate-500 py-8">Aucun produit</div>}
              </div>
            </Card>

            {lastSale && (
              <Card className="p-3 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <span className="text-slate-500">Dernière vente : </span><b className="font-mono">{lastSale.invoiceNo}</b>
                  <span className="text-slate-500"> · {fmtCurrency(lastSale.total)}</span>
                  {(lastSale.balanceDue ?? 0) > 0 && <span className="text-rose-600 font-semibold"> · reste {fmtCurrency(lastSale.balanceDue ?? 0)}</span>}
                </div>
                <Button variant="outline" onClick={() => printSale(lastSale)}><IconPrinter size={14} /> Facture</Button>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <Card className="p-5 lg:sticky lg:top-24">
              <h3 className="font-bold text-slate-900 mb-3">Panier ({cart.length})</h3>
              <div className="space-y-2 max-h-[320px] overflow-y-auto">
                {cart.length === 0 && <p className="text-slate-500 text-sm py-8 text-center">Votre panier est vide.</p>}
                {priced.map(({ line, product, total: lineTotal, promotion, discountAmount }) => {
                  const displayValue = rawInputs[line.productId] ?? String(line.quantity);
                  return (
                    <div key={line.productId} className="p-3 rounded-xl bg-slate-50 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-slate-900 leading-snug">{product.name}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {fmtCurrency(product.price)} × {line.quantity}
                            <span className="text-slate-400 ml-1">· Stock: {product.stock}</span>
                          </div>
                          {promotion && <div className="text-[11px] text-emerald-700 font-semibold mt-0.5">🏷 {promotion.name}</div>}
                        </div>
                        <div className="text-right flex-shrink-0">
                          {discountAmount > 0 && <div className="text-[11px] text-slate-400 line-through">{fmtCurrency(product.price * line.quantity)}</div>}
                          <div className="text-sm font-bold text-slate-900">{fmtCurrency(lineTotal)}</div>
                          <button onClick={() => removeItem(line.productId)} className="text-rose-600 text-[11px] hover:underline">Retirer</button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => { setRawInputs(r => { const n = { ...r }; delete n[line.productId]; return n; }); changeQty(line.productId, -1); }}
                          className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100 flex-shrink-0 active:scale-95 transition" title="-1" aria-label="Moins un"><IconMinus size={12} /></button>
                        <input type="number" step="0.001" min="0.001" max={product.stock} value={displayValue} aria-label={`Quantité ${product.name}`}
                          onChange={e => { setRawInputs(r => ({ ...r, [line.productId]: e.target.value })); setItemQty(line.productId, e.target.value); }}
                          onBlur={() => { setRawInputs(r => { const n = { ...r }; delete n[line.productId]; return n; }); if (!line.quantity || line.quantity <= 0) removeItem(line.productId); }}
                          className="flex-1 min-w-0 text-center text-sm font-bold border border-slate-300 rounded-lg py-1.5 px-1 outline-none focus:border-slate-800 focus:ring-2 focus:ring-slate-800/10 transition [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                        <button onClick={() => { setRawInputs(r => { const n = { ...r }; delete n[line.productId]; return n; }); changeQty(line.productId, 1); }}
                          className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center flex-shrink-0 active:scale-95 transition" title="+1" aria-label="Plus un"><IconPlus size={12} /></button>
                        <label className="flex items-center gap-1 ml-1 text-[11px] text-slate-500 flex-shrink-0" title={`Remise manuelle (max ${maxManualDiscount} %)`}>
                          <span>Remise</span>
                          <input type="number" min="0" max={maxManualDiscount} step="any" inputMode="decimal" aria-label={`Remise % ${product.name}`}
                            value={line.discountPercent || ""} placeholder="0"
                            onChange={e => updateLine(line.productId, { discountPercent: Math.min(maxManualDiscount, Math.max(0, Number(e.target.value) || 0)) })}
                            className="w-12 text-center text-sm border border-slate-300 rounded-lg py-1 px-1 outline-none focus:border-slate-800" />
                          <span>%</span>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-slate-200 mt-4 pt-4 space-y-2 text-sm">
                <div className="flex justify-between items-center text-slate-600 gap-2"><span className="flex-shrink-0">Client :</span>
                  <SearchSelect value={customerId || ""} onChange={v => setCustomerId(v || undefined)} className="flex-1 min-w-0"
                    options={customers.map(c => ({ value: c.id, label: c.name + ((c.balance ?? 0) > 0 ? ` (doit ${fmtCurrency(c.balance ?? 0)})` : "") }))}
                    allLabel="Client passage" placeholder="Client passage" />
                </div>
                {customer && (customer.balance ?? 0) > 0 && (
                  <div className="text-[11px] text-rose-600 text-right">Ce client doit déjà {fmtCurrency(customer.balance ?? 0)}{customer.creditLimit != null && ` · plafond ${fmtCurrency(customer.creditLimit)}`}</div>
                )}
                <div className="flex justify-between items-center text-slate-600 gap-2"><span className="flex-shrink-0">Paiement :</span>
                  <SearchSelect value={paymentMethod} onChange={setPaymentMethod} className="flex-1 min-w-0"
                    options={PAYMENT_METHODS.map(m => ({ value: m, label: m }))} />
                </div>
                <div className="flex justify-between items-center text-slate-600 gap-2"><span>Montant reçu :</span>
                  <div className="flex items-center gap-1">
                    <input type="number" min="0" inputMode="decimal" aria-label="Montant reçu" className="w-32 border border-slate-300 rounded-lg px-2 py-1 text-sm text-right"
                      placeholder={String(total)} value={paidInput} onChange={e => setPaidInput(e.target.value)} />
                    <button type="button" onClick={() => setPaidInput(String(total))} className="text-[11px] px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold" title="Montant exact">Exact</button>
                    {ss.allowCredit && <button type="button" onClick={() => setPaidInput("0")} className="text-[11px] px-2 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 font-semibold" title="Tout à crédit">Crédit</button>}
                  </div>
                </div>
                <div className="flex justify-between text-slate-600"><span>Monnaie :</span><span className="font-bold">{fmtCurrency(change)}</span></div>
                {creditDue > 0.004 && (
                  <div className={`p-2.5 rounded-lg text-xs ${creditProblem ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-amber-50 text-amber-800 border border-amber-200"}`}>
                    <div className="flex justify-between font-bold text-sm"><span>Reste à crédit</span><span>{fmtCurrency(creditDue)}</span></div>
                    <div className="mt-0.5">{creditProblem || `Sera inscrit sur le compte de ${customer?.name}.`}</div>
                  </div>
                )}
                {discounts > 0.004 && (
                  <>
                    <div className="flex justify-between text-slate-500"><span>Sous-total catalogue</span><span>{fmtCurrency(listTotal)}</span></div>
                    <div className="flex justify-between text-emerald-700 font-semibold"><span>Remises & promotions</span><span>-{fmtCurrency(discounts)}</span></div>
                  </>
                )}
                {vat > 0.004 && <div className="flex justify-between text-slate-500 text-xs"><span>dont TVA incluse</span><span>{fmtCurrency(vat)}</span></div>}
                <div className="border-t pt-2 flex justify-between text-lg font-black"><span>Total</span><span>{fmtCurrency(total)}</span></div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button variant="ghost" onClick={clearCart} disabled={cart.length === 0} className="w-full"><IconTrash size={16} /> Vider</Button>
                <Button variant="success" onClick={confirmSale} disabled={cart.length === 0 || saving || !!creditProblem || sessionBlocked} className="w-full">Valider la vente</Button>
              </div>
              {sessionBlocked && <p className="text-[11px] text-amber-700 mt-2 text-center">Ouvrez la caisse pour pouvoir vendre.</p>}
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
          if (statusFilter === "unpaid" && !((s.balanceDue ?? 0) > 0.004)) return false;
          if (statusFilter === "returns" && !((s.returnedTotal ?? 0) > 0)) return false;
          return true;
        });
        const hasFilters = !!(q || dateFrom || dateTo || statusFilter !== "all");
        const clearFilters = () => { setHistSearch(""); setDateFrom(""); setDateTo(""); setStatusFilter("all"); };
        const filteredTotal = filtered.reduce((a, b) => a + b.total - (b.returnedTotal ?? 0), 0);
        const filteredDue = filtered.reduce((a, b) => a + (b.balanceDue ?? 0), 0);

        return (
          <div className="space-y-4">
            <Card className="p-4">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input className={inputClass + " pl-9"} placeholder="Rechercher par n° de facture ou nom du client..." value={histSearch} onChange={e => setHistSearch(e.target.value)} />
                  {histSearch && <button onClick={() => setHistSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><IconClose size={14} /></button>}
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium flex-1 md:flex-none"><span>Du</span>
                    <input type="date" lang="fr-FR" className={inputClass + " !py-1.5 !text-xs flex-1 md:w-36"} value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium flex-1 md:flex-none"><span>Au</span>
                    <input type="date" lang="fr-FR" className={inputClass + " !py-1.5 !text-xs flex-1 md:w-36"} value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
                  <select aria-label="Filtrer par statut" className={inputClass + " !py-1.5 !text-xs !w-auto"} value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}>
                    <option value="all">Toutes les ventes</option><option value="unpaid">À crédit / impayées</option><option value="returns">Avec retours</option>
                  </select>
                  {hasFilters && <button onClick={clearFilters} className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition whitespace-nowrap flex-shrink-0">✕</button>}
                </div>
              </div>
              <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
                <span><b className="text-slate-900">{filtered.length}</b> facture{filtered.length > 1 ? "s" : ""} trouvée{filtered.length > 1 ? "s" : ""}</span>
                <span>Total net : <b className="text-slate-900">{fmtCurrency(filteredTotal)}</b></span>
                {filteredDue > 0.004 && <span>Reste à encaisser : <b className="text-rose-600">{fmtCurrency(filteredDue)}</b></span>}
                {hasFilters && <span className="text-amber-700">Filtres actifs</span>}
              </div>
            </Card>

            <Card className="p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-slate-600 uppercase text-xs border-b border-slate-200">
                      <th className="py-3 px-4">Facture</th><th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4 hidden md:table-cell">Client</th><th className="py-3 px-4 hidden sm:table-cell">Caissier</th>
                      <th className="py-3 px-4 hidden lg:table-cell">Paiement</th><th className="py-3 px-4 text-right">Total</th><th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(s => (
                      <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 cursor-pointer" onClick={() => setDetailId(s.id)}>
                        <td className="py-3 px-4 font-mono text-xs">
                          <div>{s.invoiceNo}</div>
                          <div className="sm:hidden text-[11px] text-slate-500 font-sans mt-0.5">{s.userName} · {s.paymentMethod}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-600">{fmtDate(s.date)}</td>
                        <td className="py-3 px-4 hidden md:table-cell">{s.customerName || "Client passage"}</td>
                        <td className="py-3 px-4 text-slate-600 hidden sm:table-cell">{s.userName}</td>
                        <td className="py-3 px-4 hidden lg:table-cell"><div className="flex gap-1 flex-wrap"><Badge tone="sky">{s.paymentMethod}</Badge><PaymentBadge sale={s} />{(s.returnedTotal ?? 0) > 0 && <Badge tone="rose">Retour</Badge>}</div></td>
                        <td className="py-3 px-4 text-right">
                          <div className="font-bold">{fmtCurrency(s.total)}</div>
                          {(s.returnedTotal ?? 0) > 0 && <div className="text-[11px] text-rose-600">-{fmtCurrency(s.returnedTotal ?? 0)} retourné</div>}
                          {(s.balanceDue ?? 0) > 0.004 && <div className="text-[11px] text-amber-700">reste {fmtCurrency(s.balanceDue ?? 0)}</div>}
                        </td>
                        <td className="py-3 px-4 text-right" onClick={e => e.stopPropagation()}>
                          <button onClick={() => printSale(s)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-900 hover:text-white text-slate-700 text-xs font-semibold transition" title="Imprimer la facture">
                            <IconPrinter size={14} /> <span className="hidden sm:inline">Imprimer</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filtered.length === 0 && <EmptyState title={hasFilters ? "Aucune facture trouvée" : "Aucune vente"} subtitle={hasFilters ? "Modifiez votre recherche ou les filtres" : "Les ventes apparaîtront ici"} />}
            </Card>
          </div>
        );
      })()}

      {/* ── Détail d'une vente ── */}
      <Modal open={!!detailSale} onClose={() => setDetailId(null)} title={detailSale?.invoiceNo || "Détails"} size="lg">
        {detailSale && (() => {
          const s = detailSale;
          const canReturn = s.items.some(i => i.quantity - (i.returnedQuantity ?? 0) > 0.0005);
          const owed = s.balanceDue ?? 0;
          const cust = customers.find(c => c.id === s.customerId);
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div className="p-3 bg-slate-50 rounded-xl"><div className="text-[10px] uppercase text-slate-500 font-semibold">Date</div><div className="font-bold mt-0.5">{fmtDate(s.date)}</div></div>
                <div className="p-3 bg-slate-50 rounded-xl"><div className="text-[10px] uppercase text-slate-500 font-semibold">Paiement</div><div className="font-bold mt-0.5">{s.paymentMethod}</div></div>
                <div className="p-3 bg-slate-50 rounded-xl"><div className="text-[10px] uppercase text-slate-500 font-semibold">Client</div><div className="font-bold mt-0.5">{s.customerName || "Client passage"}</div></div>
                <div className="p-3 bg-slate-50 rounded-xl"><div className="text-[10px] uppercase text-slate-500 font-semibold">Caissier</div><div className="font-bold mt-0.5">{s.userName}</div></div>
              </div>
              <div className="border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-600 uppercase">
                    <tr><th className="py-2 px-3 text-left">Article</th><th className="py-2 px-3 text-right">Qté</th><th className="py-2 px-3 text-right hidden sm:table-cell">TVA</th><th className="py-2 px-3 text-right">Total</th></tr>
                  </thead>
                  <tbody>
                    {s.items.map((it, idx) => (
                      <tr key={it.id ?? idx} className="border-t border-slate-100">
                        <td className="py-2 px-3">
                          {it.name}
                          {(it.discountAmount ?? 0) > 0 && <div className="text-[11px] text-emerald-700">{[it.promotionLabel, (it.discountPercent ?? 0) > 0 ? `Remise ${it.discountPercent} %` : ""].filter(Boolean).join(" + ")} (-{fmtCurrency(it.discountAmount ?? 0)})</div>}
                          {(it.returnedQuantity ?? 0) > 0 && <div className="text-[11px] text-rose-600">{it.returnedQuantity} retourné(s)</div>}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-600">{it.quantity}</td>
                        <td className="py-2 px-3 text-right text-slate-500 hidden sm:table-cell">{it.taxRate ? `${it.taxRate} %` : "—"}</td>
                        <td className="py-2 px-3 text-right font-semibold">{fmtCurrency(it.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-900 text-white rounded-xl">
                <span className="font-black text-lg">TOTAL</span><span className="font-black text-xl">{fmtCurrency(s.total)}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2 bg-slate-50 rounded-lg">TVA incluse<br /><b className="text-sm">{fmtCurrency(s.taxAmount ?? 0)}</b></div>
                <div className="p-2 bg-slate-50 rounded-lg">Encaissé<br /><b className="text-sm">{fmtCurrency(s.amountPaid ?? s.total)}</b></div>
                <div className={`p-2 rounded-lg ${owed > 0.004 ? "bg-rose-50 text-rose-700" : "bg-slate-50"}`}>Reste dû<br /><b className="text-sm">{fmtCurrency(owed)}</b></div>
                <div className={`p-2 rounded-lg ${(s.returnedTotal ?? 0) > 0 ? "bg-amber-50 text-amber-800" : "bg-slate-50"}`}>Retourné<br /><b className="text-sm">{fmtCurrency(s.returnedTotal ?? 0)}</b></div>
              </div>
              {(s.returns?.length ?? 0) > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-bold uppercase text-slate-500">Avoirs</div>
                  {s.returns!.map(r => (
                    <div key={r.id} className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                      <div className="flex justify-between font-semibold"><span className="font-mono">{r.returnNo} · {fmtDate(r.date)}</span><span>{fmtCurrency(r.total)}</span></div>
                      <div>{r.items.map(i => `${i.quantity} × ${i.name}`).join(", ")}{r.reason && ` — ${r.reason}`}</div>
                      <div className="text-amber-700">{r.creditReduction > 0 && `Créance réduite de ${fmtCurrency(r.creditReduction)}. `}{r.cashRefund > 0 && `Remboursé : ${fmtCurrency(r.cashRefund)} (${r.refundMethod}). `}{!r.restocked && "Non remis en stock."} par {r.userName}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2 justify-end">
                <Button variant="ghost" onClick={() => setDetailId(null)}>Fermer</Button>
                {owed > 0.004 && cust && <Button variant="success" onClick={() => setSettleFor({ customer: cust, saleId: s.id })}>Encaisser le solde</Button>}
                {canReturn && <Button variant="outline" onClick={() => setReturnSale(s)}>Retour / annulation</Button>}
                <Button variant="outline" onClick={() => { setDetailId(null); printSale(s); }}><IconPrinter size={14} /> Imprimer</Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {returnSale && <ReturnModal sale={sales.find(s => s.id === returnSale.id) ?? returnSale} onClose={() => setReturnSale(null)} />}
      {settleFor && <SettleModal customer={customers.find(c => c.id === settleFor.customer.id) ?? settleFor.customer} saleId={settleFor.saleId} onClose={() => setSettleFor(null)} />}

      <OpenCashModal open={openCash} onClose={() => setOpenCash(false)} />
      {closeCash && <CloseCashModal session={cashSession} onClose={() => setCloseCash(false)} />}
      <CameraScanner open={cameraOpen} onClose={() => setCameraOpen(false)} onDetect={handleScan} />

      {lastSale && <InvoicePrint sale={lastSale} />}
    </div>
  );
}
