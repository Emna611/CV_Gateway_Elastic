<?php

use App\Models\ReportSetting;
use App\Support\WorkTimeReport;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;
use Illuminate\Support\Facades\Schema;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
| Rapport quotidien « temps de travail » (scénario bureau).
|
| L'heure d'envoi est lue dans report_settings à chaque tour du planificateur,
| donc modifiable depuis l'interface sans redémarrage. Nécessite un processus
| `php artisan schedule:work` (voir start.bat / docker-compose).
*/
$reportSendAt = '18:00';
try {
    if (Schema::hasTable('report_settings')) {
        $reportSendAt = ReportSetting::forScenario(WorkTimeReport::SCENARIO)->send_at ?: '18:00';
    }
} catch (Throwable) {
    // Base indisponible (avant migration) : l'heure par défaut s'applique.
}

Schedule::command('report:work-time')
    ->dailyAt($reportSendAt)
    ->timezone((string) config('cvgateway.timezone', 'Europe/Paris'))
    ->name('report:work-time')
    ->withoutOverlapping()
    ->description('Rapport CSV quotidien du temps de travail par poste');
