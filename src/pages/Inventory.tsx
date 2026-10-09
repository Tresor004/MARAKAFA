import { useState, useMemo } from "react";
import { useStore, fmtCurrency, fmtDate } from "../store";
import { Card, Button, Modal, inputClass, EmptyState, Badge, SearchSelect } from "../components/ui";
import { IconPlus, IconMinus, IconPrinter, IconDownload, IconSearch, IconCurrency, IconTrend, IconCart, IconBox, IconAlert, IconClipboard } from "../components/Icons";
import { useToast } from "../components/ui";
import jsPDF from "jspdf";

type Period = "7j" | "30j" | "90j" | "all";

const PERIOD_LABEL: Record<Period, string> = {
  "7j": "7 derniers jours",
  "30j": "30 derniers jours",
  "90j": "90 derniers jours",
  "all": "Depuis le début",
};

export default function Inventory() {
  const { products, sales, purchases, losses, inventory, shopSettings: ss, requestOrExec } = useStore();
  const { push } = useToast();

  const [period, setPeriod] = useState<Period>("30j");
  const [open, setOpen] = useState(false);
  const [countPeriod, setCountPeriod] = useState<"Semaine" | "Mois">("Semaine");
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  // ------- Bornes de dates
  const fromDate = useMemo(() => {
    if (period === "all") return "0000-00-00";
    const days = period === "7j" ? 7 : period === "30j" ? 30 : 90;
    return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  }, [period]);

  // ------- Calculs du rapport
  const report = useMemo(() => {
    const costOf = (productId: string, fallback: number) => products.find(p => p.id === productId)?.cost ?? fallback;

    const salesInPeriod = sales.filter(s => s.date >= fromDate);
    const purchasesInPeriod = purchases.filter(p => p.date >= fromDate);
    const lossesInPeriod = losses.filter(l => l.date >= fromDate);

    const revenue = salesInPeriod.reduce((a, s) => a + s.total, 0);
    const cogs = salesInPeriod.reduce((a, s) =>
      a + s.items.reduce((b, it) => b + costOf(it.productId, it.price) * it.quantity, 0), 0);
    const grossProfit = revenue - cogs;
    const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    const purchasesTotal = purchasesInPeriod.reduce((a, p) => a + p.total, 0);
    const lossesTotal = lossesInPeriod.reduce((a, l) => a + l.total, 0);
    const netResult = grossProfit - lossesTotal;

    const nbSales = salesInPeriod.length;
    const avgBasket = nbSales > 0 ? revenue / nbSales : 0;
    const itemsSold = salesInPeriod.reduce((a, s) => a + s.items.reduce((b, it) => b + it.quantity, 0), 0);

    // Stock actuel
    const stockValueCost = products.reduce((a, p) => a + p.stock * p.cost, 0);
    const stockValueSale = products.reduce((a, p) => a + p.stock * p.price, 0);
    const lowStock = products.filter(p => p.stock <= p.minStock).length;
    const outStock = products.filter(p => p.stock === 0).length;

    // Top produits (par CA sur la période)
    const topMap: Record<string, { name: string; qty: number; total: number; profit: number }> = {};
    salesInPeriod.forEach(s => s.items.forEach(it => {
      if (!topMap[it.productId]) topMap[it.productId] = { name: it.name, qty: 0, total: 0, profit: 0 };
      topMap[it.productId].qty += it.quantity;
      topMap[it.productId].total += it.total;
      topMap[it.productId].profit += (it.price - costOf(it.productId, it.price)) * it.quantity;
    }));
    const topProducts = Object.values(topMap).sort((a, b) => b.total - a.total).slice(0, 5);

    // Répartition par mode de paiement
    const payMap: Record<string, { count: number; total: number }> = {};
    salesInPeriod.forEach(s => {
      const m = s.paymentMethod || "Espèces";
      if (!payMap[m]) payMap[m] = { count: 0, total: 0 };
      payMap[m].count += 1;
      payMap[m].total += s.total;
    });
    const payments = Object.entries(payMap).map(([method, v]) => ({ method, ...v })).sort((a, b) => b.total - a.total);

    // Meilleur client
    const custMap: Record<string, { name: string; total: number }> = {};
    salesInPeriod.forEach(s => {
      const key = s.customerId || "passage";
      const name = s.customerName || "Client passage";
      if (!custMap[key]) custMap[key] = { name, total: 0 };
      custMap[key].total += s.total;
    });
    const topCustomers = Object.values(custMap).sort((a, b) => b.total - a.total).slice(0, 3);

    return {
      revenue, cogs, grossProfit, margin, purchasesTotal, lossesTotal, netResult,
      nbSales, avgBasket, itemsSold, stockValueCost, stockValueSale, lowStock, outStock,
      topProducts, payments, topCustomers,
      nbLosses: lossesInPeriod.length, nbPurchases: purchasesInPeriod.length,
    };
  }, [products, sales, purchases, losses, fromDate]);

  // ------- Inventaire physique
  const startInventory = () => {
    setCounts(Object.fromEntries(products.map(p => [p.id, p.stock])));
    setSearch("");
    setOpen(true);
  };

  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  const expected = filteredProducts.reduce((a, p) => a + p.stock, 0);
  const actual = filteredProducts.reduce((a, p) => a + (counts[p.id] ?? p.stock), 0);

  const countSummary = useMemo(() => {
    const totalExpected = products.reduce((a, b) => a + b.stock * b.cost, 0);
    const totalActual = products.reduce((a, b) => a + (counts[b.id] ?? b.stock) * b.cost, 0);
    return { totalExpected, totalActual, diff: totalActual - totalExpected };
  }, [products, counts]);

  const saveInventory = () => {
    const entries = products.map(p => ({ productId: p.id, productName: p.name, expected: p.stock, actual: counts[p.id] ?? p.stock }));
    const totalDiff = entries.reduce((a, e) => a + Math.abs(e.actual - e.expected), 0);
    const ok = requestOrExec({
      kind: "inventory.do", module: "Inventaire", action: `Inventaire ${countPeriod.toLowerCase()}`,
      description: `${products.length} articles comptés — ${totalDiff > 0 ? totalDiff + " écarts" : "Aucun écart"}`,
      details: { articles: String(products.length), écarts: String(totalDiff), période: countPeriod },
      payload: { counts: entries, period: countPeriod },
    });
    push(ok ? `Inventaire ${countPeriod.toLowerCase()} validé (${products.length} articles)` : "Action en attente de validation par l'administrateur");
    setOpen(false); setConfirmOpen(ok);
  };

  // ------- Export PDF feuille d'inventaire physique (style Inventory Sheet)
  const exportInventorySheetPDF = () => {
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageW = 210, M = 14;
    const shopName = ss.name || "Hi-Market";
    const today = new Date().toLocaleDateString("fr-FR");

    // Titre
    doc.setFont("helvetica", "black");
    doc.setFontSize(28);
    doc.setTextColor(15, 23, 42);
    doc.text("FEUILLE D'INVENTAIRE", pageW / 2, 22, { align: "center" });

    // Département & Date
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    doc.text(`Établissement : ${shopName}`, M, 32);
    doc.text(`Période : ${countPeriod}`, M + 90, 32);
    doc.text(`Date : ${today}`, M + 150, 32);

    // Ligne de séparation sous le titre
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.6);
    doc.line(M, 36, pageW - M, 36);

    // En-tête du tableau
    const rowH  = 8.5;
    const col1  = M;
    const col2  = M + 50;
    const col3  = M + 132;
    const col4  = M + 158;
    let y = 44;

    doc.setFillColor(241, 245, 249);
    doc.rect(col1, y - 5, pageW - 2 * M, rowH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("ARTICLE", col1 + 2, y);
    doc.text("DÉSIGNATION / CATÉGORIE", col2 + 2, y);
    doc.text("QTÉ THÉO.", col3, y, { align: "right" });
    doc.text("QTÉ RÉELLE", col4, y, { align: "right" });
    doc.text("ÉCART", pageW - M - 2, y, { align: "right" });
    y += rowH;

    // Lignes produits
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const list = search
      ? products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
      : products;

    list.forEach((p, i) => {
      if (y > 268) { doc.addPage(); y = 20; }
      const actual = counts[p.id] ?? p.stock;
      const diff = actual - p.stock;

      // Zebra
      if (i % 2 === 0) {
        doc.setFillColor(250, 250, 250);
        doc.rect(col1, y - 5.5, pageW - 2 * M, rowH, "F");
      }

      // Séparateur pointillé
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.2);
      doc.line(col1, y + 2.5, pageW - M, y + 2.5);

      doc.setTextColor(30, 41, 59);
      doc.text(p.name.length > 28 ? p.name.slice(0, 27) + "…" : p.name, col1 + 2, y);
      doc.setTextColor(100, 116, 139);
      doc.text(p.category || "—", col2 + 2, y);
      doc.setTextColor(30, 41, 59);
      doc.text(String(p.stock), col3, y, { align: "right" });
      doc.text(String(actual), col4, y, { align: "right" });

      // Couleur écart
      if (diff < 0) doc.setTextColor(220, 38, 38);
      else if (diff > 0) doc.setTextColor(22, 163, 74);
      else doc.setTextColor(100, 116, 139);
      doc.setFont("helvetica", diff !== 0 ? "bold" : "normal");
      doc.text((diff >= 0 ? "+" : "") + diff, pageW - M - 2, y, { align: "right" });
      doc.setFont("helvetica", "normal");
      y += rowH;
    });

    // Lignes vides si peu de produits
    const minRows = 25;
    if (list.length < minRows) {
      doc.setTextColor(203, 213, 225);
      for (let r = list.length; r < minRows; r++) {
        if (y > 268) { doc.addPage(); y = 20; }
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.2);
        doc.line(col1, y + 2.5, pageW - M, y + 2.5);
        y += rowH;
      }
    }

    // Ligne de fin
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.4);
    doc.line(M, y + 3, pageW - M, y + 3);

    // Notes
    y += 8;
    if (y > 265) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    doc.text("NOTES :", M, y);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    for (let n = 0; n < 3; n++) {
      if (y + 8 + n * 8 > 278) break;
      doc.line(M + 18, y + n * 8, pageW - M, y + n * 8);
    }

    // Pied
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Feuille d'inventaire générée par ${shopName} le ${today}`, pageW / 2, 288, { align: "center" });

    doc.save(`Inventaire_${countPeriod}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // ------- Export PDF du rapport complet
  const nf = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const exportReportPDF = () => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = 210, M = 15;
    const cur = ss.currency || "FCFA";
    const shopName = ss.name || "Hi-Market";

    // En-tête
    doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(15, 23, 42);
    doc.text(shopName, M, 20);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(71, 85, 105);
    const idParts = [ss.ifu ? "IFU : " + ss.ifu : "", ss.rccm ? "RCCM : " + ss.rccm : ""].filter(Boolean);
    if (idParts.length) doc.text(idParts.join("  ·  "), M, 26);

    doc.setFillColor(15, 23, 42); doc.roundedRect(pageW - M - 68, 12, 68, 22, 2, 2, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text("RAPPORT D'ACTIVITÉ", pageW - M - 4, 20, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    doc.text(PERIOD_LABEL[period], pageW - M - 4, 26, { align: "right" });
    doc.text("Édité le " + fmtDate(new Date().toISOString().slice(0, 10)), pageW - M - 4, 31, { align: "right" });

    let y = 42;
    doc.setDrawColor(15, 23, 42); doc.setLineWidth(0.6); doc.line(M, y, pageW - M, y); y += 8;

    // Bloc financier
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(15, 23, 42);
    doc.text("Synthèse financière", M, y); y += 7;

    const rows: [string, string, boolean?][] = [
      ["Chiffre d'affaires", nf(report.revenue) + " " + cur],
      ["Coût des marchandises vendues", "- " + nf(report.cogs) + " " + cur],
      ["Bénéfice brut  (marge " + report.margin.toFixed(1) + "%)", nf(report.grossProfit) + " " + cur, true],
      ["Pertes & péremptions", "- " + nf(report.lossesTotal) + " " + cur],
      ["Résultat net estimé", nf(report.netResult) + " " + cur, true],
      ["Achats fournisseurs (sorties de trésorerie)", nf(report.purchasesTotal) + " " + cur],
    ];
    doc.setFontSize(10);
    rows.forEach(([label, val, strong]) => {
      if (strong) {
        doc.setFillColor(241, 245, 249); doc.rect(M, y - 4.5, pageW - 2 * M, 7, "F");
        doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42);
      } else {
        doc.setFont("helvetica", "normal"); doc.setTextColor(71, 85, 105);
      }
      doc.text(label, M + 2, y);
      doc.text(val, pageW - M - 2, y, { align: "right" });
      y += 7;
    });

    y += 5;
    // Indicateurs opérationnels
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(15, 23, 42);
    doc.text("Indicateurs opérationnels", M, y); y += 7;
    const ops: [string, string][] = [
      ["Nombre de ventes", String(report.nbSales)],
      ["Articles vendus", String(report.itemsSold)],
      ["Panier moyen", nf(report.avgBasket) + " " + cur],
      ["Commandes fournisseurs", String(report.nbPurchases)],
      ["Valeur du stock (coût)", nf(report.stockValueCost) + " " + cur],
      ["Valeur du stock (vente)", nf(report.stockValueSale) + " " + cur],
      ["Articles en stock critique", String(report.lowStock)],
      ["Articles en rupture", String(report.outStock)],
    ];
    doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(71, 85, 105);
    ops.forEach(([label, val], i) => {
      const col = i % 2; const cx = M + col * ((pageW - 2 * M) / 2);
      if (col === 0 && i > 0) y += 7;
      doc.text(label, cx + 2, y);
      doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42);
      doc.text(val, cx + (pageW - 2 * M) / 2 - 2, y, { align: "right" });
      doc.setFont("helvetica", "normal"); doc.setTextColor(71, 85, 105);
    });
    y += 12;

    // Top produits
    if (report.topProducts.length > 0) {
      if (y > 240) { doc.addPage(); y = 20; }
      doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(15, 23, 42);
      doc.text("Top produits vendus", M, y); y += 7;
      doc.setFillColor(241, 245, 249); doc.rect(M, y - 4.5, pageW - 2 * M, 7, "F");
      doc.setFontSize(9); doc.text("Produit", M + 2, y);
      doc.text("Qté", 120, y, { align: "right" });
      doc.text("CA", 160, y, { align: "right" });
      doc.text("Bénéf.", pageW - M - 2, y, { align: "right" });
      y += 7;
      doc.setFont("helvetica", "normal"); doc.setTextColor(30, 41, 59);
      report.topProducts.forEach(p => {
        doc.text(p.name.length > 40 ? p.name.slice(0, 39) + "…" : p.name, M + 2, y);
        doc.text(String(p.qty), 120, y, { align: "right" });
        doc.text(nf(p.total), 160, y, { align: "right" });
        doc.text(nf(p.profit), pageW - M - 2, y, { align: "right" });
        y += 6.5;
      });
    }

    // Pied
    doc.setFontSize(8); doc.setTextColor(148, 163, 184);
    doc.text(`Rapport généré par ${shopName} © ${new Date().getFullYear()}`, pageW / 2, 288, { align: "center" });

    doc.save(`Rapport_${period}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // Composant carte KPI
  const kpi = (label: string, value: string, icon: React.ReactNode, tone: string, sub?: string, subTone = "text-slate-500") => (
    <Card className="p-4 sm:p-5 flex flex-col">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
          <p className="text-lg sm:text-2xl font-black text-slate-900 mt-1.5 truncate">{value}</p>
        </div>
        <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${tone}`}>{icon}</div>
      </div>
      {sub && <p className={`text-[11px] mt-auto pt-3 text-right font-medium ${subTone}`}>{sub}</p>}
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900">Inventaire & Rapports</h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">Analyse d'activité · {PERIOD_LABEL[period]}</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <SearchSelect className="flex-1 sm:w-44" value={period} onChange={v => setPeriod(v as Period)}
            options={[
              { value: "7j", label: "7 derniers jours" },
              { value: "30j", label: "30 derniers jours" },
              { value: "90j", label: "90 derniers jours" },
              { value: "all", label: "Depuis le début" },
            ]} />
          <Button variant="outline" onClick={exportReportPDF} className="flex-shrink-0"><IconDownload size={16} /> <span className="hidden sm:inline">Rapport</span></Button>
        </div>
      </div>

      {/* KPIs financiers */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {kpi("Chiffre d'affaires", fmtCurrency(report.revenue), <IconCurrency className="text-white" size={20} />, "bg-slate-900", `${report.nbSales} vente${report.nbSales > 1 ? "s" : ""}`)}
        {kpi("Bénéfice brut", fmtCurrency(report.grossProfit), <IconTrend className="text-white" size={20} />, "bg-emerald-600", `Marge ${report.margin.toFixed(1)}%`, report.grossProfit >= 0 ? "text-emerald-600" : "text-rose-600")}
        {kpi("Pertes & péremptions", fmtCurrency(report.lossesTotal), <IconAlert className="text-white" size={20} />, "bg-rose-600", `${report.nbLosses} entrée${report.nbLosses > 1 ? "s" : ""}`, "text-rose-600")}
        {kpi("Résultat net estimé", fmtCurrency(report.netResult), <IconCurrency className="text-white" size={20} />, report.netResult >= 0 ? "bg-sky-600" : "bg-rose-600", "Bénéf. brut − pertes", report.netResult >= 0 ? "text-emerald-600" : "text-rose-600")}
      </div>

      {/* KPIs opérationnels */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {kpi("Panier moyen", fmtCurrency(report.avgBasket), <IconCart className="text-white" size={20} />, "bg-indigo-600", `${report.itemsSold} article${report.itemsSold > 1 ? "s" : ""} vendus`)}
        {kpi("Achats fournisseurs", fmtCurrency(report.purchasesTotal), <IconBox className="text-white" size={20} />, "bg-amber-600", `${report.nbPurchases} commande${report.nbPurchases > 1 ? "s" : ""}`)}
        {kpi("Valeur du stock", fmtCurrency(report.stockValueCost), <IconClipboard className="text-white" size={20} />, "bg-teal-600", `${fmtCurrency(report.stockValueSale)} en vente`)}
        {kpi("Alertes stock", `${report.lowStock}`, <IconAlert className="text-white" size={20} />, "bg-orange-500", `${report.outStock} en rupture`, report.lowStock > 0 ? "text-orange-600" : "text-slate-500")}
      </div>

      {/* Analyses détaillées */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top produits */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-900">Top produits vendus</h3>
            <Badge tone="sky">{PERIOD_LABEL[period]}</Badge>
          </div>
          {report.topProducts.length === 0 ? (
            <p className="text-slate-500 text-sm py-6 text-center">Aucune vente sur la période.</p>
          ) : (
            <div className="space-y-3">
              {report.topProducts.map((p, i) => {
                const max = report.topProducts[0].total;
                const pct = max > 0 ? Math.round((p.total / max) * 100) : 0;
                return (
                  <div key={p.name}>
                    <div className="flex items-center justify-between text-sm gap-2">
                      <span className="font-semibold text-slate-800 truncate">{i + 1}. {p.name}</span>
                      <span className="text-slate-600 whitespace-nowrap text-xs sm:text-sm">{p.qty} vendu(s) · <b>{fmtCurrency(p.total)}</b></span>
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

        {/* Modes de paiement + meilleurs clients */}
        <Card className="p-5">
          <h3 className="font-bold text-slate-900 mb-4">Modes de paiement</h3>
          {report.payments.length === 0 ? (
            <p className="text-slate-500 text-sm py-2 text-center">Aucune donnée.</p>
          ) : (
            <div className="space-y-2">
              {report.payments.map(p => {
                const pct = report.revenue > 0 ? Math.round((p.total / report.revenue) * 100) : 0;
                return (
                  <div key={p.method} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50">
                    <span className="text-sm font-medium text-slate-800">{p.method}</span>
                    <span className="text-xs text-slate-500">{pct}% · <b className="text-slate-900">{fmtCurrency(p.total)}</b></span>
                  </div>
                );
              })}
            </div>
          )}

          {report.topCustomers.length > 0 && (
            <>
              <h3 className="font-bold text-slate-900 mt-5 mb-3">Meilleurs clients</h3>
              <div className="space-y-2">
                {report.topCustomers.map((c, i) => (
                  <div key={c.name} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50">
                    <span className="text-sm font-medium text-slate-800 truncate">{i + 1}. {c.name}</span>
                    <b className="text-xs text-slate-900 whitespace-nowrap">{fmtCurrency(c.total)}</b>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Section inventaire physique */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900">Inventaire physique</h3>
            <p className="text-slate-500 text-xs mt-0.5">{inventory.length} comptage{inventory.length > 1 ? "s" : ""} enregistré{inventory.length > 1 ? "s" : ""} · {products.length} articles à compter</p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <SearchSelect className="flex-1 sm:w-32" value={countPeriod} onChange={v => setCountPeriod(v as "Semaine" | "Mois")}
              options={[
                { value: "Semaine", label: "Semaine" },
                { value: "Mois", label: "Mois" },
              ]} />
            <Button onClick={startInventory} className="flex-1 sm:flex-none whitespace-nowrap"><IconPlus size={16} /> Compter</Button>
          </div>
        </div>

        {/* Desktop table */}
        <Card className="p-5 hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-slate-600 uppercase text-xs border-b border-slate-200">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Période</th>
                  <th className="py-3 px-4">Produit</th>
                  <th className="py-3 px-4 text-right">Théorique</th>
                  <th className="py-3 px-4 text-right">Réel</th>
                  <th className="py-3 px-4 text-right">Écart</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map(i => (
                  <tr key={i.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 px-4 text-slate-600">{fmtDate(i.date)}</td>
                    <td className="py-3 px-4"><Badge tone="sky">{i.period}</Badge></td>
                    <td className="py-3 px-4 font-semibold">{i.productName}</td>
                    <td className="py-3 px-4 text-right">{i.expected}</td>
                    <td className="py-3 px-4 text-right">{i.actual}</td>
                    <td className={`py-3 px-4 text-right font-bold ${i.difference < 0 ? "text-rose-600" : i.difference > 0 ? "text-emerald-600" : "text-slate-700"}`}>{i.difference >= 0 ? "+" : ""}{i.difference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {inventory.length === 0 && <EmptyState title="Aucun inventaire" subtitle="Lancez votre premier comptage" />}
        </Card>

        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {inventory.length === 0 && <Card className="p-6"><EmptyState title="Aucun inventaire" subtitle="Lancez votre premier comptage" /></Card>}
          {inventory.map(i => (
            <Card key={i.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 truncate">{i.productName}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{fmtDate(i.date)}</div>
                </div>
                <Badge tone="sky">{i.period}</Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                <div className="rounded-lg bg-slate-50 py-2">
                  <div className="text-[10px] uppercase text-slate-500 font-semibold">Théorique</div>
                  <div className="font-bold text-slate-900">{i.expected}</div>
                </div>
                <div className="rounded-lg bg-slate-50 py-2">
                  <div className="text-[10px] uppercase text-slate-500 font-semibold">Réel</div>
                  <div className="font-bold text-slate-900">{i.actual}</div>
                </div>
                <div className={`rounded-lg py-2 ${i.difference < 0 ? "bg-rose-50" : i.difference > 0 ? "bg-emerald-50" : "bg-slate-50"}`}>
                  <div className="text-[10px] uppercase text-slate-500 font-semibold">Écart</div>
                  <div className={`font-bold ${i.difference < 0 ? "text-rose-600" : i.difference > 0 ? "text-emerald-600" : "text-slate-700"}`}>{i.difference >= 0 ? "+" : ""}{i.difference}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Modal comptage */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Comptage ${countPeriod.toLowerCase()}`}
        size="lg"
        footer={
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs sm:text-sm text-slate-600">Écart valeur : <b className={countSummary.diff < 0 ? "text-rose-600" : "text-emerald-700"}>{countSummary.diff >= 0 ? "+" : ""}{fmtCurrency(countSummary.diff)}</b></div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="ghost" onClick={() => setOpen(false)} className="flex-1 sm:flex-none">Annuler</Button>
              <Button variant="outline" onClick={exportInventorySheetPDF} className="flex-1 sm:flex-none"><IconDownload size={15} /> Imprimer PDF</Button>
              <Button variant="success" onClick={saveInventory} className="flex-1 sm:flex-none">Valider</Button>
            </div>
          </div>
        }
      >
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
          <Card className="p-3 bg-slate-50">
            <div className="text-[10px] sm:text-xs text-slate-500 font-semibold uppercase">Articles</div>
            <div className="text-base sm:text-lg font-black">{filteredProducts.length}</div>
          </Card>
          <Card className="p-3 bg-slate-50">
            <div className="text-[10px] sm:text-xs text-slate-500 font-semibold uppercase">Théo. / Réel</div>
            <div className="text-base sm:text-lg font-black">{expected}/{actual}</div>
          </Card>
          <Card className="p-3 bg-slate-50">
            <div className="text-[10px] sm:text-xs text-slate-500 font-semibold uppercase">Valeur réelle</div>
            <div className="text-sm sm:text-lg font-black truncate">{fmtCurrency(countSummary.totalActual)}</div>
          </Card>
        </div>

        <div className="relative mb-3">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={inputClass + " pl-9"} placeholder="Filtrer par produit..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="space-y-2.5 max-h-[45vh] overflow-y-auto pr-1 -mr-1">
          {filteredProducts.length === 0 && (
            <p className="text-center text-slate-500 text-sm py-8">Aucun produit trouvé.</p>
          )}
          {filteredProducts.map(p => {
            const val = counts[p.id] ?? p.stock;
            const diff = val - p.stock;
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
                    <div className="text-sm font-bold text-slate-700">{p.stock} {p.unit}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500 font-medium flex-shrink-0">Compté :</span>
                  <div className="flex items-center gap-1 flex-1">
                    <button onClick={() => step(-1)} className="w-8 h-8 rounded-lg bg-white border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-slate-100 active:scale-95 transition flex-shrink-0">
                      <IconMinus size={13} />
                    </button>
                    <input
                      type="number"
                      className={inputClass + " !py-1.5 text-center flex-1 min-w-0 font-bold"}
                      value={val}
                      onChange={e => setCounts(c => ({ ...c, [p.id]: +e.target.value }))}
                    />
                    <button onClick={() => step(1)} className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center hover:bg-slate-800 active:scale-95 transition flex-shrink-0">
                      <IconPlus size={13} />
                    </button>
                  </div>
                  <div className={`flex-shrink-0 min-w-[54px] text-center text-xs font-bold px-2 py-1 rounded-lg ${
                    diff < 0 ? "bg-rose-100 text-rose-700" : diff > 0 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                  }`}>
                    {diff >= 0 ? "+" : ""}{diff}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Inventaire validé">
        <p className="text-sm text-slate-600">L'inventaire a été enregistré et les stocks ajustés automatiquement.</p>
        <div className="flex flex-wrap justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => window.print()}><IconPrinter size={16} /> Imprimer</Button>
          <Button onClick={exportReportPDF}><IconDownload size={16} /> Rapport PDF</Button>
          <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Fermer</Button>
        </div>
      </Modal>
    </div>
  );
}
