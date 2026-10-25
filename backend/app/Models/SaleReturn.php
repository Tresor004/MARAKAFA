<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SaleReturn extends Model
{
    protected $fillable = [
        'return_no', 'sale_id', 'user_id', 'total', 'tax_amount',
        'credit_reduction', 'cash_refund', 'refund_method', 'restocked', 'reason', 'return_date',
    ];

    protected $casts = [
        'total'            => 'float',
        'tax_amount'       => 'float',
        'credit_reduction' => 'float',
        'cash_refund'      => 'float',
        'restocked'        => 'boolean',
        'return_date'      => 'date',
    ];

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class)->withTrashed();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(SaleReturnItem::class);
    }
}
