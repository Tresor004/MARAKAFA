<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ShopSetting extends Model
{
    protected $fillable = [
        'name', 'type', 'slogan', 'logo',
        'ifu', 'rccm', 'phone', 'phone2', 'email', 'website',
        'address', 'city', 'country',
        'currency', 'currency_code', 'tax_rate',
        'invoice_prefix', 'invoice_footer', 'thank_you_message',
        'max_discount_percent', 'require_cash_session', 'allow_credit',
    ];

    protected $casts = [
        'tax_rate'             => 'float',
        'max_discount_percent' => 'float',
        'require_cash_session' => 'boolean',
        'allow_credit'         => 'boolean',
    ];

    /** Singleton : récupère ou crée l'unique ligne de settings */
    public static function instance(): self
    {
        return self::firstOrCreate(['id' => 1]);
    }
}
