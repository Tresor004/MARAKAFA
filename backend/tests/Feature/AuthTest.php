<?php

namespace Tests\Feature;

use App\Models\AppNotification;
use Tests\ApiTestCase;

class AuthTest extends ApiTestCase
{
    public function test_login_by_email_name_or_phone(): void
    {
        foreach (['fatou@himarket.sn', 'FATOU@himarket.sn', 'Fatou Ka', '77 123 45 67', '77-123-45-67'] as $id) {
            $this->postJson('/api/login', ['identifier' => $id, 'password' => 'fatou123'])
                ->assertOk()
                ->assertJsonStructure(['token', 'user' => ['id', 'name', 'role'], 'role' => ['permissions']]);
        }
    }

    public function test_wrong_password_and_unknown_user_get_same_error(): void
    {
        $a = $this->postJson('/api/login', ['identifier' => 'fatou@himarket.sn', 'password' => 'nope'])->assertStatus(422);
        $b = $this->postJson('/api/login', ['identifier' => 'inconnu@x.sn', 'password' => 'nope'])->assertStatus(422);
        $this->assertSame($a->json('errors.identifier'), $b->json('errors.identifier'));
    }

    public function test_disabled_account_cannot_login_or_use_existing_token(): void
    {
        $token = $this->postJson('/api/login', ['identifier' => 'fatou@himarket.sn', 'password' => 'fatou123'])->json('token');
        $this->cashier->update(['active' => false]);

        $this->postJson('/api/login', ['identifier' => 'fatou@himarket.sn', 'password' => 'fatou123'])->assertStatus(422);
        $this->withHeader('Authorization', "Bearer $token")->getJson('/api/me')->assertStatus(401);
    }

    public function test_api_requires_authentication(): void
    {
        $this->getJson('/api/products')->assertStatus(401);
        $this->postJson('/api/sales', [])->assertStatus(401);
    }

    public function test_forgot_password_notifies_admin_without_revealing_account(): void
    {
        $r1 = $this->postJson('/api/forgot-password', ['identifier' => 'fatou@himarket.sn'])->assertOk();
        $r2 = $this->postJson('/api/forgot-password', ['identifier' => 'personne@x.sn'])->assertOk();
        $this->assertSame($r1->json('message'), $r2->json('message'));
        $this->assertSame(1, AppNotification::where('user_id', $this->admin->id)->where('title', 'like', 'Réinitialisation%')->count());
    }

    public function test_permission_middleware_blocks_cashier_from_admin_areas(): void
    {
        $this->as($this->cashier);
        $this->getJson('/api/users')->assertForbidden();
        $this->getJson('/api/inventory')->assertForbidden();
        $this->postJson('/api/roles', ['name' => 'X', 'permissions' => []])->assertForbidden();
        $pa = \App\Models\PendingAction::create([
            'kind' => 'customer.add', 'module' => 'T', 'action' => 'T', 'description' => 'T', 'details' => [],
            'payload' => ['name' => 'X'], 'requested_by' => $this->cashier->id, 'request_date' => today(),
        ]);
        $this->postJson("/api/pending-actions/{$pa->id}/approve")->assertForbidden();
        $this->postJson("/api/pending-actions/{$pa->id}/reject")->assertForbidden();
        $this->putJson('/api/settings', ['name' => 'Hack'])->assertForbidden();
    }
}
