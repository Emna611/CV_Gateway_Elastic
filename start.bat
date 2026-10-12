@echo off
title CV-Gateway Elastic - Lancement Global
echo ========================================================
echo       CV-Gateway Elastic - Demarrage de la plateforme
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/5] Demarrage du Backend Laravel (Port 8000)...
start "CV-Gateway Backend (Laravel :8000)" cmd /k "cd backend && php artisan serve --host=127.0.0.1 --port=8000"

echo [2/5] Demarrage du Queue Worker Laravel (Envoi d'alertes email)...
start "CV-Gateway Queue Worker" cmd /k "cd backend && php artisan queue:work --tries=3 --timeout=120"

echo [3/5] Demarrage du Planificateur Laravel (Rapport quotidien CSV)...
start "CV-Gateway Scheduler" cmd /k "cd backend && php artisan schedule:work"

echo [4/5] Demarrage du Moteur d'Inference IA (Port 5000)...
start "CV-Gateway AI Engine (Flask :5000)" cmd /k "cd ai_engine && ..\Office_Monitoring_v2\.venv\Scripts\python.exe app.py"

echo [5/5] Demarrage de l'Interface Frontend Vite (Port 3000)...
start "CV-Gateway Frontend (Vite :3000)" cmd /k "cd frontend && npm run dev"

echo.
echo Tous les services sont en cours de demarrage !
echo Ouverture de l'application dans le navigateur...
timeout /t 5 >nul
start http://localhost:3000
echo.
echo Accedez a : http://localhost:3000
echo ========================================================
