<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockMovement extends Model
{
    protected $fillable = [
        'product_id', 'product_name', 'user_id', 'user_name', 'type',
        'quantity', 'stock_before', 'stock_after', 'reason',
        'reference_type', 'reference_id', 'reference_label',
    ];

    protected $casts = ['quantity' => 'float', 'stock_before' => 'float', 'stock_after' => 'float'];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class)->withTrashed();
    }
}
