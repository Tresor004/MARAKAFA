<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Loss;
use App\Models\PendingAction;
use App\Models\Product;
use App\Models\Purchase;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class PendingActionService
{
    public function __construct(protected NotificationService $notif) {}

    /**
     * Construit et persiste une PendingAction, notifie les admins.
     */
    public function submit(
        string $kind,
        string $module,
        string $action,
        string $description,
        array  $details,
        array  $payload
    ): PendingAction {
        /** @var User $actor */
        $actor = Auth::user();

        $pa = PendingAction::create([
            'kind'          => $kind,
            'module'        => $module,
            'action'        => $action,
            'description'   => $description,
            'details'       => $details,
            'payload'       => $payload,
            'requested_by'  => $actor->id,
            'status'        => 'pending',
            'request_date'  => now()->toDateString(),
        ]);

        // Notifie tous les admins
        $this->notif->notifyAdmins(
            'Nouvelle demande en attente',
            "{$actor->name} demande : « {$action} » — {$description}",
            'warning',
            $actor->id,
            $actor->name,
        );

        return $pa;
    }

    /**
     * Approuve une demande : exécute l'action, change le statut, notifie.
     */
    public function approve(PendingAction $pa): void
    {
        /** @var User $admin */
        $admin = Auth::user();

        DB::transaction(function () use ($pa, $admin) {
            // 1. Exécuter l'action
            $this->execute($pa->kind, $pa->payload);

            // 2. Mettre à jour le statut
            $pa->update([
                'status'      => 'approved',
                'reviewed_by' => $admin->id,
                'reviewed_at' => now(),
            ]);

            // 3. Notifier l'employé demandeur
            $this->notif->notifyUser(
                $pa->requested_by,
                'Demande approuvée ✓',
                "Votre demande « {$pa->action} » ({$pa->description}) a été approuvée et appliquée par {$admin->name}.",
                'success',
                $admin->id,
                $admin->name,
            );

            // 4. Notification générale pour les actions visibles de tous
            $generalKinds = [
                'product.add', 'product.update', 'product.delete',
                'customer.add', 'customer.delete',
                'supplier.add', 'supplier.delete',
                'purchase.add',
            ];
            if (in_array($pa->kind, $generalKinds, true)) {
                $this->notif->notifyAll(
                    "{$pa->module} — {$pa->action}",
                    "{$pa->description} (demandé par {$pa->requester->name}, approuvé par {$admin->name}).",
                    'info',
                    $admin->id,
                    $admin->name,
                );
            }
        });
    }

    /**
     * Refuse une demande : change le statut, notifie l'employé.
     */
    public function reject(PendingAction $pa, ?string $reason): void
    {
        /** @var User $admin */
        $admin = Auth::user();

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
            'error',
            $admin->id,
            $admin->name,
        );
    }

    /**
     * Exécute l'action correspondant au kind sur les modèles.
     */
    private function execute(string $kind, array $payload): void
    {
        match ($kind) {
            'product.add'    => Product::create($payload),
            'product.update' => Product::findOrFail($payload['id'])->update($payload['data']),
            'product.delete' => Product::findOrFail($payload['id'])->delete(),

            'customer.add'    => Customer::create($payload),
            'customer.update' => Customer::findOrFail($payload['id'])->update($payload['data']),
            'customer.delete' => Customer::findOrFail($payload['id'])->delete(),

            'supplier.add'    => Supplier::create($payload),
            'supplier.update' => Supplier::findOrFail($payload['id'])->update($payload['data']),
            'supplier.delete' => Supplier::findOrFail($payload['id'])->delete(),

            'user.add'    => User::create($payload),
            'user.update' => User::findOrFail($payload['id'])->update($payload['data']),
            'user.delete' => User::findOrFail($payload['id'])->delete(),

            'loss.add'    => app(LossService::class)->createLoss($payload),
            'loss.delete' => Loss::findOrFail($payload['id'])->delete(),

            'stock.adjust' => app(StockService::class)->adjust($payload['product_id'], $payload['delta']),

            'inventory.do' => app(InventoryService::class)->process($payload['counts'], $payload['period']),

            'purchase.add'    => app(PurchaseService::class)->create($payload),
            'purchase.update' => Purchase::findOrFail($payload['id'])->update($payload['data']),
            'purchase.delete' => Purchase::findOrFail($payload['id'])->delete(),

            'profile.update' => User::findOrFail($payload['id'])->update($payload['data']),

            default => null,
        };
    }
}
