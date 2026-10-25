<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Payment;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\SaleReturn;
use App\Models\SaleReturnItem;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Retours / annulations de vente (avoirs).
 *
 * La valeur restituée est celle réellement payée par le client (remises et promotions déduites).
 * Si la vente a un solde impayé, le retour réduit d'abord cette créance ; le reste est remboursé.
 */
class ReturnService
{
    public function __construct(
        protected StockService $stock,
        protected DocumentNumberService $numbers,
        protected CashSessionService $sessions,
    ) {}

    /**
     * @param  array<int, array{sale_item_id:int, quantity:float|int|string}>  $lines
     */
    public function create(User $by, Sale $sale, array $lines, bool $restock, ?string $refundMethod, ?string $reason): SaleReturn
    {
        for ($attempt = 1; ; $attempt++) {
            try {
                return DB::transaction(fn () => $this->doCreate($by, $sale->id, $lines, $restock, $refundMethod, $reason));
            } catch (QueryException $e) {
                if ($attempt >= 3 || ! str_contains(strtolower($e->getMessage()), 'unique')) {
                    throw $e;
                }
            }
        }
    }

    private function doCreate(User $by, int $saleId, array $lines, bool $restock, ?string $refundMethod, ?string $reason): SaleReturn
    {
        /** @var Sale $sale */
        $sale = Sale::lockForUpdate()->with('items')->find($saleId);
        if (! $sale) {
            throw ValidationException::withMessages(['saleId' => ['Vente introuvable.']]);
        }
        if (count($lines) === 0) {
            throw ValidationException::withMessages(['items' => ['Sélectionnez au moins un article à retourner.']]);
        }

        // Fusionne les lignes d'un même article
        $wanted = [];
        foreach ($lines as $l) {
            $id = (int) $l['sale_item_id'];
            $wanted[$id] = round(($wanted[$id] ?? 0) + (float) $l['quantity'], 3);
        }

        $items = $sale->items->keyBy('id');
        $rows = [];
        $total = 0.0;
        $tax = 0.0;
        foreach ($wanted as $itemId => $qty) {
            /** @var SaleItem|null $item */
            $item = $items->get($itemId);
            if (! $item) {
                throw ValidationException::withMessages(['items' => ['Article absent de cette vente.']]);
            }
            if ($qty <= 0) {
                throw ValidationException::withMessages(['items' => ['Quantité de retour invalide.']]);
            }
            $returnable = round((float) $item->quantity - (float) $item->returned_quantity, 3);
            if ($qty > $returnable + 0.0005) {
                throw ValidationException::withMessages([
                    'items' => ["« {$item->product_name} » : seulement {$returnable} restant à retourner."],
                ]);
            }

            $ratio = $qty / (float) $item->quantity;
            // Dernière unité retournée : on solde la ligne au centime près (pas d'écart d'arrondi cumulé)
            $isRest = abs($qty - $returnable) < 0.0005;
            $alreadyValue = $this->returnedValue($item);
            $value = $isRest ? round((float) $item->total - $alreadyValue['value'], 2) : round((float) $item->total * $ratio, 2);
            $itemTax = $isRest ? round((float) $item->tax_amount - $alreadyValue['tax'], 2) : round((float) $item->tax_amount * $ratio, 2);

            $rows[] = ['item' => $item, 'qty' => $qty, 'value' => $value, 'tax' => $itemTax];
            $total += $value;
            $tax += $itemTax;
        }
        $total = round($total, 2);
        $tax = round($tax, 2);

        // Le retour réduit d'abord la créance éventuelle, le reste est remboursé
        $creditReduction = round(min((float) $sale->balance_due, $total), 2);
        $cashRefund = round($total - $creditReduction, 2);

        // Un remboursement n'est jamais bloqué par une caisse fermée (l'approbation peut intervenir plus tard)
        $session = $this->sessions->current($by);
        $method = $refundMethod ?: $sale->payment_method;

        $return = SaleReturn::create([
            'return_no'        => $this->numbers->next('AV', 'sale_returns', 'return_no'),
            'sale_id'          => $sale->id,
            'user_id'          => $by->id,
            'total'            => $total,
            'tax_amount'       => $tax,
            'credit_reduction' => $creditReduction,
            'cash_refund'      => $cashRefund,
            'refund_method'    => $cashRefund > 0.004 ? $method : null,
            'restocked'        => $restock,
            'reason'           => $reason !== null && trim($reason) !== '' ? trim($reason) : null,
            'return_date'      => today(),
        ]);

        foreach ($rows as $r) {
            /** @var SaleItem $item */
            $item = $r['item'];
            SaleReturnItem::create([
                'sale_return_id' => $return->id,
                'sale_item_id'   => $item->id,
                'product_id'     => $item->product_id,
                'product_name'   => $item->product_name,
                'quantity'       => $r['qty'],
                'unit_value'     => round($r['value'] / $r['qty'], 2),
                'total'          => $r['value'],
                'tax_amount'     => $r['tax'],
            ]);
            $item->update(['returned_quantity' => round((float) $item->returned_quantity + $r['qty'], 3)]);

            if ($restock && $item->product_id && \App\Models\Product::whereKey($item->product_id)->exists()) {
                $this->stock->increase($item->product_id, $r['qty'], [
                    'type' => 'sale_return', 'user' => $by, 'reason' => 'Retour client' . ($reason ? " : {$reason}" : ''),
                    'ref_type' => 'sale_return', 'ref_id' => $return->id, 'ref_label' => $return->return_no,
                ]);
            }
        }

        $sale->update([
            'returned_total' => round((float) $sale->returned_total + $total, 2),
            'balance_due'    => round((float) $sale->balance_due - $creditReduction, 2),
            'amount_paid'    => round((float) $sale->amount_paid - $cashRefund, 2),
        ]);

        if ($cashRefund > 0.004) {
            Payment::create([
                'sale_id' => $sale->id, 'customer_id' => $sale->customer_id, 'user_id' => $by->id,
                'cash_session_id' => $session?->id, 'kind' => 'refund', 'method' => $method,
                'amount' => -$cashRefund, 'note' => $return->return_no, 'payment_date' => today(),
            ]);
        }

        if ($sale->customer_id) {
            $customer = Customer::find($sale->customer_id);
            $customer?->update(['total_purchases' => max(0, round((float) $customer->total_purchases - $total, 2))]);
        }

        return $return->load('items', 'sale', 'user');
    }

    /** @return array{value:float, tax:float} montants déjà restitués sur une ligne */
    private function returnedValue(SaleItem $item): array
    {
        $r = SaleReturnItem::where('sale_item_id', $item->id)
            ->selectRaw('COALESCE(SUM(total),0) as v, COALESCE(SUM(tax_amount),0) as t')->first();

        return ['value' => (float) $r->v, 'tax' => (float) $r->t];
    }
}
