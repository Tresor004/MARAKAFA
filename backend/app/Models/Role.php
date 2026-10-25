<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Role extends Model
{
    /** Clés des pages (permissions) que l'on peut accorder à un rôle. */
    public const PERMISSIONS = [
        'dashboard', 'products', 'stock', 'sales', 'purchases',
        'customers', 'suppliers', 'users', 'losses', 'inventory',
        'settings', 'myspace',
    ];

    protected $fillable = ['name', 'slug', 'description', 'is_system'];

    protected $casts = ['is_system' => 'boolean'];

    protected static function booted(): void
    {
        // Les rôles personnalisés reçoivent un slug unique dérivé de leur nom.
        static::creating(function (Role $role): void {
            if (! $role->slug) {
                $role->slug = static::uniqueSlug($role->name);
            }
        });
    }

    public static function uniqueSlug(string $name): string
    {
        $base = Str::slug($name) ?: 'role';
        $slug = $base;
        $i = 2;
        while (static::where('slug', $slug)->exists()) {
            $slug = $base . '-' . $i++;
        }

        return $slug;
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function permissions(): HasMany
    {
        return $this->hasMany(RolePermission::class);
    }

    public function isAdmin(): bool
    {
        return $this->slug === 'admin';
    }

    /** Retourne la liste des clés de pages autorisées (utilise la relation chargée si possible). */
    public function getPermissionKeys(): array
    {
        $perms = $this->relationLoaded('permissions')
            ? $this->permissions->pluck('permission')
            : $this->permissions()->pluck('permission');

        return $perms->values()->all();
    }

    public function hasPermission(string $key): bool
    {
        if ($this->isAdmin()) {
            return true;
        }

        return in_array($key, $this->getPermissionKeys(), true);
    }

    /** Remplace l'ensemble des permissions du rôle. */
    public function syncPermissions(array $keys): void
    {
        $keys = array_values(array_unique(array_intersect($keys, self::PERMISSIONS)));

        $this->permissions()->whereNotIn('permission', $keys)->delete();
        $existing = $this->permissions()->pluck('permission')->all();
        foreach (array_diff($keys, $existing) as $key) {
            $this->permissions()->create(['permission' => $key]);
        }
        $this->unsetRelation('permissions');
    }
}
