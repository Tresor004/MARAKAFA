<?php

namespace Tests\Feature;

use App\Models\AppNotification;
use App\Models\Customer;
use App\Models\PendingAction;
use App\Models\Product;
use App\Models\User;
use Tests\ApiTestCase;

class ActionFlowTest extends ApiTestCase
{
    private function act(string $kind, array $payload, string $description = 'test')
    {
        return $this->postJson('/api/actions', [
            'kind' => $kind, 'module' => 'Test', 'action' => 'Test', 'description' => $description,
            'details' => ['x' => 1], 'payload' => $payload,
        ]);
    }

    public function test_admin_executes_immediately(): void
    {
        $this->as($this->admin);
        $this->act('product.add', ['name' => 'Café', 'category' => 'Boissons', 'price' => 1000, 'cost' => 700, 'stock' => 10, 'minStock' => 2, 'unit' => 'pièce', 'barcode' => '999'])
            ->assertOk()->assertJsonPath('executed', true);

        $p = Product::where('barcode', '999')->first();
        $this->assertNotNull($p);
        $this->assertSame('Boissons', $p->category->name);
    }

    public function test_new_category_is_created_on_the_fly(): void
    {
        $this->as($this->admin);
        $this->act('product.add', ['name' => 'Truc', 'category' => 'Nouvelle', 'price' => 5])->assertOk();
        $this->assertDatabaseHas('categories', ['name' => 'Nouvelle']);
    }

    public function test_employee_request_is_pending_and_changes_nothing_until_approved(): void
    {
        $this->as($this->manager);
        $this->act('product.add', ['name' => 'Thé', 'category' => 'Boissons', 'price' => 500, 'barcode' => '777'], 'Ajout de Thé')
            ->assertStatus(202)->assertJsonPath('executed', false)->assertJsonPath('pending.status', 'pending');

        $this->assertNull(Product::where('barcode', '777')->first());
        $this->assertTrue(AppNotification::where('user_id', $this->admin->id)->where('title', 'Nouvelle demande en attente')->exists());

        // l'employé ne voit que ses demandes ; il ne peut pas approuver
        $id = PendingAction::first()->id;
        $this->postJson("/api/pending-actions/$id/approve")->assertForbidden();

        $this->as($this->admin)->postJson("/api/pending-actions/$id/approve")->assertOk()->assertJsonPath('pending.status', 'approved');
        $this->assertNotNull(Product::where('barcode', '777')->first());
        $this->assertTrue(AppNotification::where('user_id', $this->manager->id)->where('title', 'like', 'Demande approuvée%')->exists());

        // double approbation impossible
        $this->postJson("/api/pending-actions/$id/approve")->assertStatus(422);
    }

    public function test_reject_does_not_execute_and_notifies_with_reason(): void
    {
        $this->as($this->manager);
        $this->act('customer.add', ['name' => 'Client X'])->assertStatus(202);
        $id = PendingAction::first()->id;

        $this->as($this->admin)->postJson("/api/pending-actions/$id/reject", ['reason' => 'Doublon'])->assertOk();
        $this->assertNull(Customer::where('name', 'Client X')->first());
        $this->assertStringContainsString('Doublon', AppNotification::where('user_id', $this->manager->id)->where('title', 'like', 'Demande refusée%')->value('message'));
    }

    public function test_user_without_permission_cannot_request_action(): void
    {
        $this->as($this->cashier);
        $this->act('supplier.add', ['name' => 'F'])->assertForbidden();   // le caissier n'a pas « suppliers »
        $this->act('stock.adjust', ['productId' => 1, 'delta' => 5])->assertForbidden();
        $this->assertDatabaseCount('pending_actions', 0);
    }

    public function test_unknown_kind_is_rejected(): void
    {
        $this->as($this->admin)->act('db.drop', [])->assertStatus(422);
    }

    public function test_approval_that_fails_leaves_request_pending(): void
    {
        $p = $this->product('100012'); // stock 5
        $this->as($this->manager)->act('stock.adjust', ['productId' => $p->id, 'delta' => -50])->assertStatus(202);
        $id = PendingAction::first()->id;

        $this->as($this->admin)->postJson("/api/pending-actions/$id/approve")->assertStatus(422);
        $this->assertSame('pending', PendingAction::find($id)->status);
        $this->assertEquals(5, $p->fresh()->stock);
    }

    public function test_stock_adjust_never_goes_negative(): void
    {
        $p = $this->product('100012');
        $this->as($this->admin)->act('stock.adjust', ['productId' => $p->id, 'delta' => -6])->assertStatus(422);
        $this->act('stock.adjust', ['productId' => $p->id, 'delta' => -5])->assertOk();
        $this->assertEquals(0, $p->fresh()->stock);
        $this->act('stock.adjust', ['productId' => $p->id, 'delta' => 12.5])->assertOk();
        $this->assertEquals(12.5, $p->fresh()->stock);
    }

    public function test_barcode_must_be_unique_and_is_freed_on_delete(): void
    {
        $this->as($this->admin);
        $this->act('product.add', ['name' => 'Dup', 'price' => 1, 'barcode' => '100001'])->assertStatus(422);

        $p = $this->product('100001');
        $this->act('product.delete', ['id' => $p->id])->assertOk();
        $this->act('product.add', ['name' => 'Riz bis', 'price' => 1, 'barcode' => '100001'])->assertOk();
    }

    public function test_product_update_only_touches_sent_fields(): void
    {
        $p = $this->product('100001');
        $this->as($this->admin)->act('product.update', ['id' => $p->id, 'data' => ['price' => 9000]])->assertOk();
        $fresh = $p->fresh();
        $this->assertEquals(9000, $fresh->price);
        $this->assertEquals(45, $fresh->stock);
        $this->assertSame('Riz Basmati 5kg', $fresh->name);
    }

    public function test_user_lifecycle_and_last_admin_protection(): void
    {
        $this->as($this->admin);
        $caissier = \App\Models\Role::where('slug', 'caissier')->value('id');

        $this->act('user.add', ['name' => 'Nouveau', 'email' => 'new@himarket.sn', 'password' => 'secret12', 'role' => $caissier])->assertOk();
        $u = User::where('email', 'new@himarket.sn')->firstOrFail();
        $this->assertTrue(\Illuminate\Support\Facades\Hash::check('secret12', $u->password));

        // email déjà pris
        $this->act('user.add', ['name' => 'Bis', 'email' => 'new@himarket.sn', 'password' => 'secret12', 'role' => $caissier])->assertStatus(422);

        // le dernier admin ne peut être ni rétrogradé, ni désactivé, ni supprimé
        $this->act('user.update', ['id' => $this->admin->id, 'data' => ['role' => $caissier]])->assertStatus(422);
        $this->act('user.update', ['id' => $this->admin->id, 'data' => ['active' => false]])->assertStatus(422);
        $this->act('user.delete', ['id' => $this->admin->id])->assertStatus(422);

        // suppression douce + email libéré
        $this->act('user.delete', ['id' => $u->id])->assertOk();
        $this->assertSoftDeleted('users', ['id' => $u->id]);
        $this->act('user.add', ['name' => 'Re', 'email' => 'new@himarket.sn', 'password' => 'secret12', 'role' => $caissier])->assertOk();
    }

    public function test_disabling_an_employee_revokes_tokens(): void
    {
        $this->cashier->createToken('t');
        $this->as($this->admin)->act('user.update', ['id' => $this->cashier->id, 'data' => ['active' => false]])->assertOk();
        $this->assertSame(0, $this->cashier->tokens()->count());
    }

    public function test_profile_update_only_for_oneself(): void
    {
        $this->as($this->cashier);
        $this->act('profile.update', ['id' => $this->manager->id, 'data' => ['name' => 'Hack']])->assertForbidden();

        // le caissier peut demander la modification de SON profil (validation admin requise)
        $this->act('profile.update', ['id' => $this->cashier->id, 'data' => ['name' => 'Fatou K.']])->assertStatus(202);
        $this->assertSame('Fatou Ka', $this->cashier->fresh()->name);

        $id = PendingAction::first()->id;
        $this->as($this->admin)->postJson("/api/pending-actions/$id/approve")->assertOk();
        $this->assertSame('Fatou K.', $this->cashier->fresh()->name);
    }

    public function test_profile_update_cannot_escalate_role(): void
    {
        $admin = \App\Models\Role::where('slug', 'admin')->value('id');
        $this->as($this->admin)->act('profile.update', ['id' => $this->admin->id, 'data' => ['role' => $admin, 'active' => false, 'name' => 'Boss']])->assertOk();
        $fresh = $this->admin->fresh();
        $this->assertSame('Boss', $fresh->name);
        $this->assertTrue($fresh->active);
    }

    public function test_admin_editing_a_user_notifies_that_user(): void
    {
        $this->as($this->admin)->act('user.update', ['id' => $this->cashier->id, 'data' => ['phone' => '70 000 00 00']])->assertOk();
        $this->assertTrue(AppNotification::where('user_id', $this->cashier->id)->where('title', 'Votre profil a été modifié')->exists());
    }
}
