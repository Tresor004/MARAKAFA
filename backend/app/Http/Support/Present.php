<?php

namespace App\Http\Support;

use App\Models\AppNotification;
use App\Models\CashSession;
use App\Models\Customer;
use App\Models\InventoryItem;
use App\Models\Loss;
use App\Models\PendingAction;
use App\Models\Product;
use App\Models\Promotion;
use App\Models\Purchase;
use App\Models\Role;
use App\Models\Sale;
use App\Models\SaleReturn;
use App\Models\ShopSetting;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\User;

/**
 * Transforme les modèles en structures JSON identiques aux types TypeScript de l'interface
 * (camelCase, identifiants en chaîne). Un seul endroit à maintenir pour le contrat API.
 */
final class Present
{
    public static function product(Product $p): array
    {
        return [
            'id'         => (string) $p->id,
            'name'       => $p->name,
            'category'   => $p->category?->name ?? '',
            'price'      => (float) $p->price,
            'cost'       => (float) $p->cost,
            'taxRate'    => $p->tax_rate !== null ? (float) $p->tax_rate : null, // null = taux de la boutique
            'stock'      => (float) $p->stock,
            'minStock'   => (float) $p->min_stock,
            'unit'       => $p->unit,
            'barcode'    => $p->barcode ?: null,
            'expiryDate' => $p->expiry_date?->toDateString(),
        ];
    }

    public static function sale(Sale $s): array
    {
        $balance = (float) $s->balance_due;
        $paidAmount = (float) $s->amount_paid;

        return [
            'id'            => (string) $s->id,
            'invoiceNo'     => $s->invoice_no,
            'items'         => $s->items->map(fn ($i) => [
                'id'               => (string) $i->id,
                'productId'        => (string) $i->product_id,
                'name'             => $i->product_name,
                'quantity'         => (float) $i->quantity,
                'price'            => (float) $i->unit_price,
                'cost'             => (float) $i->unit_cost,
                'total'            => (float) $i->total,
                'taxRate'          => (float) $i->tax_rate,
                'taxAmount'        => (float) $i->tax_amount,
                'discountPercent'  => (float) $i->discount_percent,
                'discountAmount'   => (float) $i->discount_amount,
                'promotionLabel'   => $i->promotion_label,
                'returnedQuantity' => (float) $i->returned_quantity,
            ])->values()->all(),
            'total'         => (float) $s->total,
            'taxRate'       => (float) $s->tax_rate,
            'taxAmount'     => (float) $s->tax_amount,
            'paid'          => (float) $s->paid,
            'change'        => (float) $s->change_due,
            'amountPaid'    => $paidAmount,
            'balanceDue'    => $balance,
            'returnedTotal' => (float) $s->returned_total,
            'paymentStatus' => $balance <= 0.004 ? 'paid' : ($paidAmount <= 0.004 ? 'unpaid' : 'partial'),
            'customerId'    => $s->customer_id ? (string) $s->customer_id : null,
            'customerName'  => $s->customer?->name,
            'userId'        => (string) $s->user_id,
            'userName'      => $s->user?->name ?? '—',
            'date'          => $s->sale_date->toDateString(),
            'paymentMethod' => $s->payment_method,
            'createdAt'     => $s->created_at?->toIso8601String(),
            'returns'       => $s->relationLoaded('returns')
                ? $s->returns->map(fn ($r) => self::saleReturn($r, false))->values()->all()
                : [],
        ];
    }

    public static function saleReturn(SaleReturn $r, bool $withSale = true): array
    {
        return [
            'id'              => (string) $r->id,
            'returnNo'        => $r->return_no,
            'saleId'          => (string) $r->sale_id,
            'invoiceNo'       => $withSale ? ($r->sale?->invoice_no ?? '—') : null,
            'userName'        => $r->user?->name ?? '—',
            'date'            => $r->return_date->toDateString(),
            'total'           => (float) $r->total,
            'taxAmount'       => (float) $r->tax_amount,
            'creditReduction' => (float) $r->credit_reduction,
            'cashRefund'      => (float) $r->cash_refund,
            'refundMethod'    => $r->refund_method,
            'restocked'       => (bool) $r->restocked,
            'reason'          => $r->reason,
            'items'           => $r->items->map(fn ($i) => [
                'name' => $i->product_name, 'quantity' => (float) $i->quantity,
                'unitValue' => (float) $i->unit_value, 'total' => (float) $i->total,
            ])->values()->all(),
        ];
    }

    public static function purchase(Purchase $p): array
    {
        return [
            'id'           => (string) $p->id,
            'reference'    => $p->reference,
            'items'        => $p->items->map(fn ($i) => [
                'productId' => $i->product_id ? (string) $i->product_id : '',
                'name'      => $i->product_name,
                'quantity'  => (float) $i->quantity,
                'price'     => (float) $i->unit_price,        // HT
                'total'     => (float) $i->total,             // HT
                'taxRate'   => (float) $i->tax_rate,
                'priceTtc'  => (float) $i->unit_price_ttc,
                'totalTtc'  => (float) $i->total_ttc,
            ])->values()->all(),
            'total'        => (float) $p->total,              // TTC (montant dû au fournisseur)
            'totalHt'      => (float) $p->total_ht,
            'totalTax'     => (float) $p->total_tax,
            'supplierId'   => (string) $p->supplier_id,
            'supplierName' => $p->supplier?->name ?? '—',
            'date'         => $p->purchase_date->toDateString(),
            'managerName'  => $p->user?->name ?? '—',
        ];
    }

    public static function customer(Customer $c): array
    {
        return [
            'id'             => (string) $c->id,
            'name'           => $c->name,
            'phone'          => $c->phone ?? '',
            'email'          => $c->email ?? '',
            'address'        => $c->address ?? '',
            'totalPurchases' => (float) $c->total_purchases,
            'creditLimit'    => $c->credit_limit !== null ? (float) $c->credit_limit : null,
            'balance'        => round((float) ($c->sales_sum_balance_due ?? 0), 2), // créance : ce que le client doit
            'createdAt'      => $c->created_at?->toDateString(),
        ];
    }

    public static function supplier(Supplier $s): array
    {
        return [
            'id'      => (string) $s->id,
            'name'    => $s->name,
            'contact' => $s->contact ?? '',
            'phone'   => $s->phone ?? '',
            'email'   => $s->email ?? '',
            'address' => $s->address ?? '',
        ];
    }

    public static function role(Role $r): array
    {
        return [
            'id'          => (string) $r->id,
            'name'        => $r->name,
            'slug'        => $r->slug,
            'description' => $r->description ?? '',
            'permissions' => $r->getPermissionKeys(),
            'isSystem'    => (bool) $r->is_system,
            'createdAt'   => $r->created_at?->toDateString(),
        ];
    }

    public static function user(User $u, bool $withAvatar = true): array
    {
        return [
            'id'        => (string) $u->id,
            'name'      => $u->name,
            'email'     => $u->email,
            'phone'     => $u->phone ?? '',
            'role'      => (string) $u->role_id,
            'avatar'    => $withAvatar ? ($u->avatar ?: null) : null,
            'active'    => (bool) $u->active,
            'createdAt' => $u->created_at?->toDateString(),
            'lastSeen'  => $u->last_seen_at?->getTimestampMs(),
        ];
    }

    public static function loss(Loss $l): array
    {
        return [
            'id'            => (string) $l->id,
            'productId'     => $l->product_id ? (string) $l->product_id : '',
            'productName'   => $l->product_name,
            'quantity'      => (float) $l->quantity,
            'unitPrice'     => (float) $l->unit_price,
            'total'         => (float) $l->total,
            'reason'        => $l->reason,
            'date'          => $l->loss_date->toDateString(),
            'notedBy'       => $l->notedBy?->name ?? ($l->auto_generated ? 'Système' : '—'),
            'autoGenerated' => (bool) $l->auto_generated,
        ];
    }

    public static function inventoryRow(InventoryItem $i): array
    {
        return [
            'id'          => (string) $i->id,
            'productId'   => $i->product_id ? (string) $i->product_id : '',
            'productName' => $i->product_name,
            'expected'    => (float) $i->expected,
            'actual'      => (float) $i->actual,
            'difference'  => (float) $i->actual - (float) $i->expected,
            'date'        => $i->session?->session_date?->toDateString(),
            'period'      => $i->session?->period,
            'sessionId'   => (string) $i->inventory_session_id,
            'userName'    => $i->session?->user?->name,
        ];
    }

    public static function pending(PendingAction $a): array
    {
        return [
            'id'              => (string) $a->id,
            'kind'            => $a->kind,
            'module'          => $a->module,
            'action'          => $a->action,
            'description'     => $a->description,
            'details'         => $a->details ?? (object) [],
            'payload'         => $a->payload ?? (object) [],
            'requestedBy'     => (string) $a->requested_by,
            'requestedByName' => $a->requester?->name ?? '—',
            'date'            => $a->request_date->toDateString(),
            'status'          => $a->status,
            'reviewedBy'      => $a->reviewed_by ? (string) $a->reviewed_by : null,
            'reviewedByName'  => $a->reviewer?->name,
            'reviewedDate'    => $a->reviewed_at?->toDateString(),
            'rejectReason'    => $a->reject_reason,
        ];
    }

    /** $readIds = identifiants des notifications déjà lues par l'employé courant. */
    public static function notification(AppNotification $n, array $readIds): array
    {
        return [
            'id'              => (string) $n->id,
            'userId'          => $n->user_id ? (string) $n->user_id : '*',
            'title'           => $n->title,
            'message'         => $n->message,
            'type'            => $n->type,
            'date'            => $n->notified_at?->getTimestampMs(),
            'read'            => in_array($n->id, $readIds, true),
            'scope'           => $n->scope,
            'triggeredById'   => $n->triggered_by_id ? (string) $n->triggered_by_id : 'system',
            'triggeredByName' => $n->triggered_by_name,
            'targetPage'      => $n->target_page,
            'targetId'        => $n->target_id,
        ];
    }

    public static function settings(ShopSetting $s): array
    {
        return [
            'name'            => $s->name ?? '',
            'type'            => $s->type ?? '',
            'logo'            => $s->logo ?? '',
            'slogan'          => $s->slogan ?? '',
            'ifu'             => $s->ifu ?? '',
            'rccm'            => $s->rccm ?? '',
            'phone'           => $s->phone ?? '',
            'phone2'          => $s->phone2 ?? '',
            'email'           => $s->email ?? '',
            'website'         => $s->website ?? '',
            'address'         => $s->address ?? '',
            'city'            => $s->city ?? '',
            'country'         => $s->country ?? '',
            'currency'        => $s->currency ?? 'FCFA',
            'currencyCode'    => $s->currency_code ?? 'XOF',
            'taxRate'         => (float) $s->tax_rate,
            'invoicePrefix'   => $s->invoice_prefix ?? 'FAC',
            'invoiceFooter'   => $s->invoice_footer ?? '',
            'thankYouMessage' => $s->thank_you_message ?? '',
            'maxDiscountPercent' => (float) $s->max_discount_percent,
            'requireCashSession' => (bool) $s->require_cash_session,
            'allowCredit'        => (bool) $s->allow_credit,
        ];
    }

    public static function stockMovement(StockMovement $m): array
    {
        return [
            'id'             => (string) $m->id,
            'productId'      => $m->product_id ? (string) $m->product_id : null,
            'productName'    => $m->product_name,
            'userName'       => $m->user_name ?? 'Système',
            'type'           => $m->type,
            'quantity'       => (float) $m->quantity,
            'stockBefore'    => (float) $m->stock_before,
            'stockAfter'     => (float) $m->stock_after,
            'reason'         => $m->reason,
            'referenceType'  => $m->reference_type,
            'referenceId'    => $m->reference_id ? (string) $m->reference_id : null,
            'referenceLabel' => $m->reference_label,
            'date'           => $m->created_at?->toIso8601String(),
        ];
    }

    public static function promotion(Promotion $p): array
    {
        $today = today()->toDateString();

        return [
            'id'          => (string) $p->id,
            'name'        => $p->name,
            'type'        => $p->type,
            'value'       => (float) $p->value,
            'scope'       => $p->scope,
            'categoryId'  => $p->category_id ? (string) $p->category_id : null,
            'categoryName' => $p->category?->name,
            'productId'   => $p->product_id ? (string) $p->product_id : null,
            'productName' => $p->product?->name,
            'minQuantity' => (float) $p->min_quantity,
            'startsOn'    => $p->starts_on?->toDateString(),
            'endsOn'      => $p->ends_on?->toDateString(),
            'active'      => (bool) $p->active,
            'running'     => $p->isRunningOn($today),
        ];
    }

    /** $summary = résultat de CashSessionService::summary() */
    public static function cashSession(CashSession $c, array $summary): array
    {
        return [
            'id'            => (string) $c->id,
            'userId'        => (string) $c->user_id,
            'userName'      => $c->user?->name ?? '—',
            'status'        => $c->status,
            'openedAt'      => $c->opened_at?->toIso8601String(),
            'closedAt'      => $c->closed_at?->toIso8601String(),
            'openingFloat'  => (float) $c->opening_float,
            'expectedCash'  => $c->status === 'closed' ? (float) $c->expected_cash : $summary['expectedCash'],
            'countedCash'   => $c->counted_cash !== null ? (float) $c->counted_cash : null,
            'difference'    => $c->difference !== null ? (float) $c->difference : null,
            'note'          => $c->note,
            'summary'       => $summary,
        ];
    }
}
