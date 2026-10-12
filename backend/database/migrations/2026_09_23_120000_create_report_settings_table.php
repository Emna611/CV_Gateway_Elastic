<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /*
    | Paramètres du rapport quotidien « temps de travail » (scénario bureau).
    | Une ligne par scénario : destinataire, heure d'envoi, période couverte,
    | dernier envoi. Le planificateur Laravel les lit à chaque tour.
    */
    public function up(): void
    {
        Schema::create('report_settings', function (Blueprint $table) {
            $table->id();
            $table->string('scenario', 32)->unique();
            $table->boolean('enabled')->default(false);
            $table->string('recipient', 180)->nullable();
            $table->string('send_at', 5)->default('18:00');
            $table->string('period', 16)->default('today');
            $table->timestamp('last_sent_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('report_settings');
    }
};
