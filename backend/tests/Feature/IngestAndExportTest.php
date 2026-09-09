<?php

namespace Tests\Feature;

use App\Jobs\SendAlertEmail;
use App\Models\Alerte;
use App\Models\EmailCooldown;
use App\Models\OccupationZone;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class IngestAndExportTest extends TestCase
{
    use RefreshDatabase;

    private function ingestHeaders(): array
    {
        return [
            'X-Ingest-Token' => 'test-ingest-token',
            'Accept' => 'application/json',
        ];
    }

    public function test_ingest_rejects_missing_token(): void
    {
        $this->postJson('/api/ingest/occupations', [
            'action' => 'enter',
            'session_id' => 'abc',
            'scenario' => 'bureau',
            'zone_id' => 'z1',
            'zone_name' => 'Poste 1',
            'activity_state' => 'ACTIVE',
        ])->assertStatus(401)->assertJson(['ok' => false]);
    }

    public function test_occupation_roundtrip_exports_csv_with_bom_and_semicolon(): void
    {
        $this->postJson('/api/ingest/occupations', [
            'action' => 'enter',
            'session_id' => 'sess-1',
            'scenario' => 'bureau',
            'zone_id' => 'poste-1',
            'zone_name' => 'Poste 1',
            'camera_id' => 'work-desk.mp4',
            'activity_state' => 'ACTIVE',
            'entered_at' => '2026-09-09T10:00:00+01:00',
        ], $this->ingestHeaders())->assertOk()->assertJson(['ok' => true]);

        $this->postJson('/api/ingest/occupations', [
            'action' => 'exit',
            'session_id' => 'sess-1',
            'scenario' => 'bureau',
            'zone_id' => 'poste-1',
            'activity_state' => 'IDLE',
            'exited_at' => '2026-09-09T10:05:00+01:00',
            'duration_seconds' => 300,
        ], $this->ingestHeaders())->assertOk();

        $this->assertDatabaseHas('occupation_zones', [
            'session_id' => 'sess-1',
            'zone_name' => 'Poste 1',
            'activity_state' => 'IDLE',
            'duration_seconds' => 300,
        ]);

        $response = $this->get('/api/export/occupation?session_id=sess-1&format=csv');
        $response->assertOk();
        $csv = $response->streamedContent();

        $this->assertStringStartsWith("\xEF\xBB\xBF", $csv);
        $this->assertStringContainsString('zone;date;heure_entree;heure_sortie;duree_minutes;etat_activite;scenario', $csv);
        $this->assertStringContainsString('Poste 1', $csv);
        $this->assertStringContainsString('5,00;IDLE;bureau', $csv);
    }

    public function test_alert_is_persisted_snapshot_attached_and_email_queued(): void
    {
        Storage::fake('local');
        Queue::fake();

        $jpeg = base64_decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wgALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AD/9k=');
        $file = UploadedFile::fake()->createWithContent('frame.jpg', $jpeg);

        $this->post('/api/ingest/alerts', [
            'payload' => json_encode([
                'type' => 'SLEEPING',
                'severity' => 'critical',
                'scenario' => 'bureau',
                'session_id' => 'sess-2',
                'zone_name' => 'Poste 2',
                'duration' => 12.5,
                'email' => [
                    'enabled' => true,
                    'recipient' => 'admin@elastic-solutions.tn',
                    'types' => ['sleeping'],
                    'cooldown_minutes' => 5,
                ],
            ]),
            'snapshot' => $file,
        ], $this->ingestHeaders())->assertCreated()->assertJson([
            'ok' => true,
            'email' => 'queued',
        ]);

        $alerte = Alerte::query()->first();
        $this->assertNotNull($alerte);
        $this->assertNotNull($alerte->snapshot_path);
        Queue::assertPushed(SendAlertEmail::class, fn (SendAlertEmail $job) => $job->alerteId === $alerte->id);
    }

    public function test_second_email_of_same_type_is_skipped_within_cooldown(): void
    {
        Queue::fake();

        $payload = [
            'type' => 'NO_GLOVE',
            'severity' => 'critical',
            'scenario' => 'cuisine',
            'email' => [
                'enabled' => true,
                'recipient' => 'admin@elastic-solutions.tn',
                'types' => ['no_glove'],
                'cooldown_minutes' => 5,
            ],
        ];

        $this->postJson('/api/ingest/alerts', $payload, $this->ingestHeaders())
            ->assertCreated()
            ->assertJson(['email' => 'queued']);

        $this->postJson('/api/ingest/alerts', $payload, $this->ingestHeaders())
            ->assertCreated()
            ->assertJson(['email' => 'skipped_cooldown']);

        $this->assertSame(2, Alerte::query()->count());
        $this->assertSame(1, EmailCooldown::query()->count());
        Queue::assertPushed(SendAlertEmail::class, 1);
    }

    public function test_alerts_csv_requires_from_and_uses_french_separator(): void
    {
        Alerte::query()->create([
            'type' => 'ON_PHONE',
            'severity' => 'moderate',
            'scenario' => 'bureau',
            'zone_name' => 'Poste 1',
            'created_at' => '2026-09-09 12:00:00',
        ]);

        $this->getJson('/api/export/alerts?format=csv')->assertStatus(422);

        $csv = $this->get('/api/export/alerts?from=2026-09-09T00:00:00&to=2026-09-10T00:00:00&format=csv')
            ->assertOk()
            ->streamedContent();

        $this->assertStringStartsWith("\xEF\xBB\xBF", $csv);
        $this->assertStringContainsString('type;severity;scenario;', $csv);
        $this->assertStringContainsString('ON_PHONE;moderate;bureau;', $csv);
    }

    public function test_close_session_fills_open_occupations(): void
    {
        OccupationZone::query()->create([
            'zone_id' => 'z1',
            'zone_name' => 'Poste 1',
            'scenario' => 'bureau',
            'session_id' => 'sess-3',
            'entered_at' => now()->subMinutes(2),
            'activity_state' => 'ACTIVE',
            'created_at' => now()->subMinutes(2),
        ]);

        $this->postJson('/api/ingest/sessions/sess-3/close', [], $this->ingestHeaders())
            ->assertOk()
            ->assertJson(['ok' => true, 'closed' => 1]);

        $this->assertNotNull(OccupationZone::query()->first()->exited_at);
    }

    public function test_queued_mail_is_sent_with_dashboard_link(): void
    {
        Mail::fake();

        $alerte = Alerte::query()->create([
            'type' => 'FATIGUE',
            'severity' => 'high',
            'scenario' => 'bureau',
            'zone_name' => 'Poste 3',
            'created_at' => now(),
        ]);

        (new SendAlertEmail($alerte->id, 'admin@elastic-solutions.tn'))->handle();

        Mail::assertSent(\App\Mail\AlertNotification::class, function ($mail) {
            $mail->assertSeeInHtml('Poste 3');
            $mail->assertSeeInHtml('/supervision/bureau');

            return $mail->hasTo('admin@elastic-solutions.tn');
        });
    }
}
