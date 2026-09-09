<?php

namespace App\Support;

use DateTimeInterface;
use Illuminate\Support\Carbon;
use Symfony\Component\HttpFoundation\StreamedResponse;

class CsvExport
{
    /**
     * CSV UTF-8 avec BOM et séparateur point-virgule, lisible par Excel FR.
     *
     * @param  list<string>  $headers
     * @param  iterable<int, list<string>>  $rows
     */
    public static function download(string $filename, array $headers, iterable $rows): StreamedResponse
    {
        return response()->streamDownload(function () use ($headers, $rows) {
            $handle = fopen('php://output', 'w');
            fwrite($handle, "\xEF\xBB\xBF");
            fputcsv($handle, $headers, ';');
            foreach ($rows as $row) {
                fputcsv($handle, $row, ';');
            }
            fclose($handle);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }

    public static function timezone(): string
    {
        return (string) config('cvgateway.timezone', 'Europe/Paris');
    }

    public static function local(DateTimeInterface|string|null $value): ?Carbon
    {
        if ($value === null || $value === '') {
            return null;
        }

        return Carbon::parse($value)->timezone(self::timezone());
    }

    public static function date(?Carbon $value): string
    {
        return $value ? $value->format('d/m/Y') : '';
    }

    public static function time(?Carbon $value): string
    {
        return $value ? $value->format('H:i:s') : '';
    }

    public static function minutes(?int $seconds): string
    {
        if ($seconds === null) {
            return '';
        }

        return str_replace('.', ',', number_format($seconds / 60, 2, '.', ''));
    }
}
