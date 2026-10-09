<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table): void {
            $table->string('email')->nullable()->after('phone');
        });

        Schema::table('suppliers', function (Blueprint $table): void {
            $table->string('email')->nullable()->after('phone');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table): void {
            $table->dropColumn('email');
        });

        Schema::table('suppliers', function (Blueprint $table): void {
            $table->dropColumn('email');
        });
    }
};
