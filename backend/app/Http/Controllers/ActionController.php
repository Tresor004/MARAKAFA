<?php

namespace App\Http\Controllers;

use App\Http\Support\Present;
use App\Services\ActionService;
use App\Services\PendingActionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * POST /api/actions — point d'entrée unique des opérations soumises à validation.
 *  - administrateur : exécution immédiate  → { executed: true,  affects: [...] }
 *  - autre employé  : demande en attente   → { executed: false, pending: {...} }
 */
class ActionController extends Controller
{
    public function store(Request $request, ActionService $actions, PendingActionService $pending): JsonResponse
    {
        $d = $request->validate([
            'kind'        => ['required', 'string', Rule::in(ActionService::kinds())],
            'module'      => ['nullable', 'string', 'max:60'],
            'action'      => ['nullable', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:1000'],
            'details'     => ['nullable', 'array'],
            'payload'     => ['required', 'array'],
        ]);

        $user = $request->user();
        $actions->authorize($user, $d['kind'], $d['payload']);

        if ($user->isAdmin()) {
            $actions->execute($d['kind'], $d['payload'], $user, null, $d['description'] ?? '');

            return response()->json([
                'executed' => true,
                'affects'  => ActionService::affects($d['kind']),
            ]);
        }

        // Une demande ne doit pas pouvoir être « pourrie » : on vérifie dès maintenant qu'elle est exécutable en forme.
        $pa = $pending->submit($user, $d['kind'], $d, $d['payload']);

        return response()->json([
            'executed' => false,
            'affects'  => ['pending'],
            'pending'  => Present::pending($pa->load('requester', 'reviewer')),
        ], 202);
    }
}
