<?php

namespace App\Http\Controllers;

use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * POST /api/login
     * Retourne un token Sanctum + l'utilisateur avec son rôle et ses permissions.
     */
    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email'    => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        // Tentative de connexion
        $user = User::with('role.permissions')
            ->where('email', $request->email)
            ->first();

        if (! $user || ! Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['Email ou mot de passe incorrect.'],
            ]);
        }

        if (! $user->active) {
            throw ValidationException::withMessages([
                'email' => ['Ce compte est désactivé. Contactez l\'administrateur.'],
            ]);
        }

        // Supprimer les anciens tokens (mono-session)
        $user->tokens()->delete();

        // Créer un nouveau token avec expiration de 8h
        $token = $user->createToken('api-token', ['*'], now()->addHours(8));

        // Mettre à jour la présence en ligne
        $user->update(['last_seen_at' => now()]);

        return response()->json([
            'token' => $token->plainTextToken,
            'user'  => new UserResource($user),
        ]);
    }

    /**
     * POST /api/logout
     */
    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Déconnecté avec succès.']);
    }

    /**
     * GET /api/me
     * Retourne l'utilisateur connecté avec rôle + permissions.
     */
    public function me(Request $request): JsonResponse
    {
        // Met à jour la présence en ligne
        $request->user()->update(['last_seen_at' => now()]);

        return response()->json(new UserResource($request->user()->load('role.permissions')));
    }

    /**
     * PUT /api/me/ping
     * Mise à jour de la présence en ligne (appelé toutes les 30s).
     */
    public function ping(Request $request): JsonResponse
    {
        $request->user()->update(['last_seen_at' => now()]);
        return response()->json(['online' => true]);
    }
}
