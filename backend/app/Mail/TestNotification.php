<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class TestNotification extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public string $scenarioLabel) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'CV-Gateway Elastic — email de test',
        );
    }

    public function content(): Content
    {
        $frontend = rtrim((string) config('cvgateway.frontend_url'), '/');

        return new Content(
            markdown: 'mail.test',
            with: [
                'scenario' => $this->scenarioLabel,
                'dashboardUrl' => $frontend,
            ],
        );
    }
}
