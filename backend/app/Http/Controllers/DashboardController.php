<?php

namespace App\Http\Controllers;

use App\Http\Support\Present;
use App\Models\Customer;
use App\Models\Loss;
use App\Models\Product;
use App\Models\Purchase;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Supplier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    /** Indicateurs agrégés côté base (aucune liste complète n'est transférée). */
    public function index(Request $request): JsonResponse
    {
        $d = $request->validate(['date' => ['nullable', 'date_format:Y-m-d']]);
        $date = $d['date'] ?? today()->toDateString();
        $weekAgo = today()->subDays(7)->toDateString();

        $day = Sale::whereDate('sale_date', $date);
        $week = Sale::whereDate('sale_date', '>=', $weekAgo);

        $top = SaleItem::query()
            ->select('product_name', DB::raw('SUM(quantity - returned_quantity) as qty'), DB::raw('SUM(total * (quantity - returned_quantity) / quantity) as total'))
            ->groupBy('product_name')->orderByDesc('total')->limit(5)->get()
            ->map(fn ($r) => ['name' => $r->product_name, 'qty' => (float) $r->qty, 'total' => (float) $r->total])->values();

        $today = today();
        $expiring = Product::whereNotNull('expiry_date')
            ->whereDate('expiry_date', '<=', $today->copy()->addDays(15))
            ->whereDate('expiry_date', '>=', $today->copy()->subDays(30))->count();

        $recent = Sale::with('items', 'customer', 'user', 'returns.items')->orderByDesc('id')->limit(6)->get();

        return response()->json([
            'date'            => $date,
            'totalRevenue'    => (float) Sale::sum(DB::raw('total - returned_total')),
            'salesCount'      => Sale::count(),
            'dayRevenue'      => (float) (clone $day)->sum(DB::raw('total - returned_total')),
            'daySalesCount'   => (clone $day)->count(),
            'weekRevenue'     => (float) (clone $week)->sum(DB::raw('total - returned_total')),
            'weekSalesCount'  => (clone $week)->count(),
            'receivables'     => (float) Sale::sum('balance_due'),
            'debtorsCount'    => Sale::where('balance_due', '>', 0.004)->distinct()->count('customer_id'),
            'purchasesTotal'  => (float) Purchase::sum('total'),
            'purchasesCount'  => Purchase::count(),
            'topProducts'     => $top,
            'lowStockCount'   => Product::whereColumn('stock', '<=', 'min_stock')->count(),
            'expiringCount'   => $expiring,
            'productsCount'   => Product::count(),
            'customersCount'  => Customer::count(),
            'suppliersCount'  => Supplier::count(),
            'lossesCount'     => Loss::count(),
            'recentSales'     => $recent->map(fn ($s) => Present::sale($s))->values(),
        ]);
    }
}
