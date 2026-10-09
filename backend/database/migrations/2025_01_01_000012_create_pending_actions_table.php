<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pending_actions', function (Blueprint $table) {
            $table->id();
            $table->string('kind', 60);                      // ex: 'product.add'
            $table->string('module', 60);
            $table->string('action', 120);
            $table->text('description');
            $table->json('details');                         // informations lisibles
            $table->json('payload');                         // données brutes pour exécution
            $table->foreignId('requested_by')->constrained('users')->restrictOnDelete();
            $table->enum('status', ['pending', 'approved', 'rejected'])->default('pending');
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('reject_reason')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->date('request_date');
            $table->timestamps();

            $table->index(['status', 'request_date']);
            $table->index('requested_by');
            $table->index('reviewed_by');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pending_actions');
    }
};
