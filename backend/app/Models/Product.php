<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Product extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'name', 'category_id', 'price', 'cost',
        'stock', 'min_stock', 'unit', 'barcode', 'expiry_date',
    ];

    protected $casts = [
        'price'       => 'float',
        'cost'        => 'float',
        'stock'       => 'integer',
        'min_stock'   => 'integer',
        'expiry_date' => 'date',
    ];

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function saleItems(): HasMany
    {
        return $this->hasMany(SaleItem::class);
    }

    public function purchaseItems(): HasMany
    {
        return $this->hasMany(PurchaseItem::class);
    }

    public function losses(): HasMany
    {
        return $this->hasMany(Loss::class);
    }

    // ── Helpers ──────────────────────────────────────────────
    public function isLowStock(): bool
    {
        return $this->stock <= $this->min_stock;
    }

    public function isExpired(): bool
    {
        return $this->expiry_date && $this->expiry_date->isPast();
    }

    public function isExpiringSoon(int $days = 15): bool
    {
        return $this->expiry_date
            && $this->expiry_date->isFuture()
            && $this->expiry_date->diffInDays(now()) <= $days;
    }
}
