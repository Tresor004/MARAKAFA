<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Payment;
use App\Models\Sale;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Encaissement des créances : le client règle tout ou partie de ce qu'il doit. */
class PaymentService
{
    public function __construct(protected CashSessionService $sessions) {}

    /**
     * Enregistre un règlement. Sans `$saleId`, le montant éponge les ventes impayées de la plus ancienne
     * à la plus récente. Retourne les paiements créés.
     *
     * @return array<int, Payment>
     */
    public function settle(User $by, Customer $customer, float $amount, string $method, ?int $saleId = null, ?string $note = null): array
    {
        $amount = round($amount, 2);
        if ($amount <= 0) {
            throw ValidationException::withMessages(['amount' => ['Le montant doit être supérieur à zéro.']]);
        }

        return DB::transaction(function () use ($by, $customer, $amount, $method, $saleId, $note) {
            $query = Sale::where('customer_id', $customer->id)->where('balance_due', '>', 0.004)->lockForUpdate();
            if ($saleId) {
                $query->whereKey($saleId);
            }
            $open = $query->orderBy('id')->get();

            $due = round($open->sum('balance_due'), 2);
            if ($open->isEmpty()) {
                throw ValidationException::withMessages(['amount' => ['Ce client ne doit rien.']]);
            }
            if ($amount > $due + 0.004) {
                throw ValidationException::withMessages(['amount' => ['Le montant dépasse le solde dû (' . number_format($due, 0, ',', ' ') . ').']]);
            }

            $session = $this->sessions->forPayment($by, true);
            $left = $amount;
            $created = [];
            foreach ($open as $sale) {
                if ($left <= 0.004) {
                    break;
                }
                $part = round(min($left, (float) $sale->balance_due), 2);
                $sale->update([
                    'balance_due' => round((float) $sale->balance_due - $part, 2),
                    'amount_paid' => round((float) $sale->amount_paid + $part, 2),
                ]);
                $created[] = Payment::create([
                    'sale_id' => $sale->id, 'customer_id' => $customer->id, 'user_id' => $by->id,
                    'cash_session_id' => $session?->id, 'kind' => 'settlement', 'method' => $method,
                    'amount' => $part, 'note' => $note, 'payment_date' => today(),
                ]);
                $left = round($left - $part, 2);
            }

            return $created;
        });
    }
}
