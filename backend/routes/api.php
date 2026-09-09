<?php

use App\Http\Controllers\ExportController;
use App\Http\Controllers\IngestController;
use Illuminate\Support\Facades\Route;

Route::middleware('ingest.token')->group(function () {
    Route::post('/ingest/occupations', [IngestController::class, 'occupation']);
    Route::post('/ingest/alerts', [IngestController::class, 'alert']);
    Route::post('/ingest/sessions/{sessionId}/close', [IngestController::class, 'closeSession']);
});

Route::get('/export/occupation', [ExportController::class, 'occupation']);
Route::get('/export/alerts', [ExportController::class, 'alerts']);
