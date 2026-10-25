<?php

namespace Database\Seeders;

use App\Models\ShopSetting;
use Illuminate\Database\Seeder;

class ShopSettingsSeeder extends Seeder
{
    public function run(): void
    {
        ShopSetting::updateOrCreate(['id' => 1], [
            'name'              => 'Hi-Market',
            'type'              => 'Supermarché',
            'slogan'            => 'Votre supermarché de confiance',
            'currency'          => 'FCFA',
            'currency_code'     => 'XOF',
            'tax_rate'          => 0,
            'invoice_prefix'    => 'FAC',
            'thank_you_message' => 'Merci pour votre visite ! À bientôt.',
        ]);
    }
}
