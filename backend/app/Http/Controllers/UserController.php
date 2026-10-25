<?php

namespace App\Http\Controllers;

use App\Http\Support\Present;
use App\Models\User;
use Illuminate\Http\JsonResponse;

/**
 * Lecture seule : création / modification / suppression d'employés passent par POST /api/actions.
 */
class UserController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(User::orderBy('name')->get()->map(fn ($u) => Present::user($u))->values());
    }

    /** Identifiants des employés actifs dans les 2 dernières minutes. */
    public function online(): JsonResponse
    {
        return response()->json(
            User::where('active', true)->where('last_seen_at', '>=', now()->subSeconds(120))
                ->pluck('id')->map(fn ($id) => (string) $id)->values()
        );
    }
}
