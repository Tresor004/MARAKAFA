# Hi-Market (MARAKAFA) — Gestion de commerce

Application complète de gestion de supermarché : caisse, produits, stocks, achats, clients, fournisseurs, pertes, inventaire,
employés/rôles avec **circuit de validation administrateur**, notifications, tableau de bord, factures et PDF.

Fonctions métier : journal des mouvements de stock · retours/avoirs · ventes à crédit et créances clients · sessions de caisse (écart de caisse) · TVA par produit · achats HT/TTC · remises et promotions · statistiques (évolution, marge par catégorie, comparaison de périodes) · codes-barres (douchette, caméra, étiquettes) · inventaire avec indicateurs, historique des écarts et fiches imprimables (comptage vierge, résultat).

- **Interface** : React 19 + TypeScript + Vite + Tailwind (`src/`)
- **API** : Laravel 13 + Sanctum + SQLite (`backend/`) — voir [backend/README.md](backend/README.md)

## Deux façons de l'utiliser

| | Avec serveur (Laravel) | Sans serveur (GitHub Pages) |
| --- | --- | --- |
| Lancement | `start-local.cmd` (ou `npm run dev:api` + `npm run dev`) | publié automatiquement à chaque push sur `main` ; en local : `npm run dev:pages` |
| Données | base SQLite du serveur, **partagée** entre tous les postes | `localStorage` du navigateur, **propres à ce navigateur** |
| Usage conseillé | magasin réel, plusieurs caisses | démonstration, essai, poste unique |

La version sans serveur rejoue toute l'API dans le navigateur (`src/local/` : mêmes règles métier, mêmes contrôles de droits,
mots de passe hachés). Elle est compilée par `npm run build:pages`. Ses données disparaissent si le cache du navigateur est vidé :
*Paramètres → Données de ce navigateur* permet de télécharger une sauvegarde, de la restaurer (ou de la transférer sur un autre poste)
et de tout effacer. Premier lancement : `admin@himarket.sn` / `admin123`.

## Lancer en local

Voir [GUIDE_LOCAL.md](GUIDE_LOCAL.md). En résumé :

```cmd
npm install
cd backend && composer install && copy .env.example .env && php artisan key:generate && php artisan migrate:fresh --seed && cd ..
start-local.cmd
```

Puis ouvrir http://127.0.0.1:5173 — `admin@himarket.sn` / `admin123`.

## Contrôle qualité

```cmd
npm run typecheck     # TypeScript
npm run test:api      # 93 tests Laravel
```

Audit complet et pistes d'amélioration : [AUDIT.md](AUDIT.md).
