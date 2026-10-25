<?php

namespace App\Http\Controllers;

use App\Http\Support\Present;
use App\Models\Purchase;
use Illuminate\Http\JsonResponse;

class PurchaseController extends Controller
{
    public function index(): JsonResponse
    {
        $rows = Purchase::with('items', 'supplier', 'user')->orderByDesc('id')->limit(2000)->get();

        return response()->json($rows->map(fn ($p) => Present::purchase($p))->values());
    }
}
