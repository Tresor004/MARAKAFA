<?php

namespace App\Services;

use App\Models\Loss;
use App\Models\Product;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class LossService
{
    public function createLoss(array $data): Loss
    {
        return DB::transaction(function () use ($data) {
            $user = Auth::user();

            $loss = Loss::create([
                'product_id'     => $data['product_id'],
                'product_name'   => $data['product_name'],
                'quantity'       => $data['quantity'],
                'unit_price'     => $data['unit_price'],
                'total'          => $data['total'],
                'reason'         => $data['reason'],
                'noted_by'       => $data['noted_by'] ?? $user?->id,
                'auto_generated' => $data['auto_generated'] ?? false,
                'loss_date'      => $data['loss_date'] ?? today()->toDateString(),
            ]);

            // Décrémentation du stock
            Product::where('id', $data['product_id'])
                ->decrement('stock', $data['quantity']);

            return $loss;
        });
    }

    /**
     * Détecte et enregistre automatiquement les produits périmés.
     * Appelé par une commande planifiée (schedule).
     */
    public function processExpiredProducts(NotificationService $notif): int
    {
        $today    = today()->toDateString();
        $expired  = Product::where('stock', '>', 0)
            ->whereDate('expiry_date', '<', $today)
            ->get();

        if ($expired->isEmpty()) {
            return 0;
        }

        foreach ($expired as $product) {
            DB::transaction(function () use ($product, $today) {
                Loss::create([
                    'product_id'     => $product->id,
                    'product_name'   => $product->name,
                    'quantity'       => $product->stock,
                    'unit_price'     => $product->cost,
                    'total'          => $product->stock * $product->cost,
                    'reason'         => 'Péremption',
                    'noted_by'       => null,
                    'auto_generated' => true,
                    'loss_date'      => $today,
                ]);
                $product->update(['stock' => 0]);
            });
        }

        $names = $expired->pluck('name')->implode(', ');
        $notif->notifyAll(
            'Produits périmés détectés',
            "{$expired->count()} produit(s) périmé(s) enregistré(s) en pertes : {$names}.",
            'warning',
            null,
            'Système'
        );

        return $expired->count();
    }
}
