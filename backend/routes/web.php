<?php

use Illuminate\Support\Facades\Route;

/*
 | L'interface React (build « une seule page ») est copiée dans public/app.html par `npm run build:laravel`.
 | Toute URL hors /api renvoie cette page : le serveur Laravel sert alors l'application complète.
 */
Route::get('/{any?}', function () {
    $file = public_path('app.html');

    if (! is_file($file)) {
        return response(
            '<h2>Interface non compilée</h2><p>Lancez <code>npm run build:laravel</code> à la racine du projet '
            . '(ou <code>npm run dev</code> pour le mode développement).</p>',
            503
        );
    }

    return response()->file($file, ['Cache-Control' => 'no-cache']);
})->where('any', '^(?!api/).*$');
