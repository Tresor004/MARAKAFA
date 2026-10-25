<?php

namespace Tests\Feature;

use App\Models\AppNotification;
use App\Models\Product;
use App\Models\Role;
use App\Services\NotificationService;
use Tests\ApiTestCase;

class NotificationRoleTest extends ApiTestCase
{
    public function test_general_notification_read_state_is_per_user(): void
    {
        $n = app(NotificationService::class)->notifyAll('Hello', 'Tous', 'info');

        $this->as($this->cashier)->postJson("/api/notifications/{$n->id}/read")->assertOk();
        $cashierView = $this->getJson('/api/notifications')->assertOk()->json();
        $this->assertTrue(collect($cashierView)->firstWhere('id', (string) $n->id)['read']);

        $managerView = $this->as($this->manager)->getJson('/api/notifications')->json();
        $this->assertFalse(collect($managerView)->firstWhere('id', (string) $n->id)['read']);
    }

    public function test_personal_notifications_are_private(): void
    {
        $n = app(NotificationService::class)->notifyUser($this->manager->id, 'Secret', 'Pour toi');
        $this->as($this->cashier)->postJson("/api/notifications/{$n->id}/read")->assertNotFound();
        $this->assertSame([], collect($this->getJson('/api/notifications')->json())->where('title', 'Secret')->values()->all());
    }

    public function test_targeted_notification_only_reaches_users_with_permission(): void
    {
        app(NotificationService::class)->notifyAll('Pertes', 'x', 'warning', null, 'Système', 'losses', null, 'losses');

        $mgr = collect($this->as($this->manager)->getJson('/api/notifications')->json())->where('title', 'Pertes');
        $cash = collect($this->as($this->cashier)->getJson('/api/notifications')->json())->where('title', 'Pertes');
        $this->assertCount(1, $mgr);
        $this->assertCount(0, $cash);
    }

    public function test_mark_all_read(): void
    {
        $svc = app(NotificationService::class);
        $svc->notifyAll('A', 'a');
        $svc->notifyAll('B', 'b');
        $this->as($this->cashier)->postJson('/api/notifications/read-all')->assertOk();
        $this->assertTrue(collect($this->getJson('/api/notifications')->json())->every(fn ($n) => $n['read']));
    }

    public function test_daily_checks_notify_expired_products_but_never_record_a_loss(): void
    {
        Product::where('barcode', '100004')->update(['expiry_date' => today()->subDays(3), 'stock' => 12]);

        app(NotificationService::class)->runDailyChecks();
        app(NotificationService::class)->runDailyChecks();   // idempotent dans la journée

        $this->assertSame(1, AppNotification::where('title', 'Produits périmés détectés')->count());
        $this->assertDatabaseCount('losses', 0);
        $this->assertEquals(12, $this->product('100004')->stock);
    }

    public function test_role_crud_and_protections(): void
    {
        $this->as($this->admin);
        $r = $this->postJson('/api/roles', ['name' => 'Stagiaire', 'description' => 'x', 'permissions' => ['products', 'bogus']])
            ->assertStatus(422);                                   // permission inconnue refusée

        $r = $this->postJson('/api/roles', ['name' => 'Stagiaire', 'permissions' => ['products']])->assertCreated();
        $id = $r->json('id');
        $this->assertSame(['products'], $r->json('permissions'));

        $this->putJson("/api/roles/$id", ['name' => 'Stagiaire', 'permissions' => ['products', 'sales']])->assertOk();
        $this->postJson('/api/roles', ['name' => 'Stagiaire', 'permissions' => []])->assertStatus(422);   // nom unique

        // système / admin protégés
        $adminRole = Role::where('slug', 'admin')->first();
        $this->putJson("/api/roles/{$adminRole->id}", ['name' => 'Admin', 'permissions' => []])->assertStatus(422);
        $this->deleteJson("/api/roles/{$adminRole->id}")->assertStatus(422);

        // rôle attribué : suppression refusée
        $this->actingAs($this->admin);
        $this->postJson('/api/actions', ['kind' => 'user.add', 'payload' => ['name' => 'S', 'email' => 's@x.sn', 'password' => 'secret12', 'role' => $id]])->assertOk();
        $this->deleteJson("/api/roles/$id")->assertStatus(422);
    }

    public function test_permission_change_takes_effect_immediately(): void
    {
        $this->as($this->cashier)->getJson('/api/customers')->assertOk();   // via « sales »
        $this->getJson('/api/suppliers')->assertForbidden();

        $role = Role::where('slug', 'caissier')->first();
        $role->syncPermissions(['dashboard', 'purchases']);
        $this->as($this->cashier->fresh())->getJson('/api/suppliers')->assertOk();
        $this->postJson('/api/sales', ['items' => [['productId' => 1, 'quantity' => 1]]])->assertForbidden();
    }

    public function test_dashboard_aggregates(): void
    {
        $this->as($this->cashier)->postJson('/api/sales', ['items' => [['productId' => $this->product('100001')->id, 'quantity' => 2]]])->assertCreated();
        $this->getJson('/api/dashboard')->assertOk()
            ->assertJsonPath('totalRevenue', 17000)
            ->assertJsonPath('dayRevenue', 17000)
            ->assertJsonPath('salesCount', 1)
            ->assertJsonPath('topProducts.0.name', 'Riz Basmati 5kg')
            ->assertJsonPath('productsCount', 12);
    }

    public function test_settings_update_and_category_crud(): void
    {
        $this->as($this->admin);
        $this->putJson('/api/settings', ['name' => 'Ma Boutique', 'taxRate' => 18, 'invoicePrefix' => 'INV'])->assertOk()->assertJsonPath('taxRate', 18);
        $this->getJson('/api/settings')->assertJsonPath('name', 'Ma Boutique');
        $this->putJson('/api/settings', ['taxRate' => 150])->assertStatus(422);

        $id = $this->postJson('/api/categories', ['name' => 'Surgelés'])->assertCreated()->json('id');
        $this->postJson('/api/categories', ['name' => 'surgelés'])->assertStatus(422);
        $this->putJson("/api/categories/$id", ['name' => 'Congelés'])->assertOk();
        $this->deleteJson("/api/categories/$id")->assertOk();
    }
}
