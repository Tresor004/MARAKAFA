<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Sale extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'invoice_no', 'customer_id', 'user_id',
        'total', 'tax_rate', 'tax_amount', 'paid', 'change_due', 'payment_method', 'sale_date',
        'amount_paid', 'balance_due', 'returned_total', 'cash_session_id',
    ];

    protected $casts = [
        'total'      => 'float',
        'tax_rate'   => 'float',
        'tax_amount' => 'float',
        'paid'       => 'float',
        'change_due' => 'float',
        'amount_paid'    => 'float',
        'balance_due'    => 'float',
        'returned_total' => 'float',
        'sale_date'  => 'date',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(SaleItem::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function returns(): HasMany
    {
        return $this->hasMany(SaleReturn::class);
    }
}
