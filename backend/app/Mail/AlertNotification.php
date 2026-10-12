<?php

namespace App\Mail;

use App\Models\Alerte;
use App\Support\CsvExport;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;

class AlertNotification extends Mailable
{
    use Queueable, SerializesModels;

    /**
     * Libellé et couleur par gravité renvoyée par le moteur (config.yaml).
     *
     * @var array<string, array{0: string, 1: string}>
     */
    private const SEVERITIES = [
        'critical' => ['Critique', '#b42318'],
        'high' => ['Élevée', '#c4320a'],
        'moderate' => ['Modérée', '#b54708'],
        'info' => ['Information', '#175cd3'],
        'compliant' => ['Conforme', '#067647'],
    ];

    private const SCENARIOS = [
        'bureau' => 'Surveillance bureau',
        'cuisine' => 'Surveillance cuisine',
    ];

    public function __construct(public Alerte $alerte) {}

    public function envelope(): Envelope
    {
        $when = $this->detectedAt();
        $stamp = $when ? ' — '.$when->format('d/m/Y H:i:s') : '';

        return new Envelope(
            subject: '[CV-Gateway] '.$this->alerte->label().' — '.$this->zone().$stamp,
        );
    }

    public function content(): Content
    {
        $when = $this->detectedAt();
        $sentAt = CsvExport::local(now());
        $timezone = CsvExport::timezone();

        [$severityLabel, $severityColor] = self::SEVERITIES[strtolower((string) $this->alerte->severity)]
            ?? [ucfirst((string) $this->alerte->severity), '#475467'];

        $frontend = rtrim((string) config('cvgateway.frontend_url'), '/');

        return new Content(
            view: 'mail.alert',
            with: [
                'label' => $this->alerte->label(),
                'zone' => $this->zone(),
                'scenarioLabel' => self::SCENARIOS[$this->alerte->scenario] ?? $this->alerte->scenario,
                'severityLabel' => $severityLabel,
                'severityColor' => $severityColor,
                'snapshot' => $this->snapshotPath(),

                // ── horodatage détaillé ──
                'dateLongue' => $when?->locale('fr')->isoFormat('dddd D MMMM YYYY') ?? '—',
                'heure' => $when?->format('H:i:s') ?? '—',
                'fuseau' => $timezone.' (UTC'.($when?->format('P') ?? '').')',
                'iso' => $when?->toIso8601String() ?? '—',
                'duree' => self::humanSeconds($this->alerte->duration),
                'envoyeLe' => $sentAt?->format('d/m/Y H:i:s') ?? '—',
                'delai' => $when && $sentAt
                    ? self::humanSeconds((float) abs($sentAt->diffInSeconds($when)))
                    : '—',

                // ── contexte de l'événement ──
                'type' => $this->alerte->type,
                'camera' => $this->alerte->camera_id ?: '—',
                'confiance' => $this->alerte->confidence !== null
                    ? str_replace('.', ',', number_format($this->alerte->confidence * 100, 1, '.', '')).' %'
                    : '—',
                'sessionId' => $this->alerte->session_id ?: '—',
                'alerteId' => $this->alerte->id,

                'dashboardUrl' => $frontend.'/supervision/'.$this->alerte->scenario,
            ],
        );
    }

    private function detectedAt(): ?Carbon
    {
        return CsvExport::local($this->alerte->created_at);
    }

    private function zone(): string
    {
        return $this->alerte->zone_name ?: 'scène';
    }

    /**
     * Chemin absolu de la capture, pour l'intégrer au corps du mail (cid:).
     * Null si le moteur n'a pas joint d'image ou si le fichier a été purgé.
     */
    private function snapshotPath(): ?string
    {
        $path = $this->alerte->snapshot_path;
        if (! $path || ! Storage::disk('local')->exists($path)) {
            return null;
        }

        return Storage::disk('local')->path($path);
    }

    private static function humanSeconds(?float $seconds): string
    {
        if ($seconds === null) {
            return '—';
        }

        if ($seconds < 60) {
            return str_replace('.', ',', number_format($seconds, 1, '.', '')).' s';
        }

        $whole = (int) round($seconds);

        return intdiv($whole, 60).' min '.str_pad((string) ($whole % 60), 2, '0', STR_PAD_LEFT).' s';
    }
}
