# Hi-Market

Application locale de gestion de supermarche : catalogue, stock, ventes, achats, clients, fournisseurs, inventaires et gestion des employes.

## Demarrage local

Prerequis : Node.js 20+ et PHP 8.3+ avec l'extension SQLite active.

```cmd
npm install
cd backend
composer install
copy .env.example .env
php artisan key:generate
php artisan migrate:fresh --seed
cd ..
start-local.cmd
```

Le frontend est disponible sur `http://127.0.0.1:5173` et l'API sur `http://127.0.0.1:8000`.

Les donnees de l'interface sont conservees localement dans le navigateur. Le backend utilise une base SQLite preconfiguree dans `backend/database/database.sqlite`, avec une API Sanctum prete pour l'integration progressive ou un client externe.

Comptes de demonstration :

- `admin@himarket.sn` / `admin123`
- `fatou@himarket.sn` / `fatou123`
- `ibrahima@himarket.sn` / `ibrahima123`

Pour reconstruire seulement les donnees API : `npm run setup:api`.
