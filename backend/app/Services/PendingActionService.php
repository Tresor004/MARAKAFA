<?php

namespace App\Services;

use App\Models\PendingAction;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Circuit de validation : un employé demande, l'administrateur approuve (l'action est alors exécutée) ou refuse.
 */
class PendingActionService
{
    public function __construct(
        protected NotificationService $notif,
        protected ActionService $actions,
    ) {}

    /** Enregistre une demande et prévient les administrateurs. */
    public function submit(User $actor, string $kind, array $meta, array $payload): PendingAction
    {
        $pa = PendingAction::create([
            'kind'         => $kind,
            'module'       => $meta['module'] ?? 'Général',
            'action'       => $meta['action'] ?? $kind,
            'description'  => $meta['description'] ?? '',
            'details'      => $meta['details'] ?? [],
            'payload'      => $payload,
            'requested_by' => $actor->id,
            'status'       => 'pending',
            'request_date' => today(),
        ]);

        $this->notif->notifyAdmins(
            'Nouvelle demande en attente',
            "{$actor->name} demande : « {$pa->action} » — {$pa->description}",
            'warning', $actor->id, $actor->name, 'myspace',
        );

        return $pa;
    }

    /**
     * Approuve : exécute l'action au nom du demandeur, passe la demande en « approuvée » et prévient l'employé.
     * Si l'exécution échoue (stock devenu insuffisant, produit supprimé…), rien n'est modifié et l'erreur remonte.
     */
    public function approve(PendingAction $pa, User $admin): PendingAction
    {
        return DB::transaction(function () use ($pa, $admin) {
            $pa = PendingAction::whereKey($pa->id)->lockForUpdate()->firstOrFail();
            if (! $pa->isPending()) {
                throw ValidationException::withMessages(['status' => ['Cette demande a déjà été traitée.']]);
            }

            $requester = User::withTrashed()->findOrFail($pa->requested_by);
            if (! $requester->active || $requester->trashed()) {
                throw ValidationException::withMessages(['status' => ['L\'employé demandeur n\'est plus actif : refusez la demande.']]);
            }

            $this->actions->execute($pa->kind, $pa->payload, $requester, $admin, $pa->description);

            $pa->update([
                'status'      => 'approved',
                'reviewed_by' => $admin->id,
                'reviewed_at' => now(),
            ]);

            $this->notif->notifyUser(
                $requester->id,
                'Demande approuvée ✓',
                "Votre demande « {$pa->action} » ({$pa->description}) a été approuvée et appliquée par {$admin->name}.",
                'success', $admin->id, $admin->name, ActionService::pageFor($pa->kind),
            );

            return $pa->fresh(['requester', 'reviewer']);
        });
    }

    /** Refuse une demande et prévient l'employé (avec le motif). */
    public function reject(PendingAction $pa, User $admin, ?string $reason): PendingAction
    {
        return DB::transaction(function () use ($pa, $admin, $reason) {
            $pa = PendingAction::whereKey($pa->id)->lockForUpdate()->firstOrFail();
            if (! $pa->isPending()) {
                throw ValidationException::withMessages(['status' => ['Cette demande a déjà été traitée.']]);
            }

            $pa->update([
                'status'        => 'rejected',
                'reviewed_by'   => $admin->id,
                'reviewed_at'   => now(),
                'reject_reason' => $reason,
            ]);

            $suffix = $reason ? " : {$reason}" : '.';
            $this->notif->notifyUser(
                $pa->requested_by,
                'Demande refusée ✗',
                "Votre demande « {$pa->action} » ({$pa->description}) a été refusée par {$admin->name}{$suffix}",
                'error', $admin->id, $admin->name, 'myspace',
            );

            return $pa->fresh(['requester', 'reviewer']);
        });
    }
}
