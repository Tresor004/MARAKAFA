<?php

namespace Tests\Feature;

use App\Models\Sale;
use Tests\ApiTestCase;

class StatsBarcodeTest extends ApiTestCase
{
    private function sell(array $lines, $as = null)
    {
        return $this->as($as ?? $this->cashier)->postJson('/api/sales', [
            'items' => array_map(fn ($l) => ['productId' => $this->product($l[0])->id, 'quantity' => $l[1]], $lines),
        ])->assertCreated();
    }

    public function test_stats_are_net_of_returns_with_margin_by_category(): void
    {
        $a = $this->sell([['100001', 2], ['100006', 2]]); // Riz 17000 (coût 13000) + Coca 2500 (coût 1900)
        $sale = Sale::findOrFail($a->json('sale.id'));
        $this->as($this->admin)->postJson('/api/actions', ['kind' => 'sale.return', 'payload' => [
            'saleId' => $sale->id, 'items' => [['saleItemId' => $sale->items()->where('product_name', 'Riz Basmati 5kg')->first()->id, 'quantity' => 1]],
        ]])->assertOk();

        $from = today()->subDays(6)->toDateString();
        $r = $this->getJson("/api/stats?from={$from}&to=" . today()->toDateString() . '&compare=none')->assertOk();

        $r->assertJsonPath('totals.revenue', 11000)          // 19500 - 8500 retournés
            ->assertJsonPath('totals.cogs', 8400)             // 6500 + 1900
            ->assertJsonPath('totals.margin', 2600)
            ->assertJsonPath('totals.salesCount', 1)
            ->assertJsonPath('totals.avgBasket', 11000)
            ->assertJsonPath('totals.returns', 8500)
            ->assertJsonPath('period.days', 7)->assertJsonPath('period.granularity', 'day')
            ->assertJsonPath('previous', null);
        $this->assertEqualsWithDelta(23.6, $r->json('totals.marginPct'), 0.05);

        $cats = collect($r->json('byCategory'))->keyBy('category');
        $this->assertEquals(8500, $cats['Epicerie']['revenue']);
        $this->assertEquals(2000, $cats['Epicerie']['margin']);
        $this->assertEquals(600, $cats['Boissons']['margin']);
        $this->assertEqualsWithDelta(77.3, $cats['Epicerie']['share'], 0.05);

        $this->assertCount(7, $r->json('series'));
        $this->assertEquals(11000, collect($r->json('series'))->last()['revenue']);
        $this->assertSame('Riz Basmati 5kg', $r->json('topProducts.0.name'));
        $this->assertEquals(11000, array_sum(array_column($r->json('byHour'), 'revenue')));
        $this->assertSame('Espèces', $r->json('byPayment.0.method'));
        $this->assertSame($this->cashier->name, $r->json('byCashier.0.name'));
    }

    public function test_stats_compare_with_the_previous_period(): void
    {
        $this->sell([['100001', 1]]);                                    // aujourd'hui : 8500
        $old = Sale::findOrFail($this->sell([['100001', 1], ['100003', 2]])->json('sale.id')); // 10400
        $old->update(['sale_date' => today()->subDays(8)->toDateString()]);

        $from = today()->subDays(6)->toDateString();
        $r = $this->as($this->admin)->getJson("/api/stats?from={$from}&to=" . today()->toDateString())->assertOk();

        $r->assertJsonPath('totals.revenue', 8500)->assertJsonPath('previousTotals.revenue', 10400)
            ->assertJsonPath('previous.from', today()->subDays(13)->toDateString())->assertJsonPath('previous.to', today()->subDays(7)->toDateString());
        $this->assertEqualsWithDelta(-18.3, $r->json('delta.revenue'), 0.05);

        $series = $r->json('series');
        $this->assertCount(7, $series);
        $this->assertEquals(10400, collect($series)->firstWhere('previousRevenue', 10400)['previousRevenue']);

        // période sans historique : pas de pourcentage absurde
        $r2 = $this->getJson('/api/stats?from=' . today()->subDays(60)->toDateString() . '&to=' . today()->subDays(40)->toDateString())->assertOk();
        $r2->assertJsonPath('totals.revenue', 0)->assertJsonPath('delta.revenue', null);
    }

    public function test_stats_granularity_and_validation(): void
    {
        $this->as($this->admin);
        $this->getJson('/api/stats?from=' . today()->subDays(90)->toDateString() . '&to=' . today()->toDateString())
            ->assertOk()->assertJsonPath('period.granularity', 'week');
        $this->getJson('/api/stats?from=' . today()->subDays(400)->toDateString() . '&to=' . today()->toDateString())
            ->assertOk()->assertJsonPath('period.granularity', 'month');
        $this->getJson('/api/stats?granularity=month&compare=year')->assertOk()->assertJsonPath('period.days', 30);
        $this->getJson('/api/stats?granularity=hour')->assertStatus(422);
        $this->getJson('/api/stats?from=2026-01-10&to=2026-01-01')->assertStatus(422);
        $this->getJson('/api/stats?from=2020-01-01&to=2026-01-01')->assertStatus(422); // plus de 3 ans
    }

    public function test_stats_require_the_dashboard_permission(): void
    {
        $this->as($this->cashier)->getJson('/api/stats')->assertOk(); // le caissier a « dashboard » dans sa configuration d'origine
        $role = $this->cashier->role;
        $role->syncPermissions(['sales', 'myspace']);
        $this->as($this->cashier->fresh())->getJson('/api/stats')->assertForbidden();
    }

    public function test_dashboard_is_net_of_returns_and_shows_receivables(): void
    {
        $c = \App\Models\Customer::create(['name' => 'Débiteur']);
        $this->as($this->cashier)->postJson('/api/sales', [
            'items' => [['productId' => $this->product('100010')->id, 'quantity' => 2]], 'customerId' => $c->id, 'paid' => 1000,
        ])->assertCreated();

        $this->getJson('/api/dashboard')->assertOk()
            ->assertJsonPath('dayRevenue', 6400)->assertJsonPath('receivables', 5400)->assertJsonPath('debtorsCount', 1);
    }

    // ═════════ Codes-barres ═════════

    public function test_generated_barcodes_are_valid_unique_ean13(): void
    {
        $this->as($this->admin);
        $seen = [];
        for ($i = 0; $i < 5; $i++) {
            $code = $this->getJson('/api/products/next-barcode')->assertOk()->json('barcode');
            $this->assertMatchesRegularExpression('/^2\d{12}$/', $code);
            $sum = 0;
            foreach (str_split(substr($code, 0, 12)) as $k => $d) {
                $sum += (int) $d * ($k % 2 === 0 ? 1 : 3);
            }
            $this->assertSame((10 - $sum % 10) % 10, (int) $code[12], 'chiffre de contrôle EAN-13');
            $seen[$code] = true;
        }
        $this->assertGreaterThan(1, count($seen));
    }

    public function test_barcode_generation_needs_the_products_permission(): void
    {
        $this->cashier->role->syncPermissions(['sales', 'myspace']);
        $this->as($this->cashier->fresh())->getJson('/api/products/next-barcode')->assertForbidden();
    }

    public function test_barcode_route_does_not_shadow_product_lookup(): void
    {
        $riz = $this->product('100001');
        $this->as($this->admin)->getJson('/api/products/' . $riz->id)->assertOk()->assertJsonPath('barcode', '100001');
    }
}
