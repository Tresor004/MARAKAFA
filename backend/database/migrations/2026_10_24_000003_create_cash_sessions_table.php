<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Sessions de caisse : fond de caisse à l'ouverture, comptage à la fermeture, écart. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cash_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->timestamp('opened_at');
            $table->timestamp('closed_at')->nullable();
            $table->decimal('opening_float', 16, 2)->default(0);
            $table->decimal('expected_cash', 16, 2)->nullable();   // figé à la fermeture
            $table->decimal('counted_cash', 16, 2)->nullable();
            $table->decimal('difference', 16, 2)->nullable();      // compté - attendu
            $table->text('note')->nullable();
            $table->string('status', 10)->default('open');         // open | closed
            $table->timestamps();

            $table->index(['user_id', 'status']);
        });

        Schema::table('shop_settings', function (Blueprint $table) {
            $table->boolean('require_cash_session')->default(false); // ventes impossibles sans caisse ouverte
        });
    }

    public function down(): void
    {
        Schema::table('shop_settings', fn (Blueprint $t) => $t->dropColumn('require_cash_session'));
        Schema::dropIfExists('cash_sessions');
    }
};
