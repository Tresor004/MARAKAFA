<?php

namespace Tests\Feature;

use App\Models\Loss;
use App\Models\Purchase;
use App\Models\Supplier;
use Tests\ApiTestCase;

class PurchaseLossInventoryTest extends ApiTestCase
{
    private Supplier $supplier;

    protected function setUp(): void
    {
        parent::setUp();
        $this->supplier = Supplier::create(['name' => 'Fourn']);
    }

    private function act(string $kind, array $payload)
    {
        return $this->postJson('/api/actions', ['kind' => $kind, 'module' => 'T', 'action' => 'T', 'description' => 'T', 'payload' => $payload]);
    }

    private function buy(float $qty = 10, float $price = 7000)
    {
        return $this->act('purchase.add', [
            'supplierId' => $this->supplier->id,
            'items' => [['productId' => $this->product('100001')->id, 'name' => 'x', 'quantity' => $qty, 'price' => $price]],
        ]);
    }

    public function test_purchase_increases_stock_and_updates_cost(): void
    {
        $this->as($this->manager);
        $this->buy()->assertStatus(202);                          // gestionnaire → validation
        $this->as($this->admin)->postJson('/api/pending-actions/1/approve')->assertOk();

        $p = $this->product('100001');
        $this->assertEquals(55, $p->stock);
        $this->assertEquals(7000, $p->cost);

        $purchase = Purchase::first();
        $this->assertSame('BA-' . now()->year . '-0001', $purchase->reference);
        $this->assertEquals($this->manager->id, $purchase->user_id);   // auteur = demandeur, pas l'admin
        $this->assertEquals(70000, $purchase->total);
    }

    public function test_purchase_update_and_delete_reverse_stock(): void
    {
        $this->as($this->admin);
        $this->buy(10)->assertOk();
        $id = Purchase::first()->id;
        $this->assertEquals(55, $this->product('100001')->stock);

        $this->act('purchase.update', ['id' => $id, 'data' => [
            'supplierId' => $this->supplier->id,
            'items' => [['productId' => $this->product('100001')->id, 'quantity' => 4, 'price' => 6800]],
        ]])->assertOk();
        $this->assertEquals(49, $this->product('100001')->stock);
        $this->assertEquals(27200, Purchase::first()->total);

        $this->act('purchase.delete', ['id' => $id])->assertOk();
        $this->assertEquals(45, $this->product('100001')->stock);
    }

    public function test_purchase_cannot_be_cancelled_if_goods_already_sold(): void
    {
        $this->as($this->admin);
        $this->buy(10)->assertOk();
        $this->product('100001')->update(['stock' => 3]);   // une partie a été vendue

        $this->act('purchase.delete', ['id' => Purchase::first()->id])->assertStatus(422);
        $this->assertEquals(3, $this->product('100001')->stock);
        $this->assertNull(Purchase::first()->deleted_at);
    }

    public function test_loss_decreases_stock_values_at_cost_and_is_reversible(): void
    {
        $p = $this->product('100001');
        $this->as($this->manager)->act('loss.add', ['productId' => $p->id, 'quantity' => 2, 'reason' => 'Casse'])->assertStatus(202);
        $this->assertEquals(45, $p->fresh()->stock);

        $this->as($this->admin)->postJson('/api/pending-actions/1/approve')->assertOk();
        $loss = Loss::first();
        $this->assertEquals(43, $p->fresh()->stock);
        $this->assertEquals(13000, $loss->total);               // 2 × coût 6500
        $this->assertEquals($this->manager->id, $loss->noted_by);
        $this->assertFalse($loss->auto_generated);

        $this->act('loss.delete', ['id' => $loss->id])->assertOk();
        $this->assertEquals(45, $p->fresh()->stock);
    }

    public function test_loss_larger_than_stock_is_refused(): void
    {
        $this->as($this->admin)->act('loss.add', ['productId' => $this->product('100012')->id, 'quantity' => 6, 'reason' => 'Casse'])->assertStatus(422);
        $this->assertDatabaseCount('losses', 0);
    }

    public function test_inventory_uses_database_stock_as_expected_and_aligns_stock(): void
    {
        $a = $this->product('100001');
        $b = $this->product('100002');

        $this->as($this->admin)->act('inventory.do', ['period' => 'Mois', 'counts' => [
            ['productId' => $a->id, 'actual' => 40],
            ['productId' => $b->id, 'actual' => 80],
        ]])->assertOk();

        $this->assertEquals(40, $a->fresh()->stock);
        $rows = $this->getJson('/api/inventory')->assertOk()->json();
        $row = collect($rows)->firstWhere('productId', (string) $a->id);
        $this->assertEquals(45, $row['expected']);
        $this->assertEquals(-5, $row['difference']);
        $this->assertSame('Mois', $row['period']);
        $this->assertSame('Administrateur', $row['userName']);
    }

    public function test_supplier_with_purchases_cannot_be_deleted(): void
    {
        $this->as($this->admin);
        $this->buy()->assertOk();
        $this->act('supplier.delete', ['id' => $this->supplier->id])->assertStatus(422);
    }
}
