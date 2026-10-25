import { useMemo, useState } from "react";
import { useStore, fmtCurrency, fmtDate } from "../store";
import { Card, Button, Modal, inputClass, EmptyState, Badge, useToast, useConfirm } from "../components/ui";
import { IconPlus, IconMinus, IconPrinter, IconSearch } from "../components/Icons";
import { printHtml } from "../utils/print";
import { buildCountSheet, buildResultSheet, periodLabel, ResultSheetLine } from "../utils/inventorySheets";
import type { InventoryCount, Product } from "../types";

// ───────────────────────── Période d'analyse (mêmes repères que les Statistiques) ─────────────────────────
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const shiftIso = (s: string, days: number) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + days); return iso(d); };
const daysBetween = (a: string, b: string) => Math.round((new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) / 86400000) + 1;

const PRESETS: { id: string; label: string; range: () => [string, string] }[] = [
  { id: "30", label: "30 jours", range: () => [daysAgo(29), daysAgo(0)] },
  { id: "month", label: "Ce mois", range: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth(), 1)), iso(n)]; } },
  { id: "lastmonth", label: "Mois dernier", range: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)), iso(new Date(n.getFullYear(), n.getMonth(), 0))]; } },
  { id: "90", label: "90 jours", range: () => [daysAgo(89), daysAgo(0)] },
  { id: "365", label: "12 mois", range: () => [daysAgo(364), daysAgo(0)] },
];

type CountType = "Semaine" | "Mois";

const fmtQty = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(n);
const pct = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",") + " %";
const signedMoney = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmtCurrency(Math.abs(n));

/** Montant abrégé pour les axes : 1,2 M · 350 k */
const compact = (n: number) => {
  const a = Math.abs(n);
  const f = (v: number) => String(Math.round(v * 10) / 10).replace(".", ",");
  if (a >= 1e6) return f(n / 1e6) + " M";
  if (a >= 1e3) return f(n / 1e3) + " k";
  return String(Math.round(n));
};

const Delta = ({ v, suffix = "%", invert = false }: { v: number | null | undefined; suffix?: string; invert?: boolean }) => {
  if (v === null || v === undefined || !isFinite(v)) return <span className="text-[11px] text-slate-400">—</span>;
  const r = Math.round(v * 10) / 10;
  const good = invert ? r < 0 : r > 0;
  return <Badge tone={r === 0 ? "slate" : good ? "emerald" : "rose"}>{r > 0 ? "▲" : r < 0 ? "▼" : "="} {String(Math.abs(r)).replace(".", ",")}{suffix}</Badge>;
};

// ───────────────────────── Sessions d'inventaire (lignes regroupées) ─────────────────────────
interface SessionLine extends InventoryCount { category: string; unit: string; cost: number }
interface Session {
  id: string; date: string; period: string; userName: string | null;
  lines: SessionLine[]; withDiff: number; missing: number; extra: number; net: number; accuracy: number;
}

function summarize(id: string, lines: SessionLine[]): Session {
  const first = lines[0];
  const withDiff = lines.filter(l => l.difference !== 0).length;
  const missing = lines.reduce((a, l) => a + (l.difference < 0 ? -l.difference * l.cost : 0), 0);
  const extra = lines.reduce((a, l) => a + (l.difference > 0 ? l.difference * l.cost : 0), 0);
  return {
    id, date: first.date, period: first.period, userName: first.userName ?? null, lines,
    withDiff, missing, extra, net: extra - missing,
    accuracy: lines.length ? ((lines.length - withDiff) / lines.length) * 100 : 100,
  };
}

// ───────────────────────── Graphique des écarts par inventaire (SVG sans dépendance) ─────────────────────────
function DiscrepancyChart({ sessions }: { sessions: Session[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 760, H = 260, L = 64, R = 12, T = 12, B = 34;
  const iw = W - L - R, ih = H - T - B;
  const maxV = Math.max(1, ...sessions.map(s => Math.max(s.extra, s.missing)));
  const zero = T + ih / 2;
  const y = (v: number) => zero - (v / maxV) * (ih / 2);
  const x = (i: number) => L + (iw * (i + 0.5)) / sessions.length;
  const bw = Math.max(4, Math.min(30, (iw / sessions.length) * 0.55));
  const every = Math.max(1, Math.ceil(sessions.length / 9));
  const hs = hover !== null ? sessions[hover] : null;

  return (
    <div>
      <div className="min-h-[3.25rem] text-xs text-slate-600 mb-2" aria-live="polite">
        {hs ? (
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <span className="font-bold text-slate-900">{fmtDate(hs.date)} · {hs.period}</span>
            <span>Manquants : <b className="text-rose-600">{fmtCurrency(hs.missing)}</b></span>
            <span>Excédents : <b className="text-emerald-700">{fmtCurrency(hs.extra)}</b></span>
            <span>{hs.withDiff} écart{hs.withDiff > 1 ? "s" : ""} sur {hs.lines.length} articles</span>
            <span>Exactitude : <b>{pct(hs.accuracy)}</b></span>
          </div>
        ) : <span className="text-slate-400">Survolez ou touchez une barre pour voir le détail.</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" role="img" aria-label="Valeur des écarts par inventaire">
        {[-1, -0.5, 0, 0.5, 1].map(f => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={y(f * maxV)} y2={y(f * maxV)} stroke={f === 0 ? "#94a3b8" : "#e2e8f0"} strokeWidth="1" />
            <text x={L - 8} y={y(f * maxV) + 4} textAnchor="end" fontSize="11" fill="#64748b">{f === 0 ? "0" : (f > 0 ? "+" : "−") + compact(Math.abs(f) * maxV)}</text>
          </g>
        ))}
        {sessions.map((s, i) => (
          <g key={s.id}>
            <rect x={x(i) - bw / 2} y={y(s.extra)} width={bw} height={Math.max(0, zero - y(s.extra))} rx="2" fill={hover === i ? "#047857" : "#059669"} />
            <rect x={x(i) - bw / 2} y={zero} width={bw} height={Math.max(0, y(-s.missing) - zero)} rx="2" fill={hover === i ? "#be123c" : "#e11d48"} />
            {(i % every === 0 || i === sessions.length - 1) && <text x={x(i)} y={H - 12} textAnchor="middle" fontSize="10.5" fill="#64748b">{fmtDate(s.date).slice(0, 5)}</text>}
            <rect x={x(i) - iw / sessions.length / 2} y={T} width={iw / sessions.length} height={ih} fill="transparent"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(h => (h === i ? null : h))} onClick={() => setHover(i)} />
          </g>
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-600 mt-1">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block w-3 h-3 rounded-sm bg-emerald-600" /> Excédents (compté &gt; théorique)</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block w-3 h-3 rounded-sm bg-rose-600" /> Manquants (compté &lt; théorique)</span>
      </div>
    </div>
  );
}

export default function Inventory() {
  const { products, losses, inventory, categories, shopSettings: ss, requestOrExec, currentUser } = useStore();
  const { push } = useToast();
  const confirm = useConfirm();

  // Filtres (barre identique à celle des Statistiques)
  const [preset, setPreset] = useState("90");
  const [from, setFrom] = useState(PRESETS[3].range()[0]);
  const [to, setTo] = useState(PRESETS[3].range()[1]);
  const [typeFilter, setTypeFilter] = useState<"all" | CountType>("all");
  const [category, setCategory] = useState("");
  const pickPreset = (id: string) => { const p = PRESETS.find(x => x.id === id); if (!p) return; const [f, t] = p.range(); setPreset(id); setFrom(f); setTo(t); };

  // Comptage
  const [open, setOpen] = useState(false);
  const [countType, setCountType] = useState<CountType>("Semaine");
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [lastSaved, setLastSaved] = useState<{ lines: ResultSheetLine[]; period: string; date: string } | null>(null);

  // Impression d'une fiche de comptage vierge
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetType, setSheetType] = useState<CountType>("Semaine");
  const [sheetCategory, setSheetCategory] = useState("");
  const [sheetShowExpected, setSheetShowExpected] = useState(false);

  // Détail d'un inventaire de l'historique
  const [detail, setDetail] = useState<Session | null>(null);

  const productById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const inCategory = (cat: string) => !category || cat === category;

  // ------- Sessions d'inventaire enrichies (catégorie, unité, coût actuel du produit)
  const sessions = useMemo(() => {
    const groups = new Map<string, SessionLine[]>();
    inventory.forEach(r => {
      const p = productById.get(r.productId);
      const line: SessionLine = { ...r, category: p?.category ?? "", unit: p?.unit ?? "", cost: p?.cost ?? 0 };
      const key = r.sessionId || `${r.date}|${r.period}`;
      groups.set(key, [...(groups.get(key) ?? []), line]);
    });
    return [...groups.entries()].map(([id, lines]) => summarize(id, lines))
      .sort((a, b) => b.date.localeCompare(a.date) || Number(b.id) - Number(a.id));
  }, [inventory, productById]);

  // Sessions filtrées (période, type, catégorie) — recalculées sur les seules lignes de la catégorie choisie
  const filterSessions = (f: string, t: string) => sessions
    .filter(s => s.date >= f && s.date <= t && (typeFilter === "all" || s.period === typeFilter))
    .map(s => category ? summarize(s.id, s.lines.filter(l => l.category === category)) : s)
    .filter(s => s.lines.length > 0);

  const periodDays = daysBetween(from, to);
  const prevFrom = shiftIso(from, -periodDays), prevTo = shiftIso(from, -1);
  const current = useMemo(() => filterSessions(from, to), [sessions, from, to, typeFilter, category]); // eslint-disable-line react-hooks/exhaustive-deps
  const previous = useMemo(() => filterSessions(prevFrom, prevTo), [sessions, prevFrom, prevTo, typeFilter, category]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------- Indicateurs
  const kpis = useMemo(() => {
    const list = products.filter(p => inCategory(p.category));
    const stockCost = list.reduce((a, p) => a + Math.max(0, p.stock) * p.cost, 0);
    const stockSale = list.reduce((a, p) => a + Math.max(0, p.stock) * p.price, 0);
    const units = list.reduce((a, p) => a + Math.max(0, p.stock), 0);
    const low = list.filter(p => p.stock > 0 && p.stock <= p.minStock).length;
    const out = list.filter(p => p.stock <= 0).length;

    const agg = (ss: Session[]) => {
      const lines = ss.reduce((a, s) => a + s.lines.length, 0);
      const withDiff = ss.reduce((a, s) => a + s.withDiff, 0);
      return {
        count: ss.length, lines, withDiff,
        missing: ss.reduce((a, s) => a + s.missing, 0), extra: ss.reduce((a, s) => a + s.extra, 0),
        accuracy: lines ? ((lines - withDiff) / lines) * 100 : null,
      };
    };
    const lossTotal = (f: string, t: string) => losses
      .filter(l => l.date >= f && l.date <= t && inCategory(productById.get(l.productId)?.category ?? ""))
      .reduce((a, l) => ({ total: a.total + l.total, count: a.count + 1 }), { total: 0, count: 0 });

    const cur = agg(current), prev = agg(previous);
    const lossCur = lossTotal(from, to), lossPrev = lossTotal(prevFrom, prevTo);
    return {
      stockCost, stockSale, units, refs: list.length, low, out, cur, prev, lossCur,
      accuracyDelta: cur.accuracy !== null && prev.accuracy !== null ? cur.accuracy - prev.accuracy : null,
      lossDelta: lossPrev.total > 0 ? ((lossCur.total - lossPrev.total) / lossPrev.total) * 100 : null,
      missingDelta: prev.missing > 0 ? ((cur.missing - prev.missing) / prev.missing) * 100 : null,
    };
  }, [products, losses, current, previous, category, from, to, prevFrom, prevTo, productById]); // eslint-disable-line react-hooks/exhaustive-deps

  // Valeur du stock par catégorie
  const byCategory = useMemo(() => {
    const m = new Map<string, { cost: number; sale: number; units: number; refs: number; low: number }>();
    products.filter(p => inCategory(p.category)).forEach(p => {
      const k = p.category || "Sans catégorie";
      const r = m.get(k) ?? { cost: 0, sale: 0, units: 0, refs: 0, low: 0 };
      r.cost += Math.max(0, p.stock) * p.cost; r.sale += Math.max(0, p.stock) * p.price;
      r.units += Math.max(0, p.stock); r.refs += 1; if (p.stock <= p.minStock) r.low += 1;
      m.set(k, r);
    });
    const total = [...m.values()].reduce((a, r) => a + r.cost, 0);
    return [...m.entries()].map(([name, r]) => ({ name, ...r, share: total > 0 ? (r.cost / total) * 100 : 0 }))
      .sort((a, b) => b.cost - a.cost);
  }, [products, category]); // eslint-disable-line react-hooks/exhaustive-deps
  const maxCatCost = Math.max(1, ...byCategory.map(c => c.cost));

  // Produits aux écarts les plus importants (cumul sur la période)
  const topDiscrepancies = useMemo(() => {
    const m = new Map<string, { name: string; times: number; qty: number; value: number; unit: string }>();
    current.forEach(s => s.lines.filter(l => l.difference !== 0).forEach(l => {
      const k = l.productId || l.productName;
      const r = m.get(k) ?? { name: l.productName, times: 0, qty: 0, value: 0, unit: l.unit };
      r.times += 1; r.qty += l.difference; r.value += l.difference * l.cost;
      m.set(k, r);
    }));
    return [...m.values()].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 8);
  }, [current]);

  const chartSessions = useMemo(() => [...current].reverse().slice(-30), [current]);

  // ------- Impressions
  const printCountSheet = () => {
    const list = products.filter(p => !sheetCategory || p.category === sheetCategory);
    printHtml(buildCountSheet({
      ss, period: sheetType, showExpected: sheetShowExpected, categoryLabel: sheetCategory || "Toutes",
      products: list.map(p => ({ name: p.name, category: p.category, barcode: p.barcode, unit: p.unit, stock: p.stock })),
    }), "Fiche de comptage");
    setSheetOpen(false);
  };

  const printSession = (s: Session, onlyDiscrepancies = false) => printHtml(buildResultSheet({
    ss, period: s.period, date: s.date, userName: s.userName, onlyDiscrepancies,
    lines: s.lines.map(l => ({ name: l.productName, category: l.category, unit: l.unit, expected: l.expected, actual: l.actual, cost: l.cost })),
  }), "Fiche d'inventaire");

  const countLines = (): ResultSheetLine[] => products.map(p => ({
    name: p.name, category: p.category, unit: p.unit, expected: p.stock, actual: counts[p.id] ?? p.stock, cost: p.cost,
  }));

  // ------- Comptage physique
  const startInventory = () => {
    setCounts(Object.fromEntries(products.map(p => [p.id, p.stock])));
    setSearch("");
    setOpen(true);
  };

  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  const countSummary = useMemo(() => {
    const totalExpected = products.reduce((a, b) => a + b.stock * b.cost, 0);
    const totalActual = products.reduce((a, b) => a + (counts[b.id] ?? b.stock) * b.cost, 0);
    const withDiff = products.filter(p => (counts[p.id] ?? p.stock) !== p.stock).length;
    return { totalExpected, totalActual, diff: totalActual - totalExpected, withDiff };
  }, [products, counts]);

  const saveInventory = async () => {
    // Garde-fou contre les fautes de frappe (ex. « 7272 » au lieu de « 72 »)
    const suspicious = products.filter(p => (counts[p.id] ?? p.stock) > p.stock * 5 + 20);
    if (suspicious.length > 0) {
      const ok = await confirm({
        title: "Quantités inhabituelles",
        message: `Ces quantités sont très supérieures au stock théorique : ${suspicious.slice(0, 5).map(p => `${p.name} (${fmtQty(counts[p.id] ?? p.stock)} au lieu de ${fmtQty(p.stock)})`).join(", ")}${suspicious.length > 5 ? "…" : ""}. Valider quand même ?`,
        confirmLabel: "Valider quand même",
      });
      if (!ok) return;
    }
    const entries = products.map(p => ({ productId: p.id, productName: p.name, expected: p.stock, actual: counts[p.id] ?? p.stock }));
    const ok = await requestOrExec({
      kind: "inventory.do", module: "Inventaire", action: `Inventaire ${periodLabel(countType)}`,
      description: `${products.length} articles comptés — ${countSummary.withDiff > 0 ? countSummary.withDiff + " écart(s)" : "Aucun écart"}`,
      details: { articles: String(products.length), écarts: String(countSummary.withDiff), période: countType },
      payload: { counts: entries, period: countType },
    });
    if (ok === "error") return;
    push(ok === "done" ? `Inventaire ${periodLabel(countType)} validé (${products.length} articles)` : "Action en attente de validation par l'administrateur");
    if (ok === "done") setLastSaved({ lines: countLines(), period: countType, date: iso(new Date()) });
    setOpen(false);
  };

  const kpi = (label: string, value: string, sub: string, delta?: React.ReactNode, valueTone = "text-slate-900") => (
    <Card className="p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-base sm:text-2xl font-black mt-1 truncate ${valueTone}`}>{value}</p>
      <div className="flex items-center justify-between mt-2 gap-2 min-h-[1.5rem]">
        <span className="text-[11px] text-slate-500 truncate">{sub}</span>
        {delta}
      </div>
    </Card>
  );
  const k = kpis;
  const lastSession = current[0];

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900">Inventaire</h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">Valeur du stock, comptages et écarts · {sessions.length} inventaire{sessions.length > 1 ? "s" : ""} enregistré{sessions.length > 1 ? "s" : ""}</p>
        </div>
        <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto">
          <Button variant="outline" onClick={() => { setSheetType(countType); setSheetOpen(true); }} className="whitespace-nowrap"><IconPrinter size={16} /> Fiche de comptage</Button>
          <Button onClick={startInventory} className="whitespace-nowrap"><IconPlus size={16} /> Nouveau comptage</Button>
        </div>
      </div>

      {/* Filtres */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Période">
          {PRESETS.map(p => (
            <button key={p.id} onClick={() => pickPreset(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${preset === p.id ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-700 hover:border-slate-400"}`}>{p.label}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs text-slate-600">
          <label className="flex flex-col gap-1">Du<input type="date" lang="fr-FR" max={to} className={inputClass + " !py-1.5 !text-xs"} value={from} onChange={e => { if (e.target.value) { setFrom(e.target.value); setPreset(""); } }} /></label>
          <label className="flex flex-col gap-1">Au<input type="date" lang="fr-FR" min={from} className={inputClass + " !py-1.5 !text-xs"} value={to} onChange={e => { if (e.target.value) { setTo(e.target.value); setPreset(""); } }} /></label>
          <label className="flex flex-col gap-1">Type d'inventaire
            <select className={inputClass + " !py-1.5 !text-xs"} value={typeFilter} onChange={e => setTypeFilter(e.target.value as typeof typeFilter)}>
              <option value="all">Tous</option><option value="Semaine">Hebdomadaire</option><option value="Mois">Mensuel</option>
            </select></label>
          <label className="flex flex-col gap-1">Catégorie
            <select className={inputClass + " !py-1.5 !text-xs"} value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">Toutes les catégories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select></label>
        </div>
        <p className="text-[11px] text-slate-500">
          {fmtDate(from)} → {fmtDate(to)} ({periodDays} jour{periodDays > 1 ? "s" : ""}) · comparé à {fmtDate(prevFrom)} → {fmtDate(prevTo)} · Stock à ce jour, écarts valorisés au prix d'achat HT actuel.
        </p>
      </Card>

      {/* Indicateurs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {kpi("Valeur du stock (achat)", fmtCurrency(k.stockCost), `${k.refs} référence${k.refs > 1 ? "s" : ""} · ${fmtQty(k.units)} unités`)}
        {kpi("Valeur du stock (vente)", fmtCurrency(k.stockSale), `marge potentielle ${fmtCurrency(k.stockSale - k.stockCost)}`)}
        {kpi("Alertes de stock", String(k.low + k.out), `${k.out} en rupture · ${k.low} sous le seuil`, undefined, k.low + k.out > 0 ? "text-orange-600" : "text-slate-900")}
        {kpi("Pertes & péremptions", fmtCurrency(k.lossCur.total), `${k.lossCur.count} déclaration${k.lossCur.count > 1 ? "s" : ""}`, <Delta v={k.lossDelta} invert />)}
        {kpi("Inventaires réalisés", String(k.cur.count), lastSession ? `dernier le ${fmtDate(lastSession.date)}` : "aucun sur la période")}
        {kpi("Taux d'exactitude", k.cur.accuracy === null ? "—" : pct(k.cur.accuracy), `${fmtQty(k.cur.lines - k.cur.withDiff)} / ${fmtQty(k.cur.lines)} lignes justes`, <Delta v={k.accuracyDelta} suffix=" pts" />)}
        {kpi("Manquants", fmtCurrency(k.cur.missing), "valeur des quantités manquantes", <Delta v={k.missingDelta} invert />, k.cur.missing > 0 ? "text-rose-600" : "text-slate-900")}
        {kpi("Écart net", signedMoney(k.cur.extra - k.cur.missing), `excédents ${fmtCurrency(k.cur.extra)}`, undefined, k.cur.extra - k.cur.missing < 0 ? "text-rose-600" : k.cur.extra - k.cur.missing > 0 ? "text-emerald-700" : "text-slate-900")}
      </div>

      {/* Écarts par inventaire */}
      <Card className="p-4 sm:p-5">
        <h3 className="font-bold text-slate-900 mb-3">Écarts par inventaire</h3>
        {chartSessions.length === 0
          ? <EmptyState title="Aucun inventaire sur cette période" subtitle="Lancez un comptage ou choisissez une autre période" />
          : <DiscrepancyChart sessions={chartSessions} />}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card className="p-4 sm:p-5">
          <h3 className="font-bold text-slate-900 mb-1">Valeur du stock par catégorie</h3>
          <p className="text-[11px] text-slate-500 mb-3">Valorisé au prix d'achat HT · stock actuel</p>
          <div className="space-y-3">
            {byCategory.map(c => (
              <div key={c.name}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-semibold text-slate-900 truncate">{c.name}</span>
                  <span className="text-xs text-slate-600 whitespace-nowrap">{fmtCurrency(c.cost)} · <b>{pct(c.share)}</b></span>
                </div>
                <div className="h-3 rounded bg-slate-100 mt-1 overflow-hidden">
                  <div className="h-full rounded bg-slate-700" style={{ width: `${Math.max(2, (c.cost / maxCatCost) * 100)}%` }} />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 mt-0.5">
                  <span>{c.refs} réf. · {fmtQty(c.units)} unités · {fmtCurrency(c.sale)} en vente</span>
                  {c.low > 0 && <Badge tone="amber">{c.low} en alerte</Badge>}
                </div>
              </div>
            ))}
            {byCategory.length === 0 && <p className="text-sm text-slate-500">Aucun produit</p>}
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <h3 className="font-bold text-slate-900 mb-1">Produits les plus en écart</h3>
          <p className="text-[11px] text-slate-500 mb-3">Cumul des inventaires de la période</p>
          {topDiscrepancies.length === 0 ? <p className="text-sm text-slate-500">Aucun écart constaté sur la période.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-2">Produit</th><th className="py-2 px-2 text-right">Fois</th><th className="py-2 px-2 text-right">Écart</th><th className="py-2 pl-2 text-right">Valeur</th>
                </tr></thead>
                <tbody>
                  {topDiscrepancies.map((p, i) => (
                    <tr key={p.name + i} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-2"><span className="text-slate-400 text-xs mr-1.5">{i + 1}.</span><span className="font-medium">{p.name}</span></td>
                      <td className="py-2 px-2 text-right text-slate-600">{p.times}</td>
                      <td className={`py-2 px-2 text-right font-semibold ${p.qty < 0 ? "text-rose-600" : p.qty > 0 ? "text-emerald-700" : ""}`}>{p.qty > 0 ? "+" : ""}{fmtQty(p.qty)} <span className="text-[10px] text-slate-400">{p.unit}</span></td>
                      <td className={`py-2 pl-2 text-right whitespace-nowrap ${p.value < 0 ? "text-rose-600" : "text-emerald-700"}`}>{signedMoney(p.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Historique */}
      <Card className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="font-bold text-slate-900">Historique des inventaires</h3>
          <Badge tone="sky">{current.length} sur la période</Badge>
        </div>
        {current.length === 0 ? <EmptyState title="Aucun inventaire" subtitle="Lancez votre premier comptage" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-2">Date</th><th className="py-2 px-2">Type</th><th className="py-2 px-2 hidden xl:table-cell">Réalisé par</th>
                <th className="py-2 px-2 text-right">Articles</th><th className="py-2 px-2 text-right">Écarts</th>
                <th className="py-2 px-2 text-right hidden lg:table-cell">Exactitude</th><th className="py-2 px-2 text-right">Écart net</th><th className="py-2 pl-2 text-right">Fiche</th>
              </tr></thead>
              <tbody>
                {current.map(s => (
                  <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => setDetail(s)}>
                    <td className="py-2 pr-2 font-medium whitespace-nowrap">{fmtDate(s.date)}</td>
                    <td className="py-2 px-2"><Badge tone="sky">{s.period === "Mois" ? "Mensuel" : "Hebdo"}</Badge></td>
                    <td className="py-2 px-2 text-slate-600 hidden xl:table-cell">{s.userName || "—"}</td>
                    <td className="py-2 px-2 text-right text-slate-600">{s.lines.length}</td>
                    <td className="py-2 px-2 text-right">{s.withDiff > 0 ? <b className="text-rose-600">{s.withDiff}</b> : <span className="text-slate-400">0</span>}</td>
                    <td className="py-2 px-2 text-right hidden lg:table-cell">{pct(s.accuracy)}</td>
                    <td className={`py-2 px-2 text-right whitespace-nowrap font-semibold ${s.net < 0 ? "text-rose-600" : s.net > 0 ? "text-emerald-700" : "text-slate-500"}`}>{signedMoney(s.net)}</td>
                    <td className="py-2 pl-2 text-right">
                      <button onClick={e => { e.stopPropagation(); printSession(s); }} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:border-slate-400" title="Imprimer la fiche d'inventaire">
                        <IconPrinter size={13} /> <span className="hidden 2xl:inline">Imprimer</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Détail d'un inventaire */}
      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg"
        title={detail ? `Inventaire ${detail.period === "Mois" ? "mensuel" : "hebdomadaire"} du ${fmtDate(detail.date)}` : ""}
        footer={detail && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setDetail(null)}>Fermer</Button>
            <Button variant="outline" onClick={() => printSession(detail, true)}><IconPrinter size={15} /> Écarts seulement</Button>
            <Button onClick={() => printSession(detail)}><IconPrinter size={15} /> Imprimer la fiche</Button>
          </div>
        )}>
        {detail && (<>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {[
              ["Réalisé par", detail.userName || "—", ""],
              ["Articles avec écart", `${detail.withDiff} / ${detail.lines.length}`, detail.withDiff ? "text-rose-600" : ""],
              ["Exactitude", pct(detail.accuracy), ""],
              ["Écart net", signedMoney(detail.net), detail.net < 0 ? "text-rose-600" : detail.net > 0 ? "text-emerald-700" : ""],
            ].map(([l, v, tone]) => (
              <div key={l} className="rounded-xl bg-slate-50 p-3">
                <div className="text-[10px] uppercase font-semibold text-slate-500">{l}</div>
                <div className={`font-black text-slate-900 truncate ${tone}`}>{v}</div>
              </div>
            ))}
          </div>
          <div className="max-h-[50vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white"><tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-2">Produit</th><th className="py-2 px-2 text-right">Théorique</th><th className="py-2 px-2 text-right">Compté</th><th className="py-2 pl-2 text-right">Écart</th>
              </tr></thead>
              <tbody>
                {[...detail.lines].sort((a, b) => Math.abs(b.difference * b.cost) - Math.abs(a.difference * a.cost)).map(l => (
                  <tr key={l.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-2"><div className="font-medium">{l.productName}</div><div className="text-[11px] text-slate-500">{l.category || "—"}</div></td>
                    <td className="py-2 px-2 text-right text-slate-600">{fmtQty(l.expected)}</td>
                    <td className="py-2 px-2 text-right">{fmtQty(l.actual)}</td>
                    <td className={`py-2 pl-2 text-right font-bold ${l.difference < 0 ? "text-rose-600" : l.difference > 0 ? "text-emerald-700" : "text-slate-400"}`}>{l.difference > 0 ? "+" : ""}{fmtQty(l.difference)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>)}
      </Modal>

      {/* Options de la fiche de comptage vierge */}
      <Modal open={sheetOpen} onClose={() => setSheetOpen(false)} title="Imprimer une fiche de comptage"
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setSheetOpen(false)}>Annuler</Button><Button onClick={printCountSheet}><IconPrinter size={15} /> Imprimer</Button></div>}>
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">Fiche A4 à remplir à la main pendant le comptage, regroupée par catégorie, avec cases de saisie et signatures.</p>
          <label className="flex flex-col gap-1 text-xs text-slate-600">Type d'inventaire
            <select className={inputClass} value={sheetType} onChange={e => setSheetType(e.target.value as CountType)}>
              <option value="Semaine">Hebdomadaire</option><option value="Mois">Mensuel</option>
            </select></label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">Catégorie
            <select className={inputClass} value={sheetCategory} onChange={e => setSheetCategory(e.target.value)}>
              <option value="">Toutes les catégories ({products.length} articles)</option>
              {categories.map(c => <option key={c} value={c}>{c} ({products.filter(p => p.category === c).length})</option>)}
            </select></label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={sheetShowExpected} onChange={e => setSheetShowExpected(e.target.checked)} />
            <span>Afficher le stock théorique<span className="block text-[11px] text-slate-500">Décoché (recommandé) : comptage « à l'aveugle », l'employé ne voit pas la quantité attendue.</span></span>
          </label>
        </div>
      </Modal>

      {/* Saisie du comptage */}
      <Modal open={open} onClose={() => setOpen(false)} title={`Comptage ${countType === "Mois" ? "mensuel" : "hebdomadaire"}`} size="lg"
        footer={
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs sm:text-sm text-slate-600">{countSummary.withDiff} écart{countSummary.withDiff > 1 ? "s" : ""} · valeur <b className={countSummary.diff < 0 ? "text-rose-600" : "text-emerald-700"}>{signedMoney(countSummary.diff)}</b></div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="ghost" onClick={() => setOpen(false)} className="flex-1 sm:flex-none">Annuler</Button>
              <Button variant="outline" className="flex-1 sm:flex-none"
                onClick={() => printHtml(buildResultSheet({ ss, period: countType, date: iso(new Date()), lines: countLines(), draft: true, userName: currentUser?.name }), "Fiche d'inventaire")}>
                <IconPrinter size={15} /> Imprimer
              </Button>
              <Button variant="success" onClick={saveInventory} className="flex-1 sm:flex-none">Valider</Button>
            </div>
          </div>
        }>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <label className="flex flex-col gap-1 text-xs text-slate-600">Type
            <select className={inputClass + " !py-1.5"} value={countType} onChange={e => setCountType(e.target.value as CountType)}>
              <option value="Semaine">Hebdomadaire</option><option value="Mois">Mensuel</option>
            </select></label>
          <div className="rounded-xl bg-slate-50 p-2.5">
            <div className="text-[10px] uppercase font-semibold text-slate-500">Valeur comptée</div>
            <div className="font-black truncate">{fmtCurrency(countSummary.totalActual)}</div>
          </div>
        </div>

        <div className="relative mb-3">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={inputClass + " pl-9"} placeholder="Filtrer par produit..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="space-y-2.5 max-h-[45vh] overflow-y-auto pr-1 -mr-1">
          {filteredProducts.length === 0 && <p className="text-center text-slate-500 text-sm py-8">Aucun produit trouvé.</p>}
          {filteredProducts.map((p: Product) => {
            const val = counts[p.id] ?? p.stock;
            const diff = Math.round((val - p.stock) * 1000) / 1000;
            const step = (d: number) => setCounts(c => ({ ...c, [p.id]: Math.max(0, (c[p.id] ?? p.stock) + d) }));
            return (
              <div key={p.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-start justify-between gap-2 mb-2.5">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-slate-900 leading-snug">{p.name}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{p.category}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Théorique</div>
                    <div className="text-sm font-bold text-slate-700">{fmtQty(p.stock)} {p.unit}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500 font-medium flex-shrink-0">Compté :</span>
                  <div className="flex items-center gap-1 flex-1">
                    <button onClick={() => step(-1)} aria-label="Retirer 1" className="w-8 h-8 rounded-lg bg-white border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-slate-100 active:scale-95 transition flex-shrink-0"><IconMinus size={13} /></button>
                    <input type="number" min={0} step="any" className={inputClass + " !py-1.5 text-center flex-1 min-w-0 font-bold"} value={val}
                      onChange={e => { const v = parseFloat(e.target.value); setCounts(c => ({ ...c, [p.id]: isNaN(v) ? 0 : Math.max(0, v) })); }} />
                    <button onClick={() => step(1)} aria-label="Ajouter 1" className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center hover:bg-slate-800 active:scale-95 transition flex-shrink-0"><IconPlus size={13} /></button>
                  </div>
                  <div className={`flex-shrink-0 min-w-[54px] text-center text-xs font-bold px-2 py-1 rounded-lg ${diff < 0 ? "bg-rose-100 text-rose-700" : diff > 0 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {diff > 0 ? "+" : ""}{fmtQty(diff)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>

      {/* Confirmation après validation */}
      <Modal open={!!lastSaved} onClose={() => setLastSaved(null)} title="Inventaire validé">
        <p className="text-sm text-slate-600">L'inventaire a été enregistré et les stocks ajustés sur les quantités comptées.</p>
        <div className="flex flex-wrap justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={() => setLastSaved(null)}>Fermer</Button>
          <Button onClick={() => { if (lastSaved) printHtml(buildResultSheet({ ss, ...lastSaved, userName: currentUser?.name }), "Fiche d'inventaire"); }}><IconPrinter size={16} /> Imprimer la fiche</Button>
        </div>
      </Modal>
    </div>
  );
}
