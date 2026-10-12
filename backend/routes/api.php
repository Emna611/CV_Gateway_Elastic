<?php

use App\Http\Controllers\ExportController;
use App\Http\Controllers\IngestController;
use App\Http\Controllers\NotifyController;
use App\Http\Controllers\ReportController;
use Illuminate\Support\Facades\Route;

Route::middleware('ingest.token')->group(function () {
    Route::post('/ingest/occupations', [IngestController::class, 'occupation']);
    Route::post('/ingest/alerts', [IngestController::class, 'alert']);
    Route::post('/ingest/sessions/{sessionId}/close', [IngestController::class, 'closeSession']);
    Route::get('/notify/email/status', [NotifyController::class, 'emailStatus']);
    Route::post('/notify/email/test', [NotifyController::class, 'emailTest']);
});

Route::get('/export/occupation', [ExportController::class, 'occupation']);
Route::get('/export/alerts', [ExportController::class, 'alerts']);
Route::get('/export/snapshot/{alerte}', [ExportController::class, 'snapshot']);
Route::delete('/export/journal', [ExportController::class, 'destroyJournal']);

// Rapport quotidien « temps de travail » (bureau) : sous /export pour suivre le proxy Laravel du frontend.
Route::get('/export/report/daily', [ReportController::class, 'show']);
Route::put('/export/report/daily', [ReportController::class, 'update']);
Route::get('/export/report/daily/preview', [ReportController::class, 'preview']);
Route::post('/export/report/daily/send', [ReportController::class, 'send']);
