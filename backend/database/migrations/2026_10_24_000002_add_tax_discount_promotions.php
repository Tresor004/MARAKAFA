<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TVA par produit, prix d'achat HT/TTC, remises et promotions.
 * Migration additive : les bases existantes se mettent à jour avec `php artisan migrate`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->decimal('tax_rate', 5, 2)->nullable()->after('cost'); // null = taux par défaut de la boutique
        });

        Schema::table('shop_settings', function (Blueprint $table) {
            $table->decimal('max_discount_percent', 5, 2)->default(10);   // remise manuelle maximale d'un caissier
        });

        Schema::table('sale_items', function (Blueprint $table) {
            $table->decimal('tax_rate', 5, 2)->default(0);
            $table->decimal('tax_amount', 14, 2)->default(0);
            $table->decimal('discount_percent', 5, 2)->default(0);        // remise manuelle saisie en caisse
            $table->decimal('discount_amount', 14, 2)->default(0);        // remise totale (promotion + manuelle)
            $table->unsignedBigInteger('promotion_id')->nullable();
            $table->string('promotion_label')->nullable();                // snapshot du libellé
        });

        Schema::table('purchases', function (Blueprint $table) {
            $table->decimal('total_ht', 16, 2)->default(0);
            $table->decimal('total_tax', 16, 2)->default(0);
        });

        Schema::table('purchase_items', function (Blueprint $table) {
            $table->decimal('tax_rate', 5, 2)->default(0);
            $table->decimal('unit_price_ttc', 14, 2)->default(0);
            $table->decimal('total_ttc', 14, 2)->default(0);
        });

        // `unit_price` / `total` des lignes d'achat deviennent des montants HT ; `total` du bon = TTC.
        DB::table('purchases')->update(['total_ht' => DB::raw('total'), 'total_tax' => 0]);
        DB::table('purchase_items')->update(['unit_price_ttc' => DB::raw('unit_price'), 'total_ttc' => DB::raw('total')]);

        // Part de TVA des ventes existantes, répartie sur leurs lignes pour que les statistiques nettes soient exactes
        DB::statement('UPDATE sale_items SET tax_rate = (SELECT tax_rate FROM sales WHERE sales.id = sale_items.sale_id)');
        DB::statement('UPDATE sale_items SET tax_amount = ROUND(total - total / (1 + tax_rate / 100), 2) WHERE tax_rate > 0');

        Schema::create('promotions', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('type', 10);                                   // percent | amount (montant par unité)
            $table->decimal('value', 14, 2);
            $table->string('scope', 10)->default('all');                  // all | category | product
            $table->foreignId('category_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->nullable()->constrained()->cascadeOnDelete();
            $table->decimal('min_quantity', 10, 3)->default(0);
            $table->date('starts_on')->nullable();
            $table->date('ends_on')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();

            $table->index(['active', 'starts_on', 'ends_on']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('promotions');
        Schema::table('purchase_items', fn (Blueprint $t) => $t->dropColumn(['tax_rate', 'unit_price_ttc', 'total_ttc']));
        Schema::table('purchases', fn (Blueprint $t) => $t->dropColumn(['total_ht', 'total_tax']));
        Schema::table('sale_items', fn (Blueprint $t) => $t->dropColumn(['tax_rate', 'tax_amount', 'discount_percent', 'discount_amount', 'promotion_id', 'promotion_label']));
        Schema::table('shop_settings', fn (Blueprint $t) => $t->dropColumn('max_discount_percent'));
        Schema::table('products', fn (Blueprint $t) => $t->dropColumn('tax_rate'));
    }
};
