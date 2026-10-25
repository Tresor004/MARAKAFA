<?php

use App\Http\Middleware\EnsureActiveUser;
use App\Http\Middleware\EnsurePermission;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'permission' => EnsurePermission::class,
            'active'     => EnsureActiveUser::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        // Messages en français pour les erreurs que Laravel ne traduit pas (et sans nom de classe interne)
        $json = fn (Request $request) => $request->is('api/*') || $request->expectsJson();
        $exceptions->render(fn (AuthenticationException $e, Request $request) => $json($request)
            ? response()->json(['message' => 'Session expirée. Reconnectez-vous.'], 401) : null);
        $exceptions->render(fn (ThrottleRequestsException $e, Request $request) => $json($request)
            ? response()->json(['message' => 'Trop de tentatives. Patientez une minute avant de réessayer.'], 429, $e->getHeaders()) : null);
        $exceptions->render(fn (NotFoundHttpException $e, Request $request) => $json($request)
            ? response()->json(['message' => 'Élément introuvable (il a peut-être été supprimé).'], 404) : null);
        $exceptions->render(fn (AccessDeniedHttpException $e, Request $request) => $json($request)
            ? response()->json(['message' => $e->getMessage() && $e->getMessage() !== 'This action is unauthorized.' ? $e->getMessage() : "Vous n'avez pas l'autorisation d'effectuer cette action."], 403) : null);
    })->create();
