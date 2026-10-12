# Script PowerShell de démarrage de la plateforme CV-Gateway Elastic
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "      CV-Gateway Elastic - Démarrage des Services" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$root = $PSScriptRoot

# 1. Backend Laravel
Write-Host "[1/5] Démarrage du Backend Laravel (:8000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\backend'; Write-Host '--- Backend Laravel (:8000) ---' -ForegroundColor Green; php artisan serve --host=127.0.0.1 --port=8000"

# 2. Queue Worker
Write-Host "[2/5] Démarrage du Worker Laravel Queue..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\backend'; Write-Host '--- Laravel Queue Worker ---' -ForegroundColor Green; php artisan queue:work --tries=3 --timeout=120"

# 3. Planificateur (rapport quotidien CSV du temps de travail)
Write-Host "[3/5] Démarrage du Planificateur Laravel..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\backend'; Write-Host '--- Laravel Scheduler (rapport quotidien) ---' -ForegroundColor Green; php artisan schedule:work"

# 4. AI Engine
Write-Host "[4/5] Démarrage du Moteur IA Flask (:5000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\ai_engine'; Write-Host '--- AI Engine YOLO11 (:5000) ---' -ForegroundColor Green; & '..\Office_Monitoring_v2\.venv\Scripts\python.exe' app.py"

# 5. Frontend Vite
Write-Host "[5/5] Démarrage du Frontend React Vite (:3000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\frontend'; Write-Host '--- Frontend Vite (:3000) ---' -ForegroundColor Green; npm run dev"

Write-Host ""
Write-Host "Tous les services sont lancés dans des fenêtres dédiées !" -ForegroundColor Green
Start-Sleep -Seconds 4
Start-Process "http://localhost:3000"
Write-Host "Plateforme accessible sur : http://localhost:3000" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
