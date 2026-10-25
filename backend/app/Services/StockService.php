<?php

namespace App\Services;

use App\Models\Product;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Seul point d'entrée pour modifier un stock : mises à jour atomiques en SQL
 * (pas de lecture-puis-écriture), donc sûres même avec plusieurs caisses simultanées.
 *
 * Chaque variation est inscrite au journal `stock_movements` (qui, quand, pourquoi, avant/après).
 * Le contexte du mouvement est passé en dernier argument :
 *   ['type' => 'sale', 'user' => $user, 'reason' => '…', 'ref_type' => 'sale', 'ref_id' => 12, 'ref_label' => 'FAC-2026-0001']
 */
class StockService
{
    public const TYPES = [
        'sale', 'sale_return', 'purchase', 'purchase_cancel', 'loss', 'loss_cancel',
        'inventory', 'adjustment', 'initial',
    ];

    public function __construct(protected NotificationService $notif) {}

    /**
     * Retire $qty du stock. Échoue (ValidationException) si le stock est insuffisant.
     */
    public function decrease(int $productId, float $qty, ?string $label = null, array $ctx = []): Product
    {
        $qty = round($qty, 3);

        // La tolérance (0,0005) absorbe les erreurs d'arrondi des nombres flottants.
        $affected = Product::whereKey($productId)
            ->where('stock', '>=', $qty - 0.0005)
            ->update(['stock' => DB::raw($this->floorZero('ROUND(stock - ' . $this->num($qty) . ', 3)'))]);

        if ($affected === 0) {
            $product = Product::withTrashed()->find($productId);
            $name = $label ?? $product?->name ?? "#{$productId}";
            throw ValidationException::withMessages([
                'stock' => ["Stock insuffisant pour « {$name} » (disponible : " . $this->fmt((float) ($product?->stock ?? 0)) . ').'],
            ]);
        }

        $product = Product::findOrFail($productId);
        $after = (float) $product->stock;
        $before = round($after + $qty, 3);
        $this->journal($product, -$qty, $before, $after, $ctx);
        $this->notif->notifyStockThreshold($product, $before);

        return $product;
    }

    /** Ajoute $qty au stock. */
    public function increase(int $productId, float $qty, array $ctx = []): Product
    {
        $qty = round($qty, 3);
        Product::whereKey($productId)->update(['stock' => DB::raw('ROUND(stock + ' . $this->num($qty) . ', 3)')]);

        $product = Product::findOrFail($productId);
        $after = (float) $product->stock;
        $this->journal($product, $qty, round($after - $qty, 3), $after, $ctx);

        return $product;
    }

    /** Fixe le stock à une valeur précise (inventaire physique, correction de fiche). */
    public function set(int $productId, float $value, array $ctx = []): void
    {
        $value = max(0, round($value, 3));
        $before = (float) Product::whereKey($productId)->value('stock');
        Product::whereKey($productId)->update(['stock' => $value]);

        if (abs($value - $before) >= 0.0005) {
            $product = Product::findOrFail($productId);
            $this->journal($product, round($value - $before, 3), $before, $value, $ctx + ['type' => 'adjustment']);
        }
    }

    /**
     * Ajustement manuel (+/-). Un retrait supérieur au stock est refusé.
     */
    public function adjust(int $productId, float $delta, array $ctx = []): Product
    {
        if (abs($delta) < 0.0005) {
            throw ValidationException::withMessages(['delta' => ['La quantité à ajuster ne peut pas être nulle.']]);
        }
        $ctx += ['type' => 'adjustment'];

        return $delta > 0
            ? $this->increase($productId, $delta, $ctx)
            : $this->decrease($productId, abs($delta), null, $ctx);
    }

    // ─────────────────────────────────────────────────────────────

    private function journal(Product $product, float $delta, float $before, float $after, array $ctx): void
    {
        /** @var User|null $user */
        $user = $ctx['user'] ?? null;
        $type = $ctx['type'] ?? 'adjustment';

        StockMovement::create([
            'product_id'      => $product->id,
            'product_name'    => $product->name,
            'user_id'         => $user?->id,
            'user_name'       => $user?->name,
            'type'            => in_array($type, self::TYPES, true) ? $type : 'adjustment',
            'quantity'        => $delta,
            'stock_before'    => $before,
            'stock_after'     => $after,
            'reason'          => $ctx['reason'] ?? null,
            'reference_type'  => $ctx['ref_type'] ?? null,
            'reference_id'    => $ctx['ref_id'] ?? null,
            'reference_label' => $ctx['ref_label'] ?? null,
        ]);
    }

    private function floorZero(string $expr): string
    {
        $fn = DB::getDriverName() === 'sqlite' ? 'MAX' : 'GREATEST';

        return "{$fn}({$expr}, 0)";
    }

    /** Nombre formaté pour SQL (toujours un point décimal, jamais de notation scientifique). */
    private function num(float $n): string
    {
        return number_format($n, 3, '.', '');
    }

    private function fmt(float $n): string
    {
        return rtrim(rtrim(number_format($n, 3, '.', ''), '0'), '.');
    }
}
