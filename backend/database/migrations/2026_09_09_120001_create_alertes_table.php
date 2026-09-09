<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('alertes', function (Blueprint $table) {
            $table->id();
            $table->string('type');
            $table->string('severity', 32);
            $table->string('scenario');
            $table->string('camera_id')->nullable();
            $table->string('zone_name')->nullable();
            $table->string('session_id')->nullable();
            $table->float('confidence')->nullable();
            $table->float('duration')->nullable();
            $table->string('snapshot_path')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['scenario', 'created_at']);
            $table->index(['type', 'created_at']);
            $table->index('session_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('alertes');
    }
};
