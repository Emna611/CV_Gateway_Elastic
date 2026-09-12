<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $user = (string) config('mail.mailers.smtp.username');
        $password = (string) config('mail.mailers.smtp.password');
        $scheme = strtolower((string) config('mail.mailers.smtp.scheme'));
        // Ancien MAIL_ENCRYPTION (tls/ssl) : Symfony n'accepte que smtp/smtps.
        if (in_array($scheme, ['tls', 'starttls'], true)) {
            config(['mail.mailers.smtp.scheme' => 'smtp']);
        } elseif ($scheme === 'ssl') {
            config(['mail.mailers.smtp.scheme' => 'smtps']);
        }

        if ($user !== '' && $password !== '') {
            config(['mail.default' => 'smtp']);
            $host = strtolower((string) config('mail.mailers.smtp.host'));
            if (str_contains($host, 'gmail.com')) {
                config(['mail.from.address' => $user]);
            }
        } elseif (! filter_var((string) config('mail.from.address'), FILTER_VALIDATE_EMAIL)) {
            config(['mail.from.address' => 'cv-gateway@localhost']);
        }
    }
}
