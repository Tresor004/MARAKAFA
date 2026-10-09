<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Customer extends Model
{
    use SoftDeletes;

    protected $fillable = ['name', 'phone', 'email', 'address', 'total_purchases'];

    protected $casts = ['total_purchases' => 'float'];

    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class);
    }
}
