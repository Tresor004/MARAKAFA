/** Tableau de bord et statistiques : portage de DashboardController et StatsController (montants nets des retours). */
import type { Db, SaleRow } from "./db";
import { isoDate, round } from "./db";
import { invalid } from "./http";
import * as P from "./present";

const net = (s: SaleRow) => s.total - s.returnedTotal;
const parse = (d: string) => new Date(d + "T12:00:00");
const addDays = (d: string, n: number) => { const x = parse(d); x.setDate(x.getDate() + n); return isoDate(x); };
const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);

export function dashboard(db: Db, q: URLSearchParams) {
  const date = q.get("date") || isoDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw invalid("date", "Le champ date ne correspond pas au format Y-m-d.");
  const weekAgo = addDays(isoDate(), -7);
  const sales = db.sales;
  const day = sales.filter(s => s.date === date);
  const week = sales.filter(s => s.date >= weekAgo);
  const products = db.products.filter(p => !p.deleted);

  const top = new Map<string, { name: string; qty: number; total: number }>();
  sales.forEach(s => s.items.forEach(i => {
    const kept = i.quantity - i.returnedQuantity;
    const r = top.get(i.name) ?? { name: i.name, qty: 0, total: 0 };
    r.qty += kept; r.total += i.quantity ? (i.total * kept) / i.quantity : 0;
    top.set(i.name, r);
  }));

  const today = isoDate();
  const in15 = addDays(today, 15), ago30 = addDays(today, -30);

  return {
    date,
    totalRevenue: round(sales.reduce((a, s) => a + net(s), 0)),
    salesCount: sales.length,
    dayRevenue: round(day.reduce((a, s) => a + net(s), 0)),
    daySalesCount: day.length,
    weekRevenue: round(week.reduce((a, s) => a + net(s), 0)),
    weekSalesCount: week.length,
    receivables: round(sales.reduce((a, s) => a + s.balanceDue, 0)),
    debtorsCount: new Set(sales.filter(s => s.balanceDue > 0.004 && s.customerId).map(s => s.customerId)).size,
    purchasesTotal: round(db.purchases.filter(p => !p.deleted).reduce((a, p) => a + p.total, 0)),
    purchasesCount: db.purchases.filter(p => !p.deleted).length,
    topProducts: [...top.values()].sort((a, b) => b.total - a.total).slice(0, 5).map(r => ({ ...r, total: round(r.total) })),
    lowStockCount: products.filter(p => p.stock <= p.minStock).length,
    expiringCount: products.filter(p => p.expiryDate && p.expiryDate <= in15 && p.expiryDate >= ago30).length,
    productsCount: products.length,
    customersCount: db.customers.filter(c => !c.deleted).length,
    suppliersCount: db.suppliers.length,
    lossesCount: db.losses.filter(l => !l.deleted).length,
    recentSales: [...sales].sort((a, b) => b.id - a.id).slice(0, 6).map(s => P.sale(db, s)),
  };
}

// ───────────────────────── Statistiques ─────────────────────────

interface Daily { revenue: number; tax: number; cogs: number; quantity: number; discounts: number; count: number }
const emptyDaily = (): Daily => ({ revenue: 0, tax: 0, cogs: 0, quantity: 0, discounts: 0, count: 0 });

function aggregate(db: Db, from: string, to: string) {
  const sales = db.sales.filter(s => s.date >= from && s.date <= to);
  const daily: Record<string, Daily> = {};
  const byCat = new Map<string, { rev: number; tax: number; cogs: number; qty: number }>();
  const byProd = new Map<string, { rev: number; tax: number; cogs: number; qty: number }>();
  const add = (m: Map<string, { rev: number; tax: number; cogs: number; qty: number }>, k: string, rev: number, tax: number, cogs: number, qty: number) => {
    const r = m.get(k) ?? { rev: 0, tax: 0, cogs: 0, qty: 0 };
    r.rev += rev; r.tax += tax; r.cogs += cogs; r.qty += qty; m.set(k, r);
  };

  sales.forEach(s => {
    const d = (daily[s.date] ??= emptyDaily());
    d.count += 1;
    s.items.forEach(i => {
      const kept = i.quantity - i.returnedQuantity;
      const share = i.quantity ? kept / i.quantity : 0;
      const rev = i.total * share, tax = i.taxAmount * share, cogs = i.cost * kept;
      d.revenue += rev; d.tax += tax; d.cogs += cogs; d.quantity += kept; d.discounts += i.discountAmount * share;
      const product = db.products.find(p => p.id === i.productId);
      const cat = db.categories.find(c => c.id === product?.categoryId)?.name ?? "Sans catégorie";
      add(byCat, cat, rev, tax, cogs, kept);
      add(byProd, i.name, rev, tax, cogs, kept);
    });
  });

  const sum = (k: keyof Daily) => Object.values(daily).reduce((a, d) => a + d[k], 0);
  const revenue = round(sum("revenue")), tax = round(sum("tax")), cogs = round(sum("cogs"));
  const revenueHt = round(revenue - tax), margin = round(revenueHt - cogs), count = sum("count");

  const totals = {
    revenue, tax, revenueHt, cogs, margin,
    marginPct: revenueHt > 0 ? round((margin / revenueHt) * 100, 1) : 0,
    salesCount: count, avgBasket: count > 0 ? round(revenue / count) : 0,
    quantity: round(sum("quantity"), 3), discounts: round(sum("discounts")),
    returns: round(db.saleReturns.filter(r => r.date >= from && r.date <= to).reduce((a, r) => a + r.total, 0)),
  };

  const shape = (key: "category" | "name", name: string, r: { rev: number; tax: number; cogs: number; qty: number }) => {
    const ht = round(r.rev - r.tax);
    return { [key]: name, revenue: round(r.rev), revenueHt: ht, cogs: round(r.cogs), margin: round(ht - r.cogs), marginPct: ht > 0 ? round(((ht - r.cogs) / ht) * 100, 1) : 0, quantity: round(r.qty, 3) };
  };

  const byCategory = [...byCat.entries()].map(([k, r]) => shape("category", k, r) as ReturnType<typeof shape> & { category: string })
    .filter(c => c.quantity > 0 || c.revenue > 0).sort((a, b) => b.revenueHt - a.revenueHt);
  const topProducts = [...byProd.entries()].map(([k, r]) => shape("name", k, r)).filter(c => c.quantity > 0)
    .sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  const pay = new Map<string, { method: string; count: number; revenue: number }>();
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0, revenue: 0 }));
  const cashiers = new Map<string, { name: string; count: number; revenue: number }>();
  sales.forEach(s => {
    const p = pay.get(s.paymentMethod) ?? { method: s.paymentMethod, count: 0, revenue: 0 };
    p.count += 1; p.revenue += net(s); pay.set(s.paymentMethod, p);
    const h = new Date(s.createdAt).getHours();
    hours[h].count += 1; hours[h].revenue += net(s);
    const name = db.users.find(u => u.id === s.userId)?.name ?? "—";
    const c = cashiers.get(name) ?? { name, count: 0, revenue: 0 };
    c.count += 1; c.revenue += net(s); cashiers.set(name, c);
  });

  return {
    daily, totals, byCategory, topProducts,
    byPayment: [...pay.values()].map(p => ({ ...p, revenue: round(p.revenue) })).sort((a, b) => b.revenue - a.revenue),
    byHour: hours.map(h => ({ ...h, revenue: round(h.revenue) })),
    byCashier: [...cashiers.values()].map(c => ({ ...c, revenue: round(c.revenue) })).sort((a, b) => b.revenue - a.revenue),
  };
}

/** Semaine ISO (lundi = début) */
function isoWeek(d: Date): { week: number; monday: Date } {
  const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const thursday = new Date(monday); thursday.setDate(monday.getDate() + 3);
  const jan4 = new Date(thursday.getFullYear(), 0, 4);
  const week = 1 + Math.round(((thursday.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  return { week, monday };
}

const dm = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

function series(daily: Record<string, Daily>, from: string, to: string, gran: string) {
  const buckets = new Map<string, { key: string; label: string; revenue: number; tax: number; cogs: number; count: number }>();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const date = parse(d);
    let key: string, label: string;
    if (gran === "week") { const w = isoWeek(date); key = isoDate(w.monday); label = `S${w.week} · ${dm(w.monday)}`; }
    else if (gran === "month") { key = d.slice(0, 7); label = date.toLocaleDateString("fr-FR", { month: "short", year: "numeric" }); }
    else { key = d; label = dm(date); }
    const b = buckets.get(key) ?? { key, label, revenue: 0, tax: 0, cogs: 0, count: 0 };
    const row = daily[d];
    if (row) { b.revenue += row.revenue; b.tax += row.tax; b.cogs += row.cogs; b.count += row.count; }
    buckets.set(key, b);
  }
  return [...buckets.values()].map(b => ({ key: b.key, label: b.label, revenue: round(b.revenue), margin: round(b.revenue - b.tax - b.cogs), count: b.count }));
}

export function stats(db: Db, q: URLSearchParams) {
  const to = q.get("to") || isoDate();
  const from = q.get("from") || addDays(to, -29);
  if (from > to) throw invalid("to", "Le champ date de fin doit être une date postérieure ou égale au date de début.");
  if (daysBetween(from, to) > 1100) throw invalid("from", "Période trop longue (3 ans maximum).");
  const days = daysBetween(from, to) + 1;
  const compare = q.get("compare") || "previous";
  let gran = q.get("granularity") || "auto";
  if (gran === "auto") gran = days <= 45 ? "day" : days <= 200 ? "week" : "month";

  const shiftYear = (d: string) => { const x = parse(d); x.setFullYear(x.getFullYear() - 1); return isoDate(x); };
  const prevTo = compare === "year" ? shiftYear(to) : addDays(from, -1);
  const prevFrom = compare === "year" ? shiftYear(from) : addDays(prevTo, -(days - 1));

  const cur = aggregate(db, from, to);
  const prev = compare === "none" ? null : aggregate(db, prevFrom, prevTo);
  const curSeries = series(cur.daily, from, to, gran);
  const prevSeries = prev ? series(prev.daily, prevFrom, prevTo, gran) : [];
  const seriesOut = curSeries.map((p, i) => ({
    ...p, previousRevenue: prevSeries[i]?.revenue ?? null, previousMargin: prevSeries[i]?.margin ?? null, previousLabel: prevSeries[i]?.label ?? null,
  }));

  const t = cur.totals, pt = prev?.totals ?? null;
  const delta: Record<string, number | null> = {};
  if (pt) {
    (["revenue", "revenueHt", "margin", "salesCount", "avgBasket", "quantity", "discounts", "returns"] as const).forEach(k => {
      delta[k] = pt[k] > 0 ? round(((t[k] - pt[k]) / pt[k]) * 100, 1) : null;
    });
    delta.marginPct = round(t.marginPct - pt.marginPct, 1);
  }
  const prevCat = new Map((prev?.byCategory ?? []).map(c => [c.category, c]));

  return {
    period: { from, to, days, granularity: gran },
    previous: prev ? { from: prevFrom, to: prevTo } : null,
    totals: t, previousTotals: pt, delta, series: seriesOut,
    byCategory: cur.byCategory.map(c => ({
      ...c, share: t.revenueHt > 0 ? round((c.revenueHt / t.revenueHt) * 100, 1) : 0,
      previousRevenueHt: prevCat.get(c.category)?.revenueHt ?? null,
    })),
    topProducts: cur.topProducts, byPayment: cur.byPayment, byHour: cur.byHour, byCashier: cur.byCashier,
    receivables: round(db.sales.reduce((a, s) => a + s.balanceDue, 0)),
  };
}
