# Hi-Market — API Laravel

API REST (Laravel 13, PHP 8.3, Sanctum, SQLite par défaut) de l'application de gestion de commerce Hi-Market.
Toute la logique métier (stocks, prix, TVA, numérotation, droits, validations) vit ici ; l'interface React n'est qu'un client.

## Démarrage

```bash
composer install
cp .env.example .env            # Windows : copy .env.example .env
php artisan key:generate
php artisan migrate:fresh --seed
php artisan serve               # http://127.0.0.1:8000
php artisan test                # 48 tests
```

Comptes de démonstration (⚠ à changer / supprimer en production) :
`admin@himarket.sn / admin123` · `ibrahima@himarket.sn / ibrahima123` (gestionnaire) · `fatou@himarket.sn / fatou123` (caissier).

## Principes

- **Authentification** : `POST /api/login` (identifiant = email, nom ou téléphone) → jeton Bearer (12 h). Un compte désactivé est coupé immédiatement.
- **Droits** : un rôle = une liste de pages (`dashboard, products, stock, sales, purchases, customers, suppliers, users, losses, inventory, settings, myspace`). Le rôle `admin` a tout. Les droits sont contrôlés **côté serveur** (middleware `permission:`), l'interface ne fait que masquer des menus.
- **Validation administrateur** : `POST /api/actions` est le point d'entrée unique des opérations sensibles (produits, clients, fournisseurs, employés, achats, pertes, ajustements de stock, inventaire, profil).
  L'administrateur exécute immédiatement ; tout autre employé crée une demande (`pending_actions`) que l'administrateur approuve (l'action est alors exécutée **au nom du demandeur**) ou refuse (motif notifié).
- **Ventes** : `POST /api/sales` reçoit uniquement produits + quantités. Prix, coût, totaux, TVA incluse, numéro de facture sont calculés par le serveur ; le stock est décrémenté de façon atomique (refus si insuffisant, aucune vente partielle).
- **Stock** : décimal (kg, litres…), jamais négatif, modifié uniquement via `StockService`, qui écrit aussi le **journal des mouvements** (`stock_movements` : type, employé, motif, référence, stock avant/après).
- **Prix** (`PricingService`) : prix catalogue TTC → meilleure promotion applicable (pas de cumul entre promotions) → remise manuelle en % (plafond `max_discount_percent` pour un caissier, illimité pour l'admin) → TVA incluse dans le net (taux du produit, sinon taux de la boutique). Le client n'envoie jamais de prix.
- **Crédit et règlements** : `paid` absent = payé en totalité ; `paid` < total = paiement partiel / crédit (client obligatoire, option `allow_credit`, plafond `customers.credit_limit`). Invariant : `balance_due = total − returned_total − amount_paid`. Le registre `payments` (vente / règlement / remboursement) alimente la caisse.
- **Retours** (`action sale.return`) : avoir numéroté `AV-AAAA-NNNN`, la créance est réduite d'abord, le reste est remboursé ; remise en stock au choix ; dernière unité soldée au centime.
- **Sessions de caisse** : fond de caisse, espèces attendues = fond + encaissements espèces − remboursements espèces ; un écart à la fermeture notifie les administrateurs ; `require_cash_session` bloque les ventes sans caisse ouverte.
- **Achats** : lignes saisies HT ou TTC (`priceMode`) avec `taxRate` ; le total du bon est TTC, le coût du produit est mis à jour en HT.
- **Statistiques** : `GET /api/stats` (période, regroupement jour/semaine/mois, comparaison période précédente ou année précédente), montants nets des retours.
- **Notifications** : état « lu » par employé ; diffusion ciblée par permission. Les produits périmés sont **signalés** (jamais déclarés en perte automatiquement).
- **Tâches planifiées** : `php artisan shop:daily-checks` (stock critique, péremptions) tous les jours à 06:00 — ajoutez `* * * * * php artisan schedule:run` au cron en production. Les contrôles sont aussi lancés à la première connexion du jour.

## Routes principales

| Méthode | Route | Droit |
| --- | --- | --- |
| POST | `/api/login`, `/api/forgot-password` | public |
| GET | `/api/public/shop` | public (nom/logo pour l'écran de connexion) |
| GET/POST | `/api/me`, `/api/me/verify-password`, `/api/logout` | connecté |
| GET | `/api/products`, `/categories`, `/settings`, `/roles`, `/users/online`, `/notifications`, `/pending-actions` | connecté |
| GET | `/api/customers`, `/suppliers`, `/users`, `/sales`, `/purchases`, `/losses`, `/inventory`, `/dashboard` | selon la page (voir `routes/api.php`) |
| POST | `/api/sales` | `sales` |
| GET | `/api/stock-movements` (filtres `productId, type, from, to, q, page, perPage`) | `stock` ou `inventory` |
| GET | `/api/stats` (`from, to, granularity, compare`) | `dashboard` |
| GET | `/api/promotions` | connecté (CRUD via `/api/actions`) |
| GET | `/api/products/next-barcode` (EAN-13 interne unique) | `products` |
| GET/POST | `/api/cash-sessions/current`, `/api/cash-sessions`, `/api/cash-sessions/{id}/close` | `sales` |
| GET/POST | `/api/customers/{id}/account`, `/api/customers/{id}/payments` (encaissement d'une créance) | `customers` ou `sales` |
| POST/PUT/DELETE | `/api/categories` | `products` |
| PUT | `/api/settings` | `settings` |
| POST/PUT/DELETE | `/api/roles` | admin |
| POST | `/api/actions` | connecté (droit vérifié par type d'action) |
| POST | `/api/pending-actions/{id}/approve` · `/reject` | admin |

Types d'actions (`kind`) : `product.add|update|delete`, `customer.*`, `supplier.*`, `user.*`, `loss.add|delete`, `stock.adjust`, `inventory.do`, `purchase.add|update|delete`, `profile.update`, `sale.return`, `promotion.add|update|delete`.

## Production

- `APP_ENV=production`, `APP_DEBUG=false`, HTTPS obligatoire, **changer tous les mots de passe de démonstration**.
- SQLite convient à un seul point de vente ; au-delà (plusieurs caisses simultanées) préférez MySQL/PostgreSQL (`DB_CONNECTION` dans `.env`).
- Interface hébergée ailleurs que l'API : renseigner `CORS_ALLOWED_ORIGINS`.
- Sauvegardes : copier `database/database.sqlite` (ou dump SQL) quotidiennement.
