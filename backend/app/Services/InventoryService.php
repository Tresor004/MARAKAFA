<?php

namespace App\Services;

use App\Models\InventoryItem;
use App\Models\InventorySession;
use App\Models\Product;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class InventoryService
{
    /**
     * Enregistre une session d'inventaire et ajuste les stocks.
     *
     * @param  array  $counts  [['product_id', 'product_name', 'expected', 'actual'], ...]
     */
    public function process(array $counts, string $period): InventorySession
    {
        return DB::transaction(function () use ($counts, $period) {
            $user = Auth::user();

            $session = InventorySession::create([
                'period'       => $period,
                'user_id'      => $user->id,
                'session_date' => today(),
            ]);

            foreach ($counts as $count) {
                InventoryItem::create([
                    'inventory_session_id' => $session->id,
                    'product_id'           => $count['product_id'],
                    'product_name'         => $count['product_name'],
                    'expected'             => $count['expected'],
                    'actual'               => $count['actual'],
                ]);

                // Ajuste le stock au réel compté
                Product::where('id', $count['product_id'])
                    ->update(['stock' => $count['actual']]);
            }

            return $session->load('items', 'user');
        });
    }
}
