<?php

namespace App\Http\Controllers;

use App\Models\Alerte;
use App\Models\OccupationZone;
use App\Support\CsvExport;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpFoundation\Response;

class ExportController extends Controller
{
    public function occupation(Request $request): StreamedResponse|JsonResponse
    {
        $request->validate([
            'session_id' => ['nullable', 'string', 'max:64'],
            'scenario' => ['nullable', 'string', 'max:32'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'format' => ['nullable', 'in:csv,json'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:200'],
        ]);

        $sessionId = $request->query('session_id');
        $from = $request->query('from');

        if (! $sessionId && ! $from) {
            throw ValidationException::withMessages([
                'from' => 'Indiquez session_id ou une période (from).',
            ]);
        }

        $query = OccupationZone::query();
        $this->applyCommonFilters($query, $request, 'entered_at');

        if ($request->query('format') === 'json') {
            $limit = (int) ($request->query('limit') ?? 80);
            $rows = (clone $query)->orderByDesc('entered_at')->limit($limit)->get();

            return response()->json([
                'ok' => true,
                'count' => (clone $query)->count(),
                'rows' => $rows->map(fn (OccupationZone $row) => $this->serializeOccupation($row))->values(),
            ]);
        }

        $rows = $query->orderBy('entered_at')->get()->map(function (OccupationZone $row) {
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

    public function alerts(Request $request): StreamedResponse|JsonResponse
    {
        $request->validate([
            'from' => ['nullable', 'date', 'required_without:session_id'],
            'to' => ['nullable', 'date'],
            'scenario' => ['nullable', 'string', 'max:32'],
            'session_id' => ['nullable', 'string', 'max:64'],
            'format' => ['nullable', 'in:csv,json'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:200'],
        ]);

        $query = Alerte::query();
        $this->applyCommonFilters($query, $request, 'created_at');

        if ($request->query('format') === 'json') {
            $limit = (int) ($request->query('limit') ?? 80);
            $rows = (clone $query)->orderByDesc('created_at')->limit($limit)->get();

            return response()->json([
                'ok' => true,
                'count' => (clone $query)->count(),
                'rows' => $rows->map(fn (Alerte $row) => $this->serializeAlert($row))->values(),
            ]);
        }

        $csvRows = $query->orderBy('created_at')->get()->map(function (Alerte $row) {
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
            $csvRows
        );
    }

    public function snapshot(Alerte $alerte): Response
    {
        $path = $alerte->snapshot_path;
        if (! $path || ! Storage::disk('local')->exists($path)) {
            abort(404, 'Capture indisponible.');
        }

        return Storage::disk('local')->response($path, 'capture.jpg', [
            'Content-Type' => 'image/jpeg',
            'Cache-Control' => 'private, max-age=3600',
        ]);
    }

    public function destroyJournal(Request $request): JsonResponse
    {
        $request->validate([
            'session_id' => ['nullable', 'string', 'max:64'],
            'scenario' => ['nullable', 'string', 'max:32'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        if (! $request->filled('session_id') && ! $request->filled('from')) {
            throw ValidationException::withMessages([
                'from' => 'Indiquez session_id ou une période (from).',
            ]);
        }

        $occupations = OccupationZone::query();
        $this->applyCommonFilters($occupations, $request, 'entered_at');

        $alerts = Alerte::query();
        $this->applyCommonFilters($alerts, $request, 'created_at');

        $snapshotPaths = (clone $alerts)
            ->whereNotNull('snapshot_path')
            ->pluck('snapshot_path')
            ->filter()
            ->unique()
            ->values();

        $deletedOccupations = (clone $occupations)->delete();
        $deletedAlerts = (clone $alerts)->delete();

        foreach ($snapshotPaths as $path) {
            Storage::disk('local')->delete($path);
        }

        $directories = $snapshotPaths
            ->map(fn (string $path) => dirname($path))
            ->unique()
            ->filter(fn (string $dir) => $dir !== '' && $dir !== '.');

        foreach ($directories as $directory) {
            if (Storage::disk('local')->exists($directory) && Storage::disk('local')->files($directory) === []) {
                Storage::disk('local')->deleteDirectory($directory);
            }
        }

        return response()->json([
            'ok' => true,
            'deleted' => [
                'occupations' => $deletedOccupations,
                'alerts' => $deletedAlerts,
                'snapshots' => $snapshotPaths->count(),
            ],
        ]);
    }

    /**
     * @param  Builder<OccupationZone|Alerte>  $query
     */
    private function applyCommonFilters(Builder $query, Request $request, string $dateColumn): void
    {
        if ($request->filled('session_id')) {
            $query->where('session_id', $request->query('session_id'));
        }
        if ($request->filled('scenario')) {
            $query->where('scenario', $request->query('scenario'));
        }
        if ($request->filled('from')) {
            $query->where($dateColumn, '>=', Carbon::parse($request->query('from')));
        }
        if ($request->filled('to')) {
            $query->where($dateColumn, '<=', Carbon::parse($request->query('to')));
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeOccupation(OccupationZone $row): array
    {
        $seconds = $row->duration_seconds;
        if ($seconds === null && $row->entered_at) {
            $end = $row->exited_at ?? now();
            $seconds = max(0, $end->diffInSeconds($row->entered_at));
        }

        return [
            'id' => $row->id,
            'zone_id' => $row->zone_id,
            'zone_name' => $row->zone_name,
            'camera_id' => $row->camera_id,
            'scenario' => $row->scenario,
            'session_id' => $row->session_id,
            'entered_at' => $row->entered_at?->toIso8601String(),
            'exited_at' => $row->exited_at?->toIso8601String(),
            'duration_seconds' => $seconds,
            'activity_state' => $row->activity_state,
            'open' => $row->exited_at === null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeAlert(Alerte $row): array
    {
        return [
            'id' => $row->id,
            'type' => $row->type,
            'label' => $row->label(),
            'severity' => $row->severity,
            'scenario' => $row->scenario,
            'camera_id' => $row->camera_id,
            'zone_name' => $row->zone_name,
            'session_id' => $row->session_id,
            'confidence' => $row->confidence,
            'duration' => $row->duration,
            'created_at' => $row->created_at?->toIso8601String(),
            'snapshot_url' => $row->snapshot_path
                ? '/api/export/snapshot/'.$row->id
                : null,
        ];
    }
}
