<?php

namespace App\Jobs;

use App\Mail\AlertNotification;
use App\Models\Alerte;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Mail;

class SendAlertEmail implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(
        public int $alerteId,
        public string $recipient,
    ) {}

    public function handle(): void
    {
        $alerte = Alerte::query()->find($this->alerteId);
        if ($alerte === null) {
            return;
        }

        Mail::to($this->recipient)->send(new AlertNotification($alerte));
    }
}
