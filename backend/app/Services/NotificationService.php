<?php

namespace App\Services;

use App\Models\AppNotification;
use App\Models\User;

class NotificationService
{
    /**
     * Envoie une notification à un utilisateur précis.
     */
    public function notifyUser(
        int $userId,
        string $title,
        string $message,
        string $type = 'info',
        ?int $triggeredById = null,
        string $triggeredByName = 'Système'
    ): AppNotification {
        return AppNotification::create([
            'user_id'           => $userId,
            'title'             => $title,
            'message'           => $message,
            'type'              => $type,
            'scope'             => 'personal',
            'triggered_by_id'   => $triggeredById,
            'triggered_by_name' => $triggeredByName,
        ]);
    }

    /**
     * Envoie une notification générale à TOUS les employés actifs
     * (user_id = null pour les récupérer via le scope).
     */
    public function notifyAll(
        string $title,
        string $message,
        string $type = 'info',
        ?int $triggeredById = null,
        string $triggeredByName = 'Système'
    ): AppNotification {
        return AppNotification::create([
            'user_id'           => null,  // NULL = broadcast général
            'title'             => $title,
            'message'           => $message,
            'type'              => $type,
            'scope'             => 'general',
            'triggered_by_id'   => $triggeredById,
            'triggered_by_name' => $triggeredByName,
        ]);
    }

    /**
     * Notifie tous les administrateurs actifs.
     */
    public function notifyAdmins(
        string $title,
        string $message,
        string $type = 'warning',
        ?int $triggeredById = null,
        string $triggeredByName = 'Système'
    ): void {
        $admins = User::whereHas('role', fn($q) => $q->where('name', 'Administrateur'))
            ->where('active', true)
            ->get();

        foreach ($admins as $admin) {
            $this->notifyUser($admin->id, $title, $message, $type, $triggeredById, $triggeredByName);
        }
    }
}
