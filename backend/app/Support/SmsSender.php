<?php

namespace App\Support;

use App\Models\Alerte;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class SmsError extends RuntimeException {}

class SmsNotConfigured extends SmsError {}

class SmsSender
{
    public static function configured(): bool
    {
        return self::missing() === [];
    }

    /**
     * @return list<string>
     */
    public static function missing(): array
    {
        $keys = ['sid' => 'TWILIO_SID', 'token' => 'TWILIO_TOKEN', 'from' => 'TWILIO_FROM'];
        $missing = [];
        foreach ($keys as $configKey => $envName) {
            if (trim((string) config('cvgateway.twilio.'.$configKey)) === '') {
                $missing[] = $envName;
            }
        }

        return $missing;
    }

    public static function normalize(string $raw): string
    {
        $trimmed = preg_replace('/[^\d+]/', '', trim($raw)) ?? '';
        if (str_starts_with($trimmed, '00')) {
            $trimmed = '+'.substr($trimmed, 2);
        } elseif (preg_match('/^216\d{8}$/', $trimmed) === 1) {
            $trimmed = '+'.$trimmed;
        } elseif (preg_match('/^\d{8}$/', $trimmed) === 1) {
            $trimmed = '+216'.$trimmed;
        }

        if (preg_match('/^\+[1-9]\d{7,14}$/', $trimmed) !== 1) {
            throw new SmsError('Numéro invalide. Utilisez le format international (+216XXXXXXXX).');
        }

        return $trimmed;
    }

    public static function bodyFor(Alerte $alerte): string
    {
        $when = CsvExport::local($alerte->created_at);
        $stamp = $when?->format('d/m H:i') ?? '';
        $zone = $alerte->zone_name ?: 'scène';
        $frontend = rtrim((string) config('cvgateway.frontend_url'), '/');

        return sprintf(
            "CV-Gateway: %s (%s) — %s — %s\n%s",
            $alerte->label(),
            $alerte->type,
            $zone,
            $stamp,
            $frontend.'/supervision/'.$alerte->scenario
        );
    }

    public static function send(string $to, string $body): void
    {
        if (! self::configured()) {
            throw new SmsNotConfigured(
                'Twilio n’offre pas d’essai gratuit en Tunisie. Pour envoyer des SMS, passez le compte en Upgrade, achetez un numéro, puis renseignez TWILIO_SID, TWILIO_TOKEN et TWILIO_FROM dans backend/.env.'
            );
        }

        $sid = (string) config('cvgateway.twilio.sid');
        $token = (string) config('cvgateway.twilio.token');
        $from = (string) config('cvgateway.twilio.from');

        $response = Http::asForm()
            ->withBasicAuth($sid, $token)
            ->timeout(20)
            ->post('https://api.twilio.com/2010-04-01/Accounts/'.$sid.'/Messages.json', [
                'From' => $from,
                'To' => $to,
                'Body' => $body,
            ]);

        if ($response->successful()) {
            return;
        }

        $detail = $response->json('message') ?? $response->body();
        throw new SmsError('Twilio HTTP '.$response->status().' : '.$detail);
    }
}
