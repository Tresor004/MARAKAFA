<?php

namespace App\Http\Controllers;

use App\Http\Support\Present;
use App\Models\InventoryItem;
use Illuminate\Http\JsonResponse;

class InventoryController extends Controller
{
    /** Lignes d'inventaire des sessions les plus récentes. */
    public function index(): JsonResponse
    {
        $rows = InventoryItem::with('session.user')->orderByDesc('inventory_session_id')->orderBy('id')->limit(3000)->get();

        return response()->json($rows->map(fn ($i) => Present::inventoryRow($i))->values());
    }
}
