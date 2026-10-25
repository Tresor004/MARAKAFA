<?php

namespace App\Http\Controllers;

use App\Http\Support\Present;
use App\Models\AppNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $rows = AppNotification::visibleTo($user)->orderByDesc('notified_at')->orderByDesc('id')->limit(200)->get();
        $read = DB::table('notification_reads')->where('user_id', $user->id)
            ->whereIn('notification_id', $rows->pluck('id'))->pluck('notification_id')->map(fn ($i) => (int) $i)->all();

        return response()->json($rows->map(fn ($n) => Present::notification($n, $read))->values());
    }

    public function markRead(Request $request, int $notification): JsonResponse
    {
        $user = $request->user();
        $n = AppNotification::visibleTo($user)->whereKey($notification)->firstOrFail();

        DB::table('notification_reads')->insertOrIgnore([
            'notification_id' => $n->id, 'user_id' => $user->id, 'read_at' => now(),
        ]);

        return response()->json(['ok' => true]);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $user = $request->user();

        $ids = AppNotification::visibleTo($user)
            ->whereNotIn('id', DB::table('notification_reads')->where('user_id', $user->id)->select('notification_id'))
            ->pluck('id');

        $now = now();
        foreach ($ids->chunk(200) as $chunk) {
            DB::table('notification_reads')->insertOrIgnore(
                $chunk->map(fn ($id) => ['notification_id' => $id, 'user_id' => $user->id, 'read_at' => $now])->all()
            );
        }

        return response()->json(['ok' => true]);
    }
}
