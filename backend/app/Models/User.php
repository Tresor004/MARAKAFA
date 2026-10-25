<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    protected $fillable = [
        'name', 'email', 'phone', 'password',
        'role_id', 'active', 'avatar', 'last_seen_at',
    ];

    protected $hidden = ['password', 'remember_token'];

    protected $casts = [
        'active'            => 'boolean',
        'last_seen_at'      => 'datetime',
        'email_verified_at' => 'datetime',
        'password'          => 'hashed',
    ];

    // ── Relations ──────────────────────────────────────────────
    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class);
    }

    public function purchases(): HasMany
    {
        return $this->hasMany(Purchase::class);
    }

    public function losses(): HasMany
    {
        return $this->hasMany(Loss::class, 'noted_by');
    }

    public function pendingActions(): HasMany
    {
        return $this->hasMany(PendingAction::class, 'requested_by');
    }

    // ── Helpers ────────────────────────────────────────────────
    public function isAdmin(): bool
    {
        return (bool) $this->role?->isAdmin();
    }

    public function hasPermission(string $key): bool
    {
        return $this->role?->hasPermission($key) ?? false;
    }

    public function isOnline(): bool
    {
        return $this->last_seen_at && $this->last_seen_at->diffInSeconds(now()) < 120;
    }

    /** Normalise un numéro de téléphone pour la comparaison (chiffres uniquement). */
    public static function normalizePhone(?string $phone): string
    {
        return preg_replace('/\D+/', '', (string) $phone) ?? '';
    }
}
