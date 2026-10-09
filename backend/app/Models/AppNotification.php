<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AppNotification extends Model
{
    protected $table = 'notifications';

    protected $fillable = [
        'user_id', 'title', 'message', 'type', 'scope',
        'is_read', 'triggered_by_id', 'triggered_by_name', 'notified_at',
    ];

    protected $casts = [
        'is_read'     => 'boolean',
        'notified_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function triggeredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'triggered_by_id');
    }
}
