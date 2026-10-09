<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Table singleton : une seule ligne (id = 1)
        Schema::create('shop_settings', function (Blueprint $table) {
            $table->id();
            $table->string('name')->default('Hi-Market');
            $table->string('type')->nullable();
            $table->string('slogan')->nullable();
            $table->string('logo_path')->nullable();
            $table->string('ifu', 50)->nullable();
            $table->string('rccm', 80)->nullable();
            $table->string('phone', 30)->nullable();
            $table->string('phone2', 30)->nullable();
            $table->string('email')->nullable();
            $table->string('website')->nullable();
            $table->text('address')->nullable();
            $table->string('city', 100)->nullable();
            $table->string('country', 100)->nullable();
            $table->string('currency', 20)->default('FCFA');
            $table->string('currency_code', 10)->default('XOF');
            $table->decimal('tax_rate', 5, 2)->default(0);
            $table->string('invoice_prefix', 20)->default('FAC');
            $table->text('invoice_footer')->nullable();
            $table->string('thank_you_message')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shop_settings');
    }
};
