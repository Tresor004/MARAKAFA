<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Autorise la route si l'employé possède AU MOINS UNE des permissions listées (admin : toujours).
 * Usage : ->middleware('permission:sales,dashboard')   ou   ->middleware('permission:admin')
 */
class EnsurePermission
{
    public function handle(Request $request, Closure $next, string ...$permissions): Response
    {
        $user = $request->user();
        if (! $user) {
            abort(401, 'Non authentifié.');
        }

        if (in_array('admin', $permissions, true)) {
            if (! $user->isAdmin()) {
                abort(403, 'Réservé à l\'administrateur.');
            }

            return $next($request);
        }

        foreach ($permissions as $permission) {
            if ($user->hasPermission($permission)) {
                return $next($request);
            }
        }

        abort(403, 'Vous n\'avez pas accès à cette fonctionnalité.');
    }
}
