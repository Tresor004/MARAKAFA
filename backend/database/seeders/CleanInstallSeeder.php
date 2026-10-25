<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Installation vierge : uniquement le rôle Administrateur et le compte administrateur.
 * Aucune donnée de démonstration. Usage : php artisan migrate:fresh --seed --seeder=CleanInstallSeeder
 * ⚠ Changez le mot de passe de l'administrateur dès la première connexion.
 */
class CleanInstallSeeder extends Seeder
{
    public function run(): void
    {
        $role = Role::updateOrCreate(['slug' => 'admin'], [
            'name' => 'Administrateur',
            'description' => 'Accès complet à toutes les fonctionnalités de Hi-Market.',
            'is_system' => true,
        ]);
        $role->syncPermissions(Role::PERMISSIONS);

        User::updateOrCreate(['email' => 'admin@himarket.sn'], [
            'name' => 'Administrateur', 'phone' => '77 000 00 01', 'password' => 'admin123',
            'role_id' => $role->id, 'active' => true,
        ]);
    }
}
