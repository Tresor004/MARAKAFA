<?php

namespace App\Http\Controllers;

use App\Http\Support\Present;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class RoleController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(Role::with('permissions')->orderBy('id')->get()->map(fn ($r) => Present::role($r))->values());
    }

    public function store(Request $request): JsonResponse
    {
        $d = $this->validated($request);

        $role = Role::create([
            'name'        => trim($d['name']),
            'description' => $d['description'] ?? null,
            'is_system'   => false,
        ]);
        $role->syncPermissions($d['permissions']);

        return response()->json(Present::role($role->load('permissions')), 201);
    }

    public function update(Request $request, Role $role): JsonResponse
    {
        if ($role->isAdmin()) {
            throw ValidationException::withMessages(['role' => ['Le rôle Administrateur ne peut pas être modifié.']]);
        }

        $d = $this->validated($request, $role);
        $role->update(['name' => trim($d['name']), 'description' => $d['description'] ?? null]);
        $role->syncPermissions($d['permissions']);

        return response()->json(Present::role($role->load('permissions')));
    }

    public function destroy(Role $role): JsonResponse
    {
        if ($role->is_system) {
            throw ValidationException::withMessages(['role' => ['Un rôle système ne peut pas être supprimé.']]);
        }
        if (User::withTrashed()->where('role_id', $role->id)->exists()) {
            throw ValidationException::withMessages(['role' => ['Ce rôle est attribué à des employés : réaffectez-les d\'abord.']]);
        }

        $role->permissions()->delete();
        $role->delete();

        return response()->json(['message' => 'Rôle supprimé.']);
    }

    private function validated(Request $request, ?Role $role = null): array
    {
        return $request->validate([
            'name'          => ['required', 'string', 'max:100', Rule::unique('roles', 'name')->ignore($role?->id)],
            'description'   => ['nullable', 'string', 'max:500'],
            'permissions'   => ['required', 'array'],
            'permissions.*' => ['string', Rule::in(Role::PERMISSIONS)],
        ]);
    }
}
