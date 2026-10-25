<?php

namespace App\Services;

use App\Models\AppNotification;
use App\Models\Product;
use App\Models\User;
use Illuminate\Support\Facades\Cache;

class NotificationService
{
    /**
     * Notification personnelle (un seul destinataire).
     */
    public function notifyUser(
        int $userId,
        string $title,
        string $message,
        string $type = 'info',
        ?int $triggeredById = null,
        string $triggeredByName = 'Système',
        ?string $targetPage = null,
        ?string $targetId = null,
    ): AppNotification {
        return AppNotification::create([
            'user_id'           => $userId,
            'title'             => $title,
            'message'           => $message,
            'type'              => $type,
            'scope'             => 'personal',
            'target_page'       => $targetPage,
            'target_id'         => $targetId,
            'triggered_by_id'   => $triggeredById,
            'triggered_by_name' => $triggeredByName,
            'notified_at'       => now(),
        ]);
    }

    /**
     * Notification générale (diffusée à tous les employés actifs).
     * Si $permission est renseigné, seuls les employés ayant accès à cette page la reçoivent.
     */
    public function notifyAll(
        string $title,
        string $message,
        string $type = 'info',
        ?int $triggeredById = null,
        string $triggeredByName = 'Système',
        ?string $targetPage = null,
        ?string $targetId = null,
        ?string $permission = null,
    ): AppNotification {
        return AppNotification::create([
            'user_id'           => null,
            'title'             => $title,
            'message'           => $message,
            'type'              => $type,
            'scope'             => 'general',
            'permission'        => $permission,
            'target_page'       => $targetPage,
            'target_id'         => $targetId,
            'triggered_by_id'   => $triggeredById,
            'triggered_by_name' => $triggeredByName,
            'notified_at'       => now(),
        ]);
    }

    /**
     * Notifie chaque administrateur actif (notification personnelle).
     */
    public function notifyAdmins(
        string $title,
        string $message,
        string $type = 'warning',
        ?int $triggeredById = null,
        string $triggeredByName = 'Système',
        ?string $targetPage = 'myspace',
    ): void {
        $admins = User::whereHas('role', fn ($q) => $q->where('slug', 'admin'))
            ->where('active', true)
            ->get();

        foreach ($admins as $admin) {
            $this->notifyUser($admin->id, $title, $message, $type, $triggeredById, $triggeredByName, $targetPage);
        }
    }

    /**
     * Alerte quand un produit passe sous son seuil critique ou en rupture suite à un mouvement de stock.
     * $before = stock avant le mouvement ; on ne notifie qu'au franchissement du seuil (pas à chaque vente).
     */
    public function notifyStockThreshold(Product $product, float $before): void
    {
        $after = (float) $product->stock;
        $min = (float) $product->min_stock;

        if ($after <= 0 && $before > 0) {
            $this->notifyAll(
                'Rupture de stock',
                "Le produit « {$product->name} » est en rupture de stock.",
                'error', null, 'Système', 'stock', (string) $product->id,
            );
        } elseif ($after > 0 && $after <= $min && $before > $min) {
            $this->notifyAll(
                'Stock critique',
                "Le stock de « {$product->name} » est critique ({$this->fmt($after)} restant(s)).",
                'warning', null, 'Système', 'stock', (string) $product->id,
            );
        }
    }

    /**
     * Contrôles quotidiens : stock critique (tous) et produits périmés (employés ayant accès aux pertes).
     * Idempotent sur la journée. Ne déclare PAS de perte : l'employé doit la saisir lui-même.
     */
    public function runDailyChecks(): void
    {
        $today = today();

        $already = fn (string $title) => AppNotification::where('title', $title)
            ->whereNull('triggered_by_id')
            ->whereDate('notified_at', $today)
            ->exists();

        // 1. Stock critique
        $low = Product::where('stock', '>', 0)->whereColumn('stock', '<=', 'min_stock')->orderBy('name')->get();
        if ($low->isNotEmpty() && ! $already('Stock critique (récapitulatif)')) {
            $names = $low->take(5)->map(fn ($p) => "{$p->name} ({$this->fmt($p->stock)} restant" . ($p->stock > 1 ? 's' : '') . ')')->implode(', ');
            $more = $low->count() > 5 ? ' …' : '';
            $this->notifyAll(
                'Stock critique (récapitulatif)',
                "{$low->count()} article" . ($low->count() > 1 ? 's' : '') . " en stock critique : {$names}{$more}.",
                'warning', null, 'Système', 'stock',
            );
        }

        // 2. Produits périmés encore en stock
        $expired = Product::where('stock', '>', 0)->whereNotNull('expiry_date')
            ->whereDate('expiry_date', '<', $today)->orderBy('name')->get();
        if ($expired->isNotEmpty() && ! $already('Produits périmés détectés')) {
            $names = $expired->pluck('name')->implode(', ');
            $this->notifyAll(
                'Produits périmés détectés',
                "{$expired->count()} produit(s) périmé(s) nécessite(nt) une déclaration de perte : {$names}. "
                . 'Veuillez déclarer ces pertes dans le module Pertes & Péremptions.',
                'warning', null, 'Système', 'losses', null, 'losses',
            );
        }
    }

    /** Lance les contrôles quotidiens au plus une fois par jour (appelé à la connexion). */
    public function runDailyChecksOncePerDay(): void
    {
        $key = 'daily-checks:' . today()->toDateString();
        if (Cache::add($key, true, now()->endOfDay())) {
            $this->runDailyChecks();
        }
    }

    private function fmt(float|int|string $n): string
    {
        $f = (float) $n;

        return rtrim(rtrim(number_format($f, 3, '.', ''), '0'), '.');
    }
}
