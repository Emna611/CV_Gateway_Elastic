<?php

namespace Tests\Feature;

use App\Jobs\SendDailyWorkReport;
use App\Mail\DailyWorkReport;
use App\Models\OccupationZone;
use App\Models\ReportSetting;
use App\Support\WorkTimeReport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class DailyWorkReportTest extends TestCase
{
    use RefreshDatabase;

    private function seedDay(): void
    {
        // Journée du 22/09/2026 (Europe/Paris = UTC+2 en septembre).
        OccupationZone::query()->create([
            'zone_id' => 'zone_1', 'zone_name' => 'Poste 1', 'scenario' => 'bureau', 'session_id' => 's1',
            'entered_at' => '2026-09-22T07:00:00+02:00', 'exited_at' => '2026-09-22T09:00:00+02:00',
            'duration_seconds' => 7200, 'activity_state' => 'ACTIVE', 'created_at' => now(),
        ]);
        OccupationZone::query()->create([
            'zone_id' => 'zone_1', 'zone_name' => 'Poste 1', 'scenario' => 'bureau', 'session_id' => 's1',
            'entered_at' => '2026-09-22T09:30:00+02:00', 'exited_at' => '2026-09-22T10:00:00+02:00',
            'duration_seconds' => 1800, 'activity_state' => 'IDLE', 'created_at' => now(),
        ]);
        OccupationZone::query()->create([
            'zone_id' => 'zone_2', 'zone_name' => 'Poste 2', 'scenario' => 'bureau', 'session_id' => 's1',
            'entered_at' => '2026-09-22T08:15:00+02:00', 'exited_at' => '2026-09-22T12:15:00+02:00',
            'duration_seconds' => 14400, 'activity_state' => 'ACTIVE', 'created_at' => now(),
        ]);
        // Hors journée : ne doit pas apparaître.
        OccupationZone::query()->create([
            'zone_id' => 'zone_1', 'zone_name' => 'Poste 1', 'scenario' => 'bureau', 'session_id' => 's0',
            'entered_at' => '2026-09-21T10:00:00+02:00', 'exited_at' => '2026-09-21T11:00:00+02:00',
            'duration_seconds' => 3600, 'activity_state' => 'ACTIVE', 'created_at' => now(),
        ]);
        // Autre scénario : ignoré.
        OccupationZone::query()->create([
            'zone_id' => 'k', 'zone_name' => 'Cuisine', 'scenario' => 'cuisine', 'session_id' => 's9',
            'entered_at' => '2026-09-22T10:00:00+02:00', 'exited_at' => '2026-09-22T11:00:00+02:00',
            'duration_seconds' => 3600, 'activity_state' => 'ACTIVE', 'created_at' => now(),
        ]);
    }

    public function test_report_aggregates_work_time_per_post(): void
    {
        $this->seedDay();

        $report = WorkTimeReport::for('2026-09-22');
        $summary = $report->summary();

        $this->assertCount(2, $summary);
        $this->assertSame('Poste 1', $summary[0]['poste']);
        $this->assertSame(2, $summary[0]['nb_presences']);
        $this->assertSame(7200, $summary[0]['actif_seconds']);
        $this->assertSame(1800, $summary[0]['inactif_seconds']);
        $this->assertSame(9000, $summary[0]['total_seconds']);
        $this->assertSame('07:00:00', $summary[0]['premiere_entree']->format('H:i:s'));
        $this->assertSame('10:00:00', $summary[0]['derniere_sortie']->format('H:i:s'));
        $this->assertSame(14400, $summary[1]['total_seconds']);
        $this->assertSame(23400, $report->totalSeconds());

        $csv = $report->summaryCsv();
        $this->assertStringStartsWith("\xEF\xBB\xBF", $csv);
        $this->assertStringContainsString('date;poste;premiere_entree;derniere_sortie;nb_presences;', $csv);
        $this->assertStringContainsString('22/09/2026;"Poste 1";07:00:00;10:00:00;2;120,00;30,00;150,00;02h30', $csv);
        $this->assertStringContainsString('22/09/2026;"Poste 2";08:15:00;12:15:00;1;240,00;0,00;240,00;04h00', $csv);

        $detail = $report->detailCsv();
        $this->assertSame(3, substr_count($detail, "\n") - 1);
        $this->assertStringNotContainsString('Cuisine', $detail);
    }

    public function test_mail_embeds_summary_and_attaches_both_csv(): void
    {
        $this->seedDay();

        $mailable = new DailyWorkReport(WorkTimeReport::for('2026-09-22'));
        $mailable->assertHasSubject('[CV-Gateway] Temps de travail — 22/09/2026');
        $mailable->assertSeeInHtml('Poste 1');
        $mailable->assertSeeInHtml('02h30');
        $mailable->assertSeeInHtml('temps_travail_2026-09-22.csv');

        $attachments = $mailable->attachments();
        $this->assertCount(2, $attachments);
    }

    public function test_settings_roundtrip_and_next_run(): void
    {
        $this->getJson('/api/export/report/daily')
            ->assertOk()
            ->assertJsonPath('settings.enabled', false)
            ->assertJsonPath('settings.send_at', '18:00')
            ->assertJsonPath('next_run_at', null);

        $this->putJson('/api/export/report/daily', [
            'enabled' => true,
            'recipient' => 'rh@elastic-solutions.tn',
            'send_at' => '17:30',
            'period' => 'today',
        ])->assertOk()
            ->assertJsonPath('settings.enabled', true)
            ->assertJsonPath('settings.recipient', 'rh@elastic-solutions.tn')
            ->assertJsonPath('settings.send_at', '17:30');

        $this->assertNotNull($this->getJson('/api/export/report/daily')->json('next_run_at'));

        $this->putJson('/api/export/report/daily', [
            'enabled' => true,
            'recipient' => '',
            'send_at' => '17:30',
            'period' => 'today',
        ])->assertStatus(422);
    }

    public function test_send_now_queues_the_report_for_the_configured_period(): void
    {
        Queue::fake();
        $this->seedDay();
        ReportSetting::query()->create([
            'scenario' => 'bureau', 'enabled' => true, 'recipient' => 'rh@elastic-solutions.tn',
            'send_at' => '18:00', 'period' => 'yesterday',
        ]);

        Carbon::setTestNow(Carbon::parse('2026-09-23 09:00:00', 'Europe/Paris'));

        $this->postJson('/api/export/report/daily/send', [])
            ->assertOk()
            ->assertJsonPath('date', '2026-09-22')
            ->assertJsonPath('postes', 2)
            ->assertJsonPath('presences', 3);

        Queue::assertPushed(SendDailyWorkReport::class, function (SendDailyWorkReport $job) {
            return $job->date === '2026-09-22' && $job->recipient === 'rh@elastic-solutions.tn';
        });

        Carbon::setTestNow();
    }

    public function test_command_sends_and_records_last_sent(): void
    {
        Mail::fake();
        $this->seedDay();
        ReportSetting::query()->create([
            'scenario' => 'bureau', 'enabled' => true, 'recipient' => 'rh@elastic-solutions.tn',
            'send_at' => '18:00', 'period' => 'today',
        ]);

        $this->artisan('report:work-time', ['--date' => '2026-09-22', '--sync' => true])
            ->assertSuccessful();

        Mail::assertSent(DailyWorkReport::class, fn (DailyWorkReport $mail) => $mail->hasTo('rh@elastic-solutions.tn'));
        $this->assertNotNull(ReportSetting::forScenario('bureau')->last_sent_at);
    }

    public function test_command_skips_when_disabled(): void
    {
        Mail::fake();

        $this->artisan('report:work-time')->assertSuccessful();

        Mail::assertNothingSent();
    }
}
