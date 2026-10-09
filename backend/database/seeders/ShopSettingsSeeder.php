<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class ShopSettingsSeeder extends Seeder
{
    public function run(): void
    {
        DB::table('shop_settings')->insert([
            'name'              => 'Hi-Market',
            'type'              => 'Supermarché',
            'slogan'            => 'Votre supermarché de confiance',
            'currency'          => 'FCFA',
            'currency_code'     => 'XOF',
            'tax_rate'          => 0,
            'invoice_prefix'    => 'FAC',
            'thank_you_message' => 'Merci pour votre visite ! À bientôt.',
            'created_at'        => now(),
            'updated_at'        => now(),
        ]);
    }
}
