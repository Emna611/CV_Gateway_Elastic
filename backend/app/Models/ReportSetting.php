<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReportSetting extends Model
{
    public const PERIODS = ['today', 'yesterday'];

    protected $table = 'report_settings';

    protected $fillable = [
        'scenario',
        'enabled',
        'recipient',
        'send_at',
        'period',
        'last_sent_at',
    ];

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'last_sent_at' => 'datetime',
        ];
    }

    /** Paramètres d'un scénario, avec les valeurs par défaut s'il n'a jamais été enregistré. */
    public static function forScenario(string $scenario): self
    {
        return self::query()->firstOrNew(
            ['scenario' => $scenario],
            ['enabled' => false, 'recipient' => null, 'send_at' => '18:00', 'period' => 'today'],
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function toPayload(): array
    {
        return [
            'scenario' => $this->scenario,
            'enabled' => (bool) $this->enabled,
            'recipient' => $this->recipient ?? '',
            'send_at' => $this->send_at ?? '18:00',
            'period' => $this->period ?? 'today',
            'last_sent_at' => $this->last_sent_at?->toIso8601String(),
        ];
    }
}
