<?php

namespace App\Http\Controllers;

use App\Http\Support\Present;
use App\Models\CashSession;
use App\Services\CashSessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Sessions de caisse. Un caissier ouvre / ferme SA caisse (aucune validation requise : c'est son comptage) ;
 * un administrateur voit toutes les sessions et peut en clôturer une.
 */
class CashSessionController extends Controller
{
    /** GET /api/cash-sessions/current — ma caisse ouverte (ou null). */
    public function current(Request $request, CashSessionService $svc): JsonResponse
    {
        $s = $svc->current($request->user());

        // Corps JSON littéral « null » : response()->json(null) produirait « {} », que le client prendrait pour une session.
        if (! $s) {
            return \Illuminate\Http\JsonResponse::fromJsonString('null');
        }

        return response()->json(Present::cashSession($s->load('user'), $svc->summary($s)));
    }

    /** GET /api/cash-sessions — historique (les miennes ; toutes pour un administrateur). */
    public function index(Request $request, CashSessionService $svc): JsonResponse
    {
        $user = $request->user();
        $rows = CashSession::with('user')
            ->when(! $user->isAdmin(), fn ($q) => $q->where('user_id', $user->id))
            ->orderByDesc('id')->limit(100)->get();

        return response()->json($rows->map(fn ($s) => Present::cashSession($s, $svc->summary($s)))->values());
    }

    public function open(Request $request, CashSessionService $svc): JsonResponse
    {
        $d = $request->validate(['openingFloat' => ['required', 'numeric', 'min:0', 'max:999999999999']]);
        $s = $svc->open($request->user(), (float) $d['openingFloat']);

        return response()->json(Present::cashSession($s->load('user'), $svc->summary($s)), 201);
    }

    public function close(Request $request, CashSession $cashSession, CashSessionService $svc): JsonResponse
    {
        $user = $request->user();
        if ($cashSession->user_id !== $user->id && ! $user->isAdmin()) {
            abort(403, 'Vous ne pouvez fermer que votre propre caisse.');
        }

        $d = $request->validate([
            'countedCash' => ['required', 'numeric', 'min:0', 'max:999999999999'],
            'note'        => ['nullable', 'string', 'max:500'],
        ]);

        $s = $svc->close($cashSession, $user, (float) $d['countedCash'], $d['note'] ?? null);

        return response()->json(Present::cashSession($s->load('user'), $svc->summary($s)));
    }
}
