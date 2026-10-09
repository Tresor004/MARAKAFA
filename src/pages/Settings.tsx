import { useState, useRef } from "react";
import { useStore } from "../store";
import { ShopSettings } from "../types";
import { Card, Button, Field, inputClass, SearchSelect } from "../components/ui";
import { useToast } from "../components/ui";
import { IconCamera, IconCheck, IconTrash, IconStore, IconMapPin, IconFileText, IconReceipt, IconPalette, IconPhone, IconMail, IconTag, IconCoin, IconLightbulb, IconClipboard } from "../components/Icons";

const SHOP_TYPES = [
  "Supermarché", "Boutique", "Épicerie", "Librairie", "Pharmacie",
  "Quincaillerie", "Magasin de vêtements", "Alimentation générale",
  "Bazar", "Restaurant", "Boulangerie", "Pâtisserie", "Autre",
];

const CURRENCIES = [
  { code: "XOF", symbol: "FCFA", label: "Franc CFA (BCEAO)" },
  { code: "XAF", symbol: "FCFA", label: "Franc CFA (BEAC)" },
  { code: "EUR", symbol: "€", label: "Euro" },
  { code: "USD", symbol: "$", label: "Dollar US" },
  { code: "GBP", symbol: "£", label: "Livre Sterling" },
  { code: "MAD", symbol: "MAD", label: "Dirham marocain" },
  { code: "TND", symbol: "TND", label: "Dinar tunisien" },
  { code: "GNF", symbol: "GNF", label: "Franc guinéen" },
  { code: "NGN", symbol: "₦", label: "Naira" },
];

type Section = "identity" | "contact" | "legal" | "invoicing" | "appearance";

export default function Settings() {
  const { shopSettings, updateShopSettings } = useStore();
  const { push } = useToast();
  const [form, setForm] = useState<ShopSettings>({ ...shopSettings });
  const [section, setSection] = useState<Section>("identity");
  const [hasChanges, setHasChanges] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof ShopSettings>(k: K, v: ShopSettings[K]) => {
    setForm(f => ({ ...f, [k]: v }));
    setHasChanges(true);
  };

  const save = () => {
    updateShopSettings(form);
    setHasChanges(false);
    push("Paramètres enregistrés avec succès !");
  };

  const reset = () => {
    setForm({ ...shopSettings });
    setHasChanges(false);
    push("Modifications annulées", "info");
  };

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return push("L'image ne doit pas dépasser 2 Mo", "error");
    if (!file.type.startsWith("image/")) return push("Seuls les fichiers image sont acceptés", "error");
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      set("logo", result);
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = () => { set("logo", ""); };

  const sections: { key: Section; label: string; icon: React.ReactNode }[] = [
    { key: "identity", label: "Identité", icon: <IconStore size={16} /> },
    { key: "contact", label: "Contact & Localisation", icon: <IconMapPin size={16} /> },
    { key: "legal", label: "Informations légales", icon: <IconFileText size={16} /> },
    { key: "invoicing", label: "Facturation", icon: <IconReceipt size={16} /> },
    { key: "appearance", label: "Personnalisation", icon: <IconPalette size={16} /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900">Paramètres</h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">Personnalisez les informations de votre commerce</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          {hasChanges && (
            <Button variant="ghost" onClick={reset} className="flex-1 sm:flex-none">Annuler</Button>
          )}
          <Button onClick={save} disabled={!hasChanges} variant={hasChanges ? "success" : "outline"} className="flex-1 sm:flex-none">
            <IconCheck size={16} /> Enregistrer
          </Button>
        </div>
      </div>

      {/* Preview banner */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 sm:p-8 text-white relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,.06),transparent_50%)]" />
          <div className="relative flex flex-col sm:flex-row items-center gap-5">
            {/* Logo */}
            <div className="relative group">
              {form.logo ? (
                <img src={form.logo} alt="Logo" className="w-20 h-20 rounded-2xl object-cover shadow-xl border-2 border-white/20" />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-white/10 border-2 border-dashed border-white/30 flex items-center justify-center text-3xl font-black text-white/60">
                  {(form.name || "?")[0]?.toUpperCase()}
                </div>
              )}
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <IconCamera size={22} className="text-white" />
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogo} />
            </div>
            <div className="text-center sm:text-left flex-1">
              <div className="text-2xl sm:text-3xl font-black tracking-wide">{form.name || "Nom du commerce"}</div>
              <div className="text-sm text-slate-300 mt-1">{form.type || "Type de commerce"} {form.slogan ? ` · ${form.slogan}` : ""}</div>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-400">
                {form.phone && <span className="inline-flex items-center gap-1"><IconPhone size={12} /> {form.phone}</span>}
                {form.email && <span className="inline-flex items-center gap-1"><IconMail size={12} /> {form.email}</span>}
                {form.city && <span className="inline-flex items-center gap-1"><IconMapPin size={12} /> {form.city}{form.country ? `, ${form.country}` : ""}</span>}
                {form.ifu && <span className="inline-flex items-center gap-1"><IconTag size={12} /> IFU : {form.ifu}</span>}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {sections.map(s => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
              section === s.key
                ? "bg-slate-900 text-white shadow-md shadow-slate-900/20"
                : "bg-white border border-slate-200 text-slate-700 hover:border-slate-400"
            }`}
          >
            <span>{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      {/* Form sections */}
      <Card className="p-5 sm:p-6">
        {/* IDENTITY */}
        {section === "identity" && (
          <div className="space-y-6 animate-[fadeIn_.2s_ease-out]">
            <div>
              <h2 className="text-lg font-black text-slate-900 mb-1 flex items-center gap-2"><IconStore size={20} /> Identité du commerce</h2>
              <p className="text-sm text-slate-500">Les informations fondamentales de votre établissement.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Nom du commerce" hint="Apparaîtra dans le header, les factures et les rapports.">
                <input className={inputClass} value={form.name} onChange={e => set("name", e.target.value)} placeholder="Hi-Market" />
              </Field>
              <Field label="Type de commerce">
                <SearchSelect value={form.type} onChange={v => set("type", v)}
                  options={SHOP_TYPES.map(t => ({ value: t, label: t }))} />
              </Field>
              <Field label="Slogan / sous-titre" hint="Affiché sous le nom dans les documents.">
                <input className={inputClass} value={form.slogan} onChange={e => set("slogan", e.target.value)} placeholder="Votre supermarché de confiance" />
              </Field>
              <Field label="Logo du commerce" hint="Max 2 Mo · JPG, PNG, SVG">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-medium text-slate-700 transition"
                  >
                    <IconCamera size={16} /> {form.logo ? "Changer le logo" : "Importer un logo"}
                  </button>
                  {form.logo && (
                    <button onClick={removeLogo} className="p-2 rounded-lg hover:bg-rose-50 text-rose-600" title="Supprimer le logo">
                      <IconTrash size={16} />
                    </button>
                  )}
                </div>
              </Field>
            </div>
          </div>
        )}

        {/* CONTACT */}
        {section === "contact" && (
          <div className="space-y-6 animate-[fadeIn_.2s_ease-out]">
            <div>
              <h2 className="text-lg font-black text-slate-900 mb-1 flex items-center gap-2"><IconMapPin size={20} /> Contact & Localisation</h2>
              <p className="text-sm text-slate-500">Ces informations seront imprimées sur vos factures et bons.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Téléphone principal">
                <input className={inputClass} value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+221 77 123 45 67" />
              </Field>
              <Field label="Téléphone secondaire">
                <input className={inputClass} value={form.phone2} onChange={e => set("phone2", e.target.value)} placeholder="+221 33 800 00 00" />
              </Field>
              <Field label="Adresse email">
                <input type="email" className={inputClass} value={form.email} onChange={e => set("email", e.target.value)} placeholder="contact@himarket.sn" />
              </Field>
              <Field label="Site web">
                <input className={inputClass} value={form.website} onChange={e => set("website", e.target.value)} placeholder="https://www.himarket.sn" />
              </Field>
              <Field label="Adresse physique" hint="Rue, quartier, boîte postale...">
                <input className={inputClass} value={form.address} onChange={e => set("address", e.target.value)} placeholder="123 Rue du Commerce, Plateau" />
              </Field>
              <Field label="Ville">
                <input className={inputClass} value={form.city} onChange={e => set("city", e.target.value)} placeholder="Dakar" />
              </Field>
              <Field label="Pays">
                <input className={inputClass} value={form.country} onChange={e => set("country", e.target.value)} placeholder="Sénégal" />
              </Field>
            </div>
          </div>
        )}

        {/* LEGAL */}
        {section === "legal" && (
          <div className="space-y-6 animate-[fadeIn_.2s_ease-out]">
            <div>
              <h2 className="text-lg font-black text-slate-900 mb-1 flex items-center gap-2"><IconFileText size={20} /> Informations légales</h2>
              <p className="text-sm text-slate-500">Numéros d'identification fiscale et registre de commerce.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Numéro IFU" hint="Identifiant Fiscal Unique délivré par l'administration fiscale.">
                <input className={inputClass} value={form.ifu} onChange={e => set("ifu", e.target.value)} placeholder="3202010010135" />
              </Field>
              <Field label="RCCM" hint="Registre du Commerce et du Crédit Mobilier.">
                <input className={inputClass} value={form.rccm} onChange={e => set("rccm", e.target.value)} placeholder="SN.DKR.2025.B.12345" />
              </Field>
            </div>
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
              <span className="inline-flex items-center gap-1"><IconLightbulb size={14} /> <b>Conseil :</b></span> Le numéro IFU et le RCCM sont obligatoires sur les factures commerciales dans la plupart des pays de l'espace UEMOA. Renseignez-les pour être en conformité.
            </div>
          </div>
        )}

        {/* INVOICING */}
        {section === "invoicing" && (
          <div className="space-y-6 animate-[fadeIn_.2s_ease-out]">
            <div>
              <h2 className="text-lg font-black text-slate-900 mb-1 flex items-center gap-2"><IconReceipt size={20} /> Facturation</h2>
              <p className="text-sm text-slate-500">Personnalisez la monnaie, la numérotation et le pied de facture.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Devise / Monnaie">
                <SearchSelect
                  value={form.currencyCode}
                  onChange={v => {
                    const cur = CURRENCIES.find(c => c.code === v);
                    set("currencyCode", cur?.code || v);
                    set("currency", cur?.symbol || v);
                  }}
                  options={CURRENCIES.map(c => ({ value: c.code, label: `${c.symbol} — ${c.label}` }))}
                />
              </Field>
              <Field label="Taux de taxe (%)" hint="TVA, TPS, etc. — mis à 0 si non applicable.">
                <input type="number" min="0" max="100" step="0.5" className={inputClass} value={form.taxRate} onChange={e => set("taxRate", +e.target.value)} placeholder="18" />
              </Field>
              <Field label="Préfixe de facture" hint="Ex : FAC → FAC-2025-0001">
                <input className={inputClass} value={form.invoicePrefix} onChange={e => set("invoicePrefix", e.target.value)} placeholder="FAC" />
              </Field>
              <Field label="Message de remerciement" hint="Affiché en bas de chaque facture.">
                <input className={inputClass} value={form.thankYouMessage} onChange={e => set("thankYouMessage", e.target.value)} placeholder="Merci pour votre visite ! À bientôt." />
              </Field>
            </div>
            <Field label="Pied de facture personnalisé" hint="Conditions de vente, mentions légales, etc.">
              <textarea
                className={inputClass + " min-h-[80px] resize-y"}
                value={form.invoiceFooter}
                onChange={e => set("invoiceFooter", e.target.value)}
                placeholder="Marchandise vendue ni reprise ni échangée. Paiement à réception."
              />
            </Field>
          </div>
        )}

        {/* APPEARANCE */}
        {section === "appearance" && (
          <div className="space-y-6 animate-[fadeIn_.2s_ease-out]">
            <div>
              <h2 className="text-lg font-black text-slate-900 mb-1 flex items-center gap-2"><IconPalette size={20} /> Personnalisation</h2>
              <p className="text-sm text-slate-500">Aperçu en temps réel de l'en-tête de vos factures.</p>
            </div>

            {/* Invoice preview */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <div className="bg-white p-5 sm:p-8">
                <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
                  <div className="flex items-center gap-3">
                    {form.logo ? (
                      <img src={form.logo} alt="" className="w-12 h-12 rounded-xl object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-slate-900 text-white font-black text-xl flex items-center justify-center">
                        {(form.name || "?")[0]?.toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="text-xl font-black text-slate-900">{form.name || "Nom du commerce"}</div>
                      <div className="text-xs text-slate-500">{form.type}{form.slogan ? ` · ${form.slogan}` : ""}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {[form.phone, form.email].filter(Boolean).join(" · ") || "Téléphone · Email"}
                      </div>
                    </div>
                  </div>
                  <div className="bg-slate-900 text-white rounded-lg px-3 py-2 text-right">
                    <div className="text-[10px] opacity-70">FACTURE</div>
                    <div className="text-sm font-bold">{form.invoicePrefix || "FAC"}-2025-0001</div>
                  </div>
                </div>
                <div className="mt-4 text-xs text-slate-500 space-y-0.5">
                  {form.address && <div className="flex items-center gap-1"><IconMapPin size={11} /> {form.address}{form.city ? `, ${form.city}` : ""}{form.country ? `, ${form.country}` : ""}</div>}
                  {form.ifu && <div className="flex items-center gap-1"><IconTag size={11} /> IFU : {form.ifu}</div>}
                  {form.rccm && <div className="flex items-center gap-1"><IconClipboard size={11} /> RCCM : {form.rccm}</div>}
                  {form.taxRate > 0 && <div className="flex items-center gap-1"><IconCoin size={11} /> TVA : {form.taxRate}%</div>}
                </div>
                {(form.thankYouMessage || form.invoiceFooter) && (
                  <div className="mt-6 pt-4 border-t border-dashed border-slate-200 text-center">
                    {form.thankYouMessage && <div className="text-xs text-slate-600 font-medium">{form.thankYouMessage}</div>}
                    {form.invoiceFooter && <div className="text-[11px] text-slate-400 mt-1">{form.invoiceFooter}</div>}
                  </div>
                )}
              </div>
              <div className="bg-slate-50 px-5 py-2.5 text-[11px] text-slate-400 text-center border-t border-slate-200">
                Aperçu en temps réel — Les modifications ne sont pas encore enregistrées.
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Sticky save bar on mobile when there are changes */}
      {hasChanges && (
        <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-slate-200 p-3 z-40 flex gap-2">
          <Button variant="ghost" onClick={reset} className="flex-1">Annuler</Button>
          <Button variant="success" onClick={save} className="flex-1"><IconCheck size={16} /> Enregistrer</Button>
        </div>
      )}
    </div>
  );
}
