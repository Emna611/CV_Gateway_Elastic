<?php

namespace App\Mail;

use App\Support\CsvExport;
use App\Support\WorkTimeReport;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Rapport quotidien du temps de travail par poste, avec les CSV en pièces jointes.
 */
class DailyWorkReport extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public WorkTimeReport $report) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: '[CV-Gateway] Temps de travail — '.$this->report->dayStart->format('d/m/Y'),
        );
    }

    public function content(): Content
    {
        $summary = $this->report->summary();
        $frontend = rtrim((string) config('cvgateway.frontend_url'), '/');

        return new Content(
            view: 'mail.daily_report',
            with: [
                'dateLongue' => $this->report->dayStart->locale('fr')->isoFormat('dddd D MMMM YYYY'),
                'postes' => array_map(fn (array $zone) => [
                    'poste' => $zone['poste'],
                    'entree' => CsvExport::time($zone['premiere_entree']) ?: '—',
                    'sortie' => $zone['en_cours'] ? 'en cours' : (CsvExport::time($zone['derniere_sortie']) ?: '—'),
                    'presences' => $zone['nb_presences'],
                    'actif' => WorkTimeReport::hhmm($zone['actif_seconds']),
                    'inactif' => WorkTimeReport::hhmm($zone['inactif_seconds']),
                    'total' => WorkTimeReport::hhmm($zone['total_seconds']),
                ], $summary),
                'nbPostes' => count($summary),
                'nbPresences' => $this->report->presenceCount(),
                'totalGeneral' => WorkTimeReport::hhmm($this->report->totalSeconds()),
                'fichierSynthese' => $this->report->summaryFilename(),
                'fichierDetail' => $this->report->detailFilename(),
                'envoyeLe' => CsvExport::local(now())?->format('d/m/Y H:i:s') ?? '—',
                'fuseau' => CsvExport::timezone(),
                'dashboardUrl' => $frontend.'/supervision/'.$this->report->scenario,
            ],
        );
    }

    /**
     * @return list<Attachment>
     */
    public function attachments(): array
    {
        return [
            Attachment::fromData(fn () => $this->report->summaryCsv(), $this->report->summaryFilename())
                ->withMime('text/csv'),
            Attachment::fromData(fn () => $this->report->detailCsv(), $this->report->detailFilename())
                ->withMime('text/csv'),
        ];
    }
}
