#!/bin/sh
set -e

cd /var/www/html

if [ -z "$APP_KEY" ]; then
    echo "APP_KEY manquant : renseignez-le dans backend/.env (php artisan key:generate)."
    exit 1
fi

mkdir -p database storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache
if [ ! -f database/database.sqlite ]; then
    touch database/database.sqlite
fi

php artisan migrate --force --no-ansi

exec "$@"
