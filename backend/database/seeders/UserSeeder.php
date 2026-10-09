<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        $adminRoleId      = DB::table('roles')->where('name', 'Administrateur')->value('id');
        $gestionnaireId   = DB::table('roles')->where('name', 'Gestionnaire')->value('id');
        $caisierId        = DB::table('roles')->where('name', 'Caissier')->value('id');

        $now = now();

        DB::table('users')->insert([
            [
                'name'       => 'Administrateur',
                'email'      => 'admin@himarket.sn',
                'phone'      => '77 000 00 01',
                'password'   => Hash::make('admin123'),
                'role_id'    => $adminRoleId,
                'active'     => true,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name'       => 'Fatou Ka',
                'email'      => 'fatou@himarket.sn',
                'phone'      => '77 123 45 67',
                'password'   => Hash::make('fatou123'),
                'role_id'    => $caisierId,
                'active'     => true,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name'       => 'Ibrahima Mbaye',
                'email'      => 'ibrahima@himarket.sn',
                'phone'      => '76 987 65 43',
                'password'   => Hash::make('ibrahima123'),
                'role_id'    => $gestionnaireId,
                'active'     => true,
                'created_at' => $now,
                'updated_at' => $now,
            ],
        ]);
    }
}
