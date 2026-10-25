<?php

namespace App\Http\Controllers;

use App\Http\Support\Present;
use App\Models\Loss;
use Illuminate\Http\JsonResponse;

class LossController extends Controller
{
    public function index(): JsonResponse
    {
        $rows = Loss::with('notedBy')->orderByDesc('loss_date')->orderByDesc('id')->limit(2000)->get();

        return response()->json($rows->map(fn ($l) => Present::loss($l))->values());
    }
}
