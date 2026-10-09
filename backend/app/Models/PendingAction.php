<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PendingAction extends Model
{
    protected $fillable = [
        'kind', 'module', 'action', 'description',
        'details', 'payload',
        'requested_by', 'status',
        'reviewed_by', 'reject_reason', 'reviewed_at', 'request_date',
    ];

    protected $casts = [
        'details'     => 'array',
        'payload'     => 'array',
        'reviewed_at' => 'datetime',
        'request_date'=> 'date',
    ];

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function isPending(): bool  { return $this->status === 'pending'; }
    public function isApproved(): bool { return $this->status === 'approved'; }
    public function isRejected(): bool { return $this->status === 'rejected'; }
}
