<?php

namespace App\Http\Controllers;

use App\Http\Support\Present;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * POST /api/login — identifiant = email, nom complet ou numéro de téléphone.
     */
    public function login(Request $request, NotificationService $notif): JsonResponse
    {
        $data = $request->validate([
            'identifier' => ['required', 'string', 'max:255'],
            'password'   => ['required', 'string', 'max:255'],
        ]);

        $user = $this->findByIdentifier($data['identifier']);

        // Même message pour « inconnu » et « mauvais mot de passe » : on ne révèle pas quels comptes existent.
        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'identifier' => ['Identifiant ou mot de passe incorrect.'],
            ]);
        }

        if (! $user->active) {
            throw ValidationException::withMessages([
                'identifier' => ['Ce compte est désactivé. Contactez l\'administrateur.'],
            ]);
        }

        $token = $user->createToken('web', ['*'], now()->addHours(12));
        $user->forceFill(['last_seen_at' => now()])->saveQuietly();

        // Contrôles quotidiens (stock critique, produits périmés) : au plus une fois par jour
        $notif->runDailyChecksOncePerDay();

        return response()->json([
            'token' => $token->plainTextToken,
            'user'  => Present::user($user->load('role.permissions')),
            'role'  => Present::role($user->role),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['message' => 'Déconnecté.']);
    }

    /** GET /api/me — utilisateur courant et son rôle (permissions à jour). */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user()->load('role.permissions');

        return response()->json([
            'user' => Present::user($user),
            'role' => Present::role($user->role),
        ]);
    }

    /** POST /api/me/verify-password — confirme l'identité avant une opération sensible (changement de profil). */
    public function verifyPassword(Request $request): JsonResponse
    {
        $data = $request->validate(['password' => ['required', 'string', 'max:255']]);

        if (! Hash::check($data['password'], $request->user()->password)) {
            throw ValidationException::withMessages(['password' => ['Mot de passe incorrect.']]);
        }

        return response()->json(['ok' => true]);
    }

    /**
     * POST /api/forgot-password — prévient les administrateurs ; réponse identique que le compte existe ou non.
     */
    public function forgotPassword(Request $request, NotificationService $notif): JsonResponse
    {
        $data = $request->validate(['identifier' => ['required', 'string', 'max:255']]);

        $user = $this->findByIdentifier($data['identifier']);
        if ($user && $user->active) {
            $notif->notifyAdmins(
                'Réinitialisation de mot de passe demandée',
                "{$user->name} ({$user->email}) a oublié son mot de passe. Modifiez-le dans la page Employés.",
                'warning', $user->id, $user->name, 'users',
            );
        }

        return response()->json([
            'message' => 'Si ce compte existe, l\'administrateur a été prévenu et vous communiquera un nouveau mot de passe.',
        ]);
    }

    private function findByIdentifier(string $identifier): ?User
    {
        $q = mb_strtolower(trim($identifier));
        $digits = User::normalizePhone($identifier);

        $user = User::with('role.permissions')
            ->where(fn ($w) => $w->whereRaw('LOWER(email) = ?', [$q])->orWhereRaw('LOWER(name) = ?', [$q]))
            ->first();

        // Téléphone : comparaison sur les chiffres uniquement (espaces, +, tirets ignorés)
        if (! $user && strlen($digits) >= 6) {
            $user = User::with('role.permissions')->whereNotNull('phone')->get()
                ->first(fn (User $u) => User::normalizePhone($u->phone) === $digits);
        }

        return $user;
    }
}
