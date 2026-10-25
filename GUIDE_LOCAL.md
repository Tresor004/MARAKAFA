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

## Demarrage quotidien (developpement)

Le moyen le plus simple est de lancer [start-local.cmd](start-local.cmd). Deux consoles s'ouvrent :

- frontend Vite : `http://127.0.0.1:5173` (a ouvrir dans le navigateur)
- API Laravel : `http://127.0.0.1:8000` (Vite relaie automatiquement `/api` vers elle)

Depuis VS Code, vous pouvez aussi utiliser deux terminaux : `npm run dev:api` puis `npm run dev`.

Toutes les donnees (produits, ventes, employes, validations, notifications...) sont enregistrees dans
`backend/database/database.sqlite`. Plusieurs postes/navigateurs connectes a la meme API voient les memes donnees :
une demande faite par un employe apparait chez l'administrateur sur un autre poste.

## Version sans serveur (GitHub Pages)

La version publiée sur GitHub Pages n'utilise pas Laravel : les données sont enregistrées dans le navigateur (localStorage).
Pour l'essayer sur votre poste sans démarrer l'API :

```cmd
npm run dev:pages
```

Puis ouvrir `http://127.0.0.1:5174` — `admin@himarket.sn` / `admin123` au premier lancement.
Chaque navigateur a ses propres données ; pensez à *Paramètres → Données de ce navigateur → Télécharger une sauvegarde*.
Le déploiement est automatique à chaque push sur `main` (workflow `.github/workflows/deploy.yml`, qui lance `npm run build:pages`).

## Mode "un seul serveur" (production simple)

Laravel peut servir lui-meme l'interface compilee :

```cmd
npm run build:laravel
npm run serve
```

Ouvrez ensuite `http://127.0.0.1:8000`. (`build:laravel` compile l'interface puis la copie dans `backend/public/`.)

## Comptes de demonstration

| Role | Email | Mot de passe |
| --- | --- | --- |
| Administrateur | `admin@himarket.sn` | `admin123` |
| Caissier | `fatou@himarket.sn` | `fatou123` |
| Gestionnaire | `ibrahima@himarket.sn` | `ibrahima123` |

## Compilation de production

- `npm run build` : genere `dist/index.html` (interface seule, sans le serveur).
- `npm run build:laravel` : idem + copie dans `backend/public/` pour que Laravel serve l'application complete.
- Interface hebergee ailleurs que l'API (ex. GitHub Pages) : definir `VITE_API_URL` (URL de l'API) et `VITE_BASE`
  (voir `.env.example`), et `CORS_ALLOWED_ORIGINS` dans `backend/.env`.

## Tests et controle

```cmd
npm run typecheck
cd backend
php artisan test
php artisan route:list --path=api
```

Le projet est configure pour une base SQLite locale et l'API utilise Laravel Sanctum (jeton Bearer).

**Mise a jour d'une base existante** : les nouvelles tables (journal de stock, promotions, sessions de caisse, paiements, retours) sont ajoutees par des migrations qui **conservent vos donnees**. Executez simplement :

```cmd
cd backend
php artisan migrate
```

(`npm run setup:api` efface au contraire la base et recharge les donnees de demonstration.)

Utilisation des nouvelles fonctions :

- **Douchette code-barres** : cliquez dans le champ de recherche de la caisse et scannez (la plupart des douchettes simulent un clavier). Le bouton *Camera* utilise la camera du telephone/PC (Chrome, Edge ou Android ; en HTTPS ou sur `localhost`).
- **Etiquettes** : *Produits -> Etiquettes* ; dans la fenetre d'impression, choisissez marges *Aucune* et echelle *100 %*.
- **Caisse obligatoire / credit / remise maximale** : *Parametres -> Regles de vente*.

## Reinitialiser les donnees de demonstration

Attention : cette commande efface uniquement les donnees de la base SQLite locale puis recharge les donnees de demonstration.

```cmd
npm run setup:api
```

Les donnees sont uniquement dans la base du serveur : rien a nettoyer cote navigateur (en cas de souci de session, deconnectez-vous ou videz le stockage local du site).

## Depannage rapide

- `spawn EPERM` pendant `npm install` ou `npm run build` : fermez les processus Node/Vite, puis relancez le terminal en administrateur. Un antivirus peut temporairement verrouiller `esbuild`.
- Port deja utilise : changez le port Vite avec `npm run dev -- --port 5174`, ou celui de Laravel avec `php artisan serve --port=8001`.
- Erreur SQLite : confirmez que l'extension `pdo_sqlite` est active avec `php -m | findstr sqlite`, puis relancez `npm run setup:api`.
- Dependances PHP absentes : executez `cd backend` puis `composer install`.

## Fichiers obsoletes a supprimer (apres mise a jour)

Ces fichiers de l'ancienne version ne sont plus utilises (le systeme de fichiers distant ne permet pas de les supprimer automatiquement) :

- `backend/app/Http/Requests/` (dossier entier : `ProductRequest.php`, `SaleRequest.php`, `UserRequest.php`)
- `backend/app/Http/Resources/` (dossier entier : `PendingActionResource.php`, `ProductResource.php`, `SaleResource.php`, `UserResource.php`)
- `src/seedData.ts` est remplace par un fichier vide : vous pouvez le supprimer.
