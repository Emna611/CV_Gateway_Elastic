<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OccupationZone extends Model
{
    public $timestamps = false;

    protected $table = 'occupation_zones';

    protected $fillable = [
        'zone_id',
        'zone_name',
        'camera_id',
        'scenario',
        'session_id',
        'entered_at',
        'exited_at',
        'duration_seconds',
        'activity_state',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'entered_at' => 'datetime',
            'exited_at' => 'datetime',
            'created_at' => 'datetime',
            'duration_seconds' => 'integer',
        ];
    }
}
