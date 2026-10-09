<?php

namespace App\Http\Controllers;

use App\Models\AppNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    /**
     * GET /api/notifications
     * Retourne les notifications de l'utilisateur connecté :
     *   - Les notifications personnelles (user_id = moi)
     *   - Les notifications générales (user_id = null, scope = general)
     */
    public function index(Request $request)
    {
        $userId = $request->user()->id;

        $notifications = AppNotification::where(function ($q) use ($userId) {
            $q->where('user_id', $userId)
              ->orWhere(fn($q2) => $q2->whereNull('user_id')->where('scope', 'general'));
        })
        ->orderByDesc('notified_at')
        ->paginate(100);

        return response()->json($notifications);
    }

    /**
     * POST /api/notifications/mark-all-read
     */
    public function markAllRead(Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        AppNotification::where(function ($q) use ($userId) {
            $q->where('user_id', $userId)
              ->orWhere(fn($q2) => $q2->whereNull('user_id')->where('scope', 'general'));
        })->update(['is_read' => true]);

        return response()->json(['message' => 'Toutes les notifications ont été marquées comme lues.']);
    }

    /**
     * PATCH /api/notifications/{id}/read
     */
    public function markRead(Request $request, AppNotification $notification): JsonResponse
    {
        // Vérifie que la notification appartient à cet utilisateur
        $userId = $request->user()->id;
        abort_unless(
            $notification->user_id === $userId || $notification->scope === 'general',
            403
        );

        $notification->update(['is_read' => true]);
        return response()->json(['message' => 'Notification marquée comme lue.']);
    }

    /**
     * GET /api/notifications/unread-count
     */
    public function unreadCount(Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        $count = AppNotification::where('is_read', false)
            ->where(function ($q) use ($userId) {
                $q->where('user_id', $userId)
                  ->orWhere(fn($q2) => $q2->whereNull('user_id')->where('scope', 'general'));
            })
            ->count();

        return response()->json(['count' => $count]);
    }
}
