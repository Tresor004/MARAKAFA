<?php

namespace App\Http\Controllers;

use App\Http\Support\Present;
use App\Models\Promotion;
use Illuminate\Http\JsonResponse;

/** Lecture seule : création / modification via POST /api/actions (promotion.add|update|delete). */
class PromotionController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(
            Promotion::with('category', 'product')->orderByDesc('active')->orderByDesc('id')->get()
                ->map(fn ($p) => Present::promotion($p))->values()
        );
    }
}
