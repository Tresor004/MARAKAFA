<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Loss;
use App\Models\Product;
use App\Models\Purchase;
use App\Models\Sale;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    /**
     * GET /api/dashboard
     * Retourne tous les KPIs pour le tableau de bord.
     */
    public function index(Request $request): JsonResponse
    {
        $date = $request->get('date', today()->toDateString());

        // ── Chiffre d'affaires ─────────────────────────────────────────────
        $totalRevenue = Sale::sum('total');

        $dateRevenue = Sale::whereDate('sale_date', $date)->sum('total');
        $dateSalesCount = Sale::whereDate('sale_date', $date)->count();

        // ── Ventes 7 derniers jours ─────────────────────────────────────────
        $weekRevenue = Sale::where('sale_date', '>=', now()->subDays(7)->toDateString())->sum('total');
        $weekSalesCount = Sale::where('sale_date', '>=', now()->subDays(7)->toDateString())->count();

        // ── Achats ─────────────────────────────────────────────────────────
        $totalPurchases = Purchase::sum('total');
        $purchasesCount = Purchase::count();

        // ── Stock ──────────────────────────────────────────────────────────
        $stockValueCost = Product::selectRaw('SUM(stock * cost) as val')->value('val') ?? 0;
        $lowStockCount  = Product::whereRaw('stock <= min_stock')->where('stock', '>', 0)->count();
        $outStockCount  = Product::where('stock', 0)->count();
        $expiringCount  = Product::whereDate('expiry_date', '<=', now()->addDays(15))
                                  ->whereDate('expiry_date', '>=', today())->count();

        // ── Top produits ───────────────────────────────────────────────────
        $topProducts = DB::table('sale_items')
            ->join('products', 'sale_items.product_id', '=', 'products.id')
            ->select(
                'sale_items.product_id',
                'sale_items.product_name',
                DB::raw('SUM(sale_items.quantity) as qty'),
                DB::raw('SUM(sale_items.total) as revenue'),
                DB::raw('SUM((sale_items.unit_price - products.cost) * sale_items.quantity) as profit'),
            )
            ->groupBy('sale_items.product_id', 'sale_items.product_name')
            ->orderByDesc('revenue')
            ->limit(5)
            ->get();

        // ── Modes de paiement ──────────────────────────────────────────────
        $paymentMethods = Sale::select('payment_method', DB::raw('COUNT(*) as count'), DB::raw('SUM(total) as total'))
            ->groupBy('payment_method')
            ->get();

        // ── Dernières ventes ───────────────────────────────────────────────
        $latestSales = Sale::with('customer', 'user')
            ->orderByDesc('sale_date')
            ->limit(6)
            ->get()
            ->map(fn($s) => [
                'id'           => $s->id,
                'invoice_no'   => $s->invoice_no,
                'date'         => $s->sale_date->format('d/m/Y'),
                'customer'     => $s->customer?->name ?? 'Client passage',
                'cashier'      => $s->user?->name,
                'total'        => $s->total,
                'payment_method' => $s->payment_method,
            ]);

        return response()->json([
            'revenue' => [
                'total'        => $totalRevenue,
                'date'         => $dateRevenue,
                'date_selected'=> $date,
                'date_count'   => $dateSalesCount,
                'week'         => $weekRevenue,
                'week_count'   => $weekSalesCount,
            ],
            'purchases' => [
                'total' => $totalPurchases,
                'count' => $purchasesCount,
            ],
            'stock' => [
                'value_cost'  => $stockValueCost,
                'low_count'   => $lowStockCount,
                'out_count'   => $outStockCount,
                'expiring'    => $expiringCount,
            ],
            'counts' => [
                'products'  => Product::count(),
                'customers' => Customer::count(),
                'suppliers' => Supplier::count(),
                'users'     => User::count(),
                'losses'    => Loss::count(),
            ],
            'top_products'    => $topProducts,
            'payment_methods' => $paymentMethods,
            'latest_sales'    => $latestSales,
        ]);
    }
}
