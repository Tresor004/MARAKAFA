<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->foreignId('category_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('price', 14, 2);                // prix de vente
            $table->decimal('cost', 14, 2)->default(0);     // coût d'achat
            $table->integer('stock')->default(0);
            $table->integer('min_stock')->default(5);
            $table->string('unit', 30)->default('pièce');
            $table->string('barcode', 50)->nullable()->unique();
            $table->date('expiry_date')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index('category_id');
            $table->index('stock');
            $table->index('expiry_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};
