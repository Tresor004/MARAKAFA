<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Comptes de démonstration. ⚠ À CHANGER AVANT TOUTE MISE EN PRODUCTION
 * (ou supprimer les comptes de démo et ne garder que l'administrateur).
 */
class UserSeeder extends Seeder
{
    public function run(): void
    {
        $roles = Role::pluck('id', 'slug');

        $users = [
            ['Administrateur',  'admin@himarket.sn',     '77 000 00 01', 'admin123',     'admin'],
            ['Ibrahima Mbaye',  'ibrahima@himarket.sn',  '76 987 65 43', 'ibrahima123',  'gestionnaire'],
            ['Fatou Ka',        'fatou@himarket.sn',     '77 123 45 67', 'fatou123',     'caissier'],
        ];

        foreach ($users as [$name, $email, $phone, $password, $role]) {
            User::updateOrCreate(['email' => $email], [
                'name' => $name, 'phone' => $phone, 'password' => $password,
                'role_id' => $roles[$role], 'active' => true,
            ]);
        }
    }
}
