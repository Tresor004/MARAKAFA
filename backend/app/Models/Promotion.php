<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Promotion extends Model
{
    protected $fillable = [
        'name', 'type', 'value', 'scope', 'category_id', 'product_id',
        'min_quantity', 'starts_on', 'ends_on', 'active',
    ];

    protected $casts = [
        'value'        => 'float',
        'min_quantity' => 'float',
        'starts_on'    => 'date',
        'ends_on'      => 'date',
        'active'       => 'boolean',
    ];

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class)->withTrashed();
    }

    /** Active aujourd'hui (drapeau + fenêtre de dates). */
    public function isRunningOn(string $date): bool
    {
        return $this->active
            && (! $this->starts_on || $this->starts_on->toDateString() <= $date)
            && (! $this->ends_on || $this->ends_on->toDateString() >= $date);
    }

    public function appliesTo(Product $p, float $qty): bool
    {
        if ($qty + 0.0005 < (float) $this->min_quantity) {
            return false;
        }

        return match ($this->scope) {
            'product'  => (int) $this->product_id === $p->id,
            'category' => $p->category_id !== null && (int) $this->category_id === (int) $p->category_id,
            default    => true,
        };
    }

    /** Remise (montant) que cette promotion accorde sur une ligne de prix catalogue $list. */
    public function discountFor(float $unitPrice, float $qty): float
    {
        $list = $unitPrice * $qty;
        $d = $this->type === 'percent' ? $list * $this->value / 100 : $this->value * $qty;

        return round(min($list, max(0, $d)), 2);
    }

    public function label(): string
    {
        return $this->name . ' (' . ($this->type === 'percent'
            ? rtrim(rtrim(number_format($this->value, 2, '.', ''), '0'), '.') . ' %'
            : '-' . rtrim(rtrim(number_format($this->value, 2, '.', ''), '0'), '.') . ' / unité') . ')';
    }
}
