<?php

namespace App\Http\Controllers;

use App\Http\Support\Present;
use App\Models\StockMovement;
use App\Services\StockService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** GET /api/stock-movements — journal des mouvements de stock (filtrable, paginé). */
class StockMovementController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $f = $request->validate([
            'productId' => ['nullable', 'integer'],
            'type'      => ['nullable', Rule::in(StockService::TYPES)],
            'from'      => ['nullable', 'date'],
            'to'        => ['nullable', 'date'],
            'q'         => ['nullable', 'string', 'max:100'],
            'page'      => ['nullable', 'integer', 'min:1'],
            'perPage'   => ['nullable', 'integer', 'min:1', 'max:200'],
        ]);

        $query = StockMovement::query()
            ->when($f['productId'] ?? null, fn ($q, $v) => $q->where('product_id', $v))
            ->when($f['type'] ?? null, fn ($q, $v) => $q->where('type', $v))
            ->when($f['from'] ?? null, fn ($q, $v) => $q->whereDate('created_at', '>=', $v))
            ->when($f['to'] ?? null, fn ($q, $v) => $q->whereDate('created_at', '<=', $v))
            ->when($f['q'] ?? null, fn ($q, $v) => $q->where(function ($w) use ($v) {
                $like = '%' . str_replace(['%', '_'], ['\%', '\_'], $v) . '%';
                $w->where('product_name', 'like', $like)->orWhere('reason', 'like', $like)
                    ->orWhere('reference_label', 'like', $like)->orWhere('user_name', 'like', $like);
            }));

        $page = $query->orderByDesc('id')->paginate((int) ($f['perPage'] ?? 50), ['*'], 'page', (int) ($f['page'] ?? 1));

        return response()->json([
            'data'     => collect($page->items())->map(fn ($m) => Present::stockMovement($m))->values(),
            'total'    => $page->total(),
            'page'     => $page->currentPage(),
            'lastPage' => $page->lastPage(),
        ]);
    }
}
