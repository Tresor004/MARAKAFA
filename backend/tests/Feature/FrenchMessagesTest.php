<?php

namespace Tests\Feature;

use Tests\ApiTestCase;

/** Les erreurs de l'API sont en français et n'exposent ni clé de traduction ni nom de classe interne. */
class FrenchMessagesTest extends ApiTestCase
{
    public function test_validation_errors_are_translated(): void
    {
        $this->postJson('/api/login', [])
            ->assertStatus(422)
            ->assertJsonPath('errors.identifier.0', 'Le champ identifiant est obligatoire.')
            ->assertJsonPath('errors.password.0', 'Le champ mot de passe est obligatoire.')
            ->assertJsonPath('message', 'Le champ identifiant est obligatoire. (et 1 autre erreur)');
    }

    public function test_unauthenticated_message_is_french(): void
    {
        $this->getJson('/api/me')->assertStatus(401)->assertJsonPath('message', 'Session expirée. Reconnectez-vous.');
    }

    public function test_missing_record_does_not_leak_model_name(): void
    {
        $res = $this->as($this->admin)->getJson('/api/products/999999')->assertNotFound();
        $this->assertStringNotContainsString('App\\Models', $res->json('message'));
        $this->assertSame('Élément introuvable (il a peut-être été supprimé).', $res->json('message'));
    }

    public function test_custom_forbidden_message_is_kept(): void
    {
        $this->as($this->cashier)->getJson('/api/users')->assertForbidden()
            ->assertJsonPath('message', "Vous n'avez pas accès à cette fonctionnalité.");
    }
}
