<?php

namespace Tests\Feature;

use App\Jobs\SendAlertSms;
use App\Models\Alerte;
use App\Models\EmailCooldown;
use App\Support\SmsSender;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class SmsNotificationTest extends TestCase
{
    use RefreshDatabase;

    private function ingestHeaders(): array
    {
        return [
            'X-Ingest-Token' => 'test-ingest-token',
            'Accept' => 'application/json',
        ];
    }

    private function fakeTwilio(): void
    {
        config([
            'cvgateway.twilio.sid' => 'ACtest',
            'cvgateway.twilio.token' => 'token',
            'cvgateway.twilio.from' => '+15005550006',
        ]);
        Http::fake([
            'api.twilio.com/*' => Http::response(['sid' => 'SMfake'], 201),
        ]);
    }

    public function test_sms_status_requires_token_and_reports_missing_credentials(): void
    {
        $this->getJson('/api/notify/sms/status')
            ->assertStatus(401);

        $this->getJson('/api/notify/sms/status', $this->ingestHeaders())
            ->assertOk()
            ->assertJson([
                'ok' => true,
                'configured' => false,
            ]);
    }

    public function test_sms_is_queued_on_matching_alert_and_honors_cooldown(): void
    {
        $this->fakeTwilio();
        Queue::fake();

        $payload = [
            'type' => 'SLEEPING',
            'severity' => 'critical',
            'scenario' => 'bureau',
            'zone_name' => 'Poste 1',
            'sms' => [
                'enabled' => true,
                'phone' => '20123456',
                'types' => ['sleeping'],
                'cooldown_minutes' => 5,
            ],
        ];

        $this->postJson('/api/ingest/alerts', $payload, $this->ingestHeaders())
            ->assertCreated()
            ->assertJson(['ok' => true, 'sms' => 'queued']);

        $this->postJson('/api/ingest/alerts', $payload, $this->ingestHeaders())
            ->assertCreated()
            ->assertJson(['sms' => 'skipped_cooldown']);

        Queue::assertPushed(SendAlertSms::class, 1);
        $this->assertTrue(EmailCooldown::query()->where('recipient', 'sms:+21620123456')->exists());
    }

    public function test_sms_is_skipped_when_twilio_is_not_configured(): void
    {
        Queue::fake();

        $this->postJson('/api/ingest/alerts', [
            'type' => 'NO_GLOVE',
            'severity' => 'critical',
            'scenario' => 'cuisine',
            'sms' => [
                'enabled' => true,
                'phone' => '+21620123456',
                'types' => ['no_glove'],
            ],
        ], $this->ingestHeaders())
            ->assertCreated()
            ->assertJson(['sms' => 'not_configured']);

        Queue::assertNothingPushed();
        $this->assertSame(1, Alerte::query()->count());
    }

    public function test_sms_test_sends_via_twilio(): void
    {
        $this->fakeTwilio();

        $this->postJson('/api/notify/sms/test', [
            'phone' => '+21620123456',
        ], $this->ingestHeaders())
            ->assertOk()
            ->assertJson(['ok' => true, 'via' => 'Twilio']);

        Http::assertSent(function ($request) {
            return str_contains($request->url(), 'api.twilio.com')
                && $request['To'] === '+21620123456';
        });
    }

    public function test_phone_normalization_accepts_local_tunisian_numbers(): void
    {
        $this->assertSame('+21620123456', SmsSender::normalize('20 123 456'));
        $this->assertSame('+21620123456', SmsSender::normalize('0021620123456'));
    }
}
