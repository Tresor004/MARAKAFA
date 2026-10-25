<?php

use App\Services\NotificationService;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('shop:daily-checks', function (NotificationService $notif) {
    $notif->runDailyChecks();
    $this->info('Contrôles quotidiens effectués (stock critique, produits périmés).');
})->purpose('Notifie les stocks critiques et les produits périmés (sans déclarer de perte)');

Schedule::command('shop:daily-checks')->dailyAt('06:00');
Schedule::command('sanctum:prune-expired --hours=24')->daily();
