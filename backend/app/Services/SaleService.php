<?php

namespace App\Services;

use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class SaleService
{
    public function __construct(protected NotificationService $notif) {}

    /**
     * Crée une vente, décrémente les stocks, met à jour le cumul client.
     *
     * @param  array  $items  [['product_id', 'quantity', 'unit_price', 'total', 'product_name'], ...]
     */
    public function create(
        array  $items,
        float  $paid,
        string $paymentMethod = 'Espèces',
        ?int   $customerId = null
    ): Sale {
        return DB::transaction(function () use ($items, $paid, $paymentMethod, $customerId) {
            $user  = Auth::user();
            $total = collect($items)->sum('total');

            // Numéro de facture séquentiel thread-safe
            $count  = Sale::withTrashed()->count() + 1;
            $invoiceNo = sprintf('FAC-%d-%04d', now()->year, $count);

            $sale = Sale::create([
                'invoice_no'     => $invoiceNo,
                'customer_id'    => $customerId,
                'user_id'        => $user->id,
                'total'          => $total,
                'paid'           => $paid,
                'change_due'     => max(0, $paid - $total),
                'payment_method' => $paymentMethod,
                'sale_date'      => today(),
            ]);

            foreach ($items as $item) {
                SaleItem::create([
                    'sale_id'      => $sale->id,
                    'product_id'   => $item['product_id'],
                    'product_name' => $item['product_name'],
                    'quantity'     => $item['quantity'],
                    'unit_price'   => $item['unit_price'],
                    'total'        => $item['total'],
                ]);

                // Décrémentation atomique du stock
                Product::where('id', $item['product_id'])->decrement('stock', $item['quantity']);

                // Alerte stock critique
                $product = Product::find($item['product_id']);
                if ($product && $product->stock <= $product->min_stock) {
                    $this->notif->notifyAll(
                        'Stock critique',
                        "Le stock de « {$product->name} » est critique ({$product->stock} restant(s)).",
                        'warning',
                        null,
                        'Système'
                    );
                }
            }

            // Cumul client
            if ($customerId) {
                DB::table('customers')->where('id', $customerId)
                    ->increment('total_purchases', $total);
            }

            return $sale->load('items', 'customer', 'user');
        });
    }
}
