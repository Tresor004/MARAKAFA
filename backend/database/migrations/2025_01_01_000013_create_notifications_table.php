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
            // NULL = notification diffusée (générale) ; sinon notification personnelle
            $table->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('title', 200);
            $table->text('message');
            $table->enum('type', ['info', 'success', 'warning', 'error'])->default('info');
            $table->enum('scope', ['personal', 'general'])->default('general');
            // Diffusion ciblée : seuls les employés ayant cette permission (page) la reçoivent
            $table->string('permission', 60)->nullable();
            // Navigation au clic dans l'interface
            $table->string('target_page', 60)->nullable();
            $table->string('target_id', 60)->nullable();
            // Émetteur de la notification
            $table->foreignId('triggered_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('triggered_by_name', 100)->default('Système'); // snapshot du nom
            $table->timestamp('notified_at')->useCurrent();
            $table->timestamps();

            $table->index(['user_id', 'notified_at']);
            $table->index(['scope', 'notified_at']);
            $table->index('triggered_by_id');
        });

        // État de lecture PAR employé (une notification générale est lue individuellement)
        Schema::create('notification_reads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('notification_id')->constrained('notifications')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('read_at')->useCurrent();

            $table->unique(['notification_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_reads');
        Schema::dropIfExists('notifications');
    }
};
