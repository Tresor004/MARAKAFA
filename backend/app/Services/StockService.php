<?php

namespace App\Services;

use App\Models\Product;

class StockService
{
    public function __construct(protected NotificationService $notif) {}

    public function adjust(int $productId, float $delta): void
    {
        $product = Product::findOrFail($productId);
        $newStock = max(0, $product->stock + $delta);
        $product->update(['stock' => $newStock]);

        if ($newStock <= $product->min_stock && $newStock > 0) {
            $this->notif->notifyAll(
                'Stock critique',
                "Après ajustement, le stock de « {$product->name} » est critique ({$newStock} restant(s)).",
                'warning',
                null,
                'Système'
            );
        }

        if ($newStock === 0) {
            $this->notif->notifyAll(
                'Rupture de stock',
                "Le produit « {$product->name} » est maintenant en rupture de stock.",
                'error',
                null,
                'Système'
            );
        }
    }
}
