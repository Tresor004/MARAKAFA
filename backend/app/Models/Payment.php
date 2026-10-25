<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payment extends Model
{
    public const CASH = 'Espèces';

    protected $fillable = [
        'sale_id', 'customer_id', 'user_id', 'cash_session_id',
        'kind', 'method', 'amount', 'note', 'payment_date',
    ];

    protected $casts = ['amount' => 'float', 'payment_date' => 'date'];

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
