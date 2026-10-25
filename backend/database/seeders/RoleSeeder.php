<?php

namespace Database\Seeders;

use App\Models\Role;
use Illuminate\Database\Seeder;

class RoleSeeder extends Seeder
{
    public function run(): void
    {
        $all = Role::PERMISSIONS;

        $defs = [
            'admin' => [
                'name' => 'Administrateur',
                'description' => 'Accès complet à toutes les fonctionnalités de Hi-Market.',
                'permissions' => $all,
            ],
            'gestionnaire' => [
                'name' => 'Gestionnaire',
                'description' => 'Gère les stocks, achats et pertes. Pas d\'accès à la gestion des employés.',
                'permissions' => array_values(array_diff($all, ['users'])),
            ],
            'caissier' => [
                'name' => 'Caissier',
                'description' => 'Accès limité à la caisse, au catalogue produits et au tableau de bord. Toute modification nécessite validation admin.',
                'permissions' => ['dashboard', 'products', 'sales', 'myspace'],
            ],
        ];

        foreach ($defs as $slug => $def) {
            $role = Role::updateOrCreate(['slug' => $slug], [
                'name' => $def['name'], 'description' => $def['description'], 'is_system' => true,
            ]);
            $role->syncPermissions($def['permissions']);
        }
    }
}
