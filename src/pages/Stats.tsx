import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errMsg } from "../api";
import { fmtCurrency, fmtDate } from "../store";
import { Badge, Card, EmptyState, inputClass } from "../components/ui";

// ───────────────────────── Types de la réponse GET /api/stats ─────────────────────────
interface Totals {
  revenue: number; tax: number; revenueHt: number; cogs: number; margin: number; marginPct: number;
  salesCount: number; avgBasket: number; quantity: number; discounts: number; returns: number;
}
interface Point { key: string; label: string; revenue: number; margin: number; count: number; previousRevenue: number | null; previousMargin: number | null; previousLabel: string | null }
interface CatRow { category: string; revenue: number; revenueHt: number; cogs: number; margin: number; marginPct: number; quantity: number; share: number; previousRevenueHt: number | null }
interface ProdRow { name: string; revenue: number; margin: number; marginPct: number; quantity: number }
interface StatsData {
  period: { from: string; to: string; days: number; granularity: string };
  previous: { from: string; to: string } | null;
  totals: Totals; previousTotals: Totals | null;
  delta: Partial<Record<keyof Totals, number | null>>;
  series: Point[]; byCategory: CatRow[]; topProducts: ProdRow[];
  byPayment: { method: string; count: number; revenue: number }[];
  byHour: { hour: number; count: number; revenue: number }[];
  byCashier: { name: string; count: number; revenue: number }[];
  receivables: number;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

const PRESETS: { id: string; label: string; range: () => [string, string] }[] = [
  { id: "7", label: "7 jours", range: () => [daysAgo(6), daysAgo(0)] },
  { id: "30", label: "30 jours", range: () => [daysAgo(29), daysAgo(0)] },
  { id: "month", label: "Ce mois", range: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth(), 1)), iso(n)]; } },
  { id: "lastmonth", label: "Mois dernier", range: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)), iso(new Date(n.getFullYear(), n.getMonth(), 0))]; } },
  { id: "90", label: "90 jours", range: () => [daysAgo(89), daysAgo(0)] },
  { id: "365", label: "12 mois", range: () => [daysAgo(364), daysAgo(0)] },
];

/** Montant abrégé pour les axes : 1,2 M · 350 k */
const compact = (n: number) => {
  const a = Math.abs(n);
  const f = (v: number) => String(Math.round(v * 10) / 10).replace(".", ",");
  if (a >= 1e9) return f(n / 1e9) + " Md";
  if (a >= 1e6) return f(n / 1e6) + " M";
  if (a >= 1e3) return f(n / 1e3) + " k";
  return String(Math.round(n));
};

/** Graduation « ronde » de l'axe vertical. */
function niceMax(v: number): { max: number; step: number } {
  if (v <= 0) return { max: 1, step: 0.25 };
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  const max = nice * exp;
  return { max, step: max / 4 };
}

const Delta = ({ v, suffix = "%", invert = false }: { v: number | null | undefined; suffix?: string; invert?: boolean }) => {
  if (v === null || v === undefined) return <span className="text-[11px] text-slate-400">—</span>;
  const good = invert ? v < 0 : v > 0;
  const tone = v === 0 ? "slate" : good ? "emerald" : "rose";
  return <Badge tone={tone}>{v > 0 ? "▲" : v < 0 ? "▼" : "="} {Math.abs(v)}{suffix}</Badge>;
};

// ───────────────────────── Courbe d'évolution (SVG sans dépendance) ─────────────────────────
function EvolutionChart({ series, compare }: { series: Point[]; compare: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 760, H = 280, L = 56, R = 12, T = 12, B = 34;
  const iw = W - L - R, ih = H - T - B;
  const maxV = Math.max(1, ...series.map(p => Math.max(p.revenue, p.margin, compare ? p.previousRevenue ?? 0 : 0)));
  const { max, step } = niceMax(maxV);
  const x = (i: number) => L + (series.length <= 1 ? iw / 2 : (iw * (i + 0.5)) / series.length);
  const y = (v: number) => T + ih - (Math.max(0, v) / max) * ih;
  const bw = Math.max(2, Math.min(34, (iw / Math.max(1, series.length)) * 0.62));
  const line = (get: (p: Point) => number | null) => {
    let d = "", pen = false;
    series.forEach((p, i) => { const v = get(p); if (v === null) { pen = false; return; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `; pen = true; });
    return d;
  };
  const every = Math.max(1, Math.ceil(series.length / 9));
  const hp = hover !== null ? series[hover] : null;

  return (
    <div>
      <div className="min-h-[3.25rem] text-xs text-slate-600 mb-2" aria-live="polite">
        {hp ? (
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <span className="font-bold text-slate-900">{hp.label}</span>
            <span>CA : <b className="text-slate-900">{fmtCurrency(hp.revenue)}</b></span>
            <span>Marge : <b className="text-emerald-700">{fmtCurrency(hp.margin)}</b></span>
            <span>{hp.count} vente{hp.count > 1 ? "s" : ""}</span>
            {compare && hp.previousRevenue !== null && <span>Période précédente ({hp.previousLabel}) : <b>{fmtCurrency(hp.previousRevenue)}</b></span>}
          </div>
        ) : <span className="text-slate-400">Survolez ou touchez une barre pour voir le détail.</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" role="img" aria-label="Évolution du chiffre d'affaires et de la marge">
        {Array.from({ length: 5 }, (_, i) => i * step).map(v => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#64748b">{compact(v)}</text>
          </g>
        ))}
        {series.map((p, i) => (
          <g key={p.key}>
            <rect x={x(i) - bw / 2} y={y(p.revenue)} width={bw} height={Math.max(0, T + ih - y(p.revenue))} rx="2" fill={hover === i ? "#0f172a" : "#334155"} />
            {(i % every === 0 || i === series.length - 1) && <text x={x(i)} y={H - 12} textAnchor="middle" fontSize="10.5" fill="#64748b">{p.label}</text>}
            <rect x={x(i) - iw / series.length / 2} y={T} width={iw / series.length} height={ih} fill="transparent"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(h => (h === i ? null : h))} onClick={() => setHover(i)} />
          </g>
        ))}
        {compare && <path d={line(p => p.previousRevenue)} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" />}
        <path d={line(p => p.margin)} fill="none" stroke="#059669" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {series.length <= 40 && series.map((p, i) => <circle key={p.key} cx={x(i)} cy={y(p.margin)} r={hover === i ? 4.5 : 2.5} fill="#059669" />)}
      </svg>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-600 mt-1">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block w-3 h-3 rounded-sm bg-slate-700" /> Chiffre d'affaires</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block w-4 h-0.5 bg-emerald-600" /> Marge brute</span>
        {compare && <span className="inline-flex items-center gap-1.5"><i className="inline-block w-4 border-t-2 border-dashed border-slate-400" /> CA de la période précédente</span>}
      </div>
    </div>
  );
}

function HourChart({ rows }: { rows: StatsData["byHour"] }) {
  const max = Math.max(1, ...rows.map(r => r.count));
  const peak = rows.reduce((a, r) => (r.count > a.count ? r : a), rows[0]);
  return (
    <div>
      <div className="flex items-end gap-[3px] h-28" role="img" aria-label="Nombre de ventes par heure">
        {rows.map(r => (
          <div key={r.hour} className="flex-1 flex flex-col justify-end h-full" title={`${r.hour} h : ${r.count} vente(s) · ${fmtCurrency(r.revenue)}`}>
            <div className={`w-full rounded-t ${r.hour === peak.hour && r.count > 0 ? "bg-emerald-600" : "bg-slate-300"}`} style={{ height: `${(r.count / max) * 100}%`, minHeight: r.count ? 2 : 0 }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 mt-1"><span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>23 h</span></div>
      {peak.count > 0 && <p className="text-xs text-slate-600 mt-2">Pic d'activité : <b>{peak.hour} h – {peak.hour + 1} h</b> ({peak.count} vente{peak.count > 1 ? "s" : ""}).</p>}
    </div>
  );
}

export default function Stats() {
  const [preset, setPreset] = useState("30");
  const [from, setFrom] = useState(PRESETS[1].range()[0]);
  const [to, setTo] = useState(PRESETS[1].range()[1]);
  const [compare, setCompare] = useState<"previous" | "year" | "none">("previous");
  const [gran, setGran] = useState<"auto" | "day" | "week" | "month">("auto");
  const [data, setData] = useState<StatsData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await api<StatsData>("GET", `/stats?${new URLSearchParams({ from, to, compare, granularity: gran })}`)); }
    catch (e) { setError(errMsg(e)); }
    setLoading(false);
  }, [from, to, compare, gran]);
  useEffect(() => { void load(); }, [load]);

  const pickPreset = (id: string) => { const p = PRESETS.find(x => x.id === id); if (!p) return; const [f, t] = p.range(); setPreset(id); setFrom(f); setTo(t); };
  const t = data?.totals;
  const hasData = !!t && (t.salesCount > 0 || t.revenue > 0);
  const cmp = compare !== "none" && !!data?.previousTotals;
  const maxCatRevenue = useMemo(() => Math.max(1, ...(data?.byCategory ?? []).map(c => c.revenueHt)), [data]);
  const maxPay = useMemo(() => Math.max(1, ...(data?.byPayment ?? []).map(c => c.revenue)), [data]);

  const kpi = (label: string, value: string, delta: number | null | undefined, sub?: string, invert = false) => (
    <Card className="p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1 truncate">{value}</p>
      <div className="flex items-center justify-between mt-2 gap-2 min-h-[1.5rem]">
        <span className="text-[11px] text-slate-500 truncate">{sub}</span>
        {cmp && <Delta v={delta} invert={invert} />}
      </div>
    </Card>
  );

  return (
    <div className="space-y-5">
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Période">
          {PRESETS.map(p => (
            <button key={p.id} onClick={() => pickPreset(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${preset === p.id ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-700 hover:border-slate-400"}`}>{p.label}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs text-slate-600">
          <label className="flex flex-col gap-1">Du<input type="date" lang="fr-FR" max={to} className={inputClass + " !py-1.5 !text-xs"} value={from} onChange={e => { setFrom(e.target.value); setPreset(""); }} /></label>
          <label className="flex flex-col gap-1">Au<input type="date" lang="fr-FR" min={from} className={inputClass + " !py-1.5 !text-xs"} value={to} onChange={e => { setTo(e.target.value); setPreset(""); }} /></label>
          <label className="flex flex-col gap-1">Comparer avec
            <select className={inputClass + " !py-1.5 !text-xs"} value={compare} onChange={e => setCompare(e.target.value as typeof compare)}>
              <option value="previous">Période précédente</option><option value="year">Même période l'an dernier</option><option value="none">Ne pas comparer</option>
            </select></label>
          <label className="flex flex-col gap-1">Regroupement
            <select className={inputClass + " !py-1.5 !text-xs"} value={gran} onChange={e => setGran(e.target.value as typeof gran)}>
              <option value="auto">Automatique</option><option value="day">Par jour</option><option value="week">Par semaine</option><option value="month">Par mois</option>
            </select></label>
        </div>
        {data && <p className="text-[11px] text-slate-500">
          {fmtDate(data.period.from)} → {fmtDate(data.period.to)} ({data.period.days} jour{data.period.days > 1 ? "s" : ""})
          {data.previous && compare !== "none" && <> · comparé à {fmtDate(data.previous.from)} → {fmtDate(data.previous.to)}</>}
          {loading && " · actualisation…"}
          {" "}· Montants nets des retours.
        </p>}
      </Card>

      {error && <Card className="p-4 text-sm text-rose-700 bg-rose-50 border-rose-200">{error} <button className="underline ml-2" onClick={() => void load()}>Réessayer</button></Card>}

      {data && t && (<>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {kpi("Chiffre d'affaires TTC", fmtCurrency(t.revenue), data.delta.revenue, `${t.salesCount} vente${t.salesCount > 1 ? "s" : ""}`)}
          {kpi("Marge brute", fmtCurrency(t.margin), data.delta.margin, `${String(t.marginPct).replace(".", ",")} % du CA HT`)}
          {kpi("Panier moyen", fmtCurrency(t.avgBasket), data.delta.avgBasket, `${t.quantity} article${t.quantity > 1 ? "s" : ""} vendus`)}
          {kpi("Remises & promotions", fmtCurrency(t.discounts), data.delta.discounts, "accordées sur la période", true)}
          {kpi("CA hors taxes", fmtCurrency(t.revenueHt), data.delta.revenueHt, `TVA ${fmtCurrency(t.tax)}`)}
          {kpi("Coût d'achat des ventes", fmtCurrency(t.cogs), null, "valorisé au prix d'achat HT")}
          {kpi("Retours clients", fmtCurrency(t.returns), data.delta.returns, "avoirs émis", true)}
          <Card className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Créances clients</p>
            <p className={`text-xl sm:text-2xl font-black mt-1 truncate ${data.receivables > 0 ? "text-rose-600" : "text-slate-900"}`}>{fmtCurrency(data.receivables)}</p>
            <p className="text-[11px] text-slate-500 mt-2">à encaisser (toutes périodes)</p>
          </Card>
        </div>

        {!hasData ? (
          <Card><EmptyState title="Aucune vente sur cette période" subtitle="Choisissez une autre période" /></Card>
        ) : (<>
          <Card className="p-4 sm:p-5">
            <h3 className="font-bold text-slate-900 mb-3">Évolution des ventes</h3>
            <EvolutionChart series={data.series} compare={cmp} />
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Card className="p-4 sm:p-5">
              <h3 className="font-bold text-slate-900 mb-1">Marge par catégorie</h3>
              <p className="text-[11px] text-slate-500 mb-3">Barre = CA HT · partie verte = marge brute{cmp && " · flèche = évolution du CA HT"}</p>
              <div className="space-y-3">
                {data.byCategory.map(c => {
                  const evo = c.previousRevenueHt && c.previousRevenueHt > 0 ? Math.round(((c.revenueHt - c.previousRevenueHt) / c.previousRevenueHt) * 1000) / 10 : null;
                  return (
                    <div key={c.category}>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-semibold text-slate-900 truncate">{c.category}</span>
                        <span className="text-xs text-slate-600 whitespace-nowrap">{fmtCurrency(c.margin)} · <b className={c.marginPct < 0 ? "text-rose-600" : "text-emerald-700"}>{String(c.marginPct).replace(".", ",")} %</b></span>
                      </div>
                      <div className="h-3 rounded bg-slate-100 mt-1 overflow-hidden" style={{ width: `${Math.max(3, (Math.max(0, c.revenueHt) / maxCatRevenue) * 100)}%` }}
                        title={`CA HT ${fmtCurrency(c.revenueHt)} · marge ${fmtCurrency(c.margin)}`}>
                        <div className="h-full bg-emerald-600" style={{ width: `${c.revenueHt > 0 ? Math.max(0, Math.min(100, (c.margin / c.revenueHt) * 100)) : 0}%` }} />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mt-0.5">
                        <span>CA HT {fmtCurrency(c.revenueHt)} · {c.share} % du total · {c.quantity} vendus</span>
                        {cmp && <Delta v={evo} />}
                      </div>
                    </div>
                  );
                })}
                {data.byCategory.length === 0 && <p className="text-sm text-slate-500">Aucune donnée</p>}
              </div>
            </Card>

            <Card className="p-4 sm:p-5">
              <h3 className="font-bold text-slate-900 mb-3">Meilleurs produits</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-2">Produit</th><th className="py-2 px-2 text-right">Qté</th><th className="py-2 px-2 text-right">CA TTC</th><th className="py-2 pl-2 text-right">Marge</th>
                  </tr></thead>
                  <tbody>
                    {data.topProducts.map((p, i) => (
                      <tr key={p.name} className="border-b border-slate-100 last:border-0">
                        <td className="py-2 pr-2"><span className="text-slate-400 text-xs mr-1.5">{i + 1}.</span><span className="font-medium">{p.name}</span></td>
                        <td className="py-2 px-2 text-right text-slate-600">{p.quantity}</td>
                        <td className="py-2 px-2 text-right font-semibold">{fmtCurrency(p.revenue)}</td>
                        <td className="py-2 pl-2 text-right text-emerald-700 whitespace-nowrap">{fmtCurrency(p.margin)} <span className="text-[10px] text-slate-400">({String(p.marginPct).replace(".", ",")} %)</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card className="p-4 sm:p-5">
              <h3 className="font-bold text-slate-900 mb-3">Moyens de paiement</h3>
              <div className="space-y-2.5">
                {data.byPayment.map(p => (
                  <div key={p.method}>
                    <div className="flex justify-between text-sm"><span className="font-medium">{p.method}</span><span className="text-slate-600">{fmtCurrency(p.revenue)} <span className="text-[11px] text-slate-400">· {p.count}</span></span></div>
                    <div className="h-2 rounded bg-slate-100 mt-1"><div className="h-full rounded bg-slate-700" style={{ width: `${Math.max(2, (p.revenue / maxPay) * 100)}%` }} /></div>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-4 sm:p-5">
              <h3 className="font-bold text-slate-900 mb-3">Ventes par heure</h3>
              <HourChart rows={data.byHour} />
            </Card>
            <Card className="p-4 sm:p-5">
              <h3 className="font-bold text-slate-900 mb-3">Par caissier</h3>
              <div className="space-y-2">
                {data.byCashier.map(c => (
                  <div key={c.name} className="flex justify-between text-sm"><span className="font-medium truncate">{c.name}</span><span className="text-slate-600 whitespace-nowrap">{fmtCurrency(c.revenue)} <span className="text-[11px] text-slate-400">· {c.count} vente{c.count > 1 ? "s" : ""}</span></span></div>
                ))}
              </div>
            </Card>
          </div>
        </>)}
      </>)}
      {!data && !error && <Card className="p-8 text-center text-sm text-slate-500">Chargement des statistiques…</Card>}
    </div>
  );
}
