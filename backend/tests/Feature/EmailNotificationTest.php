<?php

namespace Tests\Feature;

use App\Mail\TestNotification;
use App\Support\MailSender;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
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
}
