<?php

/*
 | CORS : nécessaire uniquement si l'interface est hébergée sur un autre domaine que l'API
 | (ex. GitHub Pages). Listez les origines autorisées dans CORS_ALLOWED_ORIGINS, séparées par des virgules.
 | En local (proxy Vite ou même serveur Laravel), aucune configuration n'est requise.
 */
return [
    'paths' => ['api/*'],
    'allowed_methods' => ['*'],
    'allowed_origins' => array_values(array_filter(array_map('trim', explode(',', (string) env('CORS_ALLOWED_ORIGINS', ''))))),
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 3600,
    'supports_credentials' => false,
];
