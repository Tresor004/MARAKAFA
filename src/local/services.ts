/**
 * Règles métier du mode « stockage local » : portage fidèle des services Laravel (backend/app/Services).
 * Toutes les fonctions travaillent sur la copie de la base fournie par `transaction()` :
 * une erreur levée n'importe où annule l'ensemble de l'opération.
 */
import type { Db, UserRow, ProductRow, SaleRow, SaleItemRow, SaleReturnRow, PromotionRow, CashSessionRow, PurchaseRow, PurchaseItemRow, LossRow, PendingRow } from "./db";
import { nextId, isoDate, nowIso, round, hashPassword, randomHex, PERMISSIONS } from "./db";
import { HttpError, V, invalid, forbidden, isObj, has, blank } from "./http";
import { isRunning } from "./present";

type Obj = Record<string, unknown>;
export interface Ctx { db: Db; user: UserRow }

// ═════════════════════════ Utilitaires ═════════════════════════

export const roleOf = (db: Db, u: UserRow) => db.roles.find(r => r.id === u.roleId);
export const isAdmin = (db: Db, u: UserRow) => roleOf(db, u)?.slug === "admin";
export const hasPermission = (db: Db, u: UserRow, key: string) => isAdmin(db, u) || !!roleOf(db, u)?.permissions.includes(key);

/** 1234567 → « 1 234 567 » (comme number_format(…, 0, ',', ' ')) */
const nf0 = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
/** 12.500 → « 12.5 » */
const fmt3 = (n: number) => String(round(n, 3));

const activeProduct = (db: Db, id: number) => db.products.find(p => p.id === id && !p.deleted);

function findOr<T extends { id: number; deleted?: boolean }>(rows: T[], id: unknown, label: string): T {
  const n = Number(id);
  const row = id ? rows.find(r => r.id === n && !r.deleted) : undefined;
  if (!row) throw invalid("id", `${label} introuvable (supprimé entre-temps ?).`);
  return row;
}

/** Numérotation PREFIXE-ANNEE-0001 déduite du plus grand numéro existant (DocumentNumberService). */
function nextNumber(prefix: string, existing: string[]): string {
  const year = new Date().getFullYear();
  const p = prefix.trim() || "DOC";
  const start = `${p}-${year}-`;
  const max = existing.filter(x => x.startsWith(start)).reduce((m, x) => Math.max(m, parseInt(x.slice(start.length), 10) || 0), 0);
  return `${start}${String(max + 1).padStart(4, "0")}`;
}

// ═════════════════════════ Notifications (NotificationService) ═════════════════════════

export function notifyUser(db: Db, userId: number, title: string, message: string, type = "info", by: UserRow | null = null, targetPage: string | null = null, targetId: string | null = null) {
  db.notifications.push({
    id: nextId(db, "notifications"), userId, title, message, type, scope: "personal", permission: null,
    targetPage, targetId, triggeredById: by?.id ?? null, triggeredByName: by?.name ?? "Système", notifiedAt: Date.now(),
  });
}

export function notifyAll(db: Db, title: string, message: string, type = "info", by: UserRow | null = null, targetPage: string | null = null, targetId: string | null = null, permission: string | null = null) {
  db.notifications.push({
    id: nextId(db, "notifications"), userId: null, title, message, type, scope: "general", permission,
    targetPage, targetId, triggeredById: by?.id ?? null, triggeredByName: by?.name ?? "Système", notifiedAt: Date.now(),
  });
}

export function notifyAdmins(db: Db, title: string, message: string, type = "warning", by: UserRow | null = null, targetPage: string | null = "myspace") {
  db.users.filter(u => u.active && !u.deleted && isAdmin(db, u)).forEach(a => notifyUser(db, a.id, title, message, type, by, targetPage));
}

function notifyStockThreshold(db: Db, p: ProductRow, before: number) {
  const after = p.stock, min = p.minStock;
  if (after <= 0 && before > 0) {
    notifyAll(db, "Rupture de stock", `Le produit « ${p.name} » est en rupture de stock.`, "error", null, "stock", String(p.id));
  } else if (after > 0 && after <= min && before > min) {
    notifyAll(db, "Stock critique", `Le stock de « ${p.name} » est critique (${fmt3(after)} restant(s)).`, "warning", null, "stock", String(p.id));
  }
}

/** Contrôles quotidiens (stock critique, produits périmés) : au plus une fois par jour, à la connexion. */
export function runDailyChecksOncePerDay(db: Db) {
  const today = isoDate();
  if (db.dailyChecks === today) return;
  db.dailyChecks = today;
  const products = db.products.filter(p => !p.deleted).sort((a, b) => a.name.localeCompare(b.name, "fr"));

  const low = products.filter(p => p.stock > 0 && p.stock <= p.minStock);
  if (low.length) {
    const names = low.slice(0, 5).map(p => `${p.name} (${fmt3(p.stock)} restant${p.stock > 1 ? "s" : ""})`).join(", ");
    notifyAll(db, "Stock critique (récapitulatif)", `${low.length} article${low.length > 1 ? "s" : ""} en stock critique : ${names}${low.length > 5 ? " …" : ""}.`, "warning", null, "stock");
  }
  const expired = products.filter(p => p.stock > 0 && p.expiryDate && p.expiryDate < today);
  if (expired.length) {
    notifyAll(db, "Produits périmés détectés",
      `${expired.length} produit(s) périmé(s) nécessite(nt) une déclaration de perte : ${expired.map(p => p.name).join(", ")}. Veuillez déclarer ces pertes dans le module Pertes & Péremptions.`,
      "warning", null, "losses", null, "losses");
  }
}

// ═════════════════════════ Stock (StockService) ═════════════════════════

interface MoveCtx { type: string; user: UserRow | null; reason?: string | null; refType?: string | null; refId?: number | null; refLabel?: string | null }

function journal(db: Db, p: ProductRow, delta: number, before: number, after: number, c: MoveCtx) {
  db.stockMovements.push({
    id: nextId(db, "stockMovements"), productId: p.id, productName: p.name, userId: c.user?.id ?? null, userName: c.user?.name ?? null,
    type: c.type, quantity: delta, stockBefore: before, stockAfter: after, reason: c.reason ?? null,
    referenceType: c.refType ?? null, referenceId: c.refId ?? null, referenceLabel: c.refLabel ?? null, createdAt: nowIso(),
  });
}

export function stockDecrease(db: Db, productId: number, qty: number, label: string | null, c: MoveCtx): ProductRow {
  qty = round(qty, 3);
  const p = activeProduct(db, productId);
  if (!p || p.stock < qty - 0.0005) {
    const any = db.products.find(x => x.id === productId);
    throw invalid("stock", `Stock insuffisant pour « ${label ?? any?.name ?? "#" + productId} » (disponible : ${fmt3(any?.stock ?? 0)}).`);
  }
  const before = p.stock;
  p.stock = Math.max(0, round(p.stock - qty, 3));
  journal(db, p, -qty, before, p.stock, c);
  notifyStockThreshold(db, p, before);
  return p;
}

export function stockIncrease(db: Db, productId: number, qty: number, c: MoveCtx): ProductRow {
  qty = round(qty, 3);
  const p = activeProduct(db, productId);
  if (!p) throw invalid("productId", "Produit introuvable.");
  const before = p.stock;
  p.stock = round(p.stock + qty, 3);
  journal(db, p, qty, before, p.stock, c);
  return p;
}

export function stockSet(db: Db, productId: number, value: number, c: MoveCtx) {
  const p = activeProduct(db, productId);
  if (!p) return;
  value = Math.max(0, round(value, 3));
  const before = p.stock;
  p.stock = value;
  if (Math.abs(value - before) >= 0.0005) journal(db, p, round(value - before, 3), before, value, c);
}

function stockAdjust(db: Db, productId: number, delta: number, c: MoveCtx) {
  if (Math.abs(delta) < 0.0005) throw invalid("delta", "La quantité à ajuster ne peut pas être nulle.");
  return delta > 0 ? stockIncrease(db, productId, delta, c) : stockDecrease(db, productId, Math.abs(delta), null, c);
}

// ═════════════════════════ Prix et promotions (PricingService) ═════════════════════════

const promoLabel = (p: PromotionRow) => `${p.name} (${p.type === "percent" ? `${round(p.value, 2)} %` : `-${round(p.value, 2)} / unité`})`;

function promoApplies(p: PromotionRow, product: ProductRow, qty: number) {
  if (qty + 0.0005 < p.minQuantity) return false;
  if (p.scope === "product") return p.productId === product.id;
  if (p.scope === "category") return product.categoryId !== null && p.categoryId === product.categoryId;
  return true;
}

function promoDiscount(p: PromotionRow, unitPrice: number, qty: number) {
  const list = unitPrice * qty;
  const d = p.type === "percent" ? (list * p.value) / 100 : p.value * qty;
  return round(Math.min(list, Math.max(0, d)), 2);
}

function priceLine(product: ProductRow, qty: number, manualPercent: number, promos: PromotionRow[], shopRate: number) {
  const list = round(qty * product.price, 2);
  let best: PromotionRow | null = null, bestDiscount = 0;
  for (const promo of promos) {
    if (!promoApplies(promo, product, qty)) continue;
    const d = promoDiscount(promo, product.price, qty);
    if (d > bestDiscount + 0.004) { best = promo; bestDiscount = d; }
  }
  const afterPromo = round(list - bestDiscount, 2);
  const pct = Math.min(100, Math.max(0, round(manualPercent, 2)));
  const total = round(afterPromo - round((afterPromo * pct) / 100, 2), 2);
  const rate = product.taxRate !== null && product.taxRate !== undefined ? product.taxRate : shopRate;
  const tax = rate > 0 ? round(total - total / (1 + rate / 100), 2) : 0;
  return { promotion: best, discountPercent: pct, discountAmount: round(list - total, 2), total, taxRate: rate, taxAmount: tax };
}

// ═════════════════════════ Caisse (CashSessionService) ═════════════════════════

export const currentCash = (db: Db, u: UserRow) =>
  db.cashSessions.filter(c => c.userId === u.id && c.status === "open").sort((a, b) => b.id - a.id)[0] ?? null;

export function cashSummary(db: Db, c: CashSessionRow) {
  const byMethod: Record<string, number> = {};
  let cash = 0, refunds = 0, settlements = 0;
  db.payments.filter(p => p.cashSessionId === c.id).forEach(p => {
    if (p.kind === "refund") refunds += -p.amount;
    else if (p.kind === "settlement") settlements += p.amount;
    byMethod[p.method] = round((byMethod[p.method] ?? 0) + p.amount, 2);
    if (p.method === "Espèces") cash += p.amount;
  });
  const sales = db.sales.filter(x => x.cashSessionId === c.id);
  return {
    salesCount: sales.length,
    salesTotal: round(sales.reduce((a, x) => a + x.total, 0), 2),
    creditGranted: round(sales.reduce((a, x) => a + x.balanceDue, 0), 2),
    refunds: round(refunds, 2), settlements: round(settlements, 2), byMethod,
    cashIn: round(cash, 2), expectedCash: round(c.openingFloat + cash, 2), until: c.closedAt,
  };
}

function cashForPayment(db: Db, u: UserRow, required: boolean) {
  const session = currentCash(db, u);
  if (!session && required && db.settings.requireCashSession) throw invalid("session", "Ouvrez votre caisse avant d'encaisser.");
  return session;
}

export function cashOpen(db: Db, u: UserRow, openingFloat: number) {
  if (openingFloat < 0) throw invalid("openingFloat", "Le fond de caisse ne peut pas être négatif.");
  if (currentCash(db, u)) throw invalid("session", "Vous avez déjà une caisse ouverte.");
  const row: CashSessionRow = {
    id: nextId(db, "cashSessions"), userId: u.id, openedAt: nowIso(), closedAt: null, openingFloat: round(openingFloat, 2),
    expectedCash: null, countedCash: null, difference: null, note: null, status: "open",
  };
  db.cashSessions.push(row);
  return row;
}

export function cashClose(db: Db, c: CashSessionRow, by: UserRow, counted: number, note: string | null) {
  if (c.status !== "open") throw invalid("session", "Cette caisse est déjà fermée.");
  if (counted < 0) throw invalid("countedCash", "Le montant compté ne peut pas être négatif.");
  const expected = cashSummary(db, c).expectedCash;
  counted = round(counted, 2);
  Object.assign(c, {
    closedAt: nowIso(), expectedCash: expected, countedCash: counted, difference: round(counted - expected, 2),
    note: note && note.trim() ? note.trim() : null, status: "closed",
  });
  const diff = c.difference ?? 0;
  if (Math.abs(diff) >= 0.005) {
    const owner = db.users.find(u => u.id === c.userId);
    notifyAdmins(db, "Écart de caisse",
      `${owner?.name ?? "Un caissier"} a fermé sa caisse avec un écart de ${diff > 0 ? "+" : diff < 0 ? "-" : ""}${nf0(Math.abs(diff))} (attendu ${nf0(expected)}, compté ${nf0(counted)}).`,
      diff < 0 ? "warning" : "info", by, "sales");
  }
  return c;
}

// ═════════════════════════ Ventes (SaleService) ═════════════════════════

export function createSale(db: Db, cashier: UserRow, body: Obj): SaleRow {
  const v = new V(body);
  const rawItems = v.arr("items", { required: true, min: 1, max: 200 });
  const customerId = v.int("customerId") ?? null;
  const paymentMethod = v.str("paymentMethod", { max: 50 }) || "Espèces";
  const paidIn = v.num("paid", { min: 0, max: 999999999999 });

  const settings = db.settings;
  const shopRate = settings.taxRate;
  const date = isoDate();
  const session = cashForPayment(db, cashier, true);

  // Fusionne les lignes identiques (même produit, même remise manuelle)
  const merged = new Map<string, { pid: number; pct: number; qty: number }>();
  rawItems.forEach((it, i) => {
    if (!isObj(it)) throw invalid(`items.${i}`, "Article invalide.");
    const iv = new V(it);
    const pid = iv.int("productId", { required: true }) as number;
    const qty = iv.num("quantity", { required: true, gt: 0, max: 999999 }) as number;
    const pct = round(iv.num("discountPercent", { min: 0, max: 100 }) ?? 0, 2);
    const key = `${pid}|${pct}`;
    merged.set(key, { pid, pct, qty: round((merged.get(key)?.qty ?? 0) + qty, 3) });
  });

  const promos = db.promotions.filter(p => isRunning(p, date));
  const maxDiscount = settings.maxDiscountPercent;
  const canOverride = isAdmin(db, cashier);
  const lines: (ReturnType<typeof priceLine> & { product: ProductRow; qty: number })[] = [];
  let total = 0, tax = 0;
  for (const m of merged.values()) {
    const product = activeProduct(db, m.pid);
    if (!product) throw invalid("items", "Un des produits du panier n'existe plus.");
    if (m.qty <= 0) throw invalid("items", `Quantité invalide pour « ${product.name} ».`);
    if (!canOverride && m.pct > maxDiscount + 0.0001) {
      throw invalid("items", `Remise de ${m.pct} % non autorisée pour « ${product.name} » (maximum ${maxDiscount} %). Demandez à un administrateur.`);
    }
    const line = { ...priceLine(product, m.qty, m.pct, promos, shopRate), product, qty: m.qty };
    total += line.total; tax += line.taxAmount;
    lines.push(line);
  }
  total = round(total, 2); tax = round(tax, 2);

  // Paiement : comptant, partiel ou à crédit
  const paid = paidIn === null || paidIn === undefined ? total : round(Math.max(0, paidIn), 2);
  const amountPaid = Math.min(paid, total);
  const balance = round(total - amountPaid, 2);

  const customer = customerId !== null ? db.customers.find(c => c.id === customerId && !c.deleted) : undefined;
  if (customerId !== null && !customer) throw invalid("customerId", "Client introuvable.");

  if (balance > 0.004) {
    if (!settings.allowCredit) throw invalid("paid", "Le montant payé est inférieur au total à régler.");
    if (!customer) throw invalid("customerId", "Choisissez un client pour enregistrer une vente à crédit ou un paiement partiel.");
    if (customer.creditLimit !== null) {
      const outstanding = db.sales.filter(x => x.customerId === customer.id).reduce((a, x) => a + x.balanceDue, 0);
      if (outstanding + balance > customer.creditLimit + 0.004) {
        throw invalid("paid", `Plafond de crédit dépassé pour ce client (plafond ${nf0(customer.creditLimit)}, déjà dû ${nf0(outstanding)}).`);
      }
    }
  }

  const sale: SaleRow = {
    id: nextId(db, "sales"), invoiceNo: nextNumber(settings.invoicePrefix || "FAC", db.sales.map(x => x.invoiceNo)),
    customerId: customer?.id ?? null, userId: cashier.id, total, taxRate: shopRate, taxAmount: tax, paid,
    change: round(Math.max(0, paid - total), 2), amountPaid, balanceDue: balance, returnedTotal: 0, paymentMethod,
    date, createdAt: nowIso(), cashSessionId: session?.id ?? null, items: [],
  };
  db.sales.push(sale);

  for (const line of lines) {
    stockDecrease(db, line.product.id, line.qty, line.product.name, {
      type: "sale", user: cashier, reason: "Vente", refType: "sale", refId: sale.id, refLabel: sale.invoiceNo,
    });
    const item: SaleItemRow = {
      id: nextId(db, "saleItems"), productId: line.product.id, name: line.product.name, quantity: line.qty,
      price: line.product.price, cost: line.product.cost, total: line.total, taxRate: line.taxRate, taxAmount: line.taxAmount,
      discountPercent: line.discountPercent, discountAmount: line.discountAmount,
      promotionId: line.promotion?.id ?? null, promotionLabel: line.promotion ? promoLabel(line.promotion) : null, returnedQuantity: 0,
    };
    sale.items.push(item);
  }

  if (amountPaid > 0.004) {
    db.payments.push({
      id: nextId(db, "payments"), saleId: sale.id, customerId: sale.customerId, userId: cashier.id, cashSessionId: session?.id ?? null,
      kind: "sale", method: paymentMethod, amount: amountPaid, note: null, date,
    });
  }
  if (customer) customer.totalPurchases = round(customer.totalPurchases + total, 2);
  return sale;
}

// ═════════════════════════ Règlements de créances (PaymentService) ═════════════════════════

export function settleCustomer(db: Db, by: UserRow, customerId: number, body: Obj) {
  const customer = db.customers.find(c => c.id === customerId && !c.deleted);
  if (!customer) throw new HttpError(404, "Élément introuvable (il a peut-être été supprimé).");
  const v = new V(body);
  const amount = round(v.num("amount", { required: true, gt: 0, max: 999999999999 }) as number, 2);
  const method = v.str("method", { max: 50 }) || "Espèces";
  const saleId = v.int("saleId") ?? null;
  const note = v.str("note", { max: 255 }) ?? null;

  const open = db.sales.filter(x => x.customerId === customer.id && x.balanceDue > 0.004 && (saleId === null || x.id === saleId)).sort((a, b) => a.id - b.id);
  if (!open.length) throw invalid("amount", "Ce client ne doit rien.");
  const due = round(open.reduce((a, x) => a + x.balanceDue, 0), 2);
  if (amount > due + 0.004) throw invalid("amount", `Le montant dépasse le solde dû (${nf0(due)}).`);

  const session = cashForPayment(db, by, true);
  let left = amount, applied = 0;
  for (const sale of open) {
    if (left <= 0.004) break;
    const part = round(Math.min(left, sale.balanceDue), 2);
    sale.balanceDue = round(sale.balanceDue - part, 2);
    sale.amountPaid = round(sale.amountPaid + part, 2);
    db.payments.push({
      id: nextId(db, "payments"), saleId: sale.id, customerId: customer.id, userId: by.id, cashSessionId: session?.id ?? null,
      kind: "settlement", method, amount: part, note, date: isoDate(),
    });
    left = round(left - part, 2);
    applied++;
  }
  return applied;
}

// ═════════════════════════ Retours (ReturnService) ═════════════════════════

function createReturn(db: Db, by: UserRow, sale: SaleRow, lines: { saleItemId: number; quantity: number }[], restock: boolean, refundMethod: string | null, reason: string | null) {
  if (!lines.length) throw invalid("items", "Sélectionnez au moins un article à retourner.");
  const wanted = new Map<number, number>();
  lines.forEach(l => wanted.set(l.saleItemId, round((wanted.get(l.saleItemId) ?? 0) + l.quantity, 3)));

  const rows: { item: SaleItemRow; qty: number; value: number; tax: number }[] = [];
  let total = 0, tax = 0;
  for (const [itemId, qty] of wanted) {
    const item = sale.items.find(i => i.id === itemId);
    if (!item) throw invalid("items", "Article absent de cette vente.");
    if (qty <= 0) throw invalid("items", "Quantité de retour invalide.");
    const returnable = round(item.quantity - item.returnedQuantity, 3);
    if (qty > returnable + 0.0005) throw invalid("items", `« ${item.name} » : seulement ${fmt3(returnable)} restant à retourner.`);

    const ratio = qty / item.quantity;
    const isRest = Math.abs(qty - returnable) < 0.0005;
    const already = db.saleReturns.flatMap(r => r.items).filter(i => i.saleItemId === item.id)
      .reduce((a, i) => ({ value: a.value + i.total, tax: a.tax + i.taxAmount }), { value: 0, tax: 0 });
    const value = isRest ? round(item.total - already.value, 2) : round(item.total * ratio, 2);
    const itemTax = isRest ? round(item.taxAmount - already.tax, 2) : round(item.taxAmount * ratio, 2);
    rows.push({ item, qty, value, tax: itemTax });
    total += value; tax += itemTax;
  }
  total = round(total, 2); tax = round(tax, 2);

  const creditReduction = round(Math.min(sale.balanceDue, total), 2);
  const cashRefund = round(total - creditReduction, 2);
  const session = currentCash(db, by);
  const method = refundMethod || sale.paymentMethod;

  const ret = {
    id: nextId(db, "saleReturns"), returnNo: nextNumber("AV", db.saleReturns.map(r => r.returnNo)), saleId: sale.id, userId: by.id,
    date: isoDate(), total, taxAmount: tax, creditReduction, cashRefund, refundMethod: cashRefund > 0.004 ? method : null,
    restocked: restock, reason: reason && reason.trim() ? reason.trim() : null, items: [] as SaleReturnRow["items"],
  };
  db.saleReturns.push(ret);

  for (const r of rows) {
    ret.items.push({ saleItemId: r.item.id, productId: r.item.productId, name: r.item.name, quantity: r.qty, unitValue: round(r.value / r.qty, 2), total: r.value, taxAmount: r.tax });
    r.item.returnedQuantity = round(r.item.returnedQuantity + r.qty, 3);
    if (restock && r.item.productId && activeProduct(db, r.item.productId)) {
      stockIncrease(db, r.item.productId, r.qty, {
        type: "sale_return", user: by, reason: "Retour client" + (reason ? ` : ${reason}` : ""), refType: "sale_return", refId: ret.id, refLabel: ret.returnNo,
      });
    }
  }

  sale.returnedTotal = round(sale.returnedTotal + total, 2);
  sale.balanceDue = round(sale.balanceDue - creditReduction, 2);
  sale.amountPaid = round(sale.amountPaid - cashRefund, 2);

  if (cashRefund > 0.004) {
    db.payments.push({
      id: nextId(db, "payments"), saleId: sale.id, customerId: sale.customerId, userId: by.id, cashSessionId: session?.id ?? null,
      kind: "refund", method, amount: -cashRefund, note: ret.returnNo, date: isoDate(),
    });
  }
  const customer = db.customers.find(c => c.id === sale.customerId);
  if (customer) customer.totalPurchases = Math.max(0, round(customer.totalPurchases - total, 2));
}

// ═════════════════════════ Achats (PurchaseService) ═════════════════════════

function purchaseLines(db: Db, items: unknown[]): PurchaseItemRow[] {
  if (!items.length) throw invalid("items", "Au moins un article est requis.");
  return items.map((raw, i) => {
    if (!isObj(raw)) throw invalid(`items.${i}`, "Article invalide.");
    const v = new V(raw);
    const qty = round(v.num("quantity", { required: true, gt: 0, max: 999999999 }) as number, 3);
    const price = round(v.num("price", { required: true, min: 0, max: 999999999999 }) as number, 2);
    const pid = v.int("productId") ?? null;
    const product = pid ? activeProduct(db, pid) : undefined;
    if (pid && !product) throw invalid("items", "Un des produits n'existe plus.");
    const name = product?.name ?? (v.str("name", { max: 255 }) ?? "");
    if (!name) throw invalid("items", "Chaque ligne doit désigner un produit.");
    const rate = Math.min(100, Math.max(0, v.num("taxRate", { min: 0, max: 100 }) ?? 0));
    const ttc = String(raw.priceMode ?? "ht").toLowerCase() === "ttc";
    const unitHt = ttc ? round(price / (1 + rate / 100), 2) : price;
    const unitTtc = ttc ? price : round(price * (1 + rate / 100), 2);
    return { productId: product?.id ?? null, name, quantity: qty, price: unitHt, total: round(qty * unitHt, 2), taxRate: rate, priceTtc: unitTtc, totalTtc: round(qty * unitTtc, 2) };
  });
}

function purchaseTotals(lines: PurchaseItemRow[]) {
  const ht = round(lines.reduce((a, l) => a + l.total, 0), 2);
  const ttc = round(lines.reduce((a, l) => a + l.totalTtc, 0), 2);
  return { total: ttc, totalHt: ht, totalTax: round(ttc - ht, 2) };
}

function applyPurchase(db: Db, p: PurchaseRow, by: UserRow | null) {
  for (const l of p.items) {
    if (!l.productId) continue;
    stockIncrease(db, l.productId, l.quantity, { type: "purchase", user: by, reason: "Réception du bon d'achat", refType: "purchase", refId: p.id, refLabel: p.reference });
    const product = activeProduct(db, l.productId);
    if (product) product.cost = l.price;
  }
}

function reversePurchase(db: Db, p: PurchaseRow, by: UserRow | null) {
  for (const l of p.items) {
    if (!l.productId || !activeProduct(db, l.productId)) continue;
    try {
      stockDecrease(db, l.productId, l.quantity, l.name, {
        type: "purchase_cancel", user: by, reason: "Annulation / modification du bon d'achat", refType: "purchase", refId: p.id, refLabel: p.reference,
      });
    } catch {
      throw invalid("purchase", `Impossible d'annuler ce bon : une partie de « ${l.name} » a déjà été vendue ou retirée du stock.`);
    }
  }
}

function assertSupplier(db: Db, id: number) {
  if (!db.suppliers.some(s => s.id === id)) throw invalid("supplierId", "Fournisseur introuvable.");
}

// ═════════════════════════ Opérations soumises à validation (ActionService) ═════════════════════════

export const CATALOG: Record<string, [string, string[]]> = {
  "product.add": ["products", ["products", "categories"]], "product.update": ["products", ["products", "categories"]],
  "product.delete": ["products", ["products"]], "customer.add": ["customers", ["customers"]],
  "customer.update": ["customers", ["customers"]], "customer.delete": ["customers", ["customers"]],
  "supplier.add": ["suppliers", ["suppliers"]], "supplier.update": ["suppliers", ["suppliers"]], "supplier.delete": ["suppliers", ["suppliers"]],
  "user.add": ["users", ["users"]], "user.update": ["users", ["users"]], "user.delete": ["users", ["users"]],
  "loss.add": ["losses", ["losses", "products"]], "loss.delete": ["losses", ["losses", "products"]],
  "stock.adjust": ["stock", ["products"]], "inventory.do": ["inventory", ["inventory", "products"]],
  "purchase.add": ["purchases", ["purchases", "products"]], "purchase.update": ["purchases", ["purchases", "products"]],
  "purchase.delete": ["purchases", ["purchases", "products"]], "profile.update": ["myspace", ["users", "me"]],
  "sale.return": ["sales", ["sales", "products", "customers", "cashSession"]],
  "promotion.add": ["products", ["promotions"]], "promotion.update": ["products", ["promotions"]], "promotion.delete": ["products", ["promotions"]],
};

const BROADCAST = ["product.add", "product.update", "product.delete", "customer.add", "customer.delete", "supplier.add", "supplier.delete", "purchase.add", "promotion.add"];
const PAGE: Record<string, string> = {
  product: "products", stock: "stock", customer: "customers", supplier: "suppliers", purchase: "purchases", loss: "losses",
  inventory: "inventory", user: "users", profile: "myspace", sale: "sales", promotion: "products",
};
export const pageFor = (kind: string) => PAGE[kind.split(".")[0]] ?? "dashboard";
const LABELS: Record<string, [string, string]> = {
  "product.add": ["Produits", "Ajouter un produit"], "product.update": ["Produits", "Modifier un produit"], "product.delete": ["Produits", "Supprimer un produit"],
  "customer.add": ["Clients", "Ajouter un client"], "customer.delete": ["Clients", "Supprimer un client"],
  "supplier.add": ["Fournisseurs", "Ajouter un fournisseur"], "supplier.delete": ["Fournisseurs", "Supprimer un fournisseur"],
  "purchase.add": ["Achats", "Nouvel achat fournisseur"], "promotion.add": ["Promotions", "Nouvelle promotion"],
};

export function authorizeAction(db: Db, actor: UserRow, kind: string, payload: Obj) {
  if (kind !== "profile.update" && !hasPermission(db, actor, CATALOG[kind][0])) throw forbidden();
  if (kind === "profile.update" && Number(payload.id ?? 0) !== actor.id) throw forbidden("Vous ne pouvez modifier que votre propre profil.");
}

const dataOf = (p: Obj): Obj => (isObj(p.data) ? p.data : {});

// ── Produits
async function productColumns(db: Db, d: Obj, ignoreId: number | null, partial: boolean) {
  const v = new V(d);
  const req = !partial;
  const out: Partial<ProductRow> = {};
  const name = v.str("name", { required: req, max: 255 });
  if (name) out.name = name;
  const price = v.num("price", { required: req, min: 0, max: 999999999999 });
  if (price !== null && price !== undefined) out.price = price;
  const cost = v.num("cost", { min: 0, max: 999999999999 });
  if (cost !== null && cost !== undefined) out.cost = cost;
  const unit = v.str("unit", { max: 30 });
  if (unit) out.unit = unit;
  if (v.present("taxRate")) { const t = v.num("taxRate", { min: 0, max: 100 }); out.taxRate = t === null || t === undefined ? null : round(t, 2); }
  const minStock = v.num("minStock", { min: 0, max: 999999999 });
  if (minStock !== null && minStock !== undefined) out.minStock = round(minStock, 3);
  if (v.present("barcode")) {
    const b = v.str("barcode", { max: 50 }) || null;
    if (b && db.products.some(p => p.barcode === b && p.id !== ignoreId)) throw invalid("barcode", "La valeur du champ code-barres est déjà utilisée.");
    out.barcode = b;
  }
  if (v.present("expiryDate")) out.expiryDate = v.date("expiryDate") || null;
  const category = v.str("category", { max: 100 });
  if (category) {
    let c = db.categories.find(x => x.name === category);
    if (!c) { c = { id: nextId(db, "categories"), name: category }; db.categories.push(c); }
    out.categoryId = c.id;
  }
  const stock = v.num("stock", { min: 0, max: 999999999 });
  return { cols: out, stock };
}

// ── Employés
async function userColumns(db: Db, d: Obj, ignoreId: number | null, partial: boolean, onlyProfile = false) {
  const v = new V(d);
  const req = !partial;
  const out: Partial<UserRow> & { password?: string } = {};
  const name = v.str("name", { required: req, max: 255 });
  if (name) out.name = name;
  const email = v.email("email", { required: req && !onlyProfile });
  if (email) {
    const e = email.toLowerCase();
    if (db.users.some(u => u.email.toLowerCase() === e && u.id !== ignoreId)) throw invalid("email", "La valeur du champ e-mail est déjà utilisée.");
    out.email = e;
  }
  if (v.present("phone")) out.phone = v.str("phone", { max: 30 }) || null;
  if (v.present("avatar")) out.avatar = v.str("avatar", { max: 3000000 }) || null;
  const pw = v.str("password", { required: req && !onlyProfile, max: 100 });
  if (pw) {
    if (pw.length < 6) throw invalid("password", "Le champ mot de passe doit contenir au moins 6 caractères.");
    out.salt = randomHex();
    out.passwordHash = await hashPassword(pw, out.salt);
    out.password = pw;
  }
  if (!onlyProfile) {
    const active = v.bool("active");
    if (active !== undefined) out.active = active;
    const roleId = v.int("role", { required: req });
    if (roleId !== null && roleId !== undefined) {
      if (!db.roles.some(r => r.id === roleId)) throw invalid("role", "La valeur sélectionnée pour rôle n'existe pas.");
      out.roleId = roleId;
    }
  }
  delete out.password;
  return out;
}

const activeAdminCount = (db: Db) => db.users.filter(u => u.active && !u.deleted && isAdmin(db, u)).length;

// ── Promotions
function promotionSave(db: Db, data: Obj, existing: PromotionRow | null) {
  const v = new V(data);
  const req = !existing;
  const name = v.str("name", { required: req, max: 255 });
  const type = v.oneOf("type", ["percent", "amount"] as const, { required: req });
  const value = v.num("value", { required: req, gt: 0, max: 999999999999 });
  const scope = v.oneOf("scope", ["all", "category", "product"] as const, { required: req });
  const categoryId = v.int("categoryId");
  const productId = v.int("productId");
  const minQuantity = v.num("minQuantity", { min: 0, max: 999999 });
  const startsOn = v.date("startsOn");
  const endsOn = v.date("endsOn");
  const active = v.bool("active");
  if (categoryId && !db.categories.some(c => c.id === categoryId)) throw invalid("categoryId", "La valeur sélectionnée pour catégorie n'existe pas.");
  if (productId && !activeProduct(db, productId)) throw invalid("productId", "La valeur sélectionnée pour produit n'existe pas.");
  const s0 = startsOn !== undefined ? startsOn : existing?.startsOn ?? null;
  if (endsOn && s0 && endsOn < s0) throw invalid("endsOn", "Le champ date de fin doit être une date postérieure ou égale au date de début.");

  const fScope = scope ?? existing!.scope;
  const fType = type ?? existing!.type;
  const fValue = value ?? existing!.value;
  if (fType === "percent" && fValue > 100) throw invalid("value", "Un pourcentage ne peut pas dépasser 100.");
  const fProduct = productId !== undefined ? productId : existing?.productId ?? null;
  const fCategory = categoryId !== undefined ? categoryId : existing?.categoryId ?? null;
  if (fScope === "product" && !fProduct) throw invalid("productId", "Choisissez le produit concerné.");
  if (fScope === "category" && !fCategory) throw invalid("categoryId", "Choisissez la catégorie concernée.");

  const row: PromotionRow = existing ?? {
    id: nextId(db, "promotions"), name: "", type: "percent", value: 0, scope: "all", categoryId: null, productId: null,
    minQuantity: 0, startsOn: null, endsOn: null, active: true,
  };
  if (name) row.name = name;
  row.type = fType; row.value = fValue; row.scope = fScope;
  if (minQuantity !== undefined) row.minQuantity = minQuantity ?? 0;
  if (startsOn !== undefined) row.startsOn = startsOn || null;
  if (endsOn !== undefined) row.endsOn = endsOn || null;
  if (active !== undefined) row.active = active;
  row.categoryId = fScope === "category" ? fCategory : null;
  row.productId = fScope === "product" ? fProduct : null;
  if (!existing) db.promotions.push(row);
}

/** Exécute l'opération. $author = demandeur (auteur des bons, pertes…), $approver = administrateur qui valide. */
export async function executeAction(db: Db, kind: string, payload: Obj, author: UserRow, approver: UserRow | null, description: string) {
  const by = approver ?? author;
  switch (kind) {
    case "product.add": {
      const { cols, stock } = await productColumns(db, payload, null, false);
      const p: ProductRow = { id: nextId(db, "products"), name: "", categoryId: null, price: 0, cost: 0, taxRate: null, stock: 0, minStock: 0, unit: "pièce", barcode: null, expiryDate: null, ...cols };
      db.products.push(p);
      const initial = round(stock ?? 0, 3);
      if (initial > 0) stockIncrease(db, p.id, initial, { type: "initial", user: author, reason: "Stock initial à la création du produit", refType: "product", refId: p.id });
      break;
    }
    case "product.update": {
      const p = findOr(db.products, payload.id, "Produit");
      const { cols, stock } = await productColumns(db, dataOf(payload), p.id, true);
      Object.assign(p, cols);
      if (stock !== null && stock !== undefined) stockSet(db, p.id, stock, { type: "adjustment", user: author, reason: "Correction depuis la fiche produit", refType: "product", refId: p.id });
      break;
    }
    case "product.delete": {
      const p = findOr(db.products, payload.id, "Produit");
      p.barcode = null; p.deleted = true;
      break;
    }
    case "customer.add":
    case "customer.update": {
      const existing = kind === "customer.update" ? findOr(db.customers, payload.id, "Client") : null;
      const v = new V(existing ? dataOf(payload) : payload);
      const name = v.str("name", { required: !existing, max: 255 });
      const row = existing ?? { id: nextId(db, "customers"), name: "", phone: null, email: null, address: null, totalPurchases: 0, creditLimit: null, createdAt: isoDate() };
      if (name) row.name = name;
      if (v.present("phone")) row.phone = v.str("phone", { max: 30 }) || null;
      if (v.present("email")) row.email = v.email("email") || null;
      if (v.present("address")) row.address = v.str("address", { max: 1000 }) || null;
      if (v.present("creditLimit")) { const c = v.num("creditLimit", { min: 0, max: 999999999999 }); row.creditLimit = c === null || c === undefined ? null : round(c, 2); }
      if (!existing) db.customers.push(row);
      break;
    }
    case "customer.delete": findOr(db.customers, payload.id, "Client").deleted = true; break;
    case "supplier.add":
    case "supplier.update": {
      const existing = kind === "supplier.update" ? (() => { const s = db.suppliers.find(x => x.id === Number(payload.id)); if (!s) throw invalid("id", "Élément introuvable (supprimé entre-temps ?)."); return s; })() : null;
      const v = new V(existing ? dataOf(payload) : payload);
      const name = v.str("name", { required: !existing, max: 255 });
      const row = existing ?? { id: nextId(db, "suppliers"), name: "", contact: null, phone: null, email: null, address: null };
      if (name) row.name = name;
      if (v.present("contact")) row.contact = v.str("contact", { max: 255 }) || null;
      if (v.present("phone")) row.phone = v.str("phone", { max: 30 }) || null;
      if (v.present("email")) row.email = v.email("email") || null;
      if (v.present("address")) row.address = v.str("address", { max: 1000 }) || null;
      if (!existing) db.suppliers.push(row);
      break;
    }
    case "supplier.delete": {
      const id = Number(payload.id);
      if (!db.suppliers.some(s => s.id === id)) throw invalid("id", "Fournisseur introuvable (supprimé entre-temps ?).");
      if (db.purchases.some(p => p.supplierId === id && !p.deleted)) throw invalid("supplier", "Ce fournisseur a des bons d'achat : suppression impossible.");
      db.suppliers = db.suppliers.filter(s => s.id !== id);
      break;
    }
    case "user.add": {
      const cols = await userColumns(db, payload, null, false);
      db.users.push({ id: nextId(db, "users"), name: "", email: "", phone: null, passwordHash: "", salt: "", roleId: 0, avatar: null, createdAt: isoDate(), lastSeen: null, ...cols, active: true });
      break;
    }
    case "user.update": {
      const u = findOr(db.users, payload.id, "Employé");
      const cols = await userColumns(db, dataOf(payload), u.id, true);
      if (isAdmin(db, u)) {
        const losesAdmin = cols.roleId !== undefined && db.roles.find(r => r.id === cols.roleId)?.slug !== "admin";
        const deactivates = cols.active === false;
        if ((losesAdmin || deactivates) && activeAdminCount(db) <= 1) throw invalid("user", "Impossible : c'est le dernier administrateur actif.");
      }
      Object.assign(u, cols);
      // Un compte désactivé ou dont le mot de passe change est déconnecté partout
      if (cols.active === false || cols.passwordHash) db.tokens = db.tokens.filter(t => t.userId !== u.id);
      break;
    }
    case "user.delete": {
      const u = findOr(db.users, payload.id, "Employé");
      if (u.id === by.id) throw invalid("user", "Vous ne pouvez pas supprimer votre propre compte.");
      if (isAdmin(db, u) && activeAdminCount(db) <= 1) throw invalid("user", "Impossible : c'est le dernier administrateur actif.");
      db.tokens = db.tokens.filter(t => t.userId !== u.id);
      Object.assign(u, { active: false, email: `deleted+${u.id}+${Date.now()}@invalid.local`, deleted: true });
      break;
    }
    case "profile.update": {
      const u = findOr(db.users, payload.id, "Employé");
      if (u.id !== author.id) throw forbidden("Vous ne pouvez modifier que votre propre profil.");
      const cols = await userColumns(db, dataOf(payload), u.id, true, true);
      Object.assign(u, cols);
      break;
    }
    case "loss.add": {
      const v = new V(payload);
      const pid = v.int("productId", { required: true }) as number;
      const qty = round(v.num("quantity", { required: true, gt: 0, max: 999999999 }) as number, 3);
      const reason = v.str("reason", { required: true, max: 100 }) as string;
      const date = v.date("date") || isoDate();
      const p = activeProduct(db, pid);
      if (!p) throw invalid("productId", "La valeur sélectionnée pour produit n'existe pas.");
      const loss: LossRow = { id: nextId(db, "losses"), productId: p.id, productName: p.name, quantity: qty, unitPrice: p.cost, total: round(qty * p.cost, 2), reason, notedBy: author.id, autoGenerated: false, date };
      db.losses.push(loss);
      stockDecrease(db, p.id, qty, p.name, { type: "loss", user: author, reason: `Perte : ${reason}`, refType: "loss", refId: loss.id });
      break;
    }
    case "loss.delete": {
      const l = findOr(db.losses, payload.id, "Perte");
      if (l.productId && activeProduct(db, l.productId)) {
        stockIncrease(db, l.productId, l.quantity, { type: "loss_cancel", user: author, reason: `Annulation de la perte « ${l.reason} »`, refType: "loss", refId: l.id });
      }
      l.deleted = true;
      break;
    }
    case "stock.adjust": {
      const v = new V(payload);
      const pid = v.int("productId", { required: true }) as number;
      const delta = v.num("delta", { required: true, min: -999999999, max: 999999999 }) as number;
      const reason = v.str("reason", { max: 200 });
      if (!activeProduct(db, pid)) throw invalid("productId", "La valeur sélectionnée pour produit n'existe pas.");
      stockAdjust(db, pid, delta, { type: "adjustment", user: author, reason: reason || "Ajustement manuel du stock" });
      break;
    }
    case "inventory.do": {
      const v = new V(payload);
      const period = v.oneOf("period", ["Semaine", "Mois"] as const, { required: true }) as string;
      const counts = v.arr("counts", { required: true, min: 1 });
      const session = { id: nextId(db, "inventorySessions"), period, userId: author.id, date: isoDate() };
      db.inventorySessions.push(session);
      counts.forEach((c, i) => {
        if (!isObj(c)) throw invalid(`counts.${i}`, "Comptage invalide.");
        const cv = new V(c);
        const pid = cv.int("productId", { required: true }) as number;
        const actual = round(cv.num("actual", { required: true }) as number, 3);
        if (actual < 0) throw invalid("counts", "Une quantité comptée est négative.");
        const p = activeProduct(db, pid);
        if (!p) return; // produit supprimé entre-temps : ligne ignorée
        db.inventoryItems.push({ id: nextId(db, "inventoryItems"), sessionId: session.id, productId: p.id, productName: p.name, expected: p.stock, actual });
        stockSet(db, p.id, actual, { type: "inventory", user: author, reason: `Inventaire ${period} : stock compté`, refType: "inventory", refId: session.id });
      });
      break;
    }
    case "purchase.add": {
      const v = new V(payload);
      const supplierId = v.int("supplierId", { required: true }) as number;
      assertSupplier(db, supplierId);
      const items = purchaseLines(db, v.arr("items", { required: true, min: 1, max: 500 }));
      const p: PurchaseRow = {
        id: nextId(db, "purchases"), reference: nextNumber("BA", db.purchases.map(x => x.reference)), supplierId, userId: author.id,
        date: isoDate(), items, ...purchaseTotals(items),
      };
      db.purchases.push(p);
      applyPurchase(db, p, author);
      break;
    }
    case "purchase.update": {
      const p = findOr(db.purchases, payload.id, "Bon d'achat");
      const v = new V(dataOf(payload));
      const supplierId = v.int("supplierId", { required: true }) as number;
      assertSupplier(db, supplierId);
      const items = purchaseLines(db, v.arr("items", { required: true, min: 1, max: 500 }));
      reversePurchase(db, p, author);
      Object.assign(p, { supplierId, items, ...purchaseTotals(items) });
      applyPurchase(db, p, author);
      break;
    }
    case "purchase.delete": {
      const p = findOr(db.purchases, payload.id, "Bon d'achat");
      reversePurchase(db, p, author);
      p.deleted = true;
      break;
    }
    case "sale.return": {
      const v = new V(payload);
      const saleId = v.int("saleId", { required: true }) as number;
      const items = v.arr("items", { required: true, min: 1, max: 200 }).map((it, i) => {
        if (!isObj(it)) throw invalid(`items.${i}`, "Article invalide.");
        const iv = new V(it);
        return { saleItemId: iv.int("saleItemId", { required: true }) as number, quantity: iv.num("quantity", { required: true, gt: 0, max: 999999 }) as number };
      });
      const sale = db.sales.find(x => x.id === saleId);
      if (!sale) throw invalid("id", "Vente introuvable (supprimé entre-temps ?).");
      createReturn(db, author, sale, items, v.bool("restock") ?? true, v.str("refundMethod", { max: 50 }) ?? null, v.str("reason", { max: 255 }) ?? null);
      break;
    }
    case "promotion.add": promotionSave(db, payload, null); break;
    case "promotion.update": promotionSave(db, dataOf(payload), findOr(db.promotions, payload.id, "Promotion")); break;
    case "promotion.delete": {
      const p = findOr(db.promotions, payload.id, "Promotion");
      db.promotions = db.promotions.filter(x => x.id !== p.id);
      break;
    }
    default: throw invalid("kind", "La valeur sélectionnée pour type n'est pas valide.");
  }

  // Annonces (comme ActionService::announce)
  const page = pageFor(kind);
  if (BROADCAST.includes(kind)) {
    const [module, verb] = LABELS[kind] ?? ["Général", kind];
    const suffix = approver && approver.id !== author.id ? `demandé par ${author.name}, approuvé par ${approver.name}` : `par ${author.name}`;
    notifyAll(db, `${module} — ${verb}`, `${description !== "" ? description : `${module} : ${verb}`} (${suffix}).`, "info", by, page);
  }
  const target = Number(payload.id ?? 0);
  if (kind === "user.update" && target && target !== by.id) {
    notifyUser(db, target, "Votre profil a été modifié", `Des informations de votre compte ont été mises à jour par ${by.name}.`, "info", by, "myspace");
  }
}

// ═════════════════════════ Circuit de validation (PendingActionService) ═════════════════════════

export function submitPending(db: Db, actor: UserRow, kind: string, meta: Obj, payload: Obj): PendingRow {
  const pa: PendingRow = {
    id: nextId(db, "pendingActions"), kind, module: String(meta.module ?? "Général"), action: String(meta.action ?? kind),
    description: String(meta.description ?? ""), details: isObj(meta.details) ? meta.details : {}, payload,
    requestedBy: actor.id, date: isoDate(), status: "pending", reviewedBy: null, reviewedAt: null, rejectReason: null,
  };
  db.pendingActions.push(pa);
  notifyAdmins(db, "Nouvelle demande en attente", `${actor.name} demande : « ${pa.action} » — ${pa.description}`, "warning", actor, "myspace");
  return pa;
}

export async function approvePending(db: Db, pa: PendingRow, admin: UserRow) {
  if (pa.status !== "pending") throw invalid("status", "Cette demande a déjà été traitée.");
  const requester = db.users.find(u => u.id === pa.requestedBy);
  if (!requester || !requester.active || requester.deleted) throw invalid("status", "L'employé demandeur n'est plus actif : refusez la demande.");
  await executeAction(db, pa.kind, pa.payload, requester, admin, pa.description);
  Object.assign(pa, { status: "approved", reviewedBy: admin.id, reviewedAt: nowIso() });
  notifyUser(db, requester.id, "Demande approuvée ✓", `Votre demande « ${pa.action} » (${pa.description}) a été approuvée et appliquée par ${admin.name}.`, "success", admin, pageFor(pa.kind));
}

export function rejectPending(db: Db, pa: PendingRow, admin: UserRow, reason: string | null) {
  if (pa.status !== "pending") throw invalid("status", "Cette demande a déjà été traitée.");
  Object.assign(pa, { status: "rejected", reviewedBy: admin.id, reviewedAt: nowIso(), rejectReason: reason });
  notifyUser(db, pa.requestedBy, "Demande refusée ✗", `Votre demande « ${pa.action} » (${pa.description}) a été refusée par ${admin.name}${reason ? ` : ${reason}` : "."}`, "error", admin, "myspace");
}

// ═════════════════════════ Rôles ═════════════════════════

export function roleData(db: Db, body: Obj, ignoreId: number | null) {
  const v = new V(body);
  const name = v.str("name", { required: true, max: 100 }) as string;
  if (db.roles.some(r => r.name === name && r.id !== ignoreId)) throw invalid("name", "La valeur du champ nom est déjà utilisée.");
  const description = v.str("description", { max: 500 }) ?? null;
  const perms = v.arr("permissions", { required: true });
  perms.forEach(p => { if (!(PERMISSIONS as readonly string[]).includes(String(p))) throw invalid("permissions", "La valeur sélectionnée pour permissions n'est pas valide."); });
  return { name, description: description ?? "", permissions: Array.from(new Set(perms.map(String))) };
}

export function uniqueSlug(db: Db, name: string) {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "role";
  let slug = base, i = 2;
  while (db.roles.some(r => r.slug === slug)) slug = `${base}-${i++}`;
  return slug;
}

export { has, blank };
