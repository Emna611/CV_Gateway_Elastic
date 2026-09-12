# Laravel 12 — PHP 8.2.
# Cible `test` = composer + phpunit (CI). Cible finale = serveur + migrate.

FROM php:8.2-cli-bookworm AS base

RUN apt-get update \
    && apt-get install -y --no-install-recommends git unzip libzip-dev sqlite3 libsqlite3-dev \
    && docker-php-ext-install pdo pdo_sqlite zip pcntl bcmath \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

FROM base AS vendor
COPY composer.json composer.lock ./
RUN composer install --no-interaction --no-scripts --prefer-dist --no-progress

FROM vendor AS test
COPY . .
RUN composer dump-autoload --no-interaction --no-scripts \
    && mkdir -p database storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && php artisan test --filter=IngestAndExportTest

FROM vendor AS runtime
COPY . .
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh \
    && composer dump-autoload --no-interaction --no-scripts \
    && mkdir -p database storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && chmod +x /usr/local/bin/entrypoint.sh \
    && chmod -R ug+rwx storage bootstrap/cache database

ENV APP_ENV=production
EXPOSE 8000
ENTRYPOINT ["entrypoint.sh"]
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000"]
