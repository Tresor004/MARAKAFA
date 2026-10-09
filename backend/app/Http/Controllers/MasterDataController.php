<?php

namespace App\Http\Controllers;

use App\Models\Category;
use App\Models\Customer;
use App\Models\ShopSetting;
use App\Models\Supplier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MasterDataController extends Controller
{
    public function customers(): JsonResponse
    {
        return response()->json(Customer::orderBy('name')->get());
    }

    public function storeCustomer(Request $request): JsonResponse
    {
        $data = $request->validate($this->customerRules());
        return response()->json(Customer::create($data), 201);
    }

    public function updateCustomer(Request $request, Customer $customer): JsonResponse
    {
        $customer->update($request->validate($this->customerRules(false)));
        return response()->json($customer->fresh());
    }

    public function destroyCustomer(Customer $customer): JsonResponse
    {
        $customer->delete();
        return response()->json(['message' => 'Client supprimé.']);
    }

    public function suppliers(): JsonResponse
    {
        return response()->json(Supplier::orderBy('name')->get());
    }

    public function storeSupplier(Request $request): JsonResponse
    {
        $data = $request->validate($this->supplierRules());
        return response()->json(Supplier::create($data), 201);
    }

    public function updateSupplier(Request $request, Supplier $supplier): JsonResponse
    {
        $supplier->update($request->validate($this->supplierRules(false)));
        return response()->json($supplier->fresh());
    }

    public function destroySupplier(Supplier $supplier): JsonResponse
    {
        $supplier->delete();
        return response()->json(['message' => 'Fournisseur supprimé.']);
    }

    public function categories(): JsonResponse
    {
        return response()->json(Category::orderBy('name')->get());
    }

    public function storeCategory(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:100', 'unique:categories,name']]);
        return response()->json(Category::create($data), 201);
    }

    public function updateCategory(Request $request, Category $category): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:100', Rule::unique('categories')->ignore($category->id)]]);
        $category->update($data);
        return response()->json($category->fresh());
    }

    public function destroyCategory(Category $category): JsonResponse
    {
        abort_if($category->products()->exists(), 409, 'Une catégorie contenant des produits ne peut pas être supprimée.');
        $category->delete();
        return response()->json(['message' => 'Catégorie supprimée.']);
    }

    public function settings(): JsonResponse
    {
        return response()->json(ShopSetting::instance());
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $settings = ShopSetting::instance();
        $settings->update($request->validate([
            'name' => ['sometimes', 'string', 'max:255'], 'type' => ['nullable', 'string', 'max:255'],
            'slogan' => ['nullable', 'string', 'max:255'], 'ifu' => ['nullable', 'string', 'max:50'],
            'rccm' => ['nullable', 'string', 'max:80'], 'phone' => ['nullable', 'string', 'max:30'],
            'phone2' => ['nullable', 'string', 'max:30'], 'email' => ['nullable', 'email'],
            'website' => ['nullable', 'url'], 'address' => ['nullable', 'string'],
            'city' => ['nullable', 'string', 'max:100'], 'country' => ['nullable', 'string', 'max:100'],
            'currency' => ['nullable', 'string', 'max:20'], 'currency_code' => ['nullable', 'string', 'max:10'],
            'tax_rate' => ['nullable', 'numeric', 'min:0', 'max:100'], 'invoice_prefix' => ['nullable', 'string', 'max:20'],
            'invoice_footer' => ['nullable', 'string'], 'thank_you_message' => ['nullable', 'string', 'max:255'],
        ]));
        return response()->json($settings->fresh());
    }

    private function customerRules(bool $required = true): array
    {
        return [
            'name' => [$required ? 'required' : 'sometimes', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'], 'email' => ['nullable', 'email', 'max:255'],
            'address' => ['nullable', 'string'], 'total_purchases' => ['nullable', 'numeric', 'min:0'],
        ];
    }

    private function supplierRules(bool $required = true): array
    {
        return [
            'name' => [$required ? 'required' : 'sometimes', 'string', 'max:255'],
            'contact' => ['nullable', 'string', 'max:255'], 'phone' => ['nullable', 'string', 'max:30'],
            'email' => ['nullable', 'email', 'max:255'], 'address' => ['nullable', 'string'],
        ];
    }
}
