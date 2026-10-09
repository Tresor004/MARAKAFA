<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\MasterDataController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\PendingActionController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\SaleController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:10,1');

Route::middleware(['auth:sanctum', 'throttle:120,1'])->group(function (): void {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::put('/me/ping', [AuthController::class, 'ping']);

    Route::get('/dashboard', [DashboardController::class, 'index']);
    Route::apiResource('products', ProductController::class);
    Route::apiResource('sales', SaleController::class)->only(['index', 'store', 'show']);

    Route::get('/customers', [MasterDataController::class, 'customers']);
    Route::post('/customers', [MasterDataController::class, 'storeCustomer']);
    Route::put('/customers/{customer}', [MasterDataController::class, 'updateCustomer']);
    Route::delete('/customers/{customer}', [MasterDataController::class, 'destroyCustomer']);
    Route::get('/suppliers', [MasterDataController::class, 'suppliers']);
    Route::post('/suppliers', [MasterDataController::class, 'storeSupplier']);
    Route::put('/suppliers/{supplier}', [MasterDataController::class, 'updateSupplier']);
    Route::delete('/suppliers/{supplier}', [MasterDataController::class, 'destroySupplier']);
    Route::get('/categories', [MasterDataController::class, 'categories']);
    Route::post('/categories', [MasterDataController::class, 'storeCategory']);
    Route::put('/categories/{category}', [MasterDataController::class, 'updateCategory']);
    Route::delete('/categories/{category}', [MasterDataController::class, 'destroyCategory']);
    Route::get('/settings', [MasterDataController::class, 'settings']);
    Route::put('/settings', [MasterDataController::class, 'updateSettings']);

    Route::get('/users/online', [UserController::class, 'online']);
    Route::post('/users/{user}/avatar', [UserController::class, 'uploadAvatar']);
    Route::apiResource('users', UserController::class);

    Route::get('/pending-actions', [PendingActionController::class, 'index']);
    Route::post('/pending-actions/{pendingAction}/approve', [PendingActionController::class, 'approve']);
    Route::post('/pending-actions/{pendingAction}/reject', [PendingActionController::class, 'reject']);

    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::post('/notifications/mark-all-read', [NotificationController::class, 'markAllRead']);
    Route::patch('/notifications/{notification}/read', [NotificationController::class, 'markRead']);
});
