# Guide de compilation et lancement local

## Prerequis

Installez les outils suivants et verifiez leurs versions dans un terminal :

```cmd
node --version
npm --version
php --version
composer --version
```

Le projet a ete valide avec Node.js 24, PHP 8.3 et Composer 2. SQLite doit etre active dans PHP. Aucune installation MySQL n'est necessaire.

## Installation initiale

Ouvrez un terminal dans le dossier racine du projet puis executez :

```cmd
npm install
cd backend
composer install
copy .env.example .env
php artisan key:generate
php artisan migrate:fresh --seed --no-interaction
cd ..
```

Cette procedure installe les dependances du frontend et du backend, configure Laravel, puis cree `backend/database/database.sqlite` avec les donnees de demonstration.

## Demarrage quotidien

Le moyen le plus simple est de lancer [start-local.cmd](start-local.cmd). Deux consoles s'ouvrent :

- frontend Vite : `http://127.0.0.1:5173`
- API Laravel : `http://127.0.0.1:8000`

Depuis VS Code, vous pouvez aussi utiliser deux terminaux :

```cmd
npm run dev:api
```

Puis, dans un second terminal a la racine :

```cmd
npm run dev
```

## Comptes de demonstration

| Role | Email | Mot de passe |
| --- | --- | --- |
| Administrateur | `admin@himarket.sn` | `admin123` |
| Caissier | `fatou@himarket.sn` | `fatou123` |
| Gestionnaire | `ibrahima@himarket.sn` | `ibrahima123` |

## Compilation de production

Pour verifier et generer la version statique du frontend :

```cmd
npm run build
```

Le resultat est cree dans le dossier `dist` sous la forme d'un `index.html` autonome.

## Tests et controle

```cmd
cd backend
php artisan test
php artisan route:list --path=api
```

Le projet est configure pour une base SQLite locale et l'API utilise Laravel Sanctum.

## Reinitialiser les donnees de demonstration

Attention : cette commande efface uniquement les donnees de la base SQLite locale puis recharge les donnees de demonstration.

```cmd
npm run setup:api
```

Le frontend conserve aussi son propre etat dans le stockage local du navigateur. Pour repartir de zero cote interface, ouvrez les outils de developpement du navigateur et supprimez les donnees du site `127.0.0.1:5173`.

## Depannage rapide

- `spawn EPERM` pendant `npm install` ou `npm run build` : fermez les processus Node/Vite, puis relancez le terminal en administrateur. Un antivirus peut temporairement verrouiller `esbuild`.
- Port deja utilise : changez le port Vite avec `npm run dev -- --port 5174`, ou celui de Laravel avec `php artisan serve --port=8001`.
- Erreur SQLite : confirmez que l'extension `pdo_sqlite` est active avec `php -m | findstr sqlite`, puis relancez `npm run setup:api`.
- Dependances PHP absentes : executez `cd backend` puis `composer install`.
