<?php

namespace App\Console\Commands;

use App\Jobs\SendDailyWorkReport;
use App\Models\ReportSetting;
use App\Support\CsvExport;
use App\Support\MailSender;
use App\Support\WorkTimeReport;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class SendWorkTimeReport extends Command
{
    protected $signature = 'report:work-time
        {--date= : Journée couverte (AAAA-MM-JJ). Par défaut : selon la période configurée}
        {--recipient= : Destinataire, sinon celui enregistré dans la configuration}
        {--force : Envoyer même si le rapport quotidien est désactivé}
        {--sync : Envoyer immédiatement sans passer par la file}';

    protected $description = 'Envoie par email le rapport CSV du temps de travail par poste (scénario bureau).';

    public function handle(): int
    {
        $setting = ReportSetting::forScenario(WorkTimeReport::SCENARIO);

        if (! $setting->enabled && ! $this->option('force')) {
            $this->info('Rapport quotidien désactivé : rien à envoyer (utilisez --force pour passer outre).');

            return self::SUCCESS;
        }

        $recipient = trim((string) ($this->option('recipient') ?: $setting->recipient));
        if ($recipient === '') {
            $this->error('Aucun destinataire : enregistrez-en un dans la configuration ou passez --recipient.');

            return self::FAILURE;
        }

        if (! MailSender::configured()) {
            $this->error('SMTP non configuré : renseignez '.implode(', ', MailSender::missing()).' dans backend/.env.');

            return self::FAILURE;
        }

        $date = $this->option('date') ?: self::dateFor($setting->period ?? 'today');

        $job = new SendDailyWorkReport($date, $recipient);
        if ($this->option('sync')) {
            $job->handle();
            $this->info("Rapport du {$date} envoyé à {$recipient}.");
        } else {
            SendDailyWorkReport::dispatch($date, $recipient);
            $this->info("Rapport du {$date} mis en file pour {$recipient}.");
        }

        return self::SUCCESS;
    }

    /** Journée couverte selon la période configurée : la journée en cours ou la veille. */
    public static function dateFor(string $period): string
    {
        $today = Carbon::now(CsvExport::timezone());

        return ($period === 'yesterday' ? $today->subDay() : $today)->format('Y-m-d');
    }
}
