<?php

namespace Tests\Unit;

use App\Models\Role;
use PHPUnit\Framework\TestCase;

class ExampleTest extends TestCase
{
    /** Les 12 pages de l'interface sont bien déclarées comme permissions. */
    public function test_permission_keys_match_the_front_end_pages(): void
    {
        $this->assertCount(12, Role::PERMISSIONS);
        $this->assertContains('myspace', Role::PERMISSIONS);
        $this->assertSame(array_unique(Role::PERMISSIONS), Role::PERMISSIONS);
    }
}
