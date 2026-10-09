<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('losses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
            $table->string('product_name');
            $table->decimal('quantity', 10, 3);
            $table->decimal('unit_price', 14, 2);
            $table->decimal('total', 14, 2);
            $table->string('reason', 100);
            $table->foreignId('noted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->boolean('auto_generated')->default(false); // true = généré par le système (péremption auto)
            $table->date('loss_date');
            $table->timestamps();
            $table->softDeletes();

            $table->index('loss_date');
            $table->index('product_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('losses');
    }
};
