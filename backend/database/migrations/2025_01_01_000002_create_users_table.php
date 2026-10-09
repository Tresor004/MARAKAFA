<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->string('phone', 30)->nullable();
            $table->string('password');                      // bcrypt
            $table->foreignId('role_id')->constrained()->restrictOnDelete();
            $table->boolean('active')->default(true);
            $table->string('avatar_path')->nullable();       // chemin sur le disque
            $table->timestamp('last_seen_at')->nullable();   // présence en ligne
            $table->rememberToken();
            $table->timestamps();
            $table->softDeletes();                           // suppression douce

            $table->index(['email', 'active']);
            $table->index('role_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
