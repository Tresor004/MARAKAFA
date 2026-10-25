/**
 * Fiches d'inventaire imprimables (A4, HTML autonome passé à printHtml) :
 * - fiche de comptage vierge, à remplir à la main pendant le comptage ;
 * - fiche de résultat d'un inventaire (théorique / compté / écart / valeur de l'écart).
 */
import type { ShopSettings } from "../types";
import { fmtDate } from "../store";

export interface CountSheetProduct {
  name: string;
  category: string;
  barcode?: string | null;
  unit: string;
  stock: number;
}

export interface ResultSheetLine {
  name: string;
  category: string;
  unit: string;
  expected: number;
  actual: number;
  cost: number;   // coût d'achat HT unitaire (valorisation de l'écart)
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const qty = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(n);
const money = (n: number, cur: string) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(n))} ${cur}`;
const signed = (n: number, f: (v: number) => string) => (n > 0 ? "+" : n < 0 ? "−" : "") + f(Math.abs(n));
/** « Semaine » → « hebdomadaire », « Mois » → « mensuel ». */
export const periodLabel = (p: string) => (p === "Mois" ? "mensuel" : p === "Semaine" ? "hebdomadaire" : p.toLowerCase());
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

const CSS = `
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #0f172a; font-size: 10.5px; }
  .hd { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #0f172a; padding-bottom: 10px; }
  .shop { display: flex; gap: 10px; align-items: center; }
  .shop img { width: 42px; height: 42px; border-radius: 8px; object-fit: cover; }
  .shop h1 { margin: 0; font-size: 20px; font-weight: 900; letter-spacing: 1px; }
  .shop .sub { color: #64748b; font-size: 10px; margin-top: 2px; }
  .tag { background: #0f172a; color: #fff; padding: 8px 12px; border-radius: 6px; text-align: right; }
  .tag .t { font-size: 13px; font-weight: 800; letter-spacing: .5px; }
  .tag .s { font-size: 10px; opacity: .85; margin-top: 2px; }
  .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 16px; margin: 10px 0 12px; }
  .meta div { border-bottom: 1px solid #cbd5e1; padding: 3px 0; }
  .meta b { color: #475569; font-weight: 600; margin-right: 4px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
  .kpi { border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 8px; }
  .kpi .l { font-size: 8.5px; text-transform: uppercase; letter-spacing: .6px; color: #64748b; font-weight: 700; }
  .kpi .v { font-size: 14px; font-weight: 900; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { background: #f1f5f9; text-align: left; font-size: 8.5px; text-transform: uppercase; letter-spacing: .5px; color: #334155; padding: 6px; border-bottom: 1.5px solid #0f172a; }
  td { padding: 6px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
  tr { page-break-inside: avoid; }
  .r { text-align: right; } .c { text-align: center; }
  .muted { color: #64748b; } .neg { color: #dc2626; font-weight: 700; } .pos { color: #16a34a; font-weight: 700; }
  .cat td { background: #f8fafc; font-weight: 800; font-size: 10px; border-bottom: 1px solid #94a3b8; padding-top: 9px; }
  .box { border: 1px solid #94a3b8; border-radius: 3px; height: 18px; }
  .tot td { font-weight: 800; border-top: 1.5px solid #0f172a; border-bottom: none; background: #f8fafc; }
  .notes { margin-top: 14px; }
  .notes .line { border-bottom: 1px solid #cbd5e1; height: 20px; }
  .sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 18px; page-break-inside: avoid; }
  .sign div { border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px; height: 62px; font-size: 9.5px; color: #475569; font-weight: 600; }
  .draft { color: #b45309; font-weight: 700; font-size: 10px; margin-top: 4px; }
  .ft { margin-top: 14px; text-align: center; color: #94a3b8; font-size: 9px; }
`;

function header(ss: ShopSettings, title: string, subtitle: string): string {
  const name = ss.name || "Hi-Market";
  const ids = [ss.ifu ? `IFU : ${ss.ifu}` : "", ss.rccm ? `RCCM : ${ss.rccm}` : ""].filter(Boolean).join(" · ");
  const place = [ss.address, ss.city, ss.country].filter(Boolean).join(", ");
  return `<div class="hd">
    <div class="shop">${ss.logo ? `<img src="${esc(ss.logo)}" alt="">` : ""}<div>
      <h1>${esc(name)}</h1>
      ${ids ? `<div class="sub">${esc(ids)}</div>` : ""}
      ${place ? `<div class="sub">${esc(place)}</div>` : ""}
    </div></div>
    <div class="tag"><div class="t">${esc(title)}</div><div class="s">${esc(subtitle)}</div></div>
  </div>`;
}

const signatures = (labels: string[]) => `<div class="sign">${labels.map(l => `<div>${esc(l)}</div>`).join("")}</div>`;
const notes = `<div class="notes"><b>Observations :</b>${'<div class="line"></div>'.repeat(3)}</div>`;
const footer = (ss: ShopSettings) => `<div class="ft">Document édité par ${esc(ss.name || "Hi-Market")} le ${fmtDate(todayIso())}</div>`;

/** Fiche de comptage vierge, regroupée par catégorie. `showExpected = false` = comptage « à l'aveugle ». */
export function buildCountSheet(o: {
  ss: ShopSettings; products: CountSheetProduct[]; period: string; categoryLabel: string; showExpected: boolean;
}): string {
  const groups = new Map<string, CountSheetProduct[]>();
  [...o.products]
    .sort((a, b) => (a.category || "~").localeCompare(b.category || "~", "fr") || a.name.localeCompare(b.name, "fr"))
    .forEach(p => { const k = p.category || "Sans catégorie"; groups.set(k, [...(groups.get(k) ?? []), p]); });

  const cols = o.showExpected ? 7 : 6;
  let n = 0;
  const rows = [...groups.entries()].map(([cat, list]) =>
    `<tr class="cat"><td colspan="${cols}">${esc(cat)} <span class="muted">(${list.length})</span></td></tr>` +
    list.map(p => `<tr>
      <td class="muted c">${++n}</td>
      <td><b>${esc(p.name)}</b>${p.barcode ? `<div class="muted">${esc(p.barcode)}</div>` : ""}</td>
      <td class="muted">${esc(p.unit || "")}</td>
      ${o.showExpected ? `<td class="r">${qty(p.stock)}</td>` : ""}
      <td style="width:18%"><div class="box"></div></td>
      <td style="width:10%"><div class="box"></div></td>
      <td style="width:18%"></td>
    </tr>`).join("")).join("");

  return `<style>${CSS}</style>
    ${header(o.ss, "FICHE DE COMPTAGE", `Inventaire ${periodLabel(o.period)}`)}
    <div class="meta">
      <div><b>Date :</b> ____ / ____ / ________</div>
      <div><b>Catégorie :</b> ${esc(o.categoryLabel)}</div>
      <div><b>Articles :</b> ${o.products.length}</div>
      <div><b>Zone / rayon :</b></div>
    </div>
    <table>
      <thead><tr>
        <th class="c" style="width:4%">N°</th><th>Désignation</th><th style="width:7%">Unité</th>
        ${o.showExpected ? `<th class="r" style="width:9%">Théorique</th>` : ""}
        <th>Quantité comptée</th><th>Écart</th><th>Remarque</th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="${cols}" class="c muted">Aucun article</td></tr>`}</tbody>
    </table>
    ${notes}
    ${signatures(["Compté par (nom et signature)", "Vérifié par", "Validé par le responsable"])}
    ${footer(o.ss)}`;
}

/** Fiche de résultat d'un inventaire (enregistré ou en cours de saisie). */
export function buildResultSheet(o: {
  ss: ShopSettings; lines: ResultSheetLine[]; period: string; date: string; userName?: string | null; draft?: boolean; onlyDiscrepancies?: boolean;
}): string {
  const cur = o.ss.currency || "FCFA";
  const all = o.lines.map(l => ({ ...l, diff: Math.round((l.actual - l.expected) * 1000) / 1000 }));
  const lines = (o.onlyDiscrepancies ? all.filter(l => l.diff !== 0) : all)
    .sort((a, b) => (a.category || "~").localeCompare(b.category || "~", "fr") || a.name.localeCompare(b.name, "fr"));
  const withDiff = all.filter(l => l.diff !== 0).length;
  const missing = all.reduce((a, l) => a + (l.diff < 0 ? -l.diff * l.cost : 0), 0);
  const extra = all.reduce((a, l) => a + (l.diff > 0 ? l.diff * l.cost : 0), 0);
  const accuracy = all.length ? Math.round(((all.length - withDiff) / all.length) * 1000) / 10 : 100;
  const m = (v: number) => money(v, cur);

  const rows = lines.map((l, i) => `<tr>
    <td class="muted c">${i + 1}</td>
    <td><b>${esc(l.name)}</b><div class="muted">${esc(l.category || "Sans catégorie")}</div></td>
    <td class="r">${qty(l.expected)} <span class="muted">${esc(l.unit || "")}</span></td>
    <td class="r">${qty(l.actual)}</td>
    <td class="r ${l.diff < 0 ? "neg" : l.diff > 0 ? "pos" : "muted"}">${l.diff === 0 ? "0" : signed(l.diff, qty)}</td>
    <td class="r ${l.diff < 0 ? "neg" : l.diff > 0 ? "pos" : "muted"}">${l.diff === 0 ? "—" : signed(l.diff * l.cost, m)}</td>
  </tr>`).join("");

  return `<style>${CSS}</style>
    ${header(o.ss, "FICHE D'INVENTAIRE", `Inventaire ${periodLabel(o.period)} · ${fmtDate(o.date)}`)}
    ${o.draft ? `<div class="draft">Brouillon : comptage en cours, non encore validé.</div>` : ""}
    <div class="meta">
      <div><b>Date :</b> ${fmtDate(o.date)}</div>
      <div><b>Type :</b> ${esc(periodLabel(o.period))}</div>
      <div><b>Réalisé par :</b> ${esc(o.userName || "—")}</div>
      <div><b>Articles comptés :</b> ${all.length}</div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="l">Articles avec écart</div><div class="v">${withDiff}</div></div>
      <div class="kpi"><div class="l">Taux d'exactitude</div><div class="v">${String(accuracy).replace(".", ",")} %</div></div>
      <div class="kpi"><div class="l">Manquants (valeur)</div><div class="v neg">${missing ? "−" + m(missing) : m(0)}</div></div>
      <div class="kpi"><div class="l">Excédents (valeur)</div><div class="v pos">${extra ? "+" + m(extra) : m(0)}</div></div>
    </div>
    <table>
      <thead><tr>
        <th class="c" style="width:4%">N°</th><th>Désignation</th><th class="r">Théorique</th><th class="r">Compté</th><th class="r">Écart</th><th class="r">Valeur écart</th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="6" class="c muted">${o.onlyDiscrepancies ? "Aucun écart constaté" : "Aucun article"}</td></tr>`}</tbody>
      <tfoot><tr class="tot"><td></td><td>Écart net${o.onlyDiscrepancies ? ` (${lines.length} ligne${lines.length > 1 ? "s" : ""} avec écart)` : ""}</td><td></td><td></td><td></td>
        <td class="r ${extra - missing < 0 ? "neg" : extra - missing > 0 ? "pos" : ""}">${signed(extra - missing, m) || m(0)}</td></tr></tfoot>
    </table>
    <p class="muted" style="margin-top:6px">Écarts valorisés au prix d'achat HT actuel des produits.</p>
    ${notes}
    ${signatures(["Réalisé par", "Vérifié par", "Validé par le responsable"])}
    ${footer(o.ss)}`;
}
