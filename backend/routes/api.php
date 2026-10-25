<?php

use App\Http\Controllers\ActionController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CashSessionController;
use App\Http\Controllers\CustomerAccountController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\InventoryController;
use App\Http\Controllers\LossController;
use App\Http\Controllers\MasterDataController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\PendingActionController;
use App\Http\Controllers\PromotionController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\PurchaseController;
use App\Http\Controllers\RoleController;
use App\Http\Controllers\SaleController;
use App\Http\Controllers\StatsController;
use App\Http\Controllers\StockMovementController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Hi-Market
|--------------------------------------------------------------------------
| Lecture : GET par ressource. Écriture :
|   - ventes, catégories, rôles, paramètres : routes dédiées ;
|   - tout le reste (produits, clients, fournisseurs, employés, achats, pertes, stock, inventaire, profil)
|     passe par POST /api/actions (exécution immédiate pour l'admin, demande de validation sinon).
*/

Route::get('/public/shop', [MasterDataController::class, 'publicShop']);
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:10,1');
Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:5,1');

Route::middleware(['auth:sanctum', 'active', 'throttle:300,1'])->group(function (): void {
    // Session
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/me/verify-password', [AuthController::class, 'verifyPassword'])->middleware('throttle:10,1');

    // Référentiels lisibles par tout employé connecté
    Route::get('/products', [ProductController::class, 'index']);
    Route::get('/products/next-barcode', [ProductController::class, 'nextBarcode'])->middleware('permission:products');
    Route::get('/products/{product}', [ProductController::class, 'show'])->whereNumber('product');
    Route::get('/promotions', [PromotionController::class, 'index']);
    Route::get('/categories', [MasterDataController::class, 'categories']);
    Route::get('/settings', [MasterDataController::class, 'settings']);
    Route::get('/roles', [RoleController::class, 'index']);
    Route::get('/users/online', [UserController::class, 'online']);

    // Lectures protégées par permission
    Route::get('/customers', [MasterDataController::class, 'customers'])->middleware('permission:customers,sales');
    Route::get('/suppliers', [MasterDataController::class, 'suppliers'])->middleware('permission:suppliers,purchases');
    Route::get('/users', [UserController::class, 'index'])->middleware('permission:users');
    Route::get('/sales', [SaleController::class, 'index'])->middleware('permission:sales,dashboard,inventory,myspace');
    Route::get('/sales/{sale}', [SaleController::class, 'show'])->middleware('permission:sales,dashboard,inventory,myspace');
    Route::get('/purchases', [PurchaseController::class, 'index'])->middleware('permission:purchases,suppliers,dashboard,inventory');
    Route::get('/losses', [LossController::class, 'index'])->middleware('permission:losses,dashboard,inventory');
    Route::get('/inventory', [InventoryController::class, 'index'])->middleware('permission:inventory');
    Route::get('/dashboard', [DashboardController::class, 'index'])->middleware('permission:dashboard');
    Route::get('/stats', [StatsController::class, 'index'])->middleware('permission:dashboard');
    Route::get('/stock-movements', [StockMovementController::class, 'index'])->middleware('permission:stock,inventory');

    // Caisse : sessions, créances clients
    Route::get('/cash-sessions/current', [CashSessionController::class, 'current'])->middleware('permission:sales');
    Route::get('/cash-sessions', [CashSessionController::class, 'index'])->middleware('permission:sales,dashboard');
    Route::post('/cash-sessions', [CashSessionController::class, 'open'])->middleware('permission:sales');
    Route::post('/cash-sessions/{cashSession}/close', [CashSessionController::class, 'close'])->middleware('permission:sales');
    Route::get('/customers/{customer}/account', [CustomerAccountController::class, 'show'])->middleware('permission:customers,sales');
    Route::post('/customers/{customer}/payments', [CustomerAccountController::class, 'store'])->middleware('permission:sales,customers');

    // Écritures dédiées
    Route::post('/sales', [SaleController::class, 'store'])->middleware('permission:sales');
    Route::post('/categories', [MasterDataController::class, 'storeCategory'])->middleware('permission:products');
    Route::put('/categories/{category}', [MasterDataController::class, 'updateCategory'])->middleware('permission:products');
    Route::delete('/categories/{category}', [MasterDataController::class, 'destroyCategory'])->middleware('permission:products');
    Route::put('/settings', [MasterDataController::class, 'updateSettings'])->middleware('permission:settings');
    Route::post('/roles', [RoleController::class, 'store'])->middleware('permission:admin');
    Route::put('/roles/{role}', [RoleController::class, 'update'])->middleware('permission:admin');
    Route::delete('/roles/{role}', [RoleController::class, 'destroy'])->middleware('permission:admin');

    // Opérations soumises à validation
    Route::post('/actions', [ActionController::class, 'store']);
    Route::get('/pending-actions', [PendingActionController::class, 'index']);
    Route::post('/pending-actions/{pendingAction}/approve', [PendingActionController::class, 'approve'])->middleware('permission:admin');
    Route::post('/pending-actions/{pendingAction}/reject', [PendingActionController::class, 'reject'])->middleware('permission:admin');

    // Notifications
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead']);
    Route::post('/notifications/{notification}/read', [NotificationController::class, 'markRead'])->whereNumber('notification');
});
