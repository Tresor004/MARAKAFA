<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => (string) $this->id,
            'name' => $this->name,
            'category_id' => $this->category_id,
            'category' => $this->category?->name,
            'price' => (float) $this->price,
            'cost' => (float) $this->cost,
            'stock' => $this->stock,
            'min_stock' => $this->min_stock,
            'unit' => $this->unit,
            'barcode' => $this->barcode,
            'expiry_date' => $this->expiry_date?->toDateString(),
        ];
    }
}
