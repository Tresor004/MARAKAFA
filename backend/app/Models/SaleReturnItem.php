<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SaleReturnItem extends Model
{
    protected $fillable = [
        'sale_return_id', 'sale_item_id', 'product_id', 'product_name',
        'quantity', 'unit_value', 'total', 'tax_amount',
    ];

    protected $casts = ['quantity' => 'float', 'unit_value' => 'float', 'total' => 'float', 'tax_amount' => 'float'];
}
