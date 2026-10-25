<?php

namespace App\Services;

use App\Models\Product;
use App\Models\Promotion;
use Illuminate\Support\Collection;

/**
 * Calcul d'une ligne de vente : promotion automatique, remise manuelle, TVA incluse.
 * C'est la SEULE référence des montants : l'interface en affiche un aperçu, mais le total facturé vient d'ici.
 *
 * Ordre : prix catalogue (TTC) → meilleure promotion applicable → remise manuelle (%) → TVA incluse dans le net.
 */
class PricingService
{
    /** Promotions en cours à la date donnée (une seule requête par vente). */
    public function activePromotions(string $date): Collection
    {
        return Promotion::where('active', true)->get()->filter(fn (Promotion $p) => $p->isRunningOn($date))->values();
    }

    /**
     * @param  Collection<int, Promotion>  $promotions
     * @return array{list_total:float, promotion:?Promotion, promotion_discount:float, discount_percent:float,
     *               discount_amount:float, total:float, tax_rate:float, tax_amount:float}
     */
    public function line(Product $product, float $qty, float $manualPercent, Collection $promotions, float $shopTaxRate): array
    {
        $price = (float) $product->price;
        $list = round($qty * $price, 2);

        // La promotion la plus avantageuse pour le client l'emporte (pas de cumul entre promotions)
        $best = null;
        $bestDiscount = 0.0;
        foreach ($promotions as $promo) {
            if (! $promo->appliesTo($product, $qty)) {
                continue;
            }
            $d = $promo->discountFor($price, $qty);
            if ($d > $bestDiscount + 0.004) {
                $best = $promo;
                $bestDiscount = $d;
            }
        }

        $afterPromo = round($list - $bestDiscount, 2);
        $manualPercent = min(100, max(0, round($manualPercent, 2)));
        $manual = round($afterPromo * $manualPercent / 100, 2);
        $total = round($afterPromo - $manual, 2);

        $rate = $product->tax_rate !== null ? (float) $product->tax_rate : $shopTaxRate;
        $tax = $rate > 0 ? round($total - $total / (1 + $rate / 100), 2) : 0.0;

        return [
            'list_total'         => $list,
            'promotion'          => $best,
            'promotion_discount' => $bestDiscount,
            'discount_percent'   => $manualPercent,
            'discount_amount'    => round($list - $total, 2),
            'total'              => $total,
            'tax_rate'           => $rate,
            'tax_amount'         => $tax,
        ];
    }
}
