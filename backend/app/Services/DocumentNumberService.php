<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Numérotation séquentielle des documents (factures, bons d'achat) : PREFIXE-ANNEE-0001.
 *
 * Le numéro suivant est déduit du plus grand numéro existant de l'année (corbeille incluse),
 * ce qui évite les doublons après une suppression. En cas de course entre deux requêtes,
 * la contrainte UNIQUE de la base protège et l'appelant rejoue la création.
 */
class DocumentNumberService
{
    public function next(string $prefix, string $table, string $column): string
    {
        $year = now()->year;
        $prefix = trim($prefix) !== '' ? trim($prefix) : 'DOC';

        $last = DB::table($table)
            ->where($column, 'like', "{$prefix}-{$year}-%")
            ->orderByRaw("LENGTH({$column}) DESC")
            ->orderByDesc($column)
            ->value($column);

        $n = $last ? ((int) substr($last, strrpos($last, '-') + 1)) + 1 : 1;

        return sprintf('%s-%d-%04d', $prefix, $year, $n);
    }
}
