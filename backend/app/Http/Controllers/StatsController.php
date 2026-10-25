<?php

namespace App\Http\Controllers;

use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\SaleReturn;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * GET /api/stats — statistiques de vente sur une période, comparées à la période précédente.
 *
 * Tous les montants sont NETS des retours. « Marge » = chiffre d'affaires HT − coût d'achat HT des articles vendus.
 */
class StatsController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $d = $request->validate([
            'from'        => ['nullable', 'date_format:Y-m-d'],
            'to'          => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
            'granularity' => ['nullable', Rule::in(['auto', 'day', 'week', 'month'])],
            'compare'     => ['nullable', Rule::in(['previous', 'year', 'none'])],
        ]);

        $to = CarbonImmutable::parse($d['to'] ?? today()->toDateString())->startOfDay();
        $from = CarbonImmutable::parse($d['from'] ?? $to->subDays(29)->toDateString())->startOfDay();
        if ($from->diffInDays($to) > 1100) {
            abort(422, 'Période trop longue (3 ans maximum).');
        }
        $days = (int) $from->diffInDays($to) + 1;
        $compare = $d['compare'] ?? 'previous';

        $gran = $d['granularity'] ?? 'auto';
        if ($gran === 'auto') {
            $gran = $days <= 45 ? 'day' : ($days <= 200 ? 'week' : 'month');
        }

        $prevTo = $compare === 'year' ? $to->subYear() : $from->subDay();
        $prevFrom = $compare === 'year' ? $from->subYear() : $prevTo->subDays($days - 1);

        $cur = $this->aggregate($from, $to);
        $prev = $compare === 'none' ? null : $this->aggregate($prevFrom, $prevTo);

        $curSeries = $this->series($cur['daily'], $from, $to, $gran);
        $prevSeries = $prev ? $this->series($prev['daily'], $prevFrom, $prevTo, $gran) : [];

        // Alignement par position : la n-ième barre de la période courante se compare à la n-ième de la précédente
        foreach ($curSeries as $i => &$point) {
            $p = $prevSeries[$i] ?? null;
            $point['previousRevenue'] = $p['revenue'] ?? null;
            $point['previousMargin'] = $p['margin'] ?? null;
            $point['previousLabel'] = $p['label'] ?? null;
        }
        unset($point);

        $totals = $cur['totals'];
        $prevTotals = $prev['totals'] ?? null;
        $delta = [];
        if ($prevTotals) {
            foreach (['revenue', 'revenueHt', 'margin', 'salesCount', 'avgBasket', 'quantity', 'discounts', 'returns'] as $k) {
                $delta[$k] = $prevTotals[$k] > 0 ? round(($totals[$k] - $prevTotals[$k]) / $prevTotals[$k] * 100, 1) : null;
            }
            $delta['marginPct'] = round($totals['marginPct'] - $prevTotals['marginPct'], 1); // en points
        }

        // Marge par catégorie, avec le chiffre d'affaires de la période précédente pour comparer
        $prevCat = $prev ? collect($prev['byCategory'])->keyBy('category') : collect();
        $byCategory = collect($cur['byCategory'])->map(function ($c) use ($prevCat, $totals) {
            $c['share'] = $totals['revenueHt'] > 0 ? round($c['revenueHt'] / $totals['revenueHt'] * 100, 1) : 0;
            $c['previousRevenueHt'] = $prevCat->has($c['category']) ? $prevCat[$c['category']]['revenueHt'] : null;

            return $c;
        })->values();

        return response()->json([
            'period'      => ['from' => $from->toDateString(), 'to' => $to->toDateString(), 'days' => $days, 'granularity' => $gran],
            'previous'    => $prev ? ['from' => $prevFrom->toDateString(), 'to' => $prevTo->toDateString()] : null,
            'totals'      => $totals,
            'previousTotals' => $prevTotals,
            'delta'       => $delta,
            'series'      => $curSeries,
            'byCategory'  => $byCategory,
            'topProducts' => $cur['topProducts'],
            'byPayment'   => $cur['byPayment'],
            'byHour'      => $cur['byHour'],
            'byCashier'   => $cur['byCashier'],
            'receivables' => round((float) Sale::sum('balance_due'), 2),
        ]);
    }

    // ═══════════════════════════════════════════════════════════════

    private function aggregate(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $f = $from->toDateString();
        $t = $to->toDateString();

        // Part « nette » d'une ligne = ce qui n'a pas été retourné
        $net = '(sale_items.quantity - sale_items.returned_quantity) / sale_items.quantity';

        $items = fn () => SaleItem::query()
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->whereNull('sales.deleted_at')
            ->whereRaw('DATE(sales.sale_date) >= ?', [$f])
            ->whereRaw('DATE(sales.sale_date) <= ?', [$t]);

        $itemSelect = "SUM(sale_items.total * {$net}) as rev, SUM(sale_items.tax_amount * {$net}) as tax, "
            . 'SUM(sale_items.unit_cost * (sale_items.quantity - sale_items.returned_quantity)) as cogs, '
            . 'SUM(sale_items.quantity - sale_items.returned_quantity) as qty, '
            . "SUM(sale_items.discount_amount * {$net}) as disc";

        $daily = [];
        foreach ($items()->selectRaw("DATE(sales.sale_date) as d, {$itemSelect}")->groupBy(DB::raw('DATE(sales.sale_date)'))->get() as $r) {
            $daily[$r->d] = ['revenue' => (float) $r->rev, 'tax' => (float) $r->tax, 'cogs' => (float) $r->cogs, 'quantity' => (float) $r->qty, 'discounts' => (float) $r->disc, 'count' => 0];
        }
        $salesRows = Sale::query()->whereRaw('DATE(sale_date) >= ?', [$f])->whereRaw('DATE(sale_date) <= ?', [$t])
            ->selectRaw('DATE(sale_date) as d, COUNT(*) as n, SUM(returned_total) as ret')->groupBy(DB::raw('DATE(sale_date)'))->get();
        foreach ($salesRows as $r) {
            $daily[$r->d] ??= ['revenue' => 0.0, 'tax' => 0.0, 'cogs' => 0.0, 'quantity' => 0.0, 'discounts' => 0.0, 'count' => 0];
            $daily[$r->d]['count'] = (int) $r->n;
        }

        $sum = fn (string $k) => array_sum(array_column($daily, $k));
        $revenue = round($sum('revenue'), 2);
        $tax = round($sum('tax'), 2);
        $cogs = round($sum('cogs'), 2);
        $revenueHt = round($revenue - $tax, 2);
        $margin = round($revenueHt - $cogs, 2);
        $count = (int) $sum('count');

        $totals = [
            'revenue'    => $revenue,
            'tax'        => $tax,
            'revenueHt'  => $revenueHt,
            'cogs'       => $cogs,
            'margin'     => $margin,
            'marginPct'  => $revenueHt > 0 ? round($margin / $revenueHt * 100, 1) : 0.0,
            'salesCount' => $count,
            'avgBasket'  => $count > 0 ? round($revenue / $count, 2) : 0.0,
            'quantity'   => round($sum('quantity'), 3),
            'discounts'  => round($sum('discounts'), 2),
            'returns'    => round((float) SaleReturn::whereRaw('DATE(return_date) >= ?', [$f])->whereRaw('DATE(return_date) <= ?', [$t])->sum('total'), 2),
        ];

        $shape = fn ($r, string $key, string $name) => (function () use ($r, $key, $name) {
            $rev = (float) $r->rev;
            $tax = (float) $r->tax;
            $cogs = (float) $r->cogs;
            $ht = round($rev - $tax, 2);

            return [
                $key         => $name,
                'revenue'    => round($rev, 2),
                'revenueHt'  => $ht,
                'cogs'       => round($cogs, 2),
                'margin'     => round($ht - $cogs, 2),
                'marginPct'  => $ht > 0 ? round(($ht - $cogs) / $ht * 100, 1) : 0.0,
                'quantity'   => round((float) $r->qty, 3),
            ];
        })();

        $byCategory = $items()
            ->leftJoin('products', 'products.id', '=', 'sale_items.product_id')
            ->leftJoin('categories', 'categories.id', '=', 'products.category_id')
            ->selectRaw("COALESCE(categories.name, 'Sans catégorie') as cat, {$itemSelect}")
            ->groupBy(DB::raw("COALESCE(categories.name, 'Sans catégorie')"))
            ->get()->map(fn ($r) => $shape($r, 'category', $r->cat))
            ->filter(fn ($c) => $c['quantity'] > 0 || $c['revenue'] > 0)
            ->sortByDesc('revenueHt')->values()->all();

        $topProducts = $items()
            ->selectRaw("sale_items.product_name as pname, {$itemSelect}")
            ->groupBy('sale_items.product_name')
            ->get()->map(fn ($r) => $shape($r, 'name', $r->pname))
            ->filter(fn ($c) => $c['quantity'] > 0)
            ->sortByDesc('revenue')->take(10)->values()->all();

        $byPayment = Sale::query()->whereRaw('DATE(sale_date) >= ?', [$f])->whereRaw('DATE(sale_date) <= ?', [$t])
            ->selectRaw('payment_method as m, COUNT(*) as n, SUM(total - returned_total) as rev')->groupBy('payment_method')->get()
            ->map(fn ($r) => ['method' => $r->m, 'count' => (int) $r->n, 'revenue' => round((float) $r->rev, 2)])
            ->sortByDesc('revenue')->values()->all();

        // Heure et caissier : calculés en PHP (la fonction « heure » diffère selon le moteur de base de données)
        $hours = array_fill(0, 24, ['count' => 0, 'revenue' => 0.0]);
        $cashiers = [];
        Sale::with('user:id,name')->whereRaw('DATE(sale_date) >= ?', [$f])->whereRaw('DATE(sale_date) <= ?', [$t])
            ->select('id', 'user_id', 'total', 'returned_total', 'created_at')->limit(50000)->get()
            ->each(function ($s) use (&$hours, &$cashiers) {
                $net = (float) $s->total - (float) $s->returned_total;
                $h = (int) ($s->created_at?->format('G') ?? 0);
                $hours[$h] = ['count' => $hours[$h]['count'] + 1, 'revenue' => $hours[$h]['revenue'] + $net];
                $name = $s->user?->name ?? '—';
                $cashiers[$name] = [
                    'name' => $name,
                    'count' => ($cashiers[$name]['count'] ?? 0) + 1,
                    'revenue' => ($cashiers[$name]['revenue'] ?? 0) + $net,
                ];
            });

        return [
            'daily'       => $daily,
            'totals'      => $totals,
            'byCategory'  => $byCategory,
            'topProducts' => $topProducts,
            'byPayment'   => $byPayment,
            'byHour'      => collect($hours)->map(fn ($v, $h) => ['hour' => $h, 'count' => $v['count'], 'revenue' => round($v['revenue'], 2)])->values()->all(),
            'byCashier'   => collect($cashiers)->map(fn ($c) => ['name' => $c['name'], 'count' => $c['count'], 'revenue' => round($c['revenue'], 2)])->sortByDesc('revenue')->values()->all(),
        ];
    }

    /** Découpe les totaux journaliers en barres (jour / semaine ISO / mois). */
    private function series(array $daily, CarbonImmutable $from, CarbonImmutable $to, string $gran): array
    {
        $buckets = [];
        for ($d = $from; $d <= $to; $d = $d->addDay()) {
            [$key, $label] = match ($gran) {
                'week'  => [$d->startOfWeek()->toDateString(), 'S' . $d->isoWeek . ' · ' . $d->startOfWeek()->format('d/m')],
                'month' => [$d->format('Y-m'), $d->locale('fr')->isoFormat('MMM YYYY')],
                default => [$d->toDateString(), $d->format('d/m')],
            };
            $row = $daily[$d->toDateString()] ?? null;
            $b = &$buckets[$key];
            $b ??= ['key' => $key, 'label' => $label, 'revenue' => 0.0, 'tax' => 0.0, 'cogs' => 0.0, 'count' => 0];
            if ($row) {
                $b['revenue'] += $row['revenue'];
                $b['tax'] += $row['tax'];
                $b['cogs'] += $row['cogs'];
                $b['count'] += $row['count'];
            }
            unset($b);
        }

        return array_values(array_map(function ($b) {
            $ht = $b['revenue'] - $b['tax'];

            return [
                'key' => $b['key'], 'label' => $b['label'], 'revenue' => round($b['revenue'], 2),
                'margin' => round($ht - $b['cogs'], 2), 'count' => $b['count'],
            ];
        }, $buckets));
    }
}
