<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ShopSetting extends Model
{
    protected $fillable = [
        'name', 'type', 'slogan', 'logo_path',
        'ifu', 'rccm', 'phone', 'phone2', 'email', 'website',
        'address', 'city', 'country',
        'currency', 'currency_code', 'tax_rate',
        'invoice_prefix', 'invoice_footer', 'thank_you_message',
    ];

    protected $casts = ['tax_rate' => 'float'];

    /** Singleton : récupère ou crée l'unique ligne de settings */
    public static function instance(): self
    {
        return self::firstOrCreate(['id' => 1]);
    }

    public function getLogoUrlAttribute(): ?string
    {
        return $this->logo_path ? asset('storage/' . $this->logo_path) : null;
    }
}
