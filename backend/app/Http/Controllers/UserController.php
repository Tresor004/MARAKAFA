<?php

namespace App\Http\Controllers;

use App\Http\Requests\UserRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\NotificationService;
use App\Services\PendingActionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

class UserController extends Controller
{
    public function __construct(
        private readonly PendingActionService $pending,
        private readonly NotificationService  $notif,
    ) {}

    public function index(): \Illuminate\Http\Resources\Json\AnonymousResourceCollection
    {
        return UserResource::collection(
            User::with('role')->withTrashed()->orderBy('name')->get()
        );
    }

    public function store(UserRequest $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validated();
        $data['password'] = Hash::make($data['password']);

        if ($user->isAdmin()) {
            $newUser = User::create($data);
            $this->notif->notifyUser(
                $newUser->id,
                'Bienvenue sur Hi-Market',
                "Votre compte a été créé par {$user->name}. Vous pouvez maintenant vous connecter.",
                'success',
                $user->id,
                $user->name,
            );
            return response()->json(new UserResource($newUser->load('role')), 201);
        }

        $pa = $this->pending->submit(
            'user.add', 'Employés', 'Ajouter un employé',
            "Nouvel employé « {$data['name']} »",
            ['nom' => $data['name'], 'email' => $data['email']],
            $data,
        );
        return response()->json(['pending' => true, 'action_id' => $pa->id], 202);
    }

    public function show(User $user): UserResource
    {
        return new UserResource($user->load('role.permissions'));
    }

    public function update(UserRequest $request, User $user): JsonResponse
    {
        $actor = $request->user();
        $data  = $request->validated();

        if (isset($data['password'])) {
            $data['password'] = Hash::make($data['password']);
        }

        if ($actor->isAdmin()) {
            $user->update($data);

            // Notifie l'utilisateur modifié (si ce n'est pas lui-même)
            if ($user->id !== $actor->id) {
                $this->notif->notifyUser(
                    $user->id,
                    'Profil mis à jour',
                    "Votre profil a été modifié par {$actor->name}.",
                    'info',
                    $actor->id,
                    $actor->name,
                );
            }

            return response()->json(new UserResource($user->fresh('role')));
        }

        $pa = $this->pending->submit(
            'user.update', 'Employés', 'Modifier un employé',
            "Modification de « {$user->name} »",
            ['nom' => $user->name],
            ['id' => $user->id, 'data' => $data],
        );
        return response()->json(['pending' => true, 'action_id' => $pa->id], 202);
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        $actor = $request->user();

        if ($actor->isAdmin()) {
            $user->delete();
            return response()->json(['message' => 'Employé supprimé.']);
        }

        $pa = $this->pending->submit(
            'user.delete', 'Employés', 'Supprimer un employé',
            "Suppression de « {$user->name} »",
            ['nom' => $user->name],
            ['id' => $user->id],
        );
        return response()->json(['pending' => true, 'action_id' => $pa->id], 202);
    }

    /**
     * POST /api/users/{user}/avatar
     */
    public function uploadAvatar(Request $request, User $user): JsonResponse
    {
        $request->validate(['avatar' => ['required', 'image', 'max:2048']]);

        $actor = $request->user();

        // Supprime l'ancien avatar
        if ($user->avatar_path) {
            Storage::disk('public')->delete($user->avatar_path);
        }

        $path = $request->file('avatar')->store("avatars", 'public');

        if ($actor->isAdmin() || $actor->id === $user->id) {
            $user->update(['avatar_path' => $path]);
            return response()->json(['avatar_url' => asset("storage/{$path}")]);
        }

        $pa = $this->pending->submit(
            'profile.update', 'Profil', 'Changer la photo de profil',
            "Mise à jour de la photo de {$user->name}",
            ['utilisateur' => $user->name],
            ['id' => $user->id, 'data' => ['avatar_path' => $path]],
        );
        return response()->json(['pending' => true, 'action_id' => $pa->id], 202);
    }

    /**
     * GET /api/users/online
     * Liste des utilisateurs connectés récemment (< 2 min).
     */
    public function online(): \Illuminate\Http\Resources\Json\AnonymousResourceCollection
    {
        $users = User::with('role')
            ->where('last_seen_at', '>=', now()->subMinutes(2))
            ->get();

        return UserResource::collection($users);
    }
}
