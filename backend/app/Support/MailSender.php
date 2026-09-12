<?php

namespace App\Support;

use App\Mail\TestNotification;
use Illuminate\Support\Facades\Mail;
use RuntimeException;
use Symfony\Component\Mailer\Exception\TransportExceptionInterface;
use Throwable;

class MailError extends RuntimeException {}

class MailNotConfigured extends MailError {}

class MailSender
{
    public static function configured(): bool
    {
        if (self::missing() === []) {
            return true;
        }

        return in_array((string) config('mail.default'), ['array'], true);
    }

    /**
     * @return list<string>
     */
    public static function missing(): array
    {
        $missing = [];
        if (trim((string) config('mail.mailers.smtp.username')) === '') {
            $missing[] = 'MAIL_USERNAME';
        }
        if (trim((string) config('mail.mailers.smtp.password')) === '') {
            $missing[] = 'MAIL_PASSWORD';
        }

        return $missing;
    }

    public static function sendTest(string $recipient, string $scenarioLabel): string
    {
        if (self::missing() !== [] && (string) config('mail.default') !== 'array') {
            throw new MailNotConfigured(
                'SMTP non configuré : renseignez '
                .implode(', ', self::missing())
                .' dans backend/.env (voir .env.example). Avec Gmail, utilisez un mot de passe d’application.'
            );
        }

        try {
            Mail::to($recipient)->send(new TestNotification($scenarioLabel));
        } catch (TransportExceptionInterface $exception) {
            throw new MailError(self::describe($exception));
        } catch (Throwable $exception) {
            throw new MailError(self::describe($exception));
        }

        $host = (string) config('mail.mailers.smtp.host');
        $port = (string) config('mail.mailers.smtp.port');

        return $host !== '' ? $host.':'.$port : (string) config('mail.default');
    }

    private static function describe(Throwable $exception): string
    {
        $message = trim($exception->getMessage());
        if ($message === '') {
            return 'Erreur SMTP : '.$exception::class.'.';
        }

        $lower = strtolower($message);

        if (str_contains($lower, 'unsupported scheme') || str_contains($lower, 'scheme is not supported')) {
            return 'Configuration SMTP invalide (MAIL_SCHEME). Utilisez smtp (port 587) ou smtps (port 465).';
        }

        if (str_contains($lower, 'auth') || str_contains($lower, '535') || str_contains($lower, 'username and password')) {
            return 'Authentification SMTP refusée. Vérifiez MAIL_USERNAME et MAIL_PASSWORD (mot de passe d’application Gmail, pas le mot de passe du compte).';
        }

        return 'Erreur SMTP : '.$message;
    }
}
