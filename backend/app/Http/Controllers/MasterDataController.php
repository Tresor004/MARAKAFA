<?php

namespace App\Http\Controllers;

use App\Http\Support\Present;
use App\Models\Category;
use App\Models\Customer;
use App\Models\ShopSetting;
use App\Models\Supplier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Données de référence : clients, fournisseurs (lecture), catégories (CRUD), paramètres de la boutique.
 * Les créations / modifications de clients et fournisseurs passent par POST /api/actions.
 */
class MasterDataController extends Controller
{
    public function customers(): JsonResponse
    {
        return response()->json(Customer::withSum('sales', 'balance_due')->orderBy('name')->get()->map(fn ($c) => Present::customer($c))->values());
    }

    public function suppliers(): JsonResponse
    {
        return response()->json(Supplier::orderBy('name')->get()->map(fn ($s) => Present::supplier($s))->values());
    }

    // ── Catégories ──────────────────────────────────────────────

    public function categories(): JsonResponse
    {
        return response()->json(
            Category::withCount('products')->orderBy('name')->get()
                ->map(fn ($c) => ['id' => (string) $c->id, 'name' => $c->name, 'productsCount' => $c->products_count])
                ->values()
        );
    }

    public function storeCategory(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:100']]);
        $name = trim($data['name']);
        $this->assertNameFree($name);

        $c = Category::create(['name' => $name]);

        return response()->json(['id' => (string) $c->id, 'name' => $c->name, 'productsCount' => 0], 201);
    }

    public function updateCategory(Request $request, Category $category): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:100']]);
        $name = trim($data['name']);
        $this->assertNameFree($name, $category->id);

        $category->update(['name' => $name]);

        return response()->json(['id' => (string) $category->id, 'name' => $category->name, 'productsCount' => $category->products()->count()]);
    }

    public function destroyCategory(Category $category): JsonResponse
    {
        // Les produits de la catégorie restent en base, sans catégorie (nullOnDelete)
        $category->delete();

        return response()->json(['message' => 'Catégorie supprimée.']);
    }

    private function assertNameFree(string $name, ?int $ignoreId = null): void
    {
        $exists = Category::whereRaw('LOWER(name) = ?', [mb_strtolower($name)])
            ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))->exists();

        if ($exists) {
            throw ValidationException::withMessages(['name' => ['Cette catégorie existe déjà.']]);
        }
    }

    // ── Paramètres de la boutique ──────────────────────────────

    public function settings(): JsonResponse
    {
        return response()->json(Present::settings(ShopSetting::instance()));
    }

    /** Identité visuelle de la boutique, accessible AVANT connexion (écran de login). */
    public function publicShop(): JsonResponse
    {
        $s = ShopSetting::instance();

        return response()->json([
            'name'   => $s->name ?? 'Hi-Market',
            'type'   => $s->type ?? '',
            'slogan' => $s->slogan ?? '',
            'logo'   => $s->logo ?? '',
        ]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $d = $request->validate([
            'name'            => ['sometimes', 'required', 'string', 'max:255'],
            'type'            => ['sometimes', 'nullable', 'string', 'max:255'],
            'slogan'          => ['sometimes', 'nullable', 'string', 'max:255'],
            'logo'            => ['sometimes', 'nullable', 'string', 'max:3000000'],
            'ifu'             => ['sometimes', 'nullable', 'string', 'max:50'],
            'rccm'            => ['sometimes', 'nullable', 'string', 'max:80'],
            'phone'           => ['sometimes', 'nullable', 'string', 'max:30'],
            'phone2'          => ['sometimes', 'nullable', 'string', 'max:30'],
            'email'           => ['sometimes', 'nullable', 'email', 'max:255'],
            'website'         => ['sometimes', 'nullable', 'string', 'max:255'],
            'address'         => ['sometimes', 'nullable', 'string', 'max:1000'],
            'city'            => ['sometimes', 'nullable', 'string', 'max:100'],
            'country'         => ['sometimes', 'nullable', 'string', 'max:100'],
            'currency'        => ['sometimes', 'required', 'string', 'max:20'],
            'currencyCode'    => ['sometimes', 'required', 'string', 'max:10'],
            'taxRate'         => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'invoicePrefix'   => ['sometimes', 'required', 'string', 'max:20', 'regex:/^[A-Za-z0-9]+$/'],
            'invoiceFooter'   => ['sometimes', 'nullable', 'string', 'max:2000'],
            'thankYouMessage' => ['sometimes', 'nullable', 'string', 'max:255'],
            'maxDiscountPercent' => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'requireCashSession' => ['sometimes', 'boolean'],
            'allowCredit'        => ['sometimes', 'boolean'],
        ]);

        $map = ['currencyCode' => 'currency_code', 'taxRate' => 'tax_rate', 'invoicePrefix' => 'invoice_prefix',
                'invoiceFooter' => 'invoice_footer', 'thankYouMessage' => 'thank_you_message',
                'maxDiscountPercent' => 'max_discount_percent', 'requireCashSession' => 'require_cash_session', 'allowCredit' => 'allow_credit'];
        $cols = [];
        foreach ($d as $k => $v) {
            $cols[$map[$k] ?? $k] = ($v === '') ? null : $v;
        }

        $settings = ShopSetting::instance();
        $settings->update($cols);

        return response()->json(Present::settings($settings->fresh()));
    }
}
