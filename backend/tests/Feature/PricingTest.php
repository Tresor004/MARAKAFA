<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Product;
use App\Models\Promotion;
use App\Models\ShopSetting;
use App\Models\Supplier;
use Tests\ApiTestCase;

class PricingTest extends ApiTestCase
{
    private function sell(array $items, ?\App\Models\User $as = null, array $extra = [])
    {
        return $this->as($as ?? $this->cashier)->postJson('/api/sales', ['items' => $items] + $extra);
    }

    public function test_vat_is_per_product_with_shop_default_as_fallback(): void
    {
        ShopSetting::instance()->update(['tax_rate' => 18]);
        $this->product('100003')->update(['tax_rate' => 0]);   // sucre exonéré
        $this->product('100010')->update(['tax_rate' => 10]);  // lessive à 10 %

        $res = $this->sell([
            ['productId' => $this->product('100001')->id, 'quantity' => 1], // 8500 à 18 % (défaut boutique)
            ['productId' => $this->product('100003')->id, 'quantity' => 1], // 950 à 0 %
            ['productId' => $this->product('100010')->id, 'quantity' => 1], // 3200 à 10 %
        ])->assertCreated();

        $res->assertJsonPath('sale.total', 12650)
            ->assertJsonPath('sale.items.0.taxRate', 18)->assertJsonPath('sale.items.0.taxAmount', 1296.61)
            ->assertJsonPath('sale.items.1.taxRate', 0)->assertJsonPath('sale.items.1.taxAmount', 0)
            ->assertJsonPath('sale.items.2.taxRate', 10)->assertJsonPath('sale.items.2.taxAmount', 290.91)
            ->assertJsonPath('sale.taxAmount', 1587.52);
    }

    public function test_product_tax_rate_can_be_set_and_reset_through_actions(): void
    {
        $riz = $this->product('100001');
        $this->as($this->admin)->postJson('/api/actions', ['kind' => 'product.update', 'payload' => ['id' => $riz->id, 'data' => ['taxRate' => 5.5]]])->assertOk();
        $this->assertEquals(5.5, $riz->fresh()->tax_rate);
        $this->getJson('/api/products/' . $riz->id)->assertJsonPath('taxRate', 5.5);

        $this->postJson('/api/actions', ['kind' => 'product.update', 'payload' => ['id' => $riz->id, 'data' => ['taxRate' => null]]])->assertOk();
        $this->assertNull($riz->fresh()->tax_rate);
        $this->postJson('/api/actions', ['kind' => 'product.update', 'payload' => ['id' => $riz->id, 'data' => ['taxRate' => 120]]])->assertStatus(422);
    }

    public function test_manual_discount_is_capped_for_cashiers_but_not_for_admins(): void
    {
        $riz = $this->product('100001');

        $this->sell([['productId' => $riz->id, 'quantity' => 2, 'discountPercent' => 10]])->assertCreated()
            ->assertJsonPath('sale.total', 15300)
            ->assertJsonPath('sale.items.0.discountPercent', 10)
            ->assertJsonPath('sale.items.0.discountAmount', 1700)
            ->assertJsonPath('sale.items.0.price', 8500); // le prix catalogue reste visible

        $this->sell([['productId' => $riz->id, 'quantity' => 1, 'discountPercent' => 11]])
            ->assertStatus(422)->assertJsonValidationErrors('items');

        ShopSetting::instance()->update(['max_discount_percent' => 25]);
        $this->sell([['productId' => $riz->id, 'quantity' => 1, 'discountPercent' => 20]])->assertCreated()->assertJsonPath('sale.total', 6800);

        $this->sell([['productId' => $riz->id, 'quantity' => 1, 'discountPercent' => 50]], $this->admin)
            ->assertCreated()->assertJsonPath('sale.total', 4250);

        $this->sell([['productId' => $riz->id, 'quantity' => 1, 'discountPercent' => 120]], $this->admin)->assertStatus(422);
    }

    public function test_category_percent_promotion_applies_automatically(): void
    {
        Promotion::create(['name' => 'Boissons', 'type' => 'percent', 'value' => 10, 'scope' => 'category',
            'category_id' => Category::where('name', 'Boissons')->value('id')]);

        $this->sell([
            ['productId' => $this->product('100006')->id, 'quantity' => 2], // Coca 2500 → 2250
            ['productId' => $this->product('100001')->id, 'quantity' => 1], // Riz : hors catégorie
        ])->assertCreated()
            ->assertJsonPath('sale.items.0.total', 2250)
            ->assertJsonPath('sale.items.0.discountAmount', 250)
            ->assertJsonPath('sale.items.1.total', 8500)
            ->assertJsonPath('sale.total', 10750);

        $this->assertStringContainsString('Boissons', \App\Models\SaleItem::first()->promotion_label);
    }

    public function test_amount_promotion_needs_its_minimum_quantity(): void
    {
        $savon = $this->product('100009'); // 650
        Promotion::create(['name' => 'Savon', 'type' => 'amount', 'value' => 100, 'scope' => 'product', 'product_id' => $savon->id, 'min_quantity' => 3]);

        $this->sell([['productId' => $savon->id, 'quantity' => 2]])->assertCreated()->assertJsonPath('sale.total', 1300);
        $this->sell([['productId' => $savon->id, 'quantity' => 3]])->assertCreated()->assertJsonPath('sale.total', 1650); // 1950 - 3×100
    }

    public function test_best_promotion_wins_and_expired_or_inactive_ones_are_ignored(): void
    {
        $coca = $this->product('100006'); // 1250
        $mk = fn (string $name, float $v, array $o = []) => Promotion::create(['name' => $name, 'type' => 'percent', 'value' => $v, 'scope' => 'all'] + $o);
        $mk('Petite', 5);
        $mk('Grosse', 15);
        $mk('Périmée', 50, ['ends_on' => today()->subDay()->toDateString()]);
        $mk('Future', 50, ['starts_on' => today()->addDay()->toDateString()]);
        $mk('Éteinte', 50, ['active' => false]);

        $this->sell([['productId' => $coca->id, 'quantity' => 1]])->assertCreated()
            ->assertJsonPath('sale.total', 1062.5)
            ->assertJsonPath('sale.items.0.promotionLabel', 'Grosse (15 %)');
    }

    public function test_promotion_and_manual_discount_stack_and_vat_is_computed_on_the_net(): void
    {
        ShopSetting::instance()->update(['tax_rate' => 18]);
        Promotion::create(['name' => 'Promo', 'type' => 'percent', 'value' => 10, 'scope' => 'all']);

        $this->sell([['productId' => $this->product('100006')->id, 'quantity' => 2, 'discountPercent' => 10]])->assertCreated()
            ->assertJsonPath('sale.total', 2025)   // 2500 → -10 % = 2250 → -10 % = 2025
            ->assertJsonPath('sale.items.0.discountAmount', 475)
            ->assertJsonPath('sale.taxAmount', 308.9); // 2025 - 2025/1.18
    }

    public function test_promotion_crud_goes_through_the_validation_circuit(): void
    {
        $payload = ['name' => 'Soldes', 'type' => 'percent', 'value' => 20, 'scope' => 'all'];

        // un caissier ne peut que demander
        $this->as($this->cashier)->postJson('/api/actions', ['kind' => 'promotion.add', 'payload' => $payload])
            ->assertStatus(202)->assertJsonPath('executed', false);
        $this->assertDatabaseCount('promotions', 0);

        $this->as($this->admin)->postJson('/api/actions', ['kind' => 'promotion.add', 'payload' => $payload])->assertOk()->assertJsonPath('affects.0', 'promotions');
        $this->getJson('/api/promotions')->assertOk()->assertJsonPath('0.name', 'Soldes')->assertJsonPath('0.running', true);

        $id = Promotion::firstOrFail()->id;
        $this->postJson('/api/actions', ['kind' => 'promotion.update', 'payload' => ['id' => $id, 'data' => ['value' => 30, 'active' => false]]])->assertOk();
        $this->assertEquals(30, Promotion::first()->value);
        $this->getJson('/api/promotions')->assertJsonPath('0.running', false);

        $this->postJson('/api/actions', ['kind' => 'promotion.add', 'payload' => ['name' => 'X', 'type' => 'percent', 'value' => 150, 'scope' => 'all']])->assertStatus(422);
        $this->postJson('/api/actions', ['kind' => 'promotion.add', 'payload' => ['name' => 'X', 'type' => 'amount', 'value' => 5, 'scope' => 'product']])->assertStatus(422);
        $this->postJson('/api/actions', ['kind' => 'promotion.delete', 'payload' => ['id' => $id]])->assertOk();
        $this->assertDatabaseCount('promotions', 0);
    }

    public function test_purchase_lines_support_ht_and_ttc_prices(): void
    {
        $riz = $this->product('100001');
        $s = Supplier::create(['name' => 'Fournisseur']);

        // 10 × 1180 TTC à 18 % → 1000 HT
        $this->as($this->admin)->postJson('/api/actions', ['kind' => 'purchase.add', 'payload' => [
            'supplierId' => $s->id,
            'items' => [['productId' => $riz->id, 'quantity' => 10, 'price' => 1180, 'taxRate' => 18, 'priceMode' => 'ttc']],
        ]])->assertOk();

        $this->assertEquals(1000, $riz->fresh()->cost); // le coût d'achat est toujours HT
        $this->getJson('/api/purchases')->assertOk()
            ->assertJsonPath('0.total', 11800)->assertJsonPath('0.totalHt', 10000)->assertJsonPath('0.totalTax', 1800)
            ->assertJsonPath('0.items.0.price', 1000)->assertJsonPath('0.items.0.priceTtc', 1180)
            ->assertJsonPath('0.items.0.taxRate', 18)->assertJsonPath('0.items.0.totalTtc', 11800);

        // 5 × 1000 HT à 18 %
        $this->postJson('/api/actions', ['kind' => 'purchase.add', 'payload' => [
            'supplierId' => $s->id,
            'items' => [['productId' => $riz->id, 'quantity' => 5, 'price' => 1000, 'taxRate' => 18]],
        ]])->assertOk();
        $this->getJson('/api/purchases')->assertJsonPath('0.total', 5900)->assertJsonPath('0.totalHt', 5000);

        // sans taux : comportement d'avant (HT = TTC)
        $this->postJson('/api/actions', ['kind' => 'purchase.add', 'payload' => [
            'supplierId' => $s->id, 'items' => [['productId' => $riz->id, 'quantity' => 1, 'price' => 700]],
        ]])->assertOk();
        $this->getJson('/api/purchases')->assertJsonPath('0.total', 700)->assertJsonPath('0.totalTax', 0);
        $this->assertEquals(700, $riz->fresh()->cost);
    }

    public function test_editing_a_purchase_recomputes_totals(): void
    {
        $riz = $this->product('100001');
        $s = Supplier::create(['name' => 'Fournisseur']);
        $this->as($this->admin)->postJson('/api/actions', ['kind' => 'purchase.add', 'payload' => [
            'supplierId' => $s->id, 'items' => [['productId' => $riz->id, 'quantity' => 4, 'price' => 1000, 'taxRate' => 18]],
        ]])->assertOk();
        $id = \App\Models\Purchase::firstOrFail()->id;

        $this->postJson('/api/actions', ['kind' => 'purchase.update', 'payload' => ['id' => $id, 'data' => [
            'supplierId' => $s->id, 'items' => [['productId' => $riz->id, 'quantity' => 2, 'price' => 1180, 'taxRate' => 18, 'priceMode' => 'ttc']],
        ]]])->assertOk();

        $this->getJson('/api/purchases')->assertJsonPath('0.total', 2360)->assertJsonPath('0.totalHt', 2000);
        $this->assertEquals(47, $riz->fresh()->stock); // 45 + 2 (ancien contenu annulé)
    }
}
