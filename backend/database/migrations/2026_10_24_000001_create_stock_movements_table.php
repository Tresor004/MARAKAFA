<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Journal des mouvements de stock : une ligne à chaque variation (qui, quand, pourquoi, avant/après).
 * Le stock reste le compteur `products.stock` ; ce journal permet de l'expliquer et de le contrôler.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
            $table->string('product_name');                       // snapshot : le produit peut être supprimé plus tard
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('user_name')->nullable();              // snapshot
            $table->string('type', 30);                           // sale, sale_return, purchase, purchase_cancel, loss, loss_cancel, inventory, adjustment, initial
            $table->decimal('quantity', 12, 3);                   // variation signée (+ entrée / - sortie)
            $table->decimal('stock_before', 12, 3);
            $table->decimal('stock_after', 12, 3);
            $table->string('reason')->nullable();
            $table->string('reference_type', 30)->nullable();     // sale, purchase, loss, inventory, sale_return
            $table->unsignedBigInteger('reference_id')->nullable();
            $table->string('reference_label', 60)->nullable();    // ex. FAC-2026-0003
            $table->timestamps();

            $table->index(['product_id', 'id']);
            $table->index('type');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_movements');
    }
};
