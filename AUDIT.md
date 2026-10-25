# Audit du projet MARAKAFA / Hi-Market

Audit du front-end (React) et du back-end (Laravel), avec l'état de chaque point : **corrigé** dans cette livraison ou **à planifier**.

## 1. Constat de départ

Le projet comportait deux applications qui ne se parlaient pas :

- un **front-end autonome** : toutes les données (produits, ventes, employés, mots de passe, demandes, notifications) vivaient dans le `localStorage` du navigateur, avec des données de démonstration codées en dur ;
- une **API Laravel** correcte dans l'idée mais jamais appelée, avec des règles différentes de celles du front.

Conséquences : deux navigateurs = deux boutiques différentes ; la demande d'un employé était invisible pour l'administrateur sur un autre poste ; vider le cache effaçait la comptabilité.

## 2. Problèmes critiques (tous corrigés)

| # | Problème | Correction |
|---|---|---|
| C1 | Aucune donnée partagée : tout en `localStorage` | Le front lit/écrit via l'API ; le serveur est l'unique source de vérité. Seul le jeton de session reste dans le navigateur. |
| C2 | **Mots de passe en clair** dans le `localStorage` et le code (`seedData.ts`), comparés côté navigateur ; contrôle du « mot de passe actuel » côté client | Hachage bcrypt côté serveur, vérification serveur (`/login`, `/me/verify-password`). Aucun mot de passe n'est jamais renvoyé au front. |
| C3 | **Droits uniquement visuels** (menus masqués) ; côté API les routes n'avaient que `auth:sanctum`, sans contrôle de permission | Middleware `permission:` sur chaque route + droit vérifié par type d'action. Testé : un caissier ne peut ni lire `/users`, ni approuver, ni modifier les paramètres. |
| C4 | **Vente : prix et totaux fournis par le client** (API) → un client malveillant pouvait vendre à 1 FCFA ; pas de contrôle de stock → stocks négatifs | Le serveur ne reçoit que produit + quantité et recalcule prix, coût, TVA, totaux ; décrémentation **atomique** avec refus si stock insuffisant (transaction : tout ou rien). |
| C5 | Numéro de facture = `nombre de ventes + 1` (doublons après suppression, collisions entre deux caisses) | Numérotation par plus grand numéro existant + contrainte `UNIQUE` + rejeu automatique en cas de collision. |
| C6 | **Approbation exécutée au nom de l'administrateur** (`Auth::user()` dans les services) : achats, pertes, inventaires attribués au mauvais employé | L'auteur (demandeur) est passé explicitement aux services. |
| C7 | Approbation = `Model::create($payload)` / `update($payload['data'])` brut : format incompatible avec le front (catégorie en nom, camelCase) et champs modifiables non filtrés (dont le rôle) | Catalogue d'actions avec validation stricte de chaque charge utile, au moment de la demande **et** de l'exécution. |
| C8 | Règle métier « le système ne fait que **notifier** les produits périmés » violée par l'API (création automatique de pertes) | Plus aucune perte automatique : notification ciblée (employés ayant accès aux pertes), une fois par jour. |
| C9 | Le service worker mettait en cache **toutes** les requêtes GET, API comprise (données périmées, fuite entre utilisateurs sur un poste partagé) | L'API n'est plus jamais mise en cache ; interface en « réseau d'abord ». |

## 3. Problèmes importants (corrigés)

- **Stock entier** alors que le front permet des quantités décimales (kg, litres) → colonnes décimales (3 décimales).
- **Notifications** : état « lu » global côté API ; chaque employé a maintenant son propre état, et la diffusion peut être ciblée par permission.
- **TVA incohérente** : la facture ajoutait la TVA *au-dessus* d'un total déjà encaissé. Les prix sont désormais TTC, la TVA est la part incluse, **figée sur chaque vente** (un changement de taux ne réécrit pas l'historique).
- **Marge** calculée avec le coût *actuel* du produit : le coût d'achat est maintenant figé sur chaque ligne de vente ; le chiffre d'affaires du rapport est hors TVA.
- **Modification d'un produit** : le formulaire renvoyait tous les champs, y compris un stock périmé qui écrasait les ventes survenues entre-temps → seuls les champs modifiés sont envoyés.
- **Achats** : modification/suppression d'un bon sans rétablir le stock → le stock est annulé/réappliqué ; refus si les marchandises ont déjà été vendues.
- **Pertes** : suppression d'une perte sans remise en stock → corrigé. Quantité supérieure au stock refusée.
- **Inventaire** : l'« attendu » vient du stock réel en base au moment de la validation.
- **Connexion** : l'API n'acceptait que l'email alors que le front proposait nom/téléphone ; message identique pour compte inconnu / mauvais mot de passe ; compte désactivé coupé immédiatement ; limitation de débit (10 essais/min).
- **« Mot de passe oublié »** : n'affichait qu'un message local ; prévient maintenant réellement les administrateurs sans révéler quels comptes existent.
- **Protection du dernier administrateur** : impossible de le supprimer, désactiver ou rétrograder.
- **Suppression** : un fournisseur avec des achats, un rôle attribué ou le rôle Administrateur ne peuvent plus être supprimés par erreur ; un employé est supprimé « en douceur » (historique conservé) et son e-mail libéré.
- **Chemins en dur** (`base: "/MARAKAFA/"`, `manifest`/`sw.js` en `/…`) → configurables (`VITE_BASE`, `VITE_API_URL`) ; manifest et service worker relatifs.
- **Aucun test** (seulement les exemples Laravel) → 89 tests PHP + une centaine de vérifications navigateur de bout en bout (connexion, vente, validation admin, achat, perte, inventaire, rôles…) exécutées pendant ce travail.
- **Fichiers inutiles ou trompeurs** : `ProductRequest`/`UserRequest` jamais utilisés, `seedData.ts` supprimés ; README Laravel générique remplacé.

## 4. Améliorations restantes (à planifier, par priorité)

### À faire avant une mise en production
1. **Changer les comptes de démonstration** (`admin123`, etc.) et fixer un mot de passe fort pour l'administrateur.
2. **HTTPS**, `APP_DEBUG=false`, sauvegarde quotidienne de la base, `cron` pour `schedule:run`.
3. **Base de données** : SQLite suffit pour une caisse ; à plusieurs caisses simultanées, passer à MySQL/PostgreSQL.
4. **Réinitialisation de mot de passe par e-mail** (aujourd'hui l'administrateur est prévenu et change le mot de passe lui-même) — nécessite un service d'envoi (SMTP).
5. **Fichiers `CLAUDE.md` / `AGENTS.md`** dans `backend/` : ce sont des consignes génériques de Laravel Boost qui demandent d'exécuter un script téléchargé (`curl … | bash`). Ils ne servent pas à l'application ; supprimez-les ou lisez-les avant de les suivre.

### Fonctionnalités métier (points 6 à 10 : réalisés)
6. ✅ **Journal des mouvements de stock** : chaque variation (vente, retour, achat, annulation d'achat, perte, inventaire, ajustement, stock initial) est enregistrée avec l'employé, le motif, la référence (n° de facture, bon d'achat…) et le stock avant/après. Consultable, filtrable et paginé dans *Stocks → Journal des mouvements*.
7. ✅ **Retours / avoirs** (partiels ou totaux, remise en stock au choix, remboursement ou réduction de la créance), **paiements partiels et ventes à crédit** (créances clients, plafond par client, encaissement des soldes) et **sessions de caisse** (fond de caisse, comptage à la fermeture, écart signalé à l'administrateur, caisse obligatoire en option).
8. ✅ **TVA par produit** (taux multiples, produit exonéré possible), **prix d'achat HT ou TTC** avec TVA par ligne, **remises manuelles** (plafonnées pour les caissiers) et **promotions** (en % ou montant, sur tout / une catégorie / un produit, avec période et quantité minimale).
9. ✅ **Statistiques** (*Tableau de bord → Statistiques*) : courbe CA / marge, comparaison avec la période précédente ou l'an dernier, marge par catégorie, meilleurs produits, paiements, heures de pointe, caissiers. Tous les montants sont nets des retours.
10. ✅ **Codes-barres** : lecture par douchette (saisie rapide au clavier) ou par la caméra, génération de codes EAN-13 internes uniques, impression d'étiquettes (rouleaux 38×25 / 50×30 / 70×40 mm, planches A4 de 24 ou 65 étiquettes).

### Qualité technique
11. **Pagination et filtres côté serveur** pour ventes/achats/pertes (aujourd'hui plafonnés à 2 000 lignes) et recherche produit côté serveur au-delà de quelques milliers de références.
12. **Notifications en temps réel** (WebSocket/SSE) : aujourd'hui rafraîchissement toutes les 20 s et au retour sur l'onglet.
13. **Mode hors-ligne pour la caisse** (file d'attente des ventes) : actuellement la vente exige le serveur.
14. **Taille du bundle** (~1,5 Mo, un seul fichier) : séparer jsPDF/html2canvas (chargement à la demande) et activer la compression.
15. **Tests front** (Vitest + Testing Library) et **intégration continue** : exécuter `npm run typecheck`, `php artisan test` et le build à chaque push (workflow fourni dans `docs/ci.yml.example`, à copier dans `.github/workflows/`).
16. **Accessibilité** (libellés ARIA, navigation clavier dans les listes/modales) et **découpage** des très gros fichiers de pages (`MySpace.tsx` ≈ 800 lignes, `Users.tsx` ≈ 700).
17. Documentation d'API (OpenAPI/Swagger) si d'autres applications doivent s'y connecter.
18. ✅ Déploiement GitHub Pages : version **sans serveur** (`npm run build:pages`) dont l'API est rejouée dans le navigateur (`src/local/`, données dans le localStorage, sauvegarde/restauration dans Paramètres). Limite assumée : les données sont propres à chaque navigateur (pas de partage entre postes). Pour un magasin à plusieurs caisses, garder la version Laravel ; on peut aussi héberger l'API ailleurs (`VITE_API_URL` + `CORS_ALLOWED_ORIGINS`).

## 5. Règles métier à valider avec vous

Choix faits pour fermer les zones floues — à confirmer :

1. **Prix de vente TTC** : la TVA (réglage « Taux de TVA ») est la part incluse dans le prix ; elle n'est pas ajoutée au total.
2. **Paiement** : un montant reçu inférieur au total est un **paiement partiel / crédit** : il exige un client identifié, l'option « crédit » activée (Paramètres → Règles de vente) et le respect du plafond du client. Sinon la vente est refusée.
3. **Vente** : seul le droit « Caisse / Ventes » est requis (pas de validation administrateur), comme dans l'interface d'origine.
4. **Annulation d'un achat** déjà en partie vendu : refusée (il faut d'abord régulariser le stock).
5. **Suppression d'une catégorie non vide** : autorisée, les produits restent mais sans catégorie.
6. **Rôles** : seul l'administrateur crée/modifie/supprime les rôles ; le rôle Administrateur n'est pas modifiable.
7. **Session** : jeton valable 12 h, un employé peut être connecté sur plusieurs appareils.
8. **Suppression d'une perte** : la quantité est remise en stock (annulation d'une erreur de saisie).
9. **Remises et promotions** : la promotion la plus avantageuse est retenue pour chaque article (pas de cumul entre promotions) ; une remise manuelle de caisse s'y ajoute. Un caissier est plafonné à 10 % par défaut (réglable, 0 = aucune remise manuelle) ; l'administrateur n'est pas limité. Le serveur recalcule toujours le prix.
10. **TVA** : taux du produit s'il est renseigné (0 = exonéré), sinon taux de la boutique. Le prix de vente reste TTC ; le coût d'achat du produit est enregistré HT.
11. **Retours** : la valeur remboursée est celle réellement payée (remises déduites). Si la vente a un solde impayé, il est réduit en premier, le reste est remboursé. Un caissier envoie une demande de retour que l'administrateur valide ; un retour n'est pas bloqué par une caisse fermée.
12. **Caisse** : espèces attendues = fond de caisse + encaissements en espèces − remboursements en espèces. Un écart à la fermeture notifie les administrateurs. Chaque caissier gère sa propre caisse, sans validation.
13. **Statistiques** : marge = chiffre d'affaires HT − coût d'achat HT figé à la vente ; tout est net des retours.
