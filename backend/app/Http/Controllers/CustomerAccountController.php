<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Payment;
use App\Models\Sale;
use App\Services\PaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Compte client : créances (ventes à crédit) et encaissement des règlements. */
class CustomerAccountController extends Controller
{
    /** GET /api/customers/{customer}/account — solde, ventes impayées, derniers règlements. */
    public function show(Customer $customer): JsonResponse
    {
        $open = Sale::where('customer_id', $customer->id)->where('balance_due', '>', 0.004)->orderBy('id')->get();
        $payments = Payment::with('user')->where('customer_id', $customer->id)->where('kind', 'settlement')
            ->orderByDesc('id')->limit(50)->get();

        return response()->json([
            'customerId'  => (string) $customer->id,
            'balance'     => round((float) $open->sum('balance_due'), 2),
            'creditLimit' => $customer->credit_limit !== null ? (float) $customer->credit_limit : null,
            'openSales'   => $open->map(fn ($s) => [
                'id' => (string) $s->id, 'invoiceNo' => $s->invoice_no, 'date' => $s->sale_date->toDateString(),
                'total' => (float) $s->total - (float) $s->returned_total, 'balanceDue' => (float) $s->balance_due,
            ])->values(),
            'payments'    => $payments->map(fn ($p) => [
                'id' => (string) $p->id, 'date' => $p->payment_date->toDateString(), 'amount' => (float) $p->amount,
                'method' => $p->method, 'userName' => $p->user?->name ?? '—', 'saleId' => $p->sale_id ? (string) $p->sale_id : null,
            ])->values(),
        ]);
    }

    /** POST /api/customers/{customer}/payments — encaisse un règlement (sans saleId : plus ancienne dette d'abord). */
    public function store(Request $request, Customer $customer, PaymentService $svc): JsonResponse
    {
        $d = $request->validate([
            'amount' => ['required', 'numeric', 'gt:0', 'max:999999999999'],
            'method' => ['nullable', 'string', 'max:50'],
            'saleId' => ['nullable', 'integer'],
            'note'   => ['nullable', 'string', 'max:255'],
        ]);

        $created = $svc->settle(
            $request->user(), $customer, (float) $d['amount'], $d['method'] ?? 'Espèces',
            isset($d['saleId']) ? (int) $d['saleId'] : null, $d['note'] ?? null,
        );

        return response()->json(['message' => 'Règlement enregistré.', 'applied' => count($created)], 201);
    }
}
