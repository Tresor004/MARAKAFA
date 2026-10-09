<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Loss extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'product_id', 'product_name', 'quantity', 'unit_price',
        'total', 'reason', 'noted_by', 'auto_generated', 'loss_date',
    ];

    protected $casts = [
        'quantity'       => 'float',
        'unit_price'     => 'float',
        'total'          => 'float',
        'auto_generated' => 'boolean',
        'loss_date'      => 'date',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function notedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'noted_by');
    }
}
