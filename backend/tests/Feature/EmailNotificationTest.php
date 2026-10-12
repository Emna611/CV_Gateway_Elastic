<?php

namespace Tests\Feature;

use App\Mail\AlertNotification;
use App\Mail\TestNotification;
use App\Support\MailSender;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class EmailNotificationTest extends TestCase
{
    use RefreshDatabase;

    private function ingestHeaders(): array
    {
        return [
            'X-Ingest-Token' => 'test-ingest-token',
            'Accept' => 'application/json',
        ];
    }

    public function test_email_status_requires_token_and_reports_missing_credentials(): void
    {
        $this->getJson('/api/notify/email/status')
            ->assertStatus(401);

        $this->getJson('/api/notify/email/status', $this->ingestHeaders())
            ->assertOk()
            ->assertJson([
                'ok' => true,
                'configured' => false,
            ]);
    }

    public function test_email_test_is_rejected_when_smtp_is_not_configured(): void
    {
        config(['mail.default' => 'log']);

        $this->postJson('/api/notify/email/test', [
            'recipient' => 'admin@elastic-solutions.tn',
            'scenario' => 'bureau',
        ], $this->ingestHeaders())
            ->assertStatus(503)
            ->assertJson(['ok' => false, 'configured' => false]);
    }

    public function test_email_test_sends_via_mailer(): void
    {
        Mail::fake();

        $this->postJson('/api/notify/email/test', [
            'recipient' => 'admin@elastic-solutions.tn',
            'scenario' => 'bureau',
        ], $this->ingestHeaders())
            ->assertOk()
            ->assertJson(['ok' => true]);

        Mail::assertSent(TestNotification::class, function (TestNotification $mail) {
            $mail->assertSeeInHtml('Surveillance bureau');

            return $mail->hasTo('admin@elastic-solutions.tn');
        });
    }

    public function test_legacy_tls_scheme_is_normalized_to_smtp(): void
    {
        config(['mail.mailers.smtp.scheme' => 'tls']);
        (new \App\Providers\AppServiceProvider($this->app))->boot();

        $this->assertSame('smtp', config('mail.mailers.smtp.scheme'));
    }

    public function test_mail_sender_treats_array_mailer_as_configured_without_smtp(): void
    {
        $this->assertSame(['MAIL_USERNAME', 'MAIL_PASSWORD'], MailSender::missing());
        $this->assertTrue(MailSender::configured());
    }

    /**
     * Le mail part reellement via le transport « array » : on inspecte le
     * message Symfony livre, pas un rendu de previsualisation.
     */
    private function sentEmails(): array
    {
        return app('mailer')->getSymfonyTransport()->messages()
            ->map(fn ($sent) => $sent->getOriginalMessage())
            ->all();
    }

    public function test_alert_email_details_the_timestamp_and_embeds_the_snapshot(): void
    {
        Storage::fake('local');

        $payload = [
            'type' => 'SLEEPING',
            'severity' => 'critical',
            'scenario' => 'bureau',
            'zone_name' => 'Poste 1',
            'camera_id' => 'cam-bureau-01',
            'session_id' => 'sess-42',
            'confidence' => 0.874,
            'duration' => 12.4,
            'created_at' => '2026-09-14T09:33:12+02:00',
            'email' => [
                'enabled' => true,
                'recipient' => 'admin@elastic-solutions.tn',
                'types' => ['sleeping'],
                'cooldown_minutes' => 5,
            ],
        ];

        $this->post('/api/ingest/alerts', [
            'payload' => json_encode($payload),
            'snapshot' => UploadedFile::fake()->create('capture.jpg', 12, 'image/jpeg'),
        ], $this->ingestHeaders())
            ->assertCreated()
            ->assertJson(['ok' => true, 'email' => 'queued']);

        $emails = $this->sentEmails();
        $this->assertCount(1, $emails);

        $email = $emails[0];
        $html = $email->getHtmlBody();

        // L'objet porte deja le quand et le ou.
        $this->assertSame(
            '[CV-Gateway] Endormissement — Poste 1 — 14/09/2026 09:33:12',
            $email->getSubject()
        );
        $this->assertSame('admin@elastic-solutions.tn', $email->getTo()[0]->getAddress());

        // Horodatage detaille : jour en toutes lettres, heure a la seconde,
        // fuseau, ISO 8601 et duree observee avant la levee de l'alerte.
        $this->assertStringContainsString('lundi 14 septembre 2026', $html);
        $this->assertStringContainsString('09:33:12', $html);
        $this->assertStringContainsString('Europe/Paris (UTC+02:00)', $html);
        $this->assertStringContainsString('2026-09-14T09:33:12+02:00', $html);
        $this->assertStringContainsString('12,4 s', $html);

        // Contexte complet de l'evenement.
        $this->assertStringContainsString('Endormissement', $html);
        $this->assertStringContainsString('Critique', $html);
        $this->assertStringContainsString('Poste 1', $html);
        $this->assertStringContainsString('cam-bureau-01', $html);
        $this->assertStringContainsString('87,4 %', $html);
        $this->assertStringContainsString('sess-42', $html);

        // Capture affichee dans le corps du message (piece jointe inline, cid:),
        // et non un lien distant que le client mail bloquerait.
        $attachments = $email->getAttachments();
        $this->assertCount(1, $attachments);
        $this->assertStringContainsString(
            'src="cid:'.$attachments[0]->getContentId().'"',
            $html
        );
        $this->assertStringContainsString('inline', $attachments[0]->getPreparedHeaders()->get('Content-Disposition')->toString());
    }

    public function test_alert_email_stays_readable_without_snapshot(): void
    {
        $this->postJson('/api/ingest/alerts', [
            'type' => 'NO_GLOVE',
            'severity' => 'critical',
            'scenario' => 'cuisine',
            'email' => [
                'enabled' => true,
                'recipient' => 'chef@elastic-solutions.tn',
                'types' => ['no_glove'],
            ],
        ], $this->ingestHeaders())
            ->assertCreated()
            ->assertJson(['email' => 'queued']);

        $emails = $this->sentEmails();
        $this->assertCount(1, $emails);

        $html = $emails[0]->getHtmlBody();
        $this->assertStringContainsString("Aucune capture n'était disponible", $html);
        $this->assertStringNotContainsString('cid:', $html);
        $this->assertSame([], $emails[0]->getAttachments());
    }
}
