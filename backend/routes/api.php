<?php

use App\Http\Controllers\ExportController;
use App\Http\Controllers\IngestController;
use App\Http\Controllers\NotifyController;
use Illuminate\Support\Facades\Route;

Route::middleware('ingest.token')->group(function () {
    Route::post('/ingest/occupations', [IngestController::class, 'occupation']);
    Route::post('/ingest/alerts', [IngestController::class, 'alert']);
    Route::post('/ingest/sessions/{sessionId}/close', [IngestController::class, 'closeSession']);
    Route::get('/notify/email/status', [NotifyController::class, 'emailStatus']);
    Route::post('/notify/email/test', [NotifyController::class, 'emailTest']);
    Route::get('/notify/sms/status', [NotifyController::class, 'smsStatus']);
    Route::post('/notify/sms/test', [NotifyController::class, 'smsTest']);
});

Route::get('/export/occupation', [ExportController::class, 'occupation']);
Route::get('/export/alerts', [ExportController::class, 'alerts']);
Route::get('/export/snapshot/{alerte}', [ExportController::class, 'snapshot']);
Route::delete('/export/journal', [ExportController::class, 'destroyJournal']);
