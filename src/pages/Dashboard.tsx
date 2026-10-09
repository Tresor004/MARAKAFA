import { useState } from "react";
import { useStore, fmtCurrency, fmtDate } from "../store";
import { Card, Badge, inputClass } from "../components/ui";
import { IconCart, IconBox, IconCurrency, IconTrend, IconAlert, IconUsers, IconTruck, IconClipboard, IconChevronRight, IconCalendar } from "../components/Icons";
import { NavKey } from "../components/nav";

interface Props {
  navigate: (key: NavKey, opts?: { salesTab?: "pos" | "history"; stockFilter?: "all" | "low" | "expiring" | "out" }) => void;
}

export default function Dashboard({ navigate }: Props) {
  const { products, sales, purchases, customers, losses, suppliers } = useStore();

  const realToday = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(realToday);
  const isToday = selectedDate === realToday;

  // Total revenue (all sales)
  const totalRevenue = sales.reduce((a, b) => a + b.total, 0);

  // Revenue for the selected date (shown in the "day sales" card)
  const selectedDaySales = sales.filter(s => s.date === selectedDate);
  const selectedDayRevenue = selectedDaySales.reduce((a, b) => a + b.total, 0);

  // Other stats
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const weekSales = sales.filter(s => s.date >= weekAgo);

  const totalPurchases = purchases.reduce((a, b) => a + b.total, 0);
  const lowStock = products.filter(p => p.stock <= p.minStock);
  const expiringSoon = products.filter(p => {
    if (!p.expiryDate) return false;
    const diff = (new Date(p.expiryDate).getTime() - Date.now()) / 86400000;
    return diff <= 15 && diff >= -30;
  });

  const topProducts = [...sales.flatMap(s => s.items)]
    .reduce<Record<string, { name: string; qty: number; total: number }>>((acc, it) => {
      if (!acc[it.productId]) acc[it.productId] = { name: it.name, qty: 0, total: 0 };
      acc[it.productId].qty += it.quantity;
      acc[it.productId].total += it.total;
      return acc;
    }, {});
  const topProductsList = Object.values(topProducts).sort((a, b) => b.total - a.total).slice(0, 5);

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
    { label: "Stock critique", count: lowStock.length, bg: "bg-rose-50 hover:bg-rose-100", border: "border-rose-100", textColor: "text-rose-700", iconColor: "text-rose-600", target: "stock", stockFilter: "low" },
    { label: "Produits à péremption", count: expiringSoon.length, bg: "bg-amber-50 hover:bg-amber-100", border: "border-amber-100", textColor: "text-amber-700", iconColor: "text-amber-600", target: "stock", stockFilter: "expiring" },
  ];
  const stats: { label: string; count: number; target: NavKey }[] = [
    { label: "Références produits", count: products.length, target: "products" },
    { label: "Clients enregistrés", count: customers.length, target: "customers" },
    { label: "Fournisseurs", count: suppliers.length, target: "suppliers" },
    { label: "Pertes déclarées", count: losses.length, target: "losses" },
  ];

  return (
    <div className="space-y-6">
      {/* Header with date selector */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900">Tableau de bord</h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">Vue d'ensemble de Hi-Market — {formatDateLabel(realToday)}</p>
        </div>
      </div>

      {/* KPIs — first card has date selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Chiffre d'affaires with date picker */}
        {/* Chiffre d'affaires total — all sales */}
        {stat("Chiffre d'affaires total", fmtCurrency(totalRevenue), <IconCurrency className="text-white" size={20} />, "bg-slate-900", `${sales.length} vente${sales.length > 1 ? "s" : ""} au total`)}

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
            {selectedDaySales.length} vente{selectedDaySales.length > 1 ? "s" : ""} {isToday ? "aujourd'hui" : `le ${formatDateLabel(selectedDate)}`}
          </p>
        </Card>

        {stat("Ventes (7 jours)", fmtCurrency(weekSales.reduce((a, b) => a + b.total, 0)), <IconTrend className="text-white" size={20} />, "bg-sky-600", `${weekSales.length} transaction${weekSales.length > 1 ? "s" : ""}`)}
        {stat("Achats fournisseurs", fmtCurrency(totalPurchases), <IconBox className="text-white" size={20} />, "bg-amber-600", `${purchases.length} commande${purchases.length > 1 ? "s" : ""}`)}
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
              {sales.slice(0, 6).map(s => (
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
          {sales.length === 0 && <p className="text-slate-500 text-sm py-6 text-center">Aucune vente enregistrée.</p>}
        </div>
      </Card>
    </div>
  );
}
