# Démarre le moteur d'inférence sur http://127.0.0.1:5000
#
# Le venv réutilisé est celui d'Office_Monitoring_v2 : il contient déjà Flask,
# OpenCV, PyYAML, requests, yt-dlp, Torch et Ultralytics. Pour un
# environnement dédié : python -m venv .venv puis
# .\.venv\Scripts\pip install -r requirements.txt

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path $root '..\Office_Monitoring_v2\.venv\Scripts\python.exe'

if (-not (Test-Path $python)) {
    $python = Join-Path $root '.venv\Scripts\python.exe'
}
if (-not (Test-Path $python)) {
    Write-Error "Aucun interpréteur trouvé. Créez un venv : python -m venv .venv"
}

Push-Location $root
try {
    & $python app.py
}
finally {
    Pop-Location
}
