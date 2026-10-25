<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Payment;
use App\Models\Sale;
use App\Models\ShopSetting;
use App\Models\StockMovement;
use Tests\ApiTestCase;

class CreditReturnCashTest extends ApiTestCase
{
    private Customer $client;

    protected function setUp(): void
    {
        parent::setUp();
        $this->client = Customer::create(['name' => 'Client Crédit']);
    }

    private function sell(array $items, array $extra = [], $as = null)
    {
        return $this->as($as ?? $this->cashier)->postJson('/api/sales', ['items' => $items] + $extra);
    }

    private function lessive(int $qty = 2, ?float $paid = 2000)
    {
        return $this->sell([['productId' => $this->product('100010')->id, 'quantity' => $qty]], ['customerId' => $this->client->id, 'paid' => $paid]);
    }

    /** balance_due = total - returned_total - amount_paid, toujours. */
    private function assertInvariant(Sale $sale): void
    {
        $sale->refresh();
        $this->assertEqualsWithDelta($sale->total - $sale->returned_total - $sale->amount_paid, $sale->balance_due, 0.005, 'invariant de la créance');
    }

    // ═════════ Paiement partiel / crédit ═════════

    public function test_partial_payment_creates_a_receivable(): void
    {
        $res = $this->lessive()->assertCreated()
            ->assertJsonPath('sale.total', 6400)->assertJsonPath('sale.amountPaid', 2000)
            ->assertJsonPath('sale.balanceDue', 4400)->assertJsonPath('sale.paymentStatus', 'partial')
            ->assertJsonPath('sale.change', 0);

        $sale = Sale::findOrFail($res->json('sale.id'));
        $this->assertInvariant($sale);
        $this->assertEquals(2000, Payment::where('sale_id', $sale->id)->sum('amount'));

        $this->getJson('/api/customers')->assertOk()->assertJsonPath('0.balance', 4400);
    }

    public function test_fully_unpaid_sale_and_exact_payment_statuses(): void
    {
        $this->lessive(1, 0)->assertCreated()->assertJsonPath('sale.paymentStatus', 'unpaid')->assertJsonPath('sale.balanceDue', 3200);
        $this->assertDatabaseCount('payments', 0);

        $this->lessive(1, 3200)->assertCreated()->assertJsonPath('sale.paymentStatus', 'paid')->assertJsonPath('sale.balanceDue', 0);
        $this->lessive(1, 5000)->assertCreated()->assertJsonPath('sale.change', 1800)->assertJsonPath('sale.amountPaid', 3200);
    }

    public function test_credit_requires_a_customer_and_respects_the_credit_limit(): void
    {
        $this->sell([['productId' => $this->product('100010')->id, 'quantity' => 1]], ['paid' => 0])
            ->assertStatus(422)->assertJsonValidationErrors('customer_id');

        $this->client->update(['credit_limit' => 5000]);
        $this->lessive(1, 0)->assertCreated();                       // 3200 ≤ 5000
        $this->lessive(1, 0)->assertStatus(422)->assertJsonValidationErrors('paid'); // 6400 > 5000
        $this->lessive(1, 1500)->assertCreated();                    // 3200 + 1700 = 4900 ≤ 5000
    }

    public function test_settlement_pays_oldest_debts_first_and_refuses_overpayment(): void
    {
        $a = Sale::findOrFail($this->lessive(2, 2000)->json('sale.id')); // doit 4400
        $b = Sale::findOrFail($this->lessive(1, 200)->json('sale.id'));  // doit 3000

        $this->postJson("/api/customers/{$this->client->id}/payments", ['amount' => 8000])->assertStatus(422);
        $this->postJson("/api/customers/{$this->client->id}/payments", ['amount' => 0])->assertStatus(422);

        $this->postJson("/api/customers/{$this->client->id}/payments", ['amount' => 5000, 'method' => 'Mobile Money'])
            ->assertCreated()->assertJsonPath('applied', 2);

        $this->assertEquals(0, $a->fresh()->balance_due);
        $this->assertEquals(2400, $b->fresh()->balance_due);
        $this->assertInvariant($a);
        $this->assertInvariant($b);
        $this->assertEquals(2, Payment::where('kind', 'settlement')->count());

        $this->getJson("/api/customers/{$this->client->id}/account")->assertOk()
            ->assertJsonPath('balance', 2400)->assertJsonCount(1, 'openSales')->assertJsonCount(2, 'payments');

        // règlement ciblé sur une vente
        $this->postJson("/api/customers/{$this->client->id}/payments", ['amount' => 400, 'saleId' => $b->id])->assertCreated();
        $this->assertEquals(2000, $b->fresh()->balance_due);
        $this->postJson("/api/customers/{$this->client->id}/payments", ['amount' => 2000])->assertCreated();
        $this->postJson("/api/customers/{$this->client->id}/payments", ['amount' => 1])->assertStatus(422); // plus rien à payer
        $this->getJson('/api/customers')->assertJsonPath('0.balance', 0);
    }

    // ═════════ Retours ═════════

    public function test_partial_return_refunds_the_discounted_value_and_restocks(): void
    {
        $riz = $this->product('100001'); // 45
        $sale = Sale::findOrFail($this->sell([['productId' => $riz->id, 'quantity' => 2, 'discountPercent' => 10]], ['customerId' => $this->client->id])->json('sale.id'));
        $item = $sale->items()->firstOrFail();
        $this->assertEquals(43, $riz->fresh()->stock);

        $this->as($this->admin)->postJson('/api/actions', ['kind' => 'sale.return', 'payload' => [
            'saleId' => $sale->id, 'items' => [['saleItemId' => $item->id, 'quantity' => 1]], 'reason' => 'Emballage abîmé',
        ]])->assertOk();

        $sale->refresh();
        $this->assertEquals(7650, $sale->returned_total);     // 15300 / 2 : la remise est restituée aussi
        $this->assertEquals(7650, $sale->amount_paid);
        $this->assertEquals(44, $riz->fresh()->stock);
        $this->assertEquals(7650, $this->client->fresh()->total_purchases);
        $this->assertInvariant($sale);

        $r = \App\Models\SaleReturn::firstOrFail();
        $this->assertSame('AV-' . now()->year . '-0001', $r->return_no);
        $this->assertEquals(7650, $r->cash_refund);
        $this->assertEquals(0, $r->credit_reduction);
        $this->assertEquals(-7650, Payment::where('kind', 'refund')->sum('amount'));

        $m = StockMovement::where('type', 'sale_return')->firstOrFail();
        $this->assertEquals(1, $m->quantity);
        $this->assertSame($r->return_no, $m->reference_label);

        // la vente expose ses retours
        $this->getJson('/api/sales')->assertOk()
            ->assertJsonPath('0.returnedTotal', 7650)->assertJsonPath('0.items.0.returnedQuantity', 1)
            ->assertJsonPath('0.returns.0.returnNo', $r->return_no)->assertJsonPath('0.returns.0.reason', 'Emballage abîmé');
    }

    public function test_cannot_return_more_than_was_sold_and_the_last_unit_closes_the_line_exactly(): void
    {
        $sale = Sale::findOrFail($this->sell([['productId' => $this->product('100001')->id, 'quantity' => 3, 'discountPercent' => 3]])->json('sale.id'));
        $item = $sale->items()->firstOrFail();   // 25500 - 3 % = 24735
        $ret = fn (float $q) => $this->as($this->admin)->postJson('/api/actions', ['kind' => 'sale.return', 'payload' => [
            'saleId' => $sale->id, 'items' => [['saleItemId' => $item->id, 'quantity' => $q]],
        ]]);

        $ret(4)->assertStatus(422);
        $ret(1)->assertOk();
        $ret(1)->assertOk();
        $ret(2)->assertStatus(422);   // il ne reste qu'une unité
        $ret(1)->assertOk();

        $sale->refresh();
        $this->assertEquals(24735, $sale->returned_total);       // somme exacte, pas d'écart d'arrondi
        $this->assertEquals(0, $sale->amount_paid);
        $this->assertInvariant($sale);
        $ret(1)->assertStatus(422);
    }

    public function test_return_on_a_credit_sale_reduces_the_debt_before_refunding_cash(): void
    {
        $sale = Sale::findOrFail($this->lessive(2, 2000)->json('sale.id')); // 6400, payé 2000, dû 4400
        $item = $sale->items()->firstOrFail();
        $ret = fn () => $this->as($this->admin)->postJson('/api/actions', ['kind' => 'sale.return', 'payload' => [
            'saleId' => $sale->id, 'items' => [['saleItemId' => $item->id, 'quantity' => 1]],
        ]])->assertOk();

        $ret();
        $sale->refresh();
        $this->assertEquals(1200, $sale->balance_due);           // 4400 - 3200
        $this->assertEquals(2000, $sale->amount_paid);           // rien à rembourser : la dette absorbe tout
        $this->assertInvariant($sale);
        $this->assertDatabaseCount('payments', 1);

        $ret();
        $sale->refresh();
        $this->assertEquals(0, $sale->balance_due);              // 1200 de dette soldés...
        $this->assertEquals(0, $sale->amount_paid);              // ...et 2000 remboursés
        $this->assertInvariant($sale);
        $this->assertEquals(-2000, Payment::where('kind', 'refund')->sum('amount'));
    }

    public function test_return_without_restock_leaves_stock_untouched(): void
    {
        $riz = $this->product('100001');
        $sale = Sale::findOrFail($this->sell([['productId' => $riz->id, 'quantity' => 1]])->json('sale.id'));
        $this->as($this->admin)->postJson('/api/actions', ['kind' => 'sale.return', 'payload' => [
            'saleId' => $sale->id, 'items' => [['saleItemId' => $sale->items()->first()->id, 'quantity' => 1]], 'restock' => false,
        ]])->assertOk();

        $this->assertEquals(44, $riz->fresh()->stock);
        $this->assertDatabaseMissing('stock_movements', ['type' => 'sale_return']);
    }

    public function test_cashier_return_waits_for_admin_approval_and_is_attributed_to_the_cashier(): void
    {
        $riz = $this->product('100001');
        $sale = Sale::findOrFail($this->sell([['productId' => $riz->id, 'quantity' => 1]])->json('sale.id'));
        $payload = ['saleId' => $sale->id, 'items' => [['saleItemId' => $sale->items()->first()->id, 'quantity' => 1]]];

        $res = $this->as($this->cashier)->postJson('/api/actions', ['kind' => 'sale.return', 'description' => 'Retour FAC', 'payload' => $payload])
            ->assertStatus(202)->assertJsonPath('executed', false);
        $this->assertEquals(44, $riz->fresh()->stock);
        $this->assertDatabaseCount('sale_returns', 0);

        $this->as($this->admin)->postJson('/api/pending-actions/' . $res->json('pending.id') . '/approve')->assertOk();
        $this->assertEquals(45, $riz->fresh()->stock);
        $this->assertEquals($this->cashier->id, \App\Models\SaleReturn::firstOrFail()->user_id);
    }

    public function test_return_payload_is_validated(): void
    {
        $this->as($this->admin);
        $this->postJson('/api/actions', ['kind' => 'sale.return', 'payload' => ['saleId' => 999, 'items' => [['saleItemId' => 1, 'quantity' => 1]]]])->assertStatus(422);
        $this->postJson('/api/actions', ['kind' => 'sale.return', 'payload' => ['saleId' => 1, 'items' => []]])->assertStatus(422);
    }

    // ═════════ Sessions de caisse ═════════

    public function test_cash_session_tracks_expected_cash_and_flags_a_difference(): void
    {
        $this->as($this->cashier);
        $this->getJson('/api/cash-sessions/current')->assertOk()->assertContent('null');

        $id = $this->postJson('/api/cash-sessions', ['openingFloat' => 10000])->assertCreated()->json('id');
        $this->postJson('/api/cash-sessions', ['openingFloat' => 5])->assertStatus(422); // déjà ouverte

        $riz = $this->product('100001');
        $this->sell([['productId' => $riz->id, 'quantity' => 2]], ['paid' => 20000]);                                  // espèces 17000 (3000 de monnaie rendue)
        $this->sell([['productId' => $this->product('100010')->id, 'quantity' => 1]], ['paymentMethod' => 'Mobile Money']); // 3200 hors tiroir

        $cur = $this->getJson('/api/cash-sessions/current')->assertOk()
            ->assertJsonPath('summary.salesCount', 2)->assertJsonPath('summary.salesTotal', 20200)
            ->assertJsonPath('summary.cashIn', 17000)->assertJsonPath('summary.expectedCash', 27000)
            ->assertJsonPath('summary.byMethod.Mobile Money', 3200);
        $this->assertSame((string) $id, $cur->json('id'));

        // un remboursement en espèces sort du tiroir
        $sale = Sale::where('payment_method', 'Espèces')->firstOrFail();
        $this->as($this->admin)->postJson('/api/actions', ['kind' => 'sale.return', 'payload' => [
            'saleId' => $sale->id, 'items' => [['saleItemId' => $sale->items()->first()->id, 'quantity' => 1]],
        ]])->assertOk();
        // (le remboursement est rattaché à la caisse de celui qui exécute : ici l'admin n'en a pas ouvert)
        $this->assertDatabaseHas('payments', ['kind' => 'refund', 'cash_session_id' => null]);

        // fermeture avec un écart
        $this->as($this->cashier);
        $this->postJson("/api/cash-sessions/{$id}/close", ['countedCash' => 26000, 'note' => 'Billet de 1000 manquant'])->assertOk()
            ->assertJsonPath('status', 'closed')->assertJsonPath('expectedCash', 27000)
            ->assertJsonPath('difference', -1000)->assertJsonPath('note', 'Billet de 1000 manquant');
        $this->postJson("/api/cash-sessions/{$id}/close", ['countedCash' => 1])->assertStatus(422); // déjà fermée

        $this->assertDatabaseHas('notifications', ['title' => 'Écart de caisse']);
        $this->getJson('/api/cash-sessions/current')->assertOk()->assertContent('null');
    }

    public function test_cash_refund_is_counted_in_the_cashiers_open_session(): void
    {
        $this->as($this->cashier);
        $id = $this->postJson('/api/cash-sessions', ['openingFloat' => 0])->json('id');
        $sale = Sale::findOrFail($this->sell([['productId' => $this->product('100001')->id, 'quantity' => 1]])->json('sale.id'));

        // le caissier demande un retour, l'admin approuve : le tiroir du caissier est débité
        $pending = $this->postJson('/api/actions', ['kind' => 'sale.return', 'payload' => [
            'saleId' => $sale->id, 'items' => [['saleItemId' => $sale->items()->first()->id, 'quantity' => 1]],
        ]])->assertStatus(202)->json('pending.id');
        $this->as($this->admin)->postJson("/api/pending-actions/{$pending}/approve")->assertOk();

        $this->as($this->cashier)->getJson('/api/cash-sessions/current')
            ->assertJsonPath('summary.refunds', 8500)->assertJsonPath('summary.expectedCash', 0);
    }

    public function test_require_cash_session_blocks_sales_until_the_till_is_open(): void
    {
        ShopSetting::instance()->update(['require_cash_session' => true]);
        $items = [['productId' => $this->product('100001')->id, 'quantity' => 1]];

        $this->sell($items)->assertStatus(422)->assertJsonValidationErrors('session');
        $this->assertDatabaseCount('sales', 0);

        $this->postJson('/api/cash-sessions', ['openingFloat' => 0])->assertCreated();
        $this->sell($items)->assertCreated();
        $this->assertNotNull(Sale::first()->cash_session_id);
    }

    public function test_sessions_are_private_to_their_owner_except_for_admins(): void
    {
        $id = $this->as($this->cashier)->postJson('/api/cash-sessions', ['openingFloat' => 100])->json('id');

        $this->as($this->manager)->postJson("/api/cash-sessions/{$id}/close", ['countedCash' => 100])->assertForbidden();
        $this->getJson('/api/cash-sessions')->assertOk()->assertJsonCount(0);                       // le gestionnaire ne voit que les siennes
        $this->as($this->admin)->getJson('/api/cash-sessions')->assertOk()->assertJsonCount(1);
        $this->postJson("/api/cash-sessions/{$id}/close", ['countedCash' => 100])->assertOk();      // l'admin peut clôturer
    }

    public function test_settlements_are_attached_to_the_open_session(): void
    {
        $this->as($this->cashier);
        $this->postJson('/api/cash-sessions', ['openingFloat' => 1000]);
        $this->lessive(2, 2000);
        $this->postJson("/api/customers/{$this->client->id}/payments", ['amount' => 1000])->assertCreated();

        $this->getJson('/api/cash-sessions/current')
            ->assertJsonPath('summary.settlements', 1000)->assertJsonPath('summary.cashIn', 3000)
            ->assertJsonPath('summary.creditGranted', 3400)->assertJsonPath('summary.expectedCash', 4000);
    }
}
