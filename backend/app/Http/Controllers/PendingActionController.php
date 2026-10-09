<?php

namespace App\Http\Controllers;

use App\Http\Resources\PendingActionResource;
use App\Models\PendingAction;
use App\Services\PendingActionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PendingActionController extends Controller
{
    public function __construct(private readonly PendingActionService $service) {}

    /**
     * GET /api/pending-actions
     * Admin : toutes les actions.
     * Employé : uniquement ses propres actions.
     */
    public function index(Request $request)
    {
        $user  = $request->user();
        $query = PendingAction::with('requester', 'reviewer')->latest();

        if (! $user->isAdmin()) {
            $query->where('requested_by', $user->id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        return PendingActionResource::collection($query->paginate(50));
    }

    /**
     * POST /api/pending-actions/{id}/approve  (admin uniquement)
     */
    public function approve(Request $request, PendingAction $pendingAction): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403, 'Seul un administrateur peut approuver une demande.');

        if (! $pendingAction->isPending()) {
            return response()->json(['message' => 'Cette action n\'est plus en attente.'], 409);
        }

        $this->service->approve($pendingAction);

        return response()->json([
            'message' => 'Action approuvée et appliquée.',
            'action'  => new PendingActionResource($pendingAction->fresh('requester', 'reviewer')),
        ]);
    }

    /**
     * POST /api/pending-actions/{id}/reject  (admin uniquement)
     */
    public function reject(Request $request, PendingAction $pendingAction): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403, 'Seul un administrateur peut refuser une demande.');

        $request->validate(['reason' => ['nullable', 'string', 'max:500']]);

        if (! $pendingAction->isPending()) {
            return response()->json(['message' => 'Cette action n\'est plus en attente.'], 409);
        }

        $this->service->reject($pendingAction, $request->reason);

        return response()->json([
            'message' => 'Action refusée.',
            'action'  => new PendingActionResource($pendingAction->fresh('requester', 'reviewer')),
        ]);
    }
}
