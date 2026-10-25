<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\ShopSetting;
use Tests\ApiTestCase;

class SaleTest extends ApiTestCase
{
    public function test_sale_prices_are_computed_server_side_and_stock_decreases(): void
    {
        $riz = $this->product('100001'); // 8500
        $before = $riz->stock;

        $res = $this->as($this->cashier)->postJson('/api/sales', [
            'items' => [['productId' => $riz->id, 'quantity' => 2, 'price' => 1, 'total' => 1]], // prix envoyés : ignorés
            'paid' => 20000,
        ])->assertCreated();

        $res->assertJsonPath('sale.total', 17000)
            ->assertJsonPath('sale.change', 3000)
            ->assertJsonPath('sale.items.0.price', 8500)
            ->assertJsonPath('sale.invoiceNo', 'FAC-' . now()->year . '-0001');
        $this->assertEquals($before - 2, $riz->fresh()->stock);
    }

    public function test_insufficient_stock_is_refused_and_nothing_changes(): void
    {
        $tomate = $this->product('100012'); // stock 5
        $riz = $this->product('100001');

        $this->as($this->cashier)->postJson('/api/sales', [
            'items' => [
                ['productId' => $riz->id, 'quantity' => 1],
                ['productId' => $tomate->id, 'quantity' => 6],
            ],
        ])->assertStatus(422)->assertJsonValidationErrors('stock');

        $this->assertEquals(45, $riz->fresh()->stock);   // transaction annulée
        $this->assertEquals(5, $tomate->fresh()->stock);
        $this->assertDatabaseCount('sales', 0);
    }

    public function test_underpayment_without_customer_is_refused(): void
    {
        $this->as($this->cashier)->postJson('/api/sales', [
            'items' => [['productId' => $this->product('100001')->id, 'quantity' => 1]],
            'paid' => 100,
        ])->assertStatus(422)->assertJsonValidationErrors('customer_id');
        $this->assertDatabaseCount('sales', 0);
    }

    public function test_underpayment_is_refused_when_credit_is_disabled(): void
    {
        ShopSetting::instance()->update(['allow_credit' => false]);
        $c = Customer::create(['name' => 'Client']);

        $this->as($this->cashier)->postJson('/api/sales', [
            'items' => [['productId' => $this->product('100001')->id, 'quantity' => 1]],
            'paid' => 100, 'customerId' => $c->id,
        ])->assertStatus(422)->assertJsonValidationErrors('paid');
    }

    public function test_vat_is_included_in_the_total_and_snapshotted(): void
    {
        ShopSetting::instance()->update(['tax_rate' => 18]);

        $this->as($this->cashier)->postJson('/api/sales', [
            'items' => [['productId' => $this->product('100001')->id, 'quantity' => 1]], // 8500 TTC
        ])->assertCreated()
            ->assertJsonPath('sale.total', 8500)
            ->assertJsonPath('sale.taxRate', 18)
            ->assertJsonPath('sale.taxAmount', 1296.61);

        ShopSetting::instance()->update(['tax_rate' => 0]); // une ancienne vente garde son taux
        $this->assertSame(18.0, (float) \App\Models\Sale::first()->tax_rate);
    }

    public function test_customer_total_and_unit_cost_snapshot(): void
    {
        $c = Customer::create(['name' => 'Test']);
        $this->as($this->cashier)->postJson('/api/sales', [
            'items' => [['productId' => $this->product('100001')->id, 'quantity' => 2]],
            'customerId' => $c->id,
        ])->assertCreated();

        $this->assertEquals(17000, $c->fresh()->total_purchases);
        $this->assertEquals(6500, \App\Models\SaleItem::first()->unit_cost);
    }

    public function test_decimal_quantities_for_weighed_goods(): void
    {
        $p = $this->product('100003'); // 950 / pièce
        $p->update(['unit' => 'kg', 'stock' => 10]);

        $this->as($this->cashier)->postJson('/api/sales', [
            'items' => [['productId' => $p->id, 'quantity' => 1.25]],
        ])->assertCreated()->assertJsonPath('sale.total', 1187.5);

        $this->assertEquals(8.75, $p->fresh()->stock);
    }

    public function test_invoice_numbers_are_sequential(): void
    {
        $id = $this->product('100001')->id;
        foreach ([1, 2, 3] as $n) {
            $this->as($this->cashier)->postJson('/api/sales', ['items' => [['productId' => $id, 'quantity' => 1]]])
                ->assertJsonPath('sale.invoiceNo', sprintf('FAC-%d-%04d', now()->year, $n));
        }
    }

    public function test_stock_threshold_notification_fires_once_when_crossing(): void
    {
        $p = $this->product('100001'); // stock 45, seuil 10
        $p->update(['stock' => 12]);

        $this->as($this->cashier);
        $this->postJson('/api/sales', ['items' => [['productId' => $p->id, 'quantity' => 3]]])->assertCreated(); // 9 → critique
        $this->postJson('/api/sales', ['items' => [['productId' => $p->id, 'quantity' => 1]]])->assertCreated(); // 8 → pas de doublon

        $this->assertSame(1, \App\Models\AppNotification::where('title', 'Stock critique')->count());
    }
}
