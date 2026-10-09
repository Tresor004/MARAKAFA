<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sales', function (Blueprint $table) {
            $table->id();
            $table->string('invoice_no', 30)->unique();      // FAC-2025-0001
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete(); // caissier
            $table->decimal('total', 16, 2);
            $table->decimal('paid', 16, 2);
            $table->decimal('change_due', 16, 2)->default(0);
            $table->string('payment_method', 50)->default('Espèces');
            $table->date('sale_date');
            $table->timestamps();
            $table->softDeletes();

            $table->index('sale_date');
            $table->index('customer_id');
            $table->index('user_id');
        });

        Schema::create('sale_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sale_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
            $table->string('product_name');                  // snapshot du nom au moment de la vente
            $table->decimal('quantity', 10, 3);
            $table->decimal('unit_price', 14, 2);
            $table->decimal('total', 14, 2);
            $table->timestamps();

            $table->index('sale_id');
            $table->index('product_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sale_items');
        Schema::dropIfExists('sales');
    }
};
