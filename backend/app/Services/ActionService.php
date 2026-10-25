<?php

namespace App\Services;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Loss;
use App\Models\Product;
use App\Models\Promotion;
use App\Models\Purchase;
use App\Models\Sale;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Catalogue des opérations « soumises à validation » (équivalent serveur du requestOrExec du front).
 *
 *  - un administrateur exécute directement ;
 *  - un employé crée une demande (PendingAction) que l'administrateur approuve ou refuse.
 *
 * Les charges utiles (payload) reprennent le format de l'interface : camelCase, catégorie par son nom.
 * Chaque charge est RE-VALIDÉE au moment de l'exécution (un payload en attente a pu devenir obsolète).
 */
class ActionService
{
    /** kind => [permission requise, ressources à rafraîchir côté interface] */
    public const CATALOG = [
        'product.add'     => ['products',  ['products', 'categories']],
        'product.update'  => ['products',  ['products', 'categories']],
        'product.delete'  => ['products',  ['products']],
        'customer.add'    => ['customers', ['customers']],
        'customer.update' => ['customers', ['customers']],
        'customer.delete' => ['customers', ['customers']],
        'supplier.add'    => ['suppliers', ['suppliers']],
        'supplier.update' => ['suppliers', ['suppliers']],
        'supplier.delete' => ['suppliers', ['suppliers']],
        'user.add'        => ['users',     ['users']],
        'user.update'     => ['users',     ['users']],
        'user.delete'     => ['users',     ['users']],
        'loss.add'        => ['losses',    ['losses', 'products']],
        'loss.delete'     => ['losses',    ['losses', 'products']],
        'stock.adjust'    => ['stock',     ['products']],
        'inventory.do'    => ['inventory', ['inventory', 'products']],
        'purchase.add'    => ['purchases', ['purchases', 'products']],
        'purchase.update' => ['purchases', ['purchases', 'products']],
        'purchase.delete' => ['purchases', ['purchases', 'products']],
        'profile.update'  => ['myspace',   ['users', 'me']],
        'sale.return'      => ['sales',    ['sales', 'products', 'customers', 'cashSession']],
        'promotion.add'    => ['products', ['promotions']],
        'promotion.update' => ['products', ['promotions']],
        'promotion.delete' => ['products', ['promotions']],
    ];

    /** Opérations dont le résultat est annoncé à toute l'équipe (comme dans l'interface). */
    private const BROADCAST = [
        'product.add', 'product.update', 'product.delete',
        'customer.add', 'customer.delete',
        'supplier.add', 'supplier.delete',
        'purchase.add', 'promotion.add',
    ];

    private const PAGE = [
        'product' => 'products', 'stock' => 'stock', 'customer' => 'customers', 'supplier' => 'suppliers',
        'purchase' => 'purchases', 'loss' => 'losses', 'inventory' => 'inventory', 'user' => 'users', 'profile' => 'myspace',
        'sale' => 'sales', 'promotion' => 'products',
    ];

    public function __construct(
        protected StockService $stock,
        protected PurchaseService $purchases,
        protected LossService $losses,
        protected InventoryService $inventories,
        protected ReturnService $returns,
        protected NotificationService $notif,
    ) {}

    public static function kinds(): array
    {
        return array_keys(self::CATALOG);
    }

    public static function permissionFor(string $kind): string
    {
        return self::CATALOG[$kind][0];
    }

    public static function affects(string $kind): array
    {
        return self::CATALOG[$kind][1] ?? [];
    }

    public static function pageFor(string $kind): string
    {
        return self::PAGE[explode('.', $kind)[0]] ?? 'dashboard';
    }

    /**
     * Vérifie que $actor a le droit de demander/exécuter $kind avec ce payload.
     * (Validation légère à la demande ; la validation complète a lieu à l'exécution.)
     */
    public function authorize(User $actor, string $kind, array $payload): void
    {
        // Chacun peut demander la modification de son propre profil, quel que soit son rôle
        if ($kind !== 'profile.update' && ! $actor->hasPermission(self::permissionFor($kind))) {
            abort(403, 'Vous n\'avez pas accès à cette fonctionnalité.');
        }

        // Le profil ne peut être modifié que par son propriétaire
        if ($kind === 'profile.update' && (int) ($payload['id'] ?? 0) !== $actor->id) {
            abort(403, 'Vous ne pouvez modifier que votre propre profil.');
        }
    }

    /**
     * Exécute l'opération. $author = employé à l'origine de la demande (auteur des bons, pertes, inventaires).
     * $approver = administrateur qui valide, ou null si l'auteur exécute lui-même.
     */
    public function execute(string $kind, array $payload, User $author, ?User $approver = null, string $description = ''): void
    {
        DB::transaction(function () use ($kind, $payload, $author, $approver, $description) {
            match ($kind) {
                'product.add'     => $this->productAdd($payload, $author),
                'product.update'  => $this->productUpdate($payload, $author),
                'product.delete'  => $this->productDelete($payload),
                'customer.add'    => $this->customerAdd($payload),
                'customer.update' => $this->customerUpdate($payload),
                'customer.delete' => $this->customerDelete($payload),
                'supplier.add'    => $this->simpleAdd(Supplier::class, $this->supplierRules(), $payload),
                'supplier.update' => $this->simpleUpdate(Supplier::class, $this->supplierRules(true), $payload),
                'supplier.delete' => $this->supplierDelete($payload),
                'user.add'        => $this->userAdd($payload),
                'user.update'     => $this->userUpdate($payload, $author, $approver),
                'user.delete'     => $this->userDelete($payload, $approver ?? $author),
                'loss.add'        => $this->lossAdd($payload, $author),
                'loss.delete'     => $this->lossDelete($payload, $author),
                'stock.adjust'    => $this->stockAdjust($payload, $author),
                'inventory.do'    => $this->inventoryDo($payload, $author),
                'purchase.add'    => $this->purchaseAdd($payload, $author),
                'purchase.update' => $this->purchaseUpdate($payload, $author),
                'purchase.delete' => $this->purchaseDelete($payload, $author),
                'profile.update'  => $this->profileUpdate($payload, $author),
                'sale.return'      => $this->saleReturn($payload, $author),
                'promotion.add'    => $this->promotionSave($payload, null),
                'promotion.update' => $this->promotionSave($payload['data'] ?? [], $this->find(Promotion::class, $payload['id'] ?? null, 'Promotion')),
                'promotion.delete' => $this->find(Promotion::class, $payload['id'] ?? null, 'Promotion')->delete(),
            };
        });

        $this->announce($kind, $payload, $author, $approver, $description);
    }

    // ═════════════════════════ Notifications liées aux actions ═════════════════════════

    private function announce(string $kind, array $payload, User $author, ?User $approver, string $description): void
    {
        $page = self::pageFor($kind);
        $by = $approver ?? $author;

        if (in_array($kind, self::BROADCAST, true)) {
            [$module, $verb] = $this->labels($kind);
            $suffix = $approver && $approver->id !== $author->id
                ? "demandé par {$author->name}, approuvé par {$approver->name}"
                : "par {$author->name}";
            $this->notif->notifyAll(
                "{$module} — {$verb}",
                ($description !== '' ? $description : "{$module} : {$verb}") . " ({$suffix}).",
                'info', $by->id, $by->name, $page,
            );
        }

        // L'employé dont l'administrateur a modifié le compte est prévenu personnellement
        if ($kind === 'user.update' && ($id = (int) ($payload['id'] ?? 0)) && $id !== $by->id) {
            $this->notif->notifyUser(
                $id, 'Votre profil a été modifié',
                "Des informations de votre compte ont été mises à jour par {$by->name}.",
                'info', $by->id, $by->name, 'myspace',
            );
        }
    }

    private function labels(string $kind): array
    {
        return match ($kind) {
            'product.add' => ['Produits', 'Ajouter un produit'], 'product.update' => ['Produits', 'Modifier un produit'],
            'product.delete' => ['Produits', 'Supprimer un produit'], 'customer.add' => ['Clients', 'Ajouter un client'],
            'customer.delete' => ['Clients', 'Supprimer un client'], 'supplier.add' => ['Fournisseurs', 'Ajouter un fournisseur'],
            'supplier.delete' => ['Fournisseurs', 'Supprimer un fournisseur'], 'purchase.add' => ['Achats', 'Nouvel achat fournisseur'],
            'promotion.add' => ['Promotions', 'Nouvelle promotion'],
            default => ['Général', $kind],
        };
    }

    // ═════════════════════════ Produits ═════════════════════════

    private function productRules(bool $partial = false, ?int $ignoreId = null): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return [
            'name'        => [$req, 'string', 'max:255'],
            'category'    => ['sometimes', 'nullable', 'string', 'max:100'],
            'price'       => [$req, 'numeric', 'min:0', 'max:999999999999'],
            'taxRate'     => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
            'cost'        => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:999999999999'],
            'stock'       => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:999999999'],
            'minStock'    => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:999999999'],
            'unit'        => ['sometimes', 'nullable', 'string', 'max:30'],
            'barcode'     => ['sometimes', 'nullable', 'string', 'max:50', Rule::unique('products', 'barcode')->ignore($ignoreId)],
            'expiryDate'  => ['sometimes', 'nullable', 'date'],
        ];
    }

    private function productColumns(array $d): array
    {
        $out = [];
        foreach (['name', 'price', 'cost', 'unit'] as $f) {
            if (array_key_exists($f, $d) && $d[$f] !== null) {
                $out[$f] = is_string($d[$f]) ? trim($d[$f]) : $d[$f];
            }
        }
        // Le stock n'est jamais écrit ici : il passe par StockService (journal des mouvements)
        if (array_key_exists('taxRate', $d)) {
            $out['tax_rate'] = ($d['taxRate'] === null || $d['taxRate'] === '') ? null : round((float) $d['taxRate'], 2);
        }
        if (array_key_exists('minStock', $d) && $d['minStock'] !== null) {
            $out['min_stock'] = round((float) $d['minStock'], 3);
        }
        if (array_key_exists('barcode', $d)) {
            $out['barcode'] = ($d['barcode'] === null || trim((string) $d['barcode']) === '') ? null : trim($d['barcode']);
        }
        if (array_key_exists('expiryDate', $d)) {
            $out['expiry_date'] = ($d['expiryDate'] === null || $d['expiryDate'] === '') ? null : $d['expiryDate'];
        }
        if (! empty($d['category'])) {
            $out['category_id'] = Category::firstOrCreate(['name' => trim($d['category'])])->id;
        }

        return $out;
    }

    private function productAdd(array $p, User $author): void
    {
        $d = Validator::make($p, $this->productRules())->validate();
        $product = Product::create($this->productColumns($d));

        $initial = round((float) ($d['stock'] ?? 0), 3);
        if ($initial > 0) {
            $this->stock->increase($product->id, $initial, [
                'type' => 'initial', 'user' => $author, 'reason' => 'Stock initial à la création du produit',
                'ref_type' => 'product', 'ref_id' => $product->id,
            ]);
        }
    }

    private function productUpdate(array $p, User $author): void
    {
        $product = $this->find(Product::class, $p['id'] ?? null, 'Produit');
        $d = Validator::make($p['data'] ?? [], $this->productRules(true, $product->id))->validate();
        $product->update($this->productColumns($d));

        if (array_key_exists('stock', $d) && $d['stock'] !== null) {
            $this->stock->set($product->id, (float) $d['stock'], [
                'type' => 'adjustment', 'user' => $author, 'reason' => 'Correction depuis la fiche produit',
                'ref_type' => 'product', 'ref_id' => $product->id,
            ]);
        }
    }

    private function productDelete(array $p): void
    {
        $product = $this->find(Product::class, $p['id'] ?? null, 'Produit');
        // Libère le code-barres (contrainte d'unicité) pour pouvoir recréer le produit plus tard
        $product->update(['barcode' => null]);
        $product->delete();
    }

    // ═════════════════════════ Clients / fournisseurs ═════════════════════════

    private function customerRules(bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return [
            'name'    => [$req, 'string', 'max:255'],
            'phone'   => ['sometimes', 'nullable', 'string', 'max:30'],
            'email'   => ['sometimes', 'nullable', 'email', 'max:255'],
            'address' => ['sometimes', 'nullable', 'string', 'max:1000'],
        ];
    }

    private function customerExtraRules(): array
    {
        return ['creditLimit' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:999999999999']];
    }

    private function customerColumns(array $d): array
    {
        $out = collect($d)->except('creditLimit')->all();
        if (array_key_exists('creditLimit', $d)) {
            $out['credit_limit'] = ($d['creditLimit'] === null || $d['creditLimit'] === '') ? null : round((float) $d['creditLimit'], 2);
        }

        return $out;
    }

    private function customerAdd(array $p): void
    {
        $d = Validator::make($p, $this->customerRules() + $this->customerExtraRules())->validate();
        Customer::create($this->customerColumns($d));
    }

    private function customerUpdate(array $p): void
    {
        $row = $this->find(Customer::class, $p['id'] ?? null, 'Client');
        $d = Validator::make($p['data'] ?? [], $this->customerRules(true) + $this->customerExtraRules())->validate();
        $row->update($this->customerColumns($d));
    }

    private function supplierRules(bool $partial = false): array
    {
        return $this->customerRules($partial) + ['contact' => ['sometimes', 'nullable', 'string', 'max:255']];
    }

    private function simpleAdd(string $model, array $rules, array $p): void
    {
        $model::create(Validator::make($p, $rules)->validate());
    }

    private function simpleUpdate(string $model, array $rules, array $p): void
    {
        $row = $this->find($model, $p['id'] ?? null, 'Élément');
        $row->update(Validator::make($p['data'] ?? [], $rules)->validate());
    }

    private function customerDelete(array $p): void
    {
        $this->find(Customer::class, $p['id'] ?? null, 'Client')->delete();
    }

    private function supplierDelete(array $p): void
    {
        $supplier = $this->find(Supplier::class, $p['id'] ?? null, 'Fournisseur');
        if (Purchase::where('supplier_id', $supplier->id)->exists()) {
            throw ValidationException::withMessages(['supplier' => ['Ce fournisseur a des bons d\'achat : suppression impossible.']]);
        }
        $supplier->delete();
    }

    // ═════════════════════════ Employés ═════════════════════════

    private function userRules(bool $partial = false, ?int $ignoreId = null): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return [
            'name'     => [$req, 'string', 'max:255'],
            'email'    => [$req, 'email', 'max:255', Rule::unique('users', 'email')->ignore($ignoreId)],
            'phone'    => ['sometimes', 'nullable', 'string', 'max:30'],
            'password' => [$partial ? 'sometimes' : 'required', 'nullable', 'string', 'min:6', 'max:100'],
            'role'     => [$req, 'integer', 'exists:roles,id'],
            'active'   => ['sometimes', 'boolean'],
            'avatar'   => ['sometimes', 'nullable', 'string', 'max:3000000'],
        ];
    }

    private function userColumns(array $d): array
    {
        $out = [];
        foreach (['name', 'email', 'phone', 'active', 'avatar'] as $f) {
            if (array_key_exists($f, $d)) {
                $out[$f] = $d[$f] === '' ? null : $d[$f];
            }
        }
        $out['name'] = isset($out['name']) ? trim($out['name']) : null;
        if ($out['name'] === null) {
            unset($out['name']);
        }
        if (isset($out['email'])) {
            $out['email'] = mb_strtolower(trim($out['email']));
        }
        if (array_key_exists('active', $out)) {
            $out['active'] = (bool) $out['active'];
        }
        if (isset($d['role'])) {
            $out['role_id'] = (int) $d['role'];
        }
        if (! empty($d['password'])) {
            $out['password'] = $d['password']; // haché par le cast « hashed »
        }

        return $out;
    }

    private function userAdd(array $p): void
    {
        $d = Validator::make($p, $this->userRules())->validate();
        User::create($this->userColumns($d) + ['active' => true]);
    }

    private function userUpdate(array $p, User $author, ?User $approver): void
    {
        $user = $this->find(User::class, $p['id'] ?? null, 'Employé');
        $d = Validator::make($p['data'] ?? [], $this->userRules(true, $user->id))->validate();
        $cols = $this->userColumns($d);

        // Protection : on ne peut pas retirer le dernier administrateur actif
        if ($user->isAdmin()) {
            $losesAdmin = isset($cols['role_id']) && ! Role::whereKey($cols['role_id'])->where('slug', 'admin')->exists();
            $deactivates = array_key_exists('active', $cols) && $cols['active'] === false;
            if (($losesAdmin || $deactivates) && $this->activeAdminCount() <= 1) {
                throw ValidationException::withMessages(['user' => ['Impossible : c\'est le dernier administrateur actif.']]);
            }
        }

        $user->update($cols);

        // Un compte désactivé ou dont le mot de passe change est déconnecté partout
        if ((array_key_exists('active', $cols) && ! $cols['active']) || isset($cols['password'])) {
            $user->tokens()->delete();
        }
    }

    private function userDelete(array $p, User $by): void
    {
        $user = $this->find(User::class, $p['id'] ?? null, 'Employé');

        if ($user->id === $by->id) {
            throw ValidationException::withMessages(['user' => ['Vous ne pouvez pas supprimer votre propre compte.']]);
        }
        if ($user->isAdmin() && $this->activeAdminCount() <= 1) {
            throw ValidationException::withMessages(['user' => ['Impossible : c\'est le dernier administrateur actif.']]);
        }

        $user->tokens()->delete();
        // Suppression douce (l'historique des ventes reste lisible) ; l'email est libéré pour une réutilisation.
        $user->update(['active' => false, 'email' => "deleted+{$user->id}+" . time() . '@invalid.local']);
        $user->delete();
    }

    private function activeAdminCount(): int
    {
        return User::where('active', true)->whereHas('role', fn ($q) => $q->where('slug', 'admin'))->count();
    }

    private function profileUpdate(array $p, User $author): void
    {
        $user = $this->find(User::class, $p['id'] ?? null, 'Employé');
        if ($user->id !== $author->id) {
            abort(403, 'Vous ne pouvez modifier que votre propre profil.');
        }

        // Le profil ne permet de changer ni le rôle ni le statut
        $rules = collect($this->userRules(true, $user->id))->only(['name', 'email', 'phone', 'password', 'avatar'])->all();
        $d = Validator::make($p['data'] ?? [], $rules)->validate();
        $user->update($this->userColumns($d));

        if (! empty($d['password'])) {
            // Les autres appareils sont déconnectés (la session courante est recréée par le client)
            $user->tokens()->where('id', '!=', $user->currentAccessToken()?->id)->delete();
        }
    }

    // ═════════════════════════ Pertes / stock / inventaire ═════════════════════════

    private function lossAdd(array $p, User $author): void
    {
        $d = Validator::make($p, [
            'productId' => ['required', 'integer', 'exists:products,id'],
            'quantity'  => ['required', 'numeric', 'gt:0', 'max:999999999'],
            'reason'    => ['required', 'string', 'max:100'],
            'date'      => ['sometimes', 'nullable', 'date'],
        ])->validate();

        $this->losses->create($author, (int) $d['productId'], (float) $d['quantity'], $d['reason'], $d['date'] ?? null);
    }

    private function lossDelete(array $p, User $author): void
    {
        $this->losses->delete($this->find(Loss::class, $p['id'] ?? null, 'Perte'), $author);
    }

    private function stockAdjust(array $p, User $author): void
    {
        $d = Validator::make($p, [
            'productId' => ['required', 'integer', 'exists:products,id'],
            'delta'     => ['required', 'numeric', 'between:-999999999,999999999'],
            'reason'    => ['sometimes', 'nullable', 'string', 'max:200'],
        ])->validate();

        $this->stock->adjust((int) $d['productId'], (float) $d['delta'], [
            'type' => 'adjustment', 'user' => $author,
            'reason' => ! empty($d['reason']) ? $d['reason'] : 'Ajustement manuel du stock',
        ]);
    }

    private function inventoryDo(array $p, User $author): void
    {
        $d = Validator::make($p, [
            'period'             => ['required', 'string', Rule::in(['Semaine', 'Mois'])],
            'counts'             => ['required', 'array', 'min:1'],
            'counts.*.productId' => ['required', 'integer'],
            'counts.*.actual'    => ['required', 'numeric', 'min:0'],
        ])->validate();

        $counts = array_map(fn ($c) => ['product_id' => $c['productId'], 'actual' => $c['actual']], $d['counts']);
        $this->inventories->process($author, $counts, $d['period']);
    }

    // ═════════════════════════ Achats ═════════════════════════

    private function purchaseItemRules(string $prefix = ''): array
    {
        return [
            $prefix . 'items'             => ['required', 'array', 'min:1', 'max:500'],
            $prefix . 'items.*.productId' => ['nullable', 'integer'],
            $prefix . 'items.*.name'      => ['nullable', 'string', 'max:255'],
            $prefix . 'items.*.quantity'  => ['required', 'numeric', 'gt:0', 'max:999999999'],
            $prefix . 'items.*.price'     => ['required', 'numeric', 'min:0', 'max:999999999999'],
            $prefix . 'items.*.taxRate'   => ['nullable', 'numeric', 'min:0', 'max:100'],
            $prefix . 'items.*.priceMode' => ['nullable', Rule::in(['ht', 'ttc'])],
        ];
    }

    private function purchaseItems(array $items): array
    {
        return array_map(fn ($i) => [
            'product_id'   => $i['productId'] ?? null,
            'product_name' => $i['name'] ?? '',
            'quantity'     => $i['quantity'],
            'unit_price'   => $i['price'],
            'tax_rate'     => $i['taxRate'] ?? 0,
            'price_mode'   => $i['priceMode'] ?? 'ht',
        ], $items);
    }

    private function purchaseAdd(array $p, User $author): void
    {
        $d = Validator::make($p, ['supplierId' => ['required', 'integer']] + $this->purchaseItemRules())->validate();
        $this->purchases->create($author, (int) $d['supplierId'], $this->purchaseItems($d['items']));
    }

    private function purchaseUpdate(array $p, User $author): void
    {
        $purchase = $this->find(Purchase::class, $p['id'] ?? null, 'Bon d\'achat');
        $d = Validator::make($p['data'] ?? [], ['supplierId' => ['required', 'integer']] + $this->purchaseItemRules())->validate();
        $this->purchases->update($purchase, (int) $d['supplierId'], $this->purchaseItems($d['items']), $author);
    }

    private function purchaseDelete(array $p, User $author): void
    {
        $this->purchases->delete($this->find(Purchase::class, $p['id'] ?? null, 'Bon d\'achat'), $author);
    }

    // ═════════════════════════ Retours de vente ═════════════════════════

    private function saleReturn(array $p, User $author): void
    {
        $d = Validator::make($p, [
            'saleId'              => ['required', 'integer'],
            'items'               => ['required', 'array', 'min:1', 'max:200'],
            'items.*.saleItemId'  => ['required', 'integer'],
            'items.*.quantity'    => ['required', 'numeric', 'gt:0', 'max:999999'],
            'restock'             => ['sometimes', 'boolean'],
            'refundMethod'        => ['sometimes', 'nullable', 'string', 'max:50'],
            'reason'              => ['sometimes', 'nullable', 'string', 'max:255'],
        ])->validate();

        $sale = $this->find(Sale::class, $d['saleId'], 'Vente');
        $this->returns->create(
            $author, $sale,
            array_map(fn ($i) => ['sale_item_id' => $i['saleItemId'], 'quantity' => $i['quantity']], $d['items']),
            (bool) ($d['restock'] ?? true), $d['refundMethod'] ?? null, $d['reason'] ?? null,
        );
    }

    // ═════════════════════════ Promotions ═════════════════════════

    private function promotionSave(array $data, ?Promotion $existing): void
    {
        $req = $existing ? 'sometimes' : 'required';
        $d = Validator::make($data, [
            'name'        => [$req, 'string', 'max:255'],
            'type'        => [$req, Rule::in(['percent', 'amount'])],
            'value'       => [$req, 'numeric', 'gt:0', 'max:999999999999'],
            'scope'       => [$req, Rule::in(['all', 'category', 'product'])],
            'categoryId'  => ['sometimes', 'nullable', 'integer', 'exists:categories,id'],
            'productId'   => ['sometimes', 'nullable', 'integer', 'exists:products,id'],
            'minQuantity' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:999999'],
            'startsOn'    => ['sometimes', 'nullable', 'date'],
            'endsOn'      => ['sometimes', 'nullable', 'date', 'after_or_equal:startsOn'],
            'active'      => ['sometimes', 'boolean'],
        ])->validate();

        $scope = $d['scope'] ?? $existing?->scope;
        $type = $d['type'] ?? $existing?->type;
        $value = (float) ($d['value'] ?? $existing?->value);
        if ($type === 'percent' && $value > 100) {
            throw ValidationException::withMessages(['value' => ['Un pourcentage ne peut pas dépasser 100.']]);
        }
        if ($scope === 'product' && empty($d['productId'] ?? $existing?->product_id)) {
            throw ValidationException::withMessages(['productId' => ['Choisissez le produit concerné.']]);
        }
        if ($scope === 'category' && empty($d['categoryId'] ?? $existing?->category_id)) {
            throw ValidationException::withMessages(['categoryId' => ['Choisissez la catégorie concernée.']]);
        }

        $cols = [];
        foreach (['name', 'type', 'value', 'scope', 'active'] as $f) {
            if (array_key_exists($f, $d)) {
                $cols[$f] = $d[$f];
            }
        }
        foreach (['categoryId' => 'category_id', 'productId' => 'product_id', 'startsOn' => 'starts_on', 'endsOn' => 'ends_on'] as $k => $col) {
            if (array_key_exists($k, $d)) {
                $cols[$col] = $d[$k] === '' ? null : $d[$k];
            }
        }
        if (array_key_exists('minQuantity', $d)) {
            $cols['min_quantity'] = $d['minQuantity'] ?? 0;
        }
        // Une portée « tout » / « catégorie » / « produit » n'a de sens qu'avec sa cible : on vide les autres
        $cols['category_id'] = $scope === 'category' ? ($cols['category_id'] ?? $existing?->category_id) : null;
        $cols['product_id'] = $scope === 'product' ? ($cols['product_id'] ?? $existing?->product_id) : null;

        $existing ? $existing->update($cols) : Promotion::create($cols + ['active' => true]);
    }

    // ═════════════════════════ Utilitaires ═════════════════════════

    /** @template T of \Illuminate\Database\Eloquent\Model @param class-string<T> $model @return T */
    private function find(string $model, mixed $id, string $label)
    {
        $row = $id ? $model::find($id) : null;
        if (! $row) {
            throw ValidationException::withMessages(['id' => ["{$label} introuvable (supprimé entre-temps ?)."]]);
        }

        return $row;
    }
}
