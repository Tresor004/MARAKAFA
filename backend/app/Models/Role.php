<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Role extends Model
{
    protected $fillable = ['name', 'description', 'is_system'];

    protected $casts = ['is_system' => 'boolean'];

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function permissions(): HasMany
    {
        return $this->hasMany(RolePermission::class);
    }

    /** Retourne un tableau de clés de pages autorisées */
    public function getPermissionKeys(): array
    {
        return $this->permissions()->pluck('permission')->toArray();
    }

    public function hasPermission(string $key): bool
    {
        return $this->permissions()->where('permission', $key)->exists();
    }
}
