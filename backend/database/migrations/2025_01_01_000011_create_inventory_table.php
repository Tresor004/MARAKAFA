<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Une session d'inventaire regroupe tous les comptages d'une période
        Schema::create('inventory_sessions', function (Blueprint $table) {
            $table->id();
            $table->string('period', 20);                    // 'Semaine' | 'Mois'
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->date('session_date');
            $table->timestamps();

            $table->index('session_date');
        });

        // Chaque ligne = un produit compté dans une session
        Schema::create('inventory_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('inventory_session_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
            $table->string('product_name');
            $table->integer('expected');
            $table->integer('actual');
            $table->integer('difference')->storedAs('actual - expected');
            $table->timestamps();

            $table->index('inventory_session_id');
            $table->index('product_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_items');
        Schema::dropIfExists('inventory_sessions');
    }
};
