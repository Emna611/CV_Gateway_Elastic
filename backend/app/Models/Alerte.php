<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Alerte extends Model
{
    public $timestamps = false;

    protected $table = 'alertes';

    public const LABELS = [
        'SLEEPING' => 'Endormissement',
        'FATIGUE' => 'Fatigue',
        'ON_PHONE' => 'Téléphone',
        'NO_GLOVE' => 'Absence de gants',
        'NO_HAIRNET' => 'Absence de charlotte',
        'NO_APRON' => 'Absence de tablier',
    ];

    protected $fillable = [
        'type',
        'severity',
        'scenario',
        'camera_id',
        'zone_name',
        'session_id',
        'confidence',
        'duration',
        'snapshot_path',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
            'confidence' => 'float',
            'duration' => 'float',
        ];
    }

    public function label(): string
    {
        return self::LABELS[$this->type] ?? $this->type;
    }
}
