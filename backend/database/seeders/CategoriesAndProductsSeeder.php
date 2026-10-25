<?php

namespace Database\Seeders;

use App\Models\Category;
use App\Models\Product;
use Illuminate\Database\Seeder;

class CategoriesAndProductsSeeder extends Seeder
{
    public function run(): void
    {
        foreach (['Epicerie', 'Boissons', 'Laitier', 'Boulangerie', 'Hygiène', 'Frais', 'Divers'] as $c) {
            Category::firstOrCreate(['name' => $c]);
        }
        $cat = Category::pluck('id', 'name');

        $in = fn (int $days) => today()->addDays($days)->toDateString();

        // nom, catégorie, prix, coût, stock, seuil, code-barres, péremption
        $rows = [
            ['Riz Basmati 5kg',     'Epicerie',    8500, 6500,  45, 10, '100001', $in(30)],
            ['Huile Dinor 1L',      'Epicerie',    2200, 1700,  80, 20, '100002', $in(30)],
            ['Sucre en poudre 1kg', 'Epicerie',     950,  700, 120, 30, '100003', null],
            ['Lait Bridel 1L',      'Laitier',     1500, 1100,  35, 15, '100004', $in(-20)],
            ['Yaourt Gervais x6',   'Laitier',     1800, 1350,  25, 10, '100005', $in(0)],
            ['Coca-Cola 1.5L',      'Boissons',    1250,  950,  60, 20, '100006', null],
            ['Eau Cristaline 1.5L', 'Boissons',     350,  200, 200, 50, '100007', null],
            ['Pain de mie',         'Boulangerie',  800,  550,  18,  8, '100008', $in(0)],
            ['Savon Lifebuoy',      'Hygiène',      650,  450,  55, 15, '100009', null],
            ['Lessive Omo 2kg',     'Hygiène',     3200, 2400,  22,  8, '100010', null],
            ['Pâtes Panzani 500g',  'Epicerie',     750,  550,  90, 25, '100011', null],
            ['Tomate concentrée',   'Epicerie',     450,  320,   5, 20, '100012', null],
        ];

        foreach ($rows as [$name, $category, $price, $cost, $stock, $min, $barcode, $expiry]) {
            Product::updateOrCreate(['barcode' => $barcode], [
                'name' => $name, 'category_id' => $cat[$category], 'price' => $price, 'cost' => $cost,
                'stock' => $stock, 'min_stock' => $min, 'unit' => 'pièce', 'expiry_date' => $expiry,
            ]);
        }
    }
}
