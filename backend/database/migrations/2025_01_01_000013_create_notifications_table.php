<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            // NULL = notification pour tous les employés (générale)
            $table->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('title', 200);
            $table->text('message');
            $table->enum('type', ['info', 'success', 'warning', 'error'])->default('info');
            $table->enum('scope', ['personal', 'general'])->default('general');
            $table->boolean('is_read')->default(false);
            // Émetteur de la notification
            $table->foreignId('triggered_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('triggered_by_name', 100)->default('Système'); // snapshot du nom
            $table->timestamp('notified_at')->useCurrent();
            $table->timestamps();

            $table->index(['user_id', 'is_read']);
            $table->index(['scope', 'notified_at']);
            $table->index('triggered_by_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
    }
};
