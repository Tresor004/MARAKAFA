<?php

namespace App\Services;

use App\Models\Loss;
use App\Models\Product;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class LossService
{
    public function __construct(protected StockService $stock) {}

    /**
     * Déclare une perte : retire la quantité du stock et valorise la perte au coût d'achat courant.
     * Une perte est TOUJOURS saisie par un employé (jamais auto-générée par le système).
     */
    public function create(User $author, int $productId, float $quantity, string $reason, ?string $date = null): Loss
    {
        return DB::transaction(function () use ($author, $productId, $quantity, $reason, $date) {
            $product = Product::find($productId);
            if (! $product) {
                throw ValidationException::withMessages(['product_id' => ['Produit introuvable.']]);
            }

            $quantity = round($quantity, 3);
            if ($quantity <= 0) {
                throw ValidationException::withMessages(['quantity' => ['La quantité doit être supérieure à zéro.']]);
            }

            $loss = Loss::create([
                'product_id'     => $product->id,
                'product_name'   => $product->name,
                'quantity'       => $quantity,
                'unit_price'     => $product->cost,
                'total'          => round($quantity * (float) $product->cost, 2),
                'reason'         => $reason,
                'noted_by'       => $author->id,
                'auto_generated' => false,
                'loss_date'      => $date ?: today()->toDateString(),
            ]);

            // Échoue (et annule la perte) si la quantité dépasse le stock disponible
            $this->stock->decrease($product->id, $quantity, $product->name, [
                'type' => 'loss', 'user' => $author, 'reason' => "Perte : {$reason}",
                'ref_type' => 'loss', 'ref_id' => $loss->id,
            ]);

            return $loss;
        });
    }

    /** Supprime une entrée de perte et remet la quantité en stock (annulation d'une saisie erronée). */
    public function delete(Loss $loss, ?User $by = null): void
    {
        DB::transaction(function () use ($loss, $by) {
            if ($loss->product_id && Product::whereKey($loss->product_id)->exists()) {
                $this->stock->increase($loss->product_id, (float) $loss->quantity, [
                    'type' => 'loss_cancel', 'user' => $by, 'reason' => "Annulation de la perte « {$loss->reason} »",
                    'ref_type' => 'loss', 'ref_id' => $loss->id,
                ]);
            }
            $loss->delete();
        });
    }
}
