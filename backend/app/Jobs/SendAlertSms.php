<?php

namespace App\Jobs;

use App\Models\Alerte;
use App\Support\SmsNotConfigured;
use App\Support\SmsSender;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

class SendAlertSms implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(
        public int $alerteId,
        public string $phone,
    ) {}

    public function handle(): void
    {
        $alerte = Alerte::query()->find($this->alerteId);
        if ($alerte === null) {
            return;
        }

        try {
            SmsSender::send($this->phone, SmsSender::bodyFor($alerte));
        } catch (SmsNotConfigured $exception) {
            Log::warning($exception->getMessage());
        }
    }
}
