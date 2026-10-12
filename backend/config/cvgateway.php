<?php

return [

    /*
    | Token partagé avec ai_engine. Sans lui, les routes d'ingestion
    | refusent toute écriture : le moteur ne peut pas inventer des
    | occupations ou des alertes.
    */
    'ingest_token' => env('INGEST_TOKEN'),

    /*
    | URL du frontend, utilisée dans les emails d'alerte pour le bouton
    | « Ouvrir le tableau de supervision ».
    */
    'frontend_url' => env('FRONTEND_URL', 'http://localhost:3000'),

    'timezone' => env('APP_TIMEZONE', 'Europe/Paris'),

];
