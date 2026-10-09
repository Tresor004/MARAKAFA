<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SaleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => (string) $this->id,
            'invoice_no' => $this->invoice_no,
            'customer_id' => $this->customer_id,
            'customer_name' => $this->customer?->name,
            'user_id' => $this->user_id,
            'user_name' => $this->user?->name,
            'total' => (float) $this->total,
            'paid' => (float) $this->paid,
            'change_due' => (float) $this->change_due,
            'payment_method' => $this->payment_method,
            'sale_date' => $this->sale_date?->toDateString(),
            'items' => $this->whenLoaded('items', fn () => $this->items->map(fn ($item) => [
                'product_id' => $item->product_id,
                'product_name' => $item->product_name,
                'quantity' => (float) $item->quantity,
                'unit_price' => (float) $item->unit_price,
                'total' => (float) $item->total,
            ])),
        ];
    }
}
