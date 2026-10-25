<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Payment;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\ShopSetting;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SaleService
{
    public function __construct(
        protected StockService $stock,
        protected DocumentNumberService $numbers,
        protected PricingService $pricing,
        protected CashSessionService $sessions,
    ) {}

    /**
     * Enregistre une vente.
     *
     * Le client n'envoie QUE les identifiants produit, les quantités et une éventuelle remise manuelle (%) :
     * prix, promotions, coût, TVA et totaux sont recalculés ici à partir de la base.
     * Les prix de vente sont TTC ; la TVA affichée est la part incluse dans le total (taux du produit, sinon de la boutique).
     *
     * Paiement : si le montant reçu est inférieur au total, le solde est vendu à crédit (client obligatoire,
     * plafond de crédit respecté). `$paid = null` signifie « payé en totalité ».
     *
     * @param  array<int, array{product_id:int, quantity:float|int|string, discount_percent?:float|int|string|null}>  $items
     */
    public function create(User $cashier, array $items, ?float $paid = null, string $paymentMethod = 'Espèces', ?int $customerId = null): Sale
    {
        // Rejoue la transaction si deux caisses obtiennent le même numéro de facture au même instant.
        for ($attempt = 1; ; $attempt++) {
            try {
                return DB::transaction(fn () => $this->doCreate($cashier, $items, $paid, $paymentMethod, $customerId));
            } catch (QueryException $e) {
                if ($attempt >= 3 || ! str_contains(strtolower($e->getMessage()), 'unique')) {
                    throw $e;
                }
            }
        }
    }

    private function doCreate(User $cashier, array $items, ?float $paid, string $paymentMethod, ?int $customerId): Sale
    {
        $settings = ShopSetting::instance();
        $shopRate = (float) $settings->tax_rate;
        $date = today()->toDateString();

        $session = $this->sessions->forPayment($cashier, true);

        // Fusionne les lignes identiques (même produit, même remise manuelle)
        $merged = [];
        foreach ($items as $item) {
            $pid = (int) $item['product_id'];
            $pct = round((float) ($item['discount_percent'] ?? 0), 2);
            $key = $pid . '|' . $pct;
            $merged[$key] = [
                'pid' => $pid,
                'pct' => $pct,
                'qty' => round(($merged[$key]['qty'] ?? 0) + (float) $item['quantity'], 3),
            ];
        }

        $products = Product::whereIn('id', array_unique(array_column($merged, 'pid')))->get()->keyBy('id');
        if ($products->count() !== count(array_unique(array_column($merged, 'pid')))) {
            throw ValidationException::withMessages(['items' => ['Un des produits du panier n\'existe plus.']]);
        }

        $promotions = $this->pricing->activePromotions($date);
        $maxDiscount = (float) $settings->max_discount_percent;
        $canOverrideDiscount = $cashier->isAdmin();

        $lines = [];
        $total = 0.0;
        $tax = 0.0;
        foreach ($merged as $m) {
            /** @var Product $product */
            $product = $products[$m['pid']];
            if ($m['qty'] <= 0) {
                throw ValidationException::withMessages(['items' => ["Quantité invalide pour « {$product->name} »."]]);
            }
            if ($m['pct'] < 0 || $m['pct'] > 100) {
                throw ValidationException::withMessages(['items' => ['Remise invalide (0 à 100 %).']]);
            }
            if (! $canOverrideDiscount && $m['pct'] > $maxDiscount + 0.0001) {
                throw ValidationException::withMessages([
                    'items' => ["Remise de {$m['pct']} % non autorisée pour « {$product->name} » (maximum {$maxDiscount} %). Demandez à un administrateur."],
                ]);
            }

            $line = $this->pricing->line($product, $m['qty'], $m['pct'], $promotions, $shopRate) + ['product' => $product, 'qty' => $m['qty']];
            $total += $line['total'];
            $tax += $line['tax_amount'];
            $lines[] = $line;
        }
        $total = round($total, 2);
        $tax = round($tax, 2);

        // ── Paiement : comptant, partiel ou à crédit ──
        $paid = $paid === null ? $total : round(max(0, $paid), 2);
        $amountPaid = min($paid, $total);
        $balance = round($total - $amountPaid, 2);

        if ($customerId !== null && ! ($customer = Customer::find($customerId))) {
            throw ValidationException::withMessages(['customer_id' => ['Client introuvable.']]);
        }

        if ($balance > 0.004) {
            if (! $settings->allow_credit) {
                throw ValidationException::withMessages(['paid' => ['Le montant payé est inférieur au total à régler.']]);
            }
            if (! $customerId) {
                throw ValidationException::withMessages(['customer_id' => ['Choisissez un client pour enregistrer une vente à crédit ou un paiement partiel.']]);
            }
            $limit = $customer->credit_limit;
            if ($limit !== null) {
                $outstanding = (float) Sale::where('customer_id', $customerId)->sum('balance_due');
                if ($outstanding + $balance > (float) $limit + 0.004) {
                    throw ValidationException::withMessages([
                        'paid' => ['Plafond de crédit dépassé pour ce client (plafond ' . number_format((float) $limit, 0, ',', ' ') . ', déjà dû ' . number_format($outstanding, 0, ',', ' ') . ').'],
                    ]);
                }
            }
        }

        $sale = Sale::create([
            'invoice_no'      => $this->numbers->next($settings->invoice_prefix ?: 'FAC', 'sales', 'invoice_no'),
            'customer_id'     => $customerId,
            'user_id'         => $cashier->id,
            'total'           => $total,
            'tax_rate'        => $shopRate,
            'tax_amount'      => $tax,
            'paid'            => $paid,
            'change_due'      => round(max(0, $paid - $total), 2),
            'amount_paid'     => $amountPaid,
            'balance_due'     => $balance,
            'payment_method'  => $paymentMethod,
            'sale_date'       => $date,
            'cash_session_id' => $session?->id,
        ]);

        foreach ($lines as $line) {
            /** @var Product $product */
            $product = $line['product'];

            // Retrait atomique : échoue si le stock est insuffisant (même avec deux caisses simultanées).
            $this->stock->decrease($product->id, $line['qty'], $product->name, [
                'type' => 'sale', 'user' => $cashier, 'reason' => 'Vente',
                'ref_type' => 'sale', 'ref_id' => $sale->id, 'ref_label' => $sale->invoice_no,
            ]);

            SaleItem::create([
                'sale_id'          => $sale->id,
                'product_id'       => $product->id,
                'product_name'     => $product->name,
                'quantity'         => $line['qty'],
                'unit_price'       => $product->price,
                'unit_cost'        => $product->cost,
                'total'            => $line['total'],
                'tax_rate'         => $line['tax_rate'],
                'tax_amount'       => $line['tax_amount'],
                'discount_percent' => $line['discount_percent'],
                'discount_amount'  => $line['discount_amount'],
                'promotion_id'     => $line['promotion']?->id,
                'promotion_label'  => $line['promotion']?->label(),
            ]);
        }

        if ($amountPaid > 0.004) {
            Payment::create([
                'sale_id' => $sale->id, 'customer_id' => $customerId, 'user_id' => $cashier->id,
                'cash_session_id' => $session?->id, 'kind' => 'sale', 'method' => $paymentMethod,
                'amount' => $amountPaid, 'payment_date' => $date,
            ]);
        }

        if ($customerId) {
            Customer::whereKey($customerId)->update(['total_purchases' => DB::raw('total_purchases + ' . number_format($total, 2, '.', ''))]);
        }

        return $sale->load('items', 'customer', 'user');
    }
}
