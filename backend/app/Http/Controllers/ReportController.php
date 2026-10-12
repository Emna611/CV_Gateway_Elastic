<?php

namespace App\Http\Controllers;

use App\Console\Commands\SendWorkTimeReport;
use App\Jobs\SendDailyWorkReport;
use App\Models\ReportSetting;
use App\Support\CsvExport;
use App\Support\MailSender;
use App\Support\WorkTimeReport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

/**
 * Rapport quotidien du temps de travail (scénario bureau) : réglages,
 * aperçu et envoi immédiat. Servi sous /api/export pour passer par le même
 * proxy que les autres appels Laravel du frontend.
 */
class ReportController extends Controller
{
    public function show(): JsonResponse
    {
        $setting = ReportSetting::forScenario(WorkTimeReport::SCENARIO);

        return response()->json([
            'ok' => true,
            'settings' => $setting->toPayload(),
            'smtp_configured' => MailSender::configured(),
            'next_run_at' => $this->nextRun($setting),
            'timezone' => CsvExport::timezone(),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
            'recipient' => ['nullable', 'email', 'max:180', 'required_if:enabled,true'],
            'send_at' => ['required', 'date_format:H:i'],
            'period' => ['required', Rule::in(ReportSetting::PERIODS)],
        ]);

        $setting = ReportSetting::forScenario(WorkTimeReport::SCENARIO);
        $setting->fill([
            'enabled' => $data['enabled'],
            'recipient' => $data['recipient'] ?? null,
            'send_at' => $data['send_at'],
            'period' => $data['period'],
        ]);
        $setting->save();

        return response()->json([
            'ok' => true,
            'settings' => $setting->toPayload(),
            'next_run_at' => $this->nextRun($setting),
        ]);
    }

    public function preview(Request $request): JsonResponse
    {
        $request->validate(['date' => ['nullable', 'date']]);

        $date = $request->query('date') ?: SendWorkTimeReport::dateFor(
            ReportSetting::forScenario(WorkTimeReport::SCENARIO)->period ?? 'today'
        );
        $report = WorkTimeReport::for($date);

        return response()->json([
            'ok' => true,
            'date' => $report->dayStart->format('Y-m-d'),
            'postes' => array_map(fn (array $zone) => [
                'poste' => $zone['poste'],
                'premiere_entree' => CsvExport::time($zone['premiere_entree']),
                'derniere_sortie' => $zone['en_cours'] ? null : CsvExport::time($zone['derniere_sortie']),
                'en_cours' => $zone['en_cours'],
                'nb_presences' => $zone['nb_presences'],
                'actif_seconds' => $zone['actif_seconds'],
                'inactif_seconds' => $zone['inactif_seconds'],
                'total_seconds' => $zone['total_seconds'],
            ], $report->summary()),
            'presences' => $report->presenceCount(),
            'total_seconds' => $report->totalSeconds(),
        ]);
    }

    public function send(Request $request): JsonResponse
    {
        $data = $request->validate([
            'recipient' => ['nullable', 'email', 'max:180'],
            'date' => ['nullable', 'date'],
        ]);

        $setting = ReportSetting::forScenario(WorkTimeReport::SCENARIO);
        $recipient = trim((string) ($data['recipient'] ?? $setting->recipient));
        if ($recipient === '') {
            return response()->json(['ok' => false, 'error' => 'Indiquez un destinataire.'], 422);
        }

        if (! MailSender::configured()) {
            return response()->json([
                'ok' => false,
                'configured' => false,
                'error' => 'SMTP non configuré : renseignez '.implode(', ', MailSender::missing()).' dans backend/.env.',
            ], 503);
        }

        $date = isset($data['date'])
            ? Carbon::parse($data['date'], CsvExport::timezone())->format('Y-m-d')
            : SendWorkTimeReport::dateFor($setting->period ?? 'today');

        $report = WorkTimeReport::for($date);
        SendDailyWorkReport::dispatch($date, $recipient, WorkTimeReport::SCENARIO, false);

        return response()->json([
            'ok' => true,
            'message' => 'Rapport du '.$report->dayStart->format('d/m/Y').' envoyé à '.$recipient.'.',
            'date' => $date,
            'postes' => count($report->summary()),
            'presences' => $report->presenceCount(),
            'total_seconds' => $report->totalSeconds(),
        ]);
    }

    private function nextRun(ReportSetting $setting): ?string
    {
        if (! $setting->enabled) {
            return null;
        }
        [$hour, $minute] = array_map('intval', explode(':', $setting->send_at ?: '18:00'));
        $next = Carbon::now(CsvExport::timezone())->setTime($hour, $minute, 0);
        if ($next->isPast()) {
            $next->addDay();
        }

        return $next->toIso8601String();
    }
}
