<?php

namespace App\Http\Controllers;

use App\Http\Support\Present;
use App\Models\Product;
use App\Models\Sale;
use App\Services\SaleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SaleController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'from'  => ['nullable', 'date'], 'to' => ['nullable', 'date'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:5000'],
        ]);

        $sales = Sale::with('items', 'customer', 'user', 'returns.items', 'returns.user')
            ->when($request->from, fn ($q, $d) => $q->whereDate('sale_date', '>=', $d))
            ->when($request->to, fn ($q, $d) => $q->whereDate('sale_date', '<=', $d))
            ->orderByDesc('id')
            ->limit((int) $request->input('limit', 2000))
            ->get();

        return response()->json($sales->map(fn ($s) => Present::sale($s))->values());
    }

    public function show(Sale $sale): JsonResponse
    {
        return response()->json(Present::sale($sale->load('items', 'customer', 'user', 'returns.items', 'returns.user')));
    }

    /**
     * POST /api/sales — le client envoie seulement produits + quantités ; prix et totaux sont calculés ici.
     */
    public function store(Request $request, SaleService $service): JsonResponse
    {
        $d = $request->validate([
            'items'               => ['required', 'array', 'min:1', 'max:200'],
            'items.*.productId'   => ['required', 'integer'],
            'items.*.quantity'    => ['required', 'numeric', 'gt:0', 'max:999999'],
            'items.*.discountPercent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'customerId'          => ['nullable', 'integer'],
            'paymentMethod'       => ['nullable', 'string', 'max:50'],
            'paid'                => ['nullable', 'numeric', 'min:0', 'max:999999999999'],
        ]);

        $sale = $service->create(
            $request->user(),
            array_map(fn ($i) => [
                'product_id' => $i['productId'], 'quantity' => $i['quantity'], 'discount_percent' => $i['discountPercent'] ?? 0,
            ], $d['items']),
            isset($d['paid']) ? (float) $d['paid'] : null,
            $d['paymentMethod'] ?? 'Espèces',
            isset($d['customerId']) ? (int) $d['customerId'] : null,
        );

        // Renvoie aussi les stocks à jour des produits vendus (évite un rechargement complet)
        $products = Product::with('category')->whereIn('id', $sale->items->pluck('product_id')->filter())->get();

        return response()->json([
            'sale'     => Present::sale($sale->load('returns')),
            'products' => $products->map(fn ($p) => Present::product($p))->values(),
        ], 201);
    }
}
