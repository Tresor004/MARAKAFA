<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CashSession extends Model
{
    protected $fillable = [
        'user_id', 'opened_at', 'closed_at', 'opening_float',
        'expected_cash', 'counted_cash', 'difference', 'note', 'status',
    ];

    protected $casts = [
        'opened_at'     => 'datetime',
        'closed_at'     => 'datetime',
        'opening_float' => 'float',
        'expected_cash' => 'float',
        'counted_cash'  => 'float',
        'difference'    => 'float',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
