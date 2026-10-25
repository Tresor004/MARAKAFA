import { useEffect, useState } from "react";
import { useStore, fmtCurrency, fmtDate } from "../store";
import { api } from "../api";
import { Sale } from "../types";
import { Card, Badge, inputClass } from "../components/ui";
import { IconCart, IconBox, IconCurrency, IconTrend, IconAlert, IconUsers, IconTruck, IconClipboard, IconChevronRight, IconCalendar } from "../components/Icons";
import { NavKey } from "../components/nav";
import Stats from "./Stats";

interface Props {
  navigate: (key: NavKey, opts?: { salesTab?: "pos" | "history"; stockFilter?: "all" | "low" | "expiring" | "out" }) => void;
}

interface DashboardData {
  date: string;
  totalRevenue: number; salesCount: number;
  dayRevenue: number; daySalesCount: number;
  weekRevenue: number; weekSalesCount: number;
  purchasesTotal: number; purchasesCount: number;
  topProducts: { name: string; qty: number; total: number }[];
  lowStockCount: number; expiringCount: number;
  productsCount: number; customersCount: number; suppliersCount: number; lossesCount: number;
  recentSales: Sale[];
  receivables: number; debtorsCount: number;
}

const EMPTY: DashboardData = {
  date: "", totalRevenue: 0, salesCount: 0, dayRevenue: 0, daySalesCount: 0, weekRevenue: 0, weekSalesCount: 0,
  purchasesTotal: 0, purchasesCount: 0, topProducts: [], lowStockCount: 0, expiringCount: 0,
  productsCount: 0, customersCount: 0, suppliersCount: 0, lossesCount: 0, recentSales: [], receivables: 0, debtorsCount: 0,
};

export default function Dashboard({ navigate }: Props) {
  // Ces listes servent uniquement à relancer le calcul serveur quand une donnée change (vente, retour, encaissement…)
  const { products, sales, purchases, customers, losses, suppliers } = useStore();

  const [tab, setTab] = useState<"overview" | "stats">("overview");
  const realToday = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(realToday);
  const isToday = selectedDate === realToday;

  // Tous les indicateurs sont agrégés par le serveur (une seule requête, aucune liste complète transférée)
  const [data, setData] = useState<DashboardData>(EMPTY);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () => api<DashboardData>("GET", `/dashboard?date=${selectedDate}`)
      .then(r => { if (alive) { setData(r); setLoadError(false); } })
      .catch(() => { if (alive) setLoadError(true); });
    load();
    const iv = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(iv); };
  }, [selectedDate, products, sales, purchases, customers, losses, suppliers]);

  const totalRevenue = data.totalRevenue;
  const selectedDayRevenue = data.dayRevenue;
  const totalPurchases = data.purchasesTotal;
  const topProductsList = data.topProducts;

  const formatDateLabel = (dateStr: string) => {
    try {
      return new Date(dateStr + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    } catch { return dateStr; }
  };

  const stat = (label: string, value: string, icon: React.ReactNode, tone: string, sub?: string) => (
    <Card className="p-5 flex flex-col">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
          <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1.5 truncate">{value}</p>
        </div>
        <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${tone}`}>{icon}</div>
      </div>
      {sub && <p className="text-[11px] text-slate-500 mt-auto pt-3 text-right">{sub}</p>}
    </Card>
  );

  // Alert items with navigation
  const alerts: { label: string; count: number; bg: string; border: string; textColor: string; iconColor: string; target: NavKey; stockFilter?: "all" | "low" | "expiring" | "out" }[] = [
    { label: "Stock critique", count: data.lowStockCount, bg: "bg-rose-50 hover:bg-rose-100", border: "border-rose-100", textColor: "text-rose-700", iconColor: "text-rose-600", target: "stock", stockFilter: "low" },
    { label: "Produits à péremption", count: data.expiringCount, bg: "bg-amber-50 hover:bg-amber-100", border: "border-amber-100", textColor: "text-amber-700", iconColor: "text-amber-600", target: "stock", stockFilter: "expiring" },
  ];
  const stats: { label: string; count: number; target: NavKey }[] = [
    { label: "Références produits", count: data.productsCount, target: "products" },
    { label: "Clients enregistrés", count: data.customersCount, target: "customers" },
    { label: "Fournisseurs", count: data.suppliersCount, target: "suppliers" },
    { label: "Pertes déclarées", count: data.lossesCount, target: "losses" },
  ];

  return (
    <div className="space-y-6">
      {/* Header with date selector */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900">Tableau de bord</h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">Vue d'ensemble de Hi-Market — {formatDateLabel(realToday)}</p>
        </div>
        <div className="grid grid-cols-2 sm:inline-flex bg-white border border-slate-200 rounded-xl p-1 text-sm w-full sm:w-auto">
          <button onClick={() => setTab("overview")} className={`px-4 py-2 sm:py-1.5 rounded-lg font-medium transition ${tab === "overview" ? "bg-slate-900 text-white" : "text-slate-700"}`}>Aperçu</button>
          <button onClick={() => setTab("stats")} className={`px-4 py-2 sm:py-1.5 rounded-lg font-medium transition ${tab === "stats" ? "bg-slate-900 text-white" : "text-slate-700"}`}>Statistiques</button>
        </div>
      </div>

      {tab === "stats" ? <Stats /> : (<>
      {loadError && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-2">
          Impossible d'actualiser les indicateurs (serveur injoignable). Les valeurs affichées peuvent être anciennes.
        </div>
      )}

      {/* KPIs — first card has date selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Chiffre d'affaires with date picker */}
        {/* Chiffre d'affaires total — all sales */}
        {stat("Chiffre d'affaires total", fmtCurrency(totalRevenue), <IconCurrency className="text-white" size={20} />, "bg-slate-900", `${data.salesCount} vente${data.salesCount > 1 ? "s" : ""} au total`)}

        {/* Ventes du jour — with date selector */}
        <Card className="p-5 relative overflow-hidden flex flex-col">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {isToday ? "Ventes aujourd'hui" : "Ventes du jour"}
              </p>
              <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1.5 truncate">{fmtCurrency(selectedDayRevenue)}</p>
              <div className="flex items-center gap-1.5 mt-2">
                <div className="relative flex items-center">
                  <IconCalendar size={13} className="absolute left-2 text-slate-400 pointer-events-none" />
                  <input
                    type="date"
                    lang="fr-FR"
                    value={selectedDate}
                    max={realToday}
                    onChange={e => setSelectedDate(e.target.value || realToday)}
                    className={inputClass + " !py-1 !pl-7 !pr-2 !text-[11px] !rounded-lg w-[135px] !border-slate-200"}
                  />
                </div>
                {!isToday && (
                  <button
                    onClick={() => setSelectedDate(realToday)}
                    className="px-2 py-1 rounded-lg bg-slate-900 text-white text-[10px] font-semibold hover:bg-slate-800 transition active:scale-95 whitespace-nowrap"
                  >
                    Aujourd'hui
                  </button>
                )}
              </div>
            </div>
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-600">
              <IconCart className="text-white" size={20} />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-auto pt-3 text-right">
            {data.daySalesCount} vente{data.daySalesCount > 1 ? "s" : ""} {isToday ? "aujourd'hui" : `le ${formatDateLabel(selectedDate)}`}
          </p>
        </Card>

        {stat("Ventes (7 jours)", fmtCurrency(data.weekRevenue), <IconTrend className="text-white" size={20} />, "bg-sky-600", `${data.weekSalesCount} transaction${data.weekSalesCount > 1 ? "s" : ""}`)}
        {stat("Achats fournisseurs", fmtCurrency(totalPurchases), <IconBox className="text-white" size={20} />, "bg-amber-600", `${data.purchasesCount} commande${data.purchasesCount > 1 ? "s" : ""}`)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-900">Produits les plus vendus</h3>
            <Badge tone="sky">TOP 5</Badge>
          </div>
          {topProductsList.length === 0 ? (
            <p className="text-slate-500 text-sm py-6 text-center">Aucune vente pour le moment.</p>
          ) : (
            <div className="space-y-3">
              {topProductsList.map((p, i) => {
                const max = topProductsList[0].total;
                const pct = Math.round((p.total / max) * 100);
                return (
                  <div key={p.name}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-slate-800">{i + 1}. {p.name}</span>
                      <span className="text-slate-600">{p.qty} vendu(s) · <b>{fmtCurrency(p.total)}</b></span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-1.5">
                      <div className="h-full bg-slate-900 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Alerts & Stats — clickable links */}
        <Card className="p-5">
          <h3 className="font-bold text-slate-900 mb-4">Alertes & Statistiques</h3>
          <div className="space-y-2">
            {alerts.map(a => (
              <button
                key={a.label}
                onClick={() => navigate(a.target, { stockFilter: a.stockFilter })}
                className={`w-full flex items-center justify-between p-3 rounded-xl ${a.bg} border ${a.border} transition-colors group`}
              >
                <div className="flex items-center gap-3">
                  <IconAlert className={a.iconColor} size={18} />
                  <span className="text-sm font-medium text-slate-800">{a.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-black ${a.textColor}`}>{a.count}</span>
                  <IconChevronRight size={14} className="text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>
            ))}

            {data.receivables > 0.004 && (
              <button onClick={() => navigate("customers")} className="w-full flex items-center justify-between p-3 rounded-xl bg-violet-50 hover:bg-violet-100 border border-violet-100 transition-colors group">
                <div className="flex items-center gap-3">
                  <IconCurrency className="text-violet-600" size={18} />
                  <span className="text-sm font-medium text-slate-800 text-left">Créances clients <span className="text-[11px] text-slate-500">({data.debtorsCount} débiteur{data.debtorsCount > 1 ? "s" : ""})</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-black text-violet-700">{fmtCurrency(data.receivables)}</span>
                  <IconChevronRight size={14} className="text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>
            )}

            {stats.map(s => (
              <button
                key={s.label}
                onClick={() => navigate(s.target)}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  {s.target === "products" && <IconClipboard className="text-slate-500" size={16} />}
                  {s.target === "customers" && <IconUsers className="text-slate-500" size={16} />}
                  {s.target === "suppliers" && <IconTruck className="text-slate-500" size={16} />}
                  {s.target === "losses" && <IconAlert className="text-slate-500" size={16} />}
                  <span className="text-sm font-medium">{s.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-black">{s.count}</span>
                  <IconChevronRight size={14} className="text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* Recent sales with "See all" button */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-900">Dernières ventes</h3>
          <button
            onClick={() => navigate("sales", { salesTab: "history" })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-900 hover:text-white text-slate-700 text-xs font-semibold transition group"
          >
            Voir toutes les ventes
            <IconChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 uppercase text-xs border-b border-slate-200">
                <th className="py-2 pr-4">Facture</th>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4 hidden sm:table-cell">Client</th>
                <th className="py-2 pr-4 hidden md:table-cell">Caissier</th>
                <th className="py-2 pr-4 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.recentSales.map(s => (
                <tr key={s.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-3 pr-4 font-mono text-xs">{s.invoiceNo}</td>
                  <td className="py-3 pr-4 text-slate-600">{fmtDate(s.date)}</td>
                  <td className="py-3 pr-4 hidden sm:table-cell">{s.customerName || "—"}</td>
                  <td className="py-3 pr-4 text-slate-600 hidden md:table-cell">{s.userName}</td>
                  <td className="py-3 pr-4 text-right font-bold">{fmtCurrency(s.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.recentSales.length === 0 && <p className="text-slate-500 text-sm py-6 text-center">Aucune vente enregistrée.</p>}
        </div>
      </Card>
      </>)}
    </div>
  );
}
