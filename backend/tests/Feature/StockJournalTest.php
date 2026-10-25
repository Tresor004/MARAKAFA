<?php

namespace Tests\Feature;

use App\Models\StockMovement;
use App\Models\Supplier;
use Tests\ApiTestCase;

class StockJournalTest extends ApiTestCase
{
    public function test_a_sale_is_journaled_with_who_why_and_before_after(): void
    {
        $riz = $this->product('100001'); // stock 45
        $this->as($this->cashier)->postJson('/api/sales', [
            'items' => [['productId' => $riz->id, 'quantity' => 3]],
        ])->assertCreated();

        $m = StockMovement::where('product_id', $riz->id)->firstOrFail();
        $this->assertSame('sale', $m->type);
        $this->assertEquals(-3, $m->quantity);
        $this->assertEquals(45, $m->stock_before);
        $this->assertEquals(42, $m->stock_after);
        $this->assertSame($this->cashier->name, $m->user_name);
        $this->assertStringStartsWith('FAC-', $m->reference_label);
    }

    public function test_every_stock_operation_leaves_a_trace_and_the_chain_is_consistent(): void
    {
        $riz = $this->product('100001');
        $supplier = Supplier::create(['name' => 'Four']);

        $this->as($this->admin);
        $this->postJson('/api/actions', ['kind' => 'purchase.add', 'payload' => [
            'supplierId' => $supplier->id, 'items' => [['productId' => $riz->id, 'quantity' => 10, 'price' => 6500]],
        ]])->assertOk();
        $this->postJson('/api/actions', ['kind' => 'loss.add', 'payload' => [
            'productId' => $riz->id, 'quantity' => 2, 'reason' => 'Casse',
        ]])->assertOk();
        $this->postJson('/api/actions', ['kind' => 'stock.adjust', 'payload' => [
            'productId' => $riz->id, 'delta' => -1, 'reason' => 'Carton ouvert',
        ]])->assertOk();
        $this->postJson('/api/actions', ['kind' => 'inventory.do', 'payload' => [
            'period' => 'Semaine', 'counts' => [['productId' => $riz->id, 'actual' => 40]],
        ]])->assertOk();

        $types = StockMovement::where('product_id', $riz->id)->orderBy('id')->pluck('type')->all();
        $this->assertSame(['purchase', 'loss', 'adjustment', 'inventory'], $types);

        // Chaîne cohérente : le « après » d'un mouvement est le « avant » du suivant, et le dernier = stock réel
        $rows = StockMovement::where('product_id', $riz->id)->orderBy('id')->get();
        for ($i = 1; $i < $rows->count(); $i++) {
            $this->assertEquals($rows[$i - 1]->stock_after, $rows[$i]->stock_before);
        }
        $this->assertEquals($riz->fresh()->stock, $rows->last()->stock_after);
        $this->assertEquals(40, $rows->last()->stock_after);
        $this->assertSame('Carton ouvert', $rows[2]->reason);
    }

    public function test_deleting_a_loss_and_a_purchase_are_journaled(): void
    {
        $riz = $this->product('100001');
        $this->as($this->admin);
        $this->postJson('/api/actions', ['kind' => 'loss.add', 'payload' => ['productId' => $riz->id, 'quantity' => 2, 'reason' => 'Casse']]);
        $loss = \App\Models\Loss::firstOrFail();
        $this->postJson('/api/actions', ['kind' => 'loss.delete', 'payload' => ['id' => $loss->id]])->assertOk();

        $this->assertSame(['loss', 'loss_cancel'], StockMovement::orderBy('id')->pluck('type')->all());
    }

    public function test_product_creation_with_stock_records_an_initial_movement(): void
    {
        $this->as($this->admin)->postJson('/api/actions', ['kind' => 'product.add', 'payload' => [
            'name' => 'Nouveau', 'price' => 500, 'stock' => 12, 'barcode' => '555',
        ]])->assertOk();

        $m = StockMovement::where('product_name', 'Nouveau')->firstOrFail();
        $this->assertSame('initial', $m->type);
        $this->assertEquals(12, $m->stock_after);
    }

    public function test_product_update_cannot_silently_change_stock(): void
    {
        $riz = $this->product('100001');
        $this->as($this->admin)->postJson('/api/actions', ['kind' => 'product.update', 'payload' => [
            'id' => $riz->id, 'data' => ['stock' => 99],
        ]])->assertOk();

        $this->assertEquals(99, $riz->fresh()->stock);
        $m = StockMovement::where('product_id', $riz->id)->firstOrFail();
        $this->assertSame('adjustment', $m->type);
        $this->assertEquals(54, $m->quantity);
    }

    public function test_journal_endpoint_filters_paginates_and_is_protected(): void
    {
        $riz = $this->product('100001');
        $eau = $this->product('100007');
        $this->as($this->cashier)->postJson('/api/sales', [
            'items' => [['productId' => $riz->id, 'quantity' => 1], ['productId' => $eau->id, 'quantity' => 2]],
        ])->assertCreated();

        // le caissier n'a pas accès au journal
        $this->getJson('/api/stock-movements')->assertForbidden();

        $this->as($this->manager);
        $this->getJson('/api/stock-movements')->assertOk()->assertJsonPath('total', 2);
        $this->getJson('/api/stock-movements?productId=' . $eau->id)->assertOk()
            ->assertJsonPath('total', 1)->assertJsonPath('data.0.productName', 'Eau Cristaline 1.5L')
            ->assertJsonPath('data.0.quantity', -2)->assertJsonPath('data.0.stockBefore', 200)->assertJsonPath('data.0.stockAfter', 198);
        $this->getJson('/api/stock-movements?type=loss')->assertOk()->assertJsonPath('total', 0);
        $this->getJson('/api/stock-movements?type=nimporte')->assertStatus(422);
        $this->getJson('/api/stock-movements?perPage=1&page=2')->assertOk()->assertJsonPath('lastPage', 2)->assertJsonCount(1, 'data');
        $this->getJson('/api/stock-movements?q=FAC-')->assertOk()->assertJsonPath('total', 2);
    }

    public function test_a_failed_operation_leaves_no_movement(): void
    {
        $tomate = $this->product('100012'); // stock 5
        $this->as($this->cashier)->postJson('/api/sales', ['items' => [['productId' => $tomate->id, 'quantity' => 6]]])->assertStatus(422);
        $this->assertDatabaseCount('stock_movements', 0);
    }
}
