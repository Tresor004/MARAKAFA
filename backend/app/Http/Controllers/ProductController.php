<?php

namespace App\Http\Controllers;

use App\Http\Requests\ProductRequest;
use App\Http\Resources\ProductResource;
use App\Models\Product;
use App\Services\NotificationService;
use App\Services\PendingActionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ProductController extends Controller
{
    public function __construct(
        private readonly PendingActionService $pending,
        private readonly NotificationService  $notif,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $query = Product::with('category');

        if ($request->filled('search')) {
            $q = $request->search;
            $query->where(fn($q2) => $q2->where('name', 'like', "%{$q}%")
                                        ->orWhere('barcode', 'like', "%{$q}%"));
        }

        if ($request->filled('category_id')) {
            $query->where('category_id', $request->category_id);
        }

        if ($request->filter === 'low') {
            $query->whereRaw('stock <= min_stock')->where('stock', '>', 0);
        } elseif ($request->filter === 'out') {
            $query->where('stock', 0);
        } elseif ($request->filter === 'expiring') {
            $query->whereDate('expiry_date', '<=', now()->addDays(15));
        }

        return ProductResource::collection($query->orderBy('name')->get());
    }

    public function store(ProductRequest $request): JsonResponse
    {
        $user = $request->user();

        if ($user->isAdmin()) {
            $product = Product::create($request->validated());
            $this->notif->notifyAll(
                'Nouveau produit',
                "Le produit « {$product->name} » a été ajouté au catalogue par {$user->name}.",
                'info',
                $user->id,
                $user->name,
            );
            return response()->json(new ProductResource($product->load('category')), 201);
        }

        $pa = $this->pending->submit(
            'product.add', 'Produits', 'Ajouter un produit',
            "Ajout de « {$request->name} »",
            ['produit' => $request->name, 'prix' => $request->price],
            $request->validated(),
        );
        return response()->json(['pending' => true, 'action_id' => $pa->id, 'message' => 'Demande soumise pour validation.'], 202);
    }

    public function show(Product $product): ProductResource
    {
        return new ProductResource($product->load('category'));
    }

    public function update(ProductRequest $request, Product $product): JsonResponse
    {
        $user = $request->user();

        if ($user->isAdmin()) {
            $product->update($request->validated());
            return response()->json(new ProductResource($product->fresh('category')));
        }

        $pa = $this->pending->submit(
            'product.update', 'Produits', 'Modifier un produit',
            "Modification de « {$product->name} »",
            ['produit' => $product->name],
            ['id' => $product->id, 'data' => $request->validated()],
        );
        return response()->json(['pending' => true, 'action_id' => $pa->id], 202);
    }

    public function destroy(Request $request, Product $product): JsonResponse
    {
        $user = $request->user();

        if ($user->isAdmin()) {
            $product->delete();
            $this->notif->notifyAll(
                'Produit supprimé',
                "Le produit « {$product->name} » a été supprimé du catalogue par {$user->name}.",
                'info',
                $user->id,
                $user->name,
            );
            return response()->json(['message' => 'Produit supprimé.']);
        }

        $pa = $this->pending->submit(
            'product.delete', 'Produits', 'Supprimer un produit',
            "Suppression de « {$product->name} »",
            ['produit' => $product->name],
            ['id' => $product->id],
        );
        return response()->json(['pending' => true, 'action_id' => $pa->id], 202);
    }
}
