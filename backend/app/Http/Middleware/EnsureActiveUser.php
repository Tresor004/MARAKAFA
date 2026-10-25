<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * - Coupe immédiatement l'accès d'un compte désactivé (même avec un jeton encore valide).
 * - Rafraîchit la « dernière activité » (présence en ligne) au plus toutes les 30 secondes.
 */
class EnsureActiveUser
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && ! $user->active) {
            $user->currentAccessToken()?->delete();
            abort(401, 'Ce compte est désactivé. Contactez l\'administrateur.');
        }

        if ($user && (! $user->last_seen_at || $user->last_seen_at->diffInSeconds(now()) >= 30)) {
            $user->forceFill(['last_seen_at' => now()])->saveQuietly();
        }

        return $next($request);
    }
}
