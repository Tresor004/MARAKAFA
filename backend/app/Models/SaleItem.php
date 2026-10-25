<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SaleItem extends Model
{
    protected $fillable = [
        'sale_id', 'product_id', 'product_name',
        'quantity', 'unit_price', 'unit_cost', 'total',
        'tax_rate', 'tax_amount', 'discount_percent', 'discount_amount', 'promotion_id', 'promotion_label',
        'returned_quantity',
    ];

    protected $casts = [
        'quantity'   => 'float',
        'unit_price' => 'float',
        'unit_cost'  => 'float',
        'total'      => 'float',
        'tax_rate'          => 'float',
        'tax_amount'        => 'float',
        'discount_percent'  => 'float',
        'discount_amount'   => 'float',
        'returned_quantity' => 'float',
    ];

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
