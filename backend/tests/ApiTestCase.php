<?php

namespace Tests;

use App\Models\Product;
use App\Models\User;
use Database\Seeders\CategoriesAndProductsSeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\ShopSettingsSeeder;
use Database\Seeders\UserSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;

abstract class ApiTestCase extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected User $manager;
    protected User $cashier;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed([RoleSeeder::class, UserSeeder::class, ShopSettingsSeeder::class, CategoriesAndProductsSeeder::class]);

        $this->admin = User::where('email', 'admin@himarket.sn')->firstOrFail();
        $this->manager = User::where('email', 'ibrahima@himarket.sn')->firstOrFail();
        $this->cashier = User::where('email', 'fatou@himarket.sn')->firstOrFail();
    }

    protected function as(User $user): static
    {
        Sanctum::actingAs($user);

        return $this;
    }

    protected function product(string $barcode): Product
    {
        return Product::where('barcode', $barcode)->firstOrFail();
    }
}
