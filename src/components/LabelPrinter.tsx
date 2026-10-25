import { useMemo, useState } from "react";
import { useStore, fmtCurrency } from "../store";
import { Product } from "../types";
import { Badge, Button, Card, EmptyState, Field, inputClass, useToast } from "./ui";
import { IconPrinter, IconSearch } from "./Icons";
import BarcodeSvg from "./BarcodeSvg";
import { barcodeSvgString, canEncode } from "../utils/barcode";
import { printHtml } from "../utils/print";

interface Preset { id: string; label: string; w: number; h: number; cols?: number; sheet?: boolean }

/** Formats courants : rouleaux d'imprimante d'étiquettes (une étiquette par page) et planches A4 adhésives. */
const PRESETS: Preset[] = [
  { id: "roll-38x25", label: "Rouleau 38 × 25 mm", w: 38, h: 25 },
  { id: "roll-50x30", label: "Rouleau 50 × 30 mm", w: 50, h: 30 },
  { id: "roll-70x40", label: "Rouleau 70 × 40 mm", w: 70, h: 40 },
  { id: "a4-3x8", label: "Planche A4 — 24 étiquettes (70 × 37 mm)", w: 70, h: 37, cols: 3, sheet: true },
  { id: "a4-5x13", label: "Planche A4 — 65 étiquettes (38 × 21 mm)", w: 38.1, h: 21.2, cols: 5, sheet: true },
];

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

interface Opts { showName: boolean; showPrice: boolean; showCode: boolean }

function labelHtml(p: Product, preset: Preset, o: Opts, currency: (n: number) => string): string {
  const small = preset.h < 30;
  const barH = Math.round((preset.h - (o.showName ? (small ? 6 : 8) : 3) - (o.showPrice ? 5 : 0) - (o.showCode ? 3.5 : 0) - 3) * 3.78);
  return `<div class="l"><div>${o.showName ? `<div class="n">${esc(p.name)}</div>` : ""}</div>
    <div class="b">${barcodeSvgString(p.barcode as string, Math.max(18, barH), 8)}</div>
    ${o.showCode ? `<div class="c">${esc(p.barcode as string)}</div>` : ""}
    ${o.showPrice ? `<div class="p">${esc(currency(p.price))}</div>` : ""}</div>`;
}

export function buildLabelsDocument(items: { p: Product; copies: number }[], preset: Preset, o: Opts, currency: (n: number) => string): string {
  const labels: string[] = [];
  for (const { p, copies } of items) for (let i = 0; i < copies; i++) labels.push(labelHtml(p, preset, o, currency));
  const fs = preset.h < 30 ? 6.5 : 8;
  const css = `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,Helvetica,sans-serif;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .l{width:${preset.w}mm;height:${preset.h}mm;padding:1.2mm 1.5mm;display:flex;flex-direction:column;align-items:center;justify-content:space-between;overflow:hidden;text-align:center;page-break-inside:avoid}
    .n{font-size:${fs}pt;font-weight:700;line-height:1.1;max-height:${fs * 2.4}pt;overflow:hidden}
    .b{width:100%}.b svg{display:block;width:100%}
    .c{font-family:'Courier New',monospace;font-size:${fs - 0.5}pt;letter-spacing:.08em}
    .p{font-size:${fs + 3}pt;font-weight:800}
    ${preset.sheet
      ? `@page{size:A4;margin:0}.g{display:grid;grid-template-columns:repeat(${preset.cols},${preset.w}mm);grid-auto-rows:${preset.h}mm;width:210mm;margin:0 auto;justify-content:center}`
      : `@page{size:${preset.w}mm ${preset.h}mm;margin:0}.l{page-break-after:always}`}`;
  return `<style>${css}</style>${preset.sheet ? `<div class="g">${labels.join("")}</div>` : labels.join("")}`;
}

/** Sélection de produits + nombre d'exemplaires + format → impression d'étiquettes code-barres (EAN-13 ou Code 128). */
export default function LabelPrinter() {
  const { products } = useStore();
  const { push } = useToast();
  const [search, setSearch] = useState("");
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [presetId, setPresetId] = useState(PRESETS[3].id);
  const [opts, setOpts] = useState<Opts>({ showName: true, showPrice: true, showCode: true });

  const preset = PRESETS.find(p => p.id === presetId) ?? PRESETS[0];
  const shown = useMemo(() => {
    const q = search.toLowerCase().trim();
    return products.filter(p => !q || p.name.toLowerCase().includes(q) || (p.barcode || "").includes(q));
  }, [products, search]);

  const printable = (p: Product) => canEncode(p.barcode);
  const selected = products.filter(p => (copies[p.id] ?? 0) > 0 && printable(p));
  const totalLabels = selected.reduce((a, p) => a + (copies[p.id] ?? 0), 0);
  const withoutCode = products.filter(p => !printable(p)).length;
  const money = (n: number) => fmtCurrency(n);

  const setCopy = (id: string, n: number) => setCopies(c => ({ ...c, [id]: Math.max(0, Math.min(500, Math.floor(n) || 0)) }));
  const selectShown = () => setCopies(c => { const n = { ...c }; shown.filter(printable).forEach(p => { if (!n[p.id]) n[p.id] = 1; }); return n; });
  const selectLowStock = () => setCopies(c => { const n = { ...c }; products.filter(p => printable(p) && p.stock <= p.minStock).forEach(p => { n[p.id] = Math.max(1, Math.ceil(p.minStock)); }); return n; });

  const print = () => {
    if (totalLabels === 0) return push("Choisissez au moins un produit (avec un code-barres)", "error");
    printHtml(buildLabelsDocument(selected.map(p => ({ p, copies: copies[p.id] })), preset, opts, money), "Étiquettes");
  };

  const sample = selected[0] ?? products.find(printable);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 space-y-4">
        <Card className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className={inputClass + " pl-9"} placeholder="Rechercher un produit…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Rechercher un produit" />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={selectShown}>Tout sélectionner</Button>
              <Button variant="outline" onClick={selectLowStock}>Stock bas</Button>
              <Button variant="ghost" onClick={() => setCopies({})} disabled={totalLabels === 0}>Vider</Button>
            </div>
          </div>
          {withoutCode > 0 && <p className="text-xs text-amber-700 mt-3">{withoutCode} produit{withoutCode > 1 ? "s" : ""} sans code-barres exploitable : ouvrez la fiche du produit et utilisez « Générer ».</p>}
        </Card>

        <Card className="p-0 overflow-hidden">
          <div className="max-h-[520px] overflow-y-auto divide-y divide-slate-100">
            {shown.map(p => {
              const ok = printable(p);
              return (
                <div key={p.id} className={`flex items-center gap-3 px-4 py-2.5 ${ok ? "" : "opacity-50"}`}>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate">{p.name}</div>
                    <div className="text-xs text-slate-500 font-mono">{ok ? p.barcode : "pas de code-barres"}</div>
                  </div>
                  <div className="text-sm text-slate-600 hidden sm:block">{fmtCurrency(p.price)}</div>
                  <div className="flex items-center gap-1">
                    <button disabled={!ok} onClick={() => setCopy(p.id, (copies[p.id] ?? 0) - 1)} className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40" aria-label="Moins">−</button>
                    <input disabled={!ok} type="number" min="0" max="500" className="w-14 text-center text-sm border border-slate-300 rounded-lg py-1 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                      value={copies[p.id] ?? 0} onChange={e => setCopy(p.id, Number(e.target.value))} aria-label={`Exemplaires ${p.name}`} />
                    <button disabled={!ok} onClick={() => setCopy(p.id, (copies[p.id] ?? 0) + 1)} className="w-7 h-7 rounded-lg bg-slate-900 text-white disabled:opacity-40" aria-label="Plus">+</button>
                  </div>
                </div>
              );
            })}
            {shown.length === 0 && <EmptyState title="Aucun produit" subtitle="Modifiez la recherche" />}
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="p-5 space-y-4 xl:sticky xl:top-24">
          <h3 className="font-bold text-slate-900">Étiquettes</h3>
          <Field label="Format">
            <select className={inputClass} value={presetId} onChange={e => setPresetId(e.target.value)}>
              {PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Field>
          <div className="space-y-1.5 text-sm">
            {([["showName", "Nom du produit"], ["showPrice", "Prix"], ["showCode", "Numéro sous le code"]] as const).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={opts[k]} onChange={e => setOpts({ ...opts, [k]: e.target.checked })} /> {label}</label>
            ))}
          </div>
          {sample && (
            <div>
              <div className="text-[11px] uppercase font-semibold text-slate-500 mb-1.5">Aperçu</div>
              <div className="border border-dashed border-slate-300 bg-white mx-auto flex flex-col items-center justify-between text-center p-1.5" style={{ width: `${preset.w * 3.2}px`, height: `${preset.h * 3.2}px`, maxWidth: "100%" }}>
                {opts.showName ? <div className="text-[10px] font-bold leading-tight line-clamp-2">{sample.name}</div> : <span />}
                <BarcodeSvg code={sample.barcode as string} height={Math.max(14, preset.h * 1.1)} showText={opts.showCode} />
                {opts.showPrice ? <div className="text-xs font-extrabold">{fmtCurrency(sample.price)}</div> : <span />}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between text-sm"><span className="text-slate-600">À imprimer</span><Badge tone={totalLabels ? "emerald" : "slate"}>{totalLabels} étiquette{totalLabels > 1 ? "s" : ""}</Badge></div>
          <Button onClick={print} disabled={totalLabels === 0} className="w-full"><IconPrinter size={16} /> Imprimer les étiquettes</Button>
          <p className="text-[11px] text-slate-400">Dans la fenêtre d'impression : marges « Aucune » et échelle 100 % pour respecter les dimensions.</p>
        </Card>
      </div>
    </div>
  );
}
