<?php

namespace App\Services;

use App\Models\Product;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\ShopSetting;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PurchaseService
{
    public function __construct(
        protected StockService $stock,
        protected DocumentNumberService $numbers,
    ) {}

    /**
     * Crée un bon d'achat : incrémente les stocks et met à jour le coût d'achat (dernier prix).
     *
     * Chaque ligne : prix saisi (`unit_price`) en HT (défaut) ou TTC (`price_mode` = 'ttc') et taux de TVA (`tax_rate`, 0 par défaut).
     * Le coût d'achat du produit est toujours enregistré HT (la TVA d'achat est récupérable).
     *
     * @param  array<int, array{product_id:int|string|null, product_name?:string, quantity:float|int|string, unit_price:float|int|string, price_mode?:string, tax_rate?:float|int|string|null}>  $items
     */
    public function create(User $author, int $supplierId, array $items): Purchase
    {
        for ($attempt = 1; ; $attempt++) {
            try {
                return DB::transaction(function () use ($author, $supplierId, $items) {
                    $this->assertSupplier($supplierId);
                    $lines = $this->normalize($items);

                    $purchase = Purchase::create([
                        'reference'     => $this->numbers->next('BA', 'purchases', 'reference'),
                        'supplier_id'   => $supplierId,
                        'user_id'       => $author->id,
                        'purchase_date' => today(),
                    ] + $this->totals($lines));

                    $this->applyLines($purchase, $lines, $author);

                    return $purchase->load('items', 'supplier', 'user');
                });
            } catch (QueryException $e) {
                if ($attempt >= 3 || ! str_contains(strtolower($e->getMessage()), 'unique')) {
                    throw $e;
                }
            }
        }
    }

    /**
     * Modifie un bon : annule l'effet de l'ancien contenu sur le stock puis applique le nouveau.
     * Refusé si l'annulation rendrait un stock négatif (des articles ont déjà été vendus).
     */
    public function update(Purchase $purchase, int $supplierId, array $items, ?User $by = null): Purchase
    {
        return DB::transaction(function () use ($purchase, $supplierId, $items, $by) {
            $this->assertSupplier($supplierId);
            $lines = $this->normalize($items);

            $this->reverseStock($purchase, $by);
            $purchase->items()->delete();

            $purchase->update(['supplier_id' => $supplierId] + $this->totals($lines));

            $this->applyLines($purchase, $lines, $by);

            return $purchase->load('items', 'supplier', 'user');
        });
    }

    /** Supprime un bon et retire du stock les quantités qu'il avait ajoutées. */
    public function delete(Purchase $purchase, ?User $by = null): void
    {
        DB::transaction(function () use ($purchase, $by) {
            $this->reverseStock($purchase, $by);
            $purchase->delete();
        });
    }

    // ─────────────────────────────────────────────────────────────

    private function assertSupplier(int $supplierId): void
    {
        if (! Supplier::whereKey($supplierId)->exists()) {
            throw ValidationException::withMessages(['supplier_id' => ['Fournisseur introuvable.']]);
        }
    }

    /** Valide et fusionne les lignes ; retrouve le nom du produit côté serveur. */
    private function normalize(array $items): array
    {
        if (count($items) === 0) {
            throw ValidationException::withMessages(['items' => ['Au moins un article est requis.']]);
        }

        $lines = [];
        foreach ($items as $i) {
            $qty = round((float) ($i['quantity'] ?? 0), 3);
            $price = round((float) ($i['unit_price'] ?? 0), 2);
            if ($qty <= 0 || $price < 0) {
                throw ValidationException::withMessages(['items' => ['Quantité ou prix invalide.']]);
            }

            $product = ! empty($i['product_id']) ? Product::find((int) $i['product_id']) : null;
            if (! empty($i['product_id']) && ! $product) {
                throw ValidationException::withMessages(['items' => ['Un des produits n\'existe plus.']]);
            }

            $name = $product?->name ?? trim((string) ($i['product_name'] ?? ''));
            if ($name === '') {
                throw ValidationException::withMessages(['items' => ['Chaque ligne doit désigner un produit.']]);
            }

            $rate = min(100, max(0, (float) ($i['tax_rate'] ?? 0)));
            $ttcMode = strtolower((string) ($i['price_mode'] ?? 'ht')) === 'ttc';
            if ($ttcMode) {
                $unitTtc = $price;
                $unitHt = round($price / (1 + $rate / 100), 2);
            } else {
                $unitHt = $price;
                $unitTtc = round($price * (1 + $rate / 100), 2);
            }

            $lines[] = [
                'product_id'     => $product?->id,
                'product_name'   => $name,
                'quantity'       => $qty,
                'unit_price'     => $unitHt,
                'total'          => round($qty * $unitHt, 2),
                'tax_rate'       => $rate,
                'unit_price_ttc' => $unitTtc,
                'total_ttc'      => round($qty * $unitTtc, 2),
            ];
        }

        return $lines;
    }

    /** Totaux du bon : `total` = TTC (montant dû au fournisseur), plus le détail HT / TVA. */
    private function totals(array $lines): array
    {
        $ht = round(collect($lines)->sum('total'), 2);
        $ttc = round(collect($lines)->sum('total_ttc'), 2);

        return ['total' => $ttc, 'total_ht' => $ht, 'total_tax' => round($ttc - $ht, 2)];
    }

    private function applyLines(Purchase $purchase, array $lines, ?User $by): void
    {
        foreach ($lines as $line) {
            PurchaseItem::create($line + ['purchase_id' => $purchase->id]);

            if ($line['product_id']) {
                $this->stock->increase($line['product_id'], $line['quantity'], [
                    'type' => 'purchase', 'user' => $by, 'reason' => 'Réception du bon d\'achat',
                    'ref_type' => 'purchase', 'ref_id' => $purchase->id, 'ref_label' => $purchase->reference,
                ]);
                Product::whereKey($line['product_id'])->update(['cost' => $line['unit_price']]);
            }
        }
    }

    private function reverseStock(Purchase $purchase, ?User $by, string $reason = 'Annulation / modification du bon d\'achat'): void
    {
        foreach ($purchase->items()->get() as $item) {
            if ($item->product_id && Product::whereKey($item->product_id)->exists()) {
                try {
                    $this->stock->decrease($item->product_id, (float) $item->quantity, $item->product_name, [
                        'type' => 'purchase_cancel', 'user' => $by, 'reason' => $reason,
                        'ref_type' => 'purchase', 'ref_id' => $purchase->id, 'ref_label' => $purchase->reference,
                    ]);
                } catch (ValidationException) {
                    throw ValidationException::withMessages([
                        'purchase' => ["Impossible d'annuler ce bon : une partie de « {$item->product_name} » a déjà été vendue ou retirée du stock."],
                    ]);
                }
            }
        }
    }
}
