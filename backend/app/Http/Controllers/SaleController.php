<?php

namespace App\Http\Controllers;

use App\Http\Requests\SaleRequest;
use App\Http\Resources\SaleResource;
use App\Models\Sale;
use App\Services\SaleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SaleController extends Controller
{
    public function __construct(private readonly SaleService $service) {}

    public function index(Request $request)
    {
        $query = Sale::with('items.product', 'customer', 'user')
            ->orderByDesc('sale_date')
            ->orderByDesc('created_at');

        if ($request->filled('from')) {
            $query->whereDate('sale_date', '>=', $request->from);
        }
        if ($request->filled('to')) {
            $query->whereDate('sale_date', '<=', $request->to);
        }
        if ($request->filled('search')) {
            $s = $request->search;
            $query->where(fn($q) => $q->where('invoice_no', 'like', "%{$s}%")
                ->orWhereHas('customer', fn($q2) => $q2->where('name', 'like', "%{$s}%"))
            );
        }

        return SaleResource::collection($query->paginate(50));
    }

    public function store(SaleRequest $request): JsonResponse
    {
        $sale = $this->service->create(
            $request->validated('items'),
            $request->validated('paid'),
            $request->validated('payment_method', 'Espèces'),
            $request->validated('customer_id'),
        );

        return response()->json(new SaleResource($sale), 201);
    }

    public function show(Sale $sale): SaleResource
    {
        return new SaleResource($sale->load('items.product', 'customer', 'user'));
    }
}
