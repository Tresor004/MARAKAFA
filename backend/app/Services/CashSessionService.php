<?php

namespace App\Services;

use App\Models\CashSession;
use App\Models\Payment;
use App\Models\ShopSetting;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Sessions de caisse : ouverture (fond de caisse), suivi des encaissements, fermeture avec comptage et écart.
 * Les espèces attendues = fond de caisse + encaissements en espèces − remboursements en espèces.
 */
class CashSessionService
{
    public function __construct(protected NotificationService $notif) {}

    public function current(User $user): ?CashSession
    {
        return CashSession::where('user_id', $user->id)->where('status', 'open')->latest('id')->first();
    }

    public function open(User $user, float $openingFloat): CashSession
    {
        if ($openingFloat < 0) {
            throw ValidationException::withMessages(['openingFloat' => ['Le fond de caisse ne peut pas être négatif.']]);
        }

        return DB::transaction(function () use ($user, $openingFloat) {
            if ($this->current($user)) {
                throw ValidationException::withMessages(['session' => ['Vous avez déjà une caisse ouverte.']]);
            }

            return CashSession::create([
                'user_id'       => $user->id,
                'opened_at'     => now(),
                'opening_float' => round($openingFloat, 2),
                'status'        => 'open',
            ]);
        });
    }

    public function close(CashSession $session, User $by, float $counted, ?string $note): CashSession
    {
        if ($session->status !== 'open') {
            throw ValidationException::withMessages(['session' => ['Cette caisse est déjà fermée.']]);
        }
        if ($counted < 0) {
            throw ValidationException::withMessages(['countedCash' => ['Le montant compté ne peut pas être négatif.']]);
        }

        $session = DB::transaction(function () use ($session, $counted, $note) {
            $summary = $this->summary($session);
            $expected = $summary['expectedCash'];
            $counted = round($counted, 2);

            $session->update([
                'closed_at'     => now(),
                'expected_cash' => $expected,
                'counted_cash'  => $counted,
                'difference'    => round($counted - $expected, 2),
                'note'          => $note !== null && trim($note) !== '' ? trim($note) : null,
                'status'        => 'closed',
            ]);

            return $session->fresh();
        });

        if (abs((float) $session->difference) >= 0.005) {
            $session->loadMissing('user');
            $diff = (float) $session->difference;
            $this->notif->notifyAdmins(
                'Écart de caisse',
                ($session->user?->name ?? 'Un caissier') . ' a fermé sa caisse avec un écart de ' . ($diff > 0 ? '+' : '') . number_format($diff, 0, ',', ' ') . ' (attendu ' . number_format((float) $session->expected_cash, 0, ',', ' ') . ', compté ' . number_format((float) $session->counted_cash, 0, ',', ' ') . ').',
                $diff < 0 ? 'warning' : 'info', $by->id, $by->name, 'sales',
            );
        }

        return $session;
    }

    /** Totaux de la session, calculés depuis les encaissements rattachés. */
    public function summary(CashSession $session): array
    {
        $rows = Payment::where('cash_session_id', $session->id)
            ->selectRaw('kind, method, SUM(amount) as total, COUNT(*) as n')
            ->groupBy('kind', 'method')->get();

        $byMethod = [];
        $cash = 0.0;
        $refunds = 0.0;
        $settlements = 0.0;
        foreach ($rows as $r) {
            $amount = (float) $r->total;
            if ($r->kind === 'refund') {
                $refunds += -$amount;
            } elseif ($r->kind === 'settlement') {
                $settlements += $amount;
            }
            $byMethod[$r->method] = round(($byMethod[$r->method] ?? 0) + $amount, 2);
            if ($r->method === Payment::CASH) {
                $cash += $amount;
            }
        }

        $salesQ = \App\Models\Sale::where('cash_session_id', $session->id);
        $until = $session->closed_at;

        return [
            'salesCount'      => (clone $salesQ)->count(),
            'salesTotal'      => round((float) (clone $salesQ)->sum('total'), 2),
            'creditGranted'   => round((float) (clone $salesQ)->sum('balance_due'), 2),
            'refunds'         => round($refunds, 2),
            'settlements'     => round($settlements, 2),
            'byMethod'        => $byMethod,
            'cashIn'          => round($cash, 2),
            'expectedCash'    => round((float) $session->opening_float + $cash, 2),
            'until'           => $until?->toIso8601String(),
        ];
    }

    /** Session à laquelle rattacher un encaissement de $user, ou erreur si la boutique l'exige. */
    public function forPayment(User $user, bool $required): ?CashSession
    {
        $session = $this->current($user);
        if (! $session && $required && ShopSetting::instance()->require_cash_session) {
            throw ValidationException::withMessages(['session' => ['Ouvrez votre caisse avant d\'encaisser.']]);
        }

        return $session;
    }
}
