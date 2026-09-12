# Même pipeline que GitHub Actions, à lancer en local :
#   powershell -File scripts/ci.ps1

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host "=== Frontend (Vite) ==="
docker build -f frontend/Dockerfile --target test frontend
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "=== Laravel (PHPUnit) ==="
docker build -f backend/Dockerfile --target test backend
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "=== Moteur (syntaxe) ==="
docker build -f ai_engine/Dockerfile --target test ai_engine
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "CI Docker OK"
