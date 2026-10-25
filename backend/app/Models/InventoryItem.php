<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InventoryItem extends Model
{
    protected $fillable = [
        'inventory_session_id', 'product_id', 'product_name',
        'expected', 'actual',
    ];

    protected $casts = [
        'expected'   => 'float',
        'actual'     => 'float',
        'difference' => 'float',
    ];

    public function session(): BelongsTo
    {
        return $this->belongsTo(InventorySession::class, 'inventory_session_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
