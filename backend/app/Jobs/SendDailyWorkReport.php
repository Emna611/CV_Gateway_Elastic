<?php

namespace App\Jobs;

use App\Mail\DailyWorkReport;
use App\Models\ReportSetting;
use App\Support\WorkTimeReport;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Mail;

class SendDailyWorkReport implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(
        public string $date,
        public string $recipient,
        public string $scenario = WorkTimeReport::SCENARIO,
        public bool $remember = true,
    ) {}

    public function handle(): void
    {
        $report = WorkTimeReport::for($this->date, $this->scenario);

        Mail::to($this->recipient)->send(new DailyWorkReport($report));

        if ($this->remember) {
            $setting = ReportSetting::forScenario($this->scenario);
            $setting->last_sent_at = now();
            $setting->save();
        }
    }
}
