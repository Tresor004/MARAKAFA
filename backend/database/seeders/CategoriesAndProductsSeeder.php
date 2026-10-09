<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class CategoriesAndProductsSeeder extends Seeder
{
    public function run(): void
    {
        $now = now();

        $cats = ['Epicerie', 'Boissons', 'Laitier', 'Boulangerie', 'Hygiène', 'Frais', 'Divers'];
        foreach ($cats as $c) {
            DB::table('categories')->insert(['name' => $c, 'created_at' => $now, 'updated_at' => $now]);
        }

        $catMap = DB::table('categories')->pluck('id', 'name');

        DB::table('products')->insert([
            ['name' => 'Riz Basmati 5kg',    'category_id' => $catMap['Epicerie'],    'price' => 8500,  'cost' => 6500,  'stock' => 45, 'min_stock' => 10, 'unit' => 'pièce', 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Huile Dinor 1L',      'category_id' => $catMap['Epicerie'],    'price' => 2200,  'cost' => 1700,  'stock' => 80, 'min_stock' => 20, 'unit' => 'pièce', 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Sucre en poudre 1kg', 'category_id' => $catMap['Epicerie'],    'price' => 950,   'cost' => 700,   'stock' => 120,'min_stock' => 30, 'unit' => 'pièce', 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Lait Bridel 1L',      'category_id' => $catMap['Laitier'],     'price' => 1500,  'cost' => 1100,  'stock' => 35, 'min_stock' => 15, 'unit' => 'pièce', 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Yaourt Gervais x6',   'category_id' => $catMap['Laitier'],     'price' => 1800,  'cost' => 1350,  'stock' => 25, 'min_stock' => 10, 'unit' => 'pièce', 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Coca-Cola 1.5L',      'category_id' => $catMap['Boissons'],    'price' => 1250,  'cost' => 950,   'stock' => 60, 'min_stock' => 20, 'unit' => 'pièce', 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Eau Cristaline 1.5L', 'category_id' => $catMap['Boissons'],    'price' => 350,   'cost' => 200,   'stock' => 200,'min_stock' => 50, 'unit' => 'pièce', 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Pain de mie',          'category_id' => $catMap['Boulangerie'], 'price' => 800,   'cost' => 550,   'stock' => 18, 'min_stock' => 8,  'unit' => 'pièce', 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Savon Lifebuoy',       'category_id' => $catMap['Hygiène'],     'price' => 650,   'cost' => 450,   'stock' => 55, 'min_stock' => 15, 'unit' => 'pièce', 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Lessive Omo 2kg',      'category_id' => $catMap['Hygiène'],     'price' => 3200,  'cost' => 2400,  'stock' => 22, 'min_stock' => 8,  'unit' => 'pièce', 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Pâtes Panzani 500g',   'category_id' => $catMap['Epicerie'],    'price' => 750,   'cost' => 550,   'stock' => 90, 'min_stock' => 25, 'unit' => 'pièce', 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Tomate concentrée',    'category_id' => $catMap['Epicerie'],    'price' => 450,   'cost' => 320,   'stock' => 5,  'min_stock' => 20, 'unit' => 'pièce', 'created_at' => $now, 'updated_at' => $now],
        ]);
    }
}
