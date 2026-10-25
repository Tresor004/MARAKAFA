<?php

namespace Database\Seeders;

use App\Models\Customer;
use App\Models\Category;
use App\Models\Product;
use App\Models\Promotion;
use App\Models\Purchase;
use App\Models\Sale;
use App\Models\ShopSetting;
use App\Models\Supplier;
use App\Models\User;
use App\Services\PurchaseService;
use App\Services\SaleService;
use Illuminate\Database\Seeder;

/**
 * Clients, fournisseurs et quelques opérations de démonstration, créés VIA les services métier
 * (donc avec stocks, totaux et cumuls clients parfaitement cohérents).
 */
class DemoDataSeeder extends Seeder
{
    public function run(SaleService $sales, PurchaseService $purchases): void
    {
        foreach ([
            ['Aïcha Diallo',   '77 123 45 67', 'aicha@exemple.sn',    'Dakar, Plateau'],
            ['Mamadou Ndiaye', '77 987 65 43', 'mamadou@exemple.sn',  'Dakar, Pikine'],
            ['Fatou Niang',    '76 456 78 90', 'fatou@exemple.sn',    'Dakar, Fann'],
            ['Abdoulaye Sow',  '70 234 56 78', 'abdoulaye@exemple.sn','Thiès'],
        ] as [$name, $phone, $email, $address]) {
            Customer::firstOrCreate(['name' => $name], compact('phone', 'email', 'address'));
        }

        foreach ([
            ['SENEPAL',         'M. Diagne', '33 800 00 00', 'contact@senepal.sn',      'Rufisque'],
            ['CIMENT DU SAHEL', 'Mme. Fall', '33 850 00 00', 'ventes@cimentsahel.sn',   'Dakar'],
            ['BRIDEL',          'M. Camara', '33 820 00 00', 'bridel@bridel.sn',        'Thiès'],
            ['COFIMA',          'Mme. Gueye','33 860 00 00', 'cofima@cofima.sn',        'Rufisque'],
        ] as [$name, $contact, $phone, $email, $address]) {
            Supplier::firstOrCreate(['name' => $name], compact('contact', 'phone', 'email', 'address'));
        }

        if (Sale::exists() || Purchase::exists()) {
            return; // déjà peuplé
        }

        $manager = User::where('email', 'ibrahima@himarket.sn')->firstOrFail();
        $cashier = User::where('email', 'fatou@himarket.sn')->firstOrFail();
        $p = fn (string $barcode) => Product::where('barcode', $barcode)->firstOrFail()->id;
        $c = fn (string $name) => Customer::where('name', $name)->firstOrFail()->id;
        $s = fn (string $name) => Supplier::where('name', $name)->firstOrFail()->id;

        // TVA : taux par défaut 18 %, produits de première nécessité exonérés (0 %) pour illustrer la TVA par produit
        ShopSetting::instance()->update(['tax_rate' => 18]);
        Product::whereIn('barcode', ['100001', '100003', '100004', '100011'])->update(['tax_rate' => 0]);

        // Promotions de démonstration
        Promotion::firstOrCreate(['name' => 'Boissons -10 %'], [
            'type' => 'percent', 'value' => 10, 'scope' => 'category',
            'category_id' => Category::where('name', 'Boissons')->value('id'), 'active' => true,
        ]);
        Promotion::firstOrCreate(['name' => 'Savon : -100 F dès 3'], [
            'type' => 'amount', 'value' => 100, 'scope' => 'product',
            'product_id' => $p('100009'), 'min_quantity' => 3, 'active' => true,
        ]);

        // Achats
        $bon = $purchases->create($manager, $s('SENEPAL'), [
            ['product_id' => $p('100001'), 'quantity' => 50, 'unit_price' => 6500],
        ]);
        $bon->update(['purchase_date' => today()->subDays(20)]);
        $bon = $purchases->create($manager, $s('BRIDEL'), [
            ['product_id' => $p('100004'), 'quantity' => 100, 'unit_price' => 1100],
        ]);
        $bon->update(['purchase_date' => today()->subDays(20)]);

        // Ventes
        $demo = [
            [20, 'Aïcha Diallo',   [['100001', 4], ['100003', 6]]],
            [20, 'Mamadou Ndiaye', [['100004', 5], ['100005', 2]]],
            [0,  'Fatou Niang',    [['100002', 3], ['100011', 6], ['100007', 12]]],
        ];
        foreach ($demo as [$daysAgo, $customer, $lines]) {
            $sale = $sales->create(
                $cashier,
                array_map(fn ($l) => ['product_id' => $p($l[0]), 'quantity' => $l[1]], $lines),
                null, 'Espèces', $c($customer),
            );
            $sale->update(['sale_date' => today()->subDays($daysAgo)]);
        }

        // Une vente partiellement payée (le solde reste dû par le client)
        $credit = $sales->create($cashier, [['product_id' => $p('100010'), 'quantity' => 2]], 2000, 'Espèces', $c('Abdoulaye Sow'));
        $credit->update(['sale_date' => today()->subDays(3)]);
    }
}
