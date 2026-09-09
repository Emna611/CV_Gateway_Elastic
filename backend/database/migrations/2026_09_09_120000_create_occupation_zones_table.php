<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('occupation_zones', function (Blueprint $table) {
            $table->id();
            $table->string('zone_id');
            $table->string('zone_name');
            $table->string('camera_id')->nullable();
            $table->string('scenario');
            $table->string('session_id');
            $table->timestamp('entered_at');
            $table->timestamp('exited_at')->nullable();
            $table->unsignedInteger('duration_seconds')->nullable();
            $table->string('activity_state', 16);
            $table->timestamp('created_at')->useCurrent();

            $table->index(['session_id', 'zone_id']);
            $table->index(['scenario', 'entered_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('occupation_zones');
    }
};
