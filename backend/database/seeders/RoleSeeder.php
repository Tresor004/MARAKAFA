<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class RoleSeeder extends Seeder
{
    /** Toutes les clés de navigation disponibles */
    const ALL_PERMISSIONS = [
        'dashboard', 'products', 'stock', 'sales', 'purchases',
        'customers', 'suppliers', 'users', 'losses', 'inventory',
        'settings', 'myspace',
    ];

    public function run(): void
    {
        $now = now();

        // 1. Administrateur — accès total
        $adminId = DB::table('roles')->insertGetId([
            'name'        => 'Administrateur',
            'description' => 'Accès complet à toutes les fonctionnalités de Hi-Market.',
            'is_system'   => true,
            'created_at'  => $now,
            'updated_at'  => $now,
        ]);

        foreach (self::ALL_PERMISSIONS as $perm) {
            DB::table('role_permissions')->insert([
                'role_id'    => $adminId,
                'permission' => $perm,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        // 2. Gestionnaire — tout sauf users & myspace exclusif admin
        $gestionnaireId = DB::table('roles')->insertGetId([
            'name'        => 'Gestionnaire',
            'description' => 'Gère les stocks, achats et pertes. Pas d\'accès à la gestion des employés.',
            'is_system'   => true,
            'created_at'  => $now,
            'updated_at'  => $now,
        ]);

        $gestPerms = array_diff(self::ALL_PERMISSIONS, ['users']);
        foreach ($gestPerms as $perm) {
            DB::table('role_permissions')->insert([
                'role_id'    => $gestionnaireId,
                'permission' => $perm,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        // 3. Caissier — accès minimal
        $caisierId = DB::table('roles')->insertGetId([
            'name'        => 'Caissier',
            'description' => 'Accès limité à la caisse, au catalogue produits et au tableau de bord.',
            'is_system'   => true,
            'created_at'  => $now,
            'updated_at'  => $now,
        ]);

        foreach (['dashboard', 'products', 'sales', 'myspace'] as $perm) {
            DB::table('role_permissions')->insert([
                'role_id'    => $caisierId,
                'permission' => $perm,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }
}
