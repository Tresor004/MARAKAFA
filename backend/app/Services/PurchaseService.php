<?php

namespace App\Services;

use App\Models\Product;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class PurchaseService
{
    /**
     * Crée un bon d'achat et incrémente les stocks.
     */
    public function create(array $payload): Purchase
    {
        return DB::transaction(function () use ($payload) {
            $user  = Auth::user();
            $items = $payload['items'];
            $total = collect($items)->sum('total');

            $count     = Purchase::withTrashed()->count() + 1;
            $reference = sprintf('BA-%d-%04d', now()->year, $count);

            $purchase = Purchase::create([
                'reference'     => $reference,
                'supplier_id'   => $payload['supplier_id'],
                'user_id'       => $user->id,
                'total'         => $total,
                'purchase_date' => today(),
            ]);

            foreach ($items as $item) {
                PurchaseItem::create([
                    'purchase_id'  => $purchase->id,
                    'product_id'   => $item['product_id'] ?? null,
                    'product_name' => $item['product_name'],
                    'quantity'     => $item['quantity'],
                    'unit_price'   => $item['unit_price'],
                    'total'        => $item['total'],
                ]);

                // Incrémentation du stock
                if (!empty($item['product_id'])) {
                    Product::where('id', $item['product_id'])
                        ->increment('stock', $item['quantity']);
                    // Mise à jour du coût d'achat (dernier prix)
                    Product::where('id', $item['product_id'])
                        ->update(['cost' => $item['unit_price']]);
                }
            }

            return $purchase->load('items', 'supplier', 'user');
        });
    }
}
