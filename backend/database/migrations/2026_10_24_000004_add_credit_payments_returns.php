<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Paiements partiels / à crédit, encaissement des créances, retours (avoirs).
 *
 * Invariant maintenu sur chaque vente :  balance_due = total - returned_total - amount_paid
 * (amount_paid = somme des lignes `payments` de la vente, remboursements en espèces déduits).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('shop_settings', function (Blueprint $table) {
            $table->boolean('allow_credit')->default(true);
        });

        Schema::table('customers', function (Blueprint $table) {
            $table->decimal('credit_limit', 16, 2)->nullable();    // null = pas de plafond
        });

        Schema::table('sales', function (Blueprint $table) {
            $table->decimal('amount_paid', 16, 2)->default(0);
            $table->decimal('balance_due', 16, 2)->default(0);
            $table->decimal('returned_total', 16, 2)->default(0);
            $table->unsignedBigInteger('cash_session_id')->nullable();
            $table->index('balance_due');
        });

        Schema::table('sale_items', function (Blueprint $table) {
            $table->decimal('returned_quantity', 10, 3)->default(0);
        });

        DB::table('sales')->update(['amount_paid' => DB::raw('total'), 'balance_due' => 0]);

        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sale_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('cash_session_id')->nullable();
            $table->string('kind', 12);                            // sale | settlement | refund
            $table->string('method', 50);
            $table->decimal('amount', 16, 2);                      // signé : négatif pour un remboursement
            $table->string('note')->nullable();
            $table->date('payment_date');
            $table->timestamps();

            $table->index('sale_id');
            $table->index('customer_id');
            $table->index('cash_session_id');
        });

        // Historique : chaque vente existante a été encaissée en totalité (montant net de la monnaie rendue)
        $now = now();
        DB::table('sales')->orderBy('id')->each(function ($s) use ($now) {
            DB::table('payments')->insert([
                'sale_id' => $s->id, 'customer_id' => $s->customer_id, 'user_id' => $s->user_id,
                'kind' => 'sale', 'method' => $s->payment_method, 'amount' => $s->total,
                'payment_date' => $s->sale_date, 'created_at' => $now, 'updated_at' => $now,
            ]);
        });

        Schema::create('sale_returns', function (Blueprint $table) {
            $table->id();
            $table->string('return_no', 30)->unique();             // AV-2026-0001
            $table->foreignId('sale_id')->constrained()->restrictOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->decimal('total', 16, 2);                       // valeur TTC restituée
            $table->decimal('tax_amount', 16, 2)->default(0);
            $table->decimal('credit_reduction', 16, 2)->default(0); // part qui réduit la créance du client
            $table->decimal('cash_refund', 16, 2)->default(0);      // part remboursée
            $table->string('refund_method', 50)->nullable();
            $table->boolean('restocked')->default(true);
            $table->string('reason', 255)->nullable();
            $table->date('return_date');
            $table->timestamps();

            $table->index('sale_id');
            $table->index('return_date');
        });

        Schema::create('sale_return_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sale_return_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sale_item_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
            $table->string('product_name');
            $table->decimal('quantity', 10, 3);
            $table->decimal('unit_value', 14, 2);                  // prix unitaire effectif (remises déduites)
            $table->decimal('total', 14, 2);
            $table->decimal('tax_amount', 14, 2)->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sale_return_items');
        Schema::dropIfExists('sale_returns');
        Schema::dropIfExists('payments');
        Schema::table('sale_items', fn (Blueprint $t) => $t->dropColumn('returned_quantity'));
        Schema::table('sales', function (Blueprint $t) {
            $t->dropIndex(['balance_due']);
            $t->dropColumn(['amount_paid', 'balance_due', 'returned_total', 'cash_session_id']);
        });
        Schema::table('customers', fn (Blueprint $t) => $t->dropColumn('credit_limit'));
        Schema::table('shop_settings', fn (Blueprint $t) => $t->dropColumn('allow_credit'));
    }
};
