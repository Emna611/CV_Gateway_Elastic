<?php

namespace App\Support;

use App\Models\OccupationZone;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Rapport quotidien « temps de travail » du scénario bureau.
 *
 * Chaque poste (zone tracée) correspond à un employé : le rapport agrège les
 * passages enregistrés par le moteur (occupation_zones) sur une journée
 * civile du fuseau de l'application, et produit deux CSV : la synthèse par
 * poste et le détail des présences.
 */
class WorkTimeReport
{
    public const SCENARIO = 'bureau';

    public readonly Carbon $dayStart;

    public readonly Carbon $dayEnd;

    /** @var Collection<int, OccupationZone> */
    private Collection $rows;

    public function __construct(public readonly Carbon $day, public readonly string $scenario = self::SCENARIO)
    {
        $timezone = CsvExport::timezone();
        $this->dayStart = $day->copy()->timezone($timezone)->startOfDay();
        $this->dayEnd = $this->dayStart->copy()->endOfDay();

        $this->rows = OccupationZone::query()
            ->where('scenario', $scenario)
            ->where('entered_at', '>=', $this->dayStart->copy()->utc())
            ->where('entered_at', '<=', $this->dayEnd->copy()->utc())
            ->orderBy('entered_at')
            ->get();
    }

    public static function for(string $date, string $scenario = self::SCENARIO): self
    {
        return new self(Carbon::parse($date, CsvExport::timezone()), $scenario);
    }

    public function isEmpty(): bool
    {
        return $this->rows->isEmpty();
    }

    public function presenceCount(): int
    {
        return $this->rows->count();
    }

    /**
     * Synthèse par poste, triée par nom.
     *
     * @return list<array{
     *     poste: string,
     *     premiere_entree: ?Carbon,
     *     derniere_sortie: ?Carbon,
     *     nb_presences: int,
     *     actif_seconds: int,
     *     inactif_seconds: int,
     *     total_seconds: int,
     *     en_cours: bool
     * }>
     */
    public function summary(): array
    {
        $byZone = [];
        $clock = $this->clock();

        foreach ($this->rows as $row) {
            $entered = CsvExport::local($row->entered_at);
            $exited = CsvExport::local($row->exited_at);
            $seconds = $this->seconds($row, $clock);
            $key = $row->zone_name ?: $row->zone_id;

            $zone = $byZone[$key] ?? [
                'poste' => $key,
                'premiere_entree' => null,
                'derniere_sortie' => null,
                'nb_presences' => 0,
                'actif_seconds' => 0,
                'inactif_seconds' => 0,
                'total_seconds' => 0,
                'en_cours' => false,
            ];

            if ($entered && ($zone['premiere_entree'] === null || $entered->lt($zone['premiere_entree']))) {
                $zone['premiere_entree'] = $entered;
            }
            if ($exited && ($zone['derniere_sortie'] === null || $exited->gt($zone['derniere_sortie']))) {
                $zone['derniere_sortie'] = $exited;
            }
            if ($exited === null) {
                $zone['en_cours'] = true;
            }

            $zone['nb_presences']++;
            $zone['total_seconds'] += $seconds;
            if ($row->activity_state === 'IDLE') {
                $zone['inactif_seconds'] += $seconds;
            } else {
                $zone['actif_seconds'] += $seconds;
            }

            $byZone[$key] = $zone;
        }

        ksort($byZone, SORT_NATURAL);

        return array_values($byZone);
    }

    public function totalSeconds(): int
    {
        return array_sum(array_column($this->summary(), 'total_seconds'));
    }

    /** CSV de synthèse : une ligne par poste. */
    public function summaryCsv(): string
    {
        $rows = array_map(fn (array $zone) => [
            CsvExport::date($this->dayStart),
            $zone['poste'],
            CsvExport::time($zone['premiere_entree']),
            $zone['en_cours'] ? 'en cours' : CsvExport::time($zone['derniere_sortie']),
            (string) $zone['nb_presences'],
            CsvExport::minutes($zone['actif_seconds']),
            CsvExport::minutes($zone['inactif_seconds']),
            CsvExport::minutes($zone['total_seconds']),
            self::hhmm($zone['total_seconds']),
        ], $this->summary());

        return self::csv(
            [
                'date', 'poste', 'premiere_entree', 'derniere_sortie', 'nb_presences',
                'temps_actif_minutes', 'temps_inactif_minutes', 'temps_total_minutes', 'temps_total_hhmm',
            ],
            $rows,
        );
    }

    /** CSV détaillé : une ligne par présence, même format que l'export « occupations ». */
    public function detailCsv(): string
    {
        $clock = $this->clock();
        $rows = $this->rows->map(function (OccupationZone $row) use ($clock) {
            $entered = CsvExport::local($row->entered_at);
            $exited = CsvExport::local($row->exited_at);

            return [
                $row->zone_name ?: $row->zone_id,
                CsvExport::date($entered),
                CsvExport::time($entered),
                $exited ? CsvExport::time($exited) : 'en cours',
                CsvExport::minutes($this->seconds($row, $clock)),
                $row->activity_state,
                $row->camera_id ?? '',
                $row->session_id ?? '',
            ];
        })->all();

        return self::csv(
            ['poste', 'date', 'heure_entree', 'heure_sortie', 'duree_minutes', 'etat_activite', 'camera', 'session'],
            $rows,
        );
    }

    public function summaryFilename(): string
    {
        return 'temps_travail_'.$this->dayStart->format('Y-m-d').'.csv';
    }

    public function detailFilename(): string
    {
        return 'presences_detail_'.$this->dayStart->format('Y-m-d').'.csv';
    }

    public static function hhmm(int $seconds): string
    {
        $seconds = max(0, $seconds);

        return sprintf('%02dh%02d', intdiv($seconds, 3600), intdiv($seconds % 3600, 60));
    }

    /** Instant de référence pour une présence encore ouverte : maintenant, borné à la fin du jour. */
    private function clock(): Carbon
    {
        $now = CsvExport::local(now());

        return $now->lt($this->dayEnd) ? $now : $this->dayEnd->copy();
    }

    private function seconds(OccupationZone $row, Carbon $clock): int
    {
        if ($row->duration_seconds !== null) {
            return max(0, (int) $row->duration_seconds);
        }
        $entered = CsvExport::local($row->entered_at);
        if ($entered === null) {
            return 0;
        }
        $end = CsvExport::local($row->exited_at) ?? $clock;

        return max(0, (int) $entered->diffInSeconds($end, true));
    }

    /**
     * @param  list<string>  $headers
     * @param  iterable<int, list<string>>  $rows
     */
    private static function csv(array $headers, iterable $rows): string
    {
        $handle = fopen('php://temp', 'r+');
        fwrite($handle, "\xEF\xBB\xBF");
        fputcsv($handle, $headers, ';');
        foreach ($rows as $row) {
            fputcsv($handle, $row, ';');
        }
        rewind($handle);
        $content = stream_get_contents($handle);
        fclose($handle);

        return $content;
    }
}
