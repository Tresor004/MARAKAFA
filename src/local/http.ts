/** Erreurs et validation au format de l'API Laravel ({ message, errors }), pour que l'interface les affiche à l'identique. */

export class HttpError extends Error {
  status: number;
  errors: Record<string, string[]>;
  constructor(status: number, message: string, errors: Record<string, string[]> = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

/** Erreur de validation (422) sur un champ. */
export const invalid = (field: string, message: string) => new HttpError(422, message, { [field]: [message] });
export const forbidden = (message = "Vous n'avez pas accès à cette fonctionnalité.") => new HttpError(403, message);
export const notFound = () => new HttpError(404, "Élément introuvable (il a peut-être été supprimé).");

type Obj = Record<string, unknown>;

export const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
export const has = (o: Obj, k: string) => Object.prototype.hasOwnProperty.call(o, k);
export const blank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** Petit validateur : chaque méthode lit un champ, le contrôle et renvoie la valeur normalisée. */
export class V {
  constructor(private d: Obj) {}

  private label(k: string) { return LABELS[k] ?? k; }

  present(k: string) { return has(this.d, k); }

  str(k: string, o: { required?: boolean; max?: number } = {}): string | null | undefined {
    const v = this.d[k];
    if (blank(v)) {
      if (o.required) throw invalid(k, `Le champ ${this.label(k)} est obligatoire.`);
      return has(this.d, k) ? null : undefined;
    }
    if (typeof v !== "string" && typeof v !== "number") throw invalid(k, `Le champ ${this.label(k)} doit être une chaîne de caractères.`);
    const s = String(v).trim();
    if (o.max && s.length > o.max) throw invalid(k, `Le champ ${this.label(k)} ne doit pas dépasser ${o.max} caractères.`);
    return s;
  }

  num(k: string, o: { required?: boolean; min?: number; gt?: number; max?: number } = {}): number | null | undefined {
    const v = this.d[k];
    if (blank(v)) {
      if (o.required) throw invalid(k, `Le champ ${this.label(k)} est obligatoire.`);
      return has(this.d, k) ? null : undefined;
    }
    const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
    if (!isFinite(n)) throw invalid(k, `Le champ ${this.label(k)} doit être un nombre.`);
    if (o.min !== undefined && n < o.min) throw invalid(k, `Le champ ${this.label(k)} doit être au moins égal à ${o.min}.`);
    if (o.gt !== undefined && n <= o.gt) throw invalid(k, `Le champ ${this.label(k)} doit être supérieur à ${o.gt}.`);
    if (o.max !== undefined && n > o.max) throw invalid(k, `Le champ ${this.label(k)} ne doit pas dépasser ${o.max}.`);
    return n;
  }

  int(k: string, o: { required?: boolean } = {}): number | null | undefined {
    const n = this.num(k, o);
    if (n === null || n === undefined) return n;
    if (!Number.isInteger(n)) throw invalid(k, `Le champ ${this.label(k)} doit être un nombre entier.`);
    return n;
  }

  bool(k: string): boolean | undefined {
    const v = this.d[k];
    if (v === undefined || v === null) return undefined;
    if (typeof v === "boolean") return v;
    if (v === 1 || v === "1" || v === "true") return true;
    if (v === 0 || v === "0" || v === "false") return false;
    throw invalid(k, `Le champ ${this.label(k)} doit être vrai ou faux.`);
  }

  email(k: string, o: { required?: boolean } = {}): string | null | undefined {
    const s = this.str(k, { ...o, max: 255 });
    if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw invalid(k, `Le champ ${this.label(k)} doit être une adresse e-mail valide.`);
    return s;
  }

  date(k: string): string | null | undefined {
    const s = this.str(k);
    if (s && (!/^\d{4}-\d{2}-\d{2}/.test(s) || isNaN(new Date(s.slice(0, 10) + "T12:00:00").getTime()))) {
      throw invalid(k, `Le champ ${this.label(k)} n'est pas une date valide.`);
    }
    return s ? s.slice(0, 10) : s;
  }

  oneOf<T extends string>(k: string, values: readonly T[], o: { required?: boolean } = {}): T | undefined {
    const v = this.d[k];
    if (blank(v)) {
      if (o.required) throw invalid(k, `Le champ ${this.label(k)} est obligatoire.`);
      return undefined;
    }
    if (!values.includes(v as T)) throw invalid(k, `La valeur sélectionnée pour ${this.label(k)} n'est pas valide.`);
    return v as T;
  }

  arr(k: string, o: { required?: boolean; min?: number; max?: number } = {}): unknown[] {
    const v = this.d[k];
    if (v === undefined || v === null) {
      if (o.required) throw invalid(k, `Le champ ${this.label(k)} est obligatoire.`);
      return [];
    }
    if (!Array.isArray(v)) throw invalid(k, `Le champ ${this.label(k)} doit être une liste.`);
    if (o.min && v.length < o.min) throw invalid(k, o.min === 1 ? `Le champ ${this.label(k)} est obligatoire.` : `Le champ ${this.label(k)} doit contenir au moins ${o.min} éléments.`);
    if (o.max && v.length > o.max) throw invalid(k, `Le champ ${this.label(k)} ne doit pas contenir plus de ${o.max} éléments.`);
    return v;
  }
}

/** Mêmes noms lisibles que backend/lang/fr/validation.php */
const LABELS: Record<string, string> = {
  actual: "quantité comptée", address: "adresse", amount: "montant", avatar: "photo", barcode: "code-barres", category: "catégorie",
  categoryId: "catégorie", city: "ville", contact: "contact", cost: "prix d'achat", country: "pays", counts: "comptages",
  currency: "devise", currencyCode: "code devise", customerId: "client", date: "date", delta: "variation", description: "description",
  email: "e-mail", expiryDate: "date de péremption", identifier: "identifiant", items: "articles", kind: "type", minStock: "seuil d'alerte",
  name: "nom", note: "note", paid: "montant reçu", password: "mot de passe", payload: "données", paymentMethod: "mode de paiement",
  period: "période", permissions: "permissions", phone: "téléphone", price: "prix de vente", productId: "produit", quantity: "quantité",
  reason: "motif", role: "rôle", stock: "stock", taxRate: "taux de TVA", unit: "unité", value: "valeur", scope: "portée", type: "type",
  openingFloat: "fond de caisse", countedCash: "montant compté", creditLimit: "plafond de crédit", minQuantity: "quantité minimale",
  startsOn: "date de début", endsOn: "date de fin", invoicePrefix: "préfixe de facture", maxDiscountPercent: "remise maximale",
  supplierId: "fournisseur", saleId: "vente", website: "site web", slogan: "slogan", logo: "logo",
};
