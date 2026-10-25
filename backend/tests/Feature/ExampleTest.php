<?php

namespace Tests\Feature;

use Tests\TestCase;

class ExampleTest extends TestCase
{
    /** Le point de santé de Laravel répond (l'application démarre correctement). */
    public function test_application_health_endpoint_responds(): void
    {
        $this->get('/up')->assertOk();
    }

    /** Toute URL hors /api renvoie l'interface (ou un message explicite si elle n'est pas compilée). */
    public function test_front_end_entry_point_is_served(): void
    {
        $status = $this->get('/')->getStatusCode();

        $this->assertContains($status, [200, 503]);
    }
}
