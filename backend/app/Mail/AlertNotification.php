<?php

namespace App\Mail;

use App\Models\Alerte;
use App\Support\CsvExport;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Storage;

class AlertNotification extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public Alerte $alerte) {}

    public function envelope(): Envelope
    {
        $zone = $this->alerte->zone_name ?: 'scène';

        return new Envelope(
            subject: '[CV-Gateway] '.$this->alerte->label().' — '.$zone,
        );
    }

    public function content(): Content
    {
        $when = CsvExport::local($this->alerte->created_at);
        $frontend = rtrim((string) config('cvgateway.frontend_url'), '/');

        return new Content(
            markdown: 'mail.alert',
            with: [
                'label' => $this->alerte->label(),
                'type' => $this->alerte->type,
                'zone' => $this->alerte->zone_name ?: 'scène',
                'scenario' => $this->alerte->scenario,
                'when' => $when?->isoFormat('LLLL') ?? '',
                'dashboardUrl' => $frontend.'/supervision/'.$this->alerte->scenario,
            ],
        );
    }

    /**
     * @return array<int, Attachment>
     */
    public function attachments(): array
    {
        $path = $this->alerte->snapshot_path;
        if (! $path || ! Storage::disk('local')->exists($path)) {
            return [];
        }

        return [
            Attachment::fromStorageDisk('local', $path)
                ->as('capture.jpg')
                ->withMime('image/jpeg'),
        ];
    }
}
