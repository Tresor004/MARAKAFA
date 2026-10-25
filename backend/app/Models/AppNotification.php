<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class AppNotification extends Model
{
    protected $table = 'notifications';

    protected $fillable = [
        'user_id', 'title', 'message', 'type', 'scope',
        'permission', 'target_page', 'target_id',
        'triggered_by_id', 'triggered_by_name', 'notified_at',
    ];

    protected $casts = [
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

    /** Employés ayant lu la notification. */
    public function readers(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'notification_reads', 'notification_id', 'user_id')
            ->withPivot('read_at');
    }

    /**
     * Notifications visibles par un employé :
     *  - ses notifications personnelles ;
     *  - les notifications générales (éventuellement limitées à une permission qu'il possède).
     */
    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        $permissions = $user->isAdmin()
            ? null
            : ($user->role?->getPermissionKeys() ?? []);

        return $query->where(function (Builder $q) use ($user, $permissions) {
            $q->where('user_id', $user->id)
              ->orWhere(function (Builder $q2) use ($permissions) {
                  $q2->whereNull('user_id')->where('scope', 'general');
                  if ($permissions !== null) {
                      $q2->where(function (Builder $q3) use ($permissions) {
                          $q3->whereNull('permission')->orWhereIn('permission', $permissions);
                      });
                  }
              });
        });
    }
}
