<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

class EmailCooldown extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'type',
        'recipient',
        'sent_at',
    ];

    protected function casts(): array
    {
        return [
            'sent_at' => 'datetime',
        ];
    }

    public static function blocks(string $type, string $recipient, int $minutes): bool
    {
        if ($minutes < 1) {
            return false;
        }

        return static::query()
            ->where('type', $type)
            ->where('recipient', $recipient)
            ->where('sent_at', '>=', Carbon::now()->subMinutes($minutes))
            ->exists();
    }

    public static function remember(string $type, string $recipient): void
    {
        static::query()->create([
            'type' => $type,
            'recipient' => $recipient,
            'sent_at' => Carbon::now(),
        ]);
    }
}
