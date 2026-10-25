<?php

namespace App\Http\Controllers;

use App\Http\Support\Present;
use App\Models\Product;
use Illuminate\Http\JsonResponse;

/**
 * Lecture seule : toute création / modification / suppression passe par POST /api/actions
 * (circuit de validation administrateur).
 */
class ProductController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(
            Product::with('category')->orderBy('name')->get()->map(fn ($p) => Present::product($p))->values()
        );
    }

    /**
     * GET /api/products/next-barcode — code EAN-13 à usage interne (préfixe 2), unique en base.
     * Sert à étiqueter les produits sans code fabricant (vrac, fabrication maison).
     */
    public function nextBarcode(): JsonResponse
    {
        for ($i = 0; $i < 20; $i++) {
            $body = '2' . str_pad((string) random_int(0, 99999999999), 11, '0', STR_PAD_LEFT);
            $sum = 0;
            foreach (str_split($body) as $idx => $digit) {
                $sum += (int) $digit * ($idx % 2 === 0 ? 1 : 3);
            }
            $code = $body . ((10 - $sum % 10) % 10);

            if (! Product::withTrashed()->where('barcode', $code)->exists()) {
                return response()->json(['barcode' => $code]);
            }
        }

        abort(503, 'Impossible de générer un code-barres unique, réessayez.');
    }

    public function show(Product $product): JsonResponse
    {
        return response()->json(Present::product($product->load('category')));
    }
}
