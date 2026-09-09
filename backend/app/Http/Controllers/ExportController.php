<?php

namespace App\Http\Controllers;

use App\Models\Alerte;
use App\Models\OccupationZone;
use App\Support\CsvExport;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ExportController extends Controller
{
    public function occupation(Request $request): StreamedResponse
    {
        $request->validate([
            'session_id' => ['nullable', 'string', 'max:64'],
            'scenario' => ['nullable', 'string', 'max:32'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'format' => ['nullable', 'in:csv'],
        ]);

        $sessionId = $request->query('session_id');
        $from = $request->query('from');
        $to = $request->query('to');

        if (! $sessionId && ! $from) {
            throw ValidationException::withMessages([
                'from' => "Indiquez session_id ou une période (from).",
            ]);
        }

        $query = OccupationZone::query()->orderBy('entered_at');

        if ($sessionId) {
            $query->where('session_id', $sessionId);
        }
        if ($request->filled('scenario')) {
            $query->where('scenario', $request->query('scenario'));
        }
        if ($from) {
            $query->where('entered_at', '>=', Carbon::parse($from));
        }
        if ($to) {
            $query->where('entered_at', '<=', Carbon::parse($to));
        }

        $rows = $query->get()->map(function (OccupationZone $row) {
            $entered = CsvExport::local($row->entered_at);
            $exited = CsvExport::local($row->exited_at);
            $seconds = $row->duration_seconds;
            if ($seconds === null && $entered) {
                $end = $exited ?? CsvExport::local(now());
                $seconds = max(0, $end->diffInSeconds($entered));
            }

            return [
                $row->zone_name,
                CsvExport::date($entered),
                CsvExport::time($entered),
                CsvExport::time($exited),
                CsvExport::minutes($seconds),
                $row->activity_state,
                $row->scenario,
            ];
        });

        $stamp = now()->timezone(CsvExport::timezone())->format('Ymd_His');

        return CsvExport::download(
            "occupations_{$stamp}.csv",
            ['zone', 'date', 'heure_entree', 'heure_sortie', 'duree_minutes', 'etat_activite', 'scenario'],
            $rows
        );
    }

    public function alerts(Request $request): StreamedResponse
    {
        $request->validate([
            'from' => ['required', 'date'],
            'to' => ['nullable', 'date'],
            'scenario' => ['nullable', 'string', 'max:32'],
            'session_id' => ['nullable', 'string', 'max:64'],
            'format' => ['nullable', 'in:csv'],
        ]);

        $query = Alerte::query()
            ->where('created_at', '>=', Carbon::parse($request->query('from')))
            ->orderBy('created_at');

        if ($request->filled('to')) {
            $query->where('created_at', '<=', Carbon::parse($request->query('to')));
        }
        if ($request->filled('scenario')) {
            $query->where('scenario', $request->query('scenario'));
        }
        if ($request->filled('session_id')) {
            $query->where('session_id', $request->query('session_id'));
        }

        $rows = $query->get()->map(function (Alerte $row) {
            $when = CsvExport::local($row->created_at);

            return [
                $row->type,
                $row->severity,
                $row->scenario,
                $row->camera_id ?? '',
                $row->zone_name ?? '',
                $row->confidence === null ? '' : str_replace('.', ',', (string) $row->confidence),
                $row->duration === null ? '' : str_replace('.', ',', (string) $row->duration),
                CsvExport::date($when),
                CsvExport::time($when),
            ];
        });

        $stamp = now()->timezone(CsvExport::timezone())->format('Ymd_His');

        return CsvExport::download(
            "alertes_{$stamp}.csv",
            ['type', 'severity', 'scenario', 'camera_id', 'zone_name', 'confidence', 'duration', 'date', 'heure'],
            $rows
        );
    }
}
