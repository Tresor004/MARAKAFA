import { Product, Promotion } from "../types";

/**
 * APERÇU des prix en caisse. Le serveur recalcule tout à l'enregistrement (PricingService) et reste l'autorité :
 * ces règles sont les mêmes (promotion la plus avantageuse → remise manuelle → TVA incluse dans le net).
 */

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface PricedLine {
  list: number;              // prix catalogue × quantité
  promotion: Promotion | null;
  promotionDiscount: number;
  discountAmount: number;    // promotion + remise manuelle
  total: number;             // net à payer (TTC)
  taxRate: number;
  taxAmount: number;
}

export function promoLabel(p: Promotion): string {
  const v = String(Math.round(p.value * 100) / 100).replace(".", ",");
  return `${p.name} (${p.type === "percent" ? `${v} %` : `-${v} / unité`})`;
}

function applies(promo: Promotion, product: Product, qty: number): boolean {
  if (!promo.active || !promo.running) return false;
  if (qty + 0.0005 < promo.minQuantity) return false;
  if (promo.scope === "product") return promo.productId === product.id;
  if (promo.scope === "category") return !!promo.categoryName && promo.categoryName === product.category;
  return true;
}

export function priceLine(product: Product, qty: number, manualPercent: number, promotions: Promotion[], shopTaxRate: number): PricedLine {
  const list = r2(qty * product.price);

  let best: Promotion | null = null;
  let bestDiscount = 0;
  for (const promo of promotions) {
    if (!applies(promo, product, qty)) continue;
    const raw = promo.type === "percent" ? list * promo.value / 100 : promo.value * qty;
    const d = r2(Math.min(list, Math.max(0, raw)));
    if (d > bestDiscount + 0.004) { best = promo; bestDiscount = d; }
  }

  const afterPromo = r2(list - bestDiscount);
  const pct = Math.min(100, Math.max(0, r2(manualPercent || 0)));
  const total = r2(afterPromo - r2(afterPromo * pct / 100));
  const rate = product.taxRate != null ? product.taxRate : shopTaxRate;
  const taxAmount = rate > 0 ? r2(total - total / (1 + rate / 100)) : 0;

  return { list, promotion: best, promotionDiscount: bestDiscount, discountAmount: r2(list - total), total, taxRate: rate, taxAmount };
}
