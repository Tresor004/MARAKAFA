<?php

namespace App\Services;

use App\Models\InventoryItem;
use App\Models\InventorySession;
use App\Models\Product;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class InventoryService
{
    public function __construct(protected StockService $stock) {}

    /**
     * Enregistre une session d'inventaire et aligne les stocks sur les quantités comptées.
     *
     * La quantité « attendue » est relue en base au moment de la validation (et non celle affichée
     * à l'écran quand l'employé a commencé son comptage) : l'écart reflète donc la réalité du stock.
     *
     * @param  array<int, array{product_id:int|string, actual:float|int|string}>  $counts
     */
    public function process(User $author, array $counts, string $period): InventorySession
    {
        if (count($counts) === 0) {
            throw ValidationException::withMessages(['counts' => ['Aucun article compté.']]);
        }

        return DB::transaction(function () use ($author, $counts, $period) {
            $session = InventorySession::create([
                'period'       => $period,
                'user_id'      => $author->id,
                'session_date' => today(),
            ]);

            foreach ($counts as $c) {
                $actual = round((float) $c['actual'], 3);
                if ($actual < 0) {
                    throw ValidationException::withMessages(['counts' => ['Une quantité comptée est négative.']]);
                }

                $product = Product::find((int) $c['product_id']);
                if (! $product) {
                    continue; // produit supprimé entre-temps : ligne ignorée
                }

                InventoryItem::create([
                    'inventory_session_id' => $session->id,
                    'product_id'           => $product->id,
                    'product_name'         => $product->name,
                    'expected'             => $product->stock,
                    'actual'               => $actual,
                ]);

                $this->stock->set($product->id, $actual, [
                    'type' => 'inventory', 'user' => $author, 'reason' => "Inventaire {$period} : stock compté",
                    'ref_type' => 'inventory', 'ref_id' => $session->id,
                ]);
            }

            return $session->load('items', 'user');
        });
    }
}
