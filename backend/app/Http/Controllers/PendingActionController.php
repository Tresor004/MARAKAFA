<?php

namespace App\Http\Controllers;

use App\Http\Support\Present;
use App\Models\PendingAction;
use App\Services\ActionService;
use App\Services\PendingActionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PendingActionController extends Controller
{
    /** Administrateur : toutes les demandes ; autre employé : uniquement les siennes. */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $rows = PendingAction::with('requester', 'reviewer')
            ->when(! $user->isAdmin(), fn ($q) => $q->where('requested_by', $user->id))
            ->orderByRaw("CASE status WHEN 'pending' THEN 0 ELSE 1 END")
            ->orderByDesc('id')
            ->limit(500)
            ->get();

        return response()->json($rows->map(fn ($a) => Present::pending($a))->values());
    }

    public function approve(Request $request, PendingAction $pendingAction, PendingActionService $service): JsonResponse
    {
        $pa = $service->approve($pendingAction, $request->user());

        return response()->json([
            'pending' => Present::pending($pa),
            'affects' => array_merge(['pending'], ActionService::affects($pa->kind)),
        ]);
    }

    public function reject(Request $request, PendingAction $pendingAction, PendingActionService $service): JsonResponse
    {
        $d = $request->validate(['reason' => ['nullable', 'string', 'max:500']]);
        $pa = $service->reject($pendingAction, $request->user(), $d['reason'] ?? null);

        return response()->json(['pending' => Present::pending($pa), 'affects' => ['pending']]);
    }
}
