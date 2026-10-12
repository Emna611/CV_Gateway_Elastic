# Regenere les figures d'architecture en PNG a partir des pages HTML de ce dossier.
#   pwsh docs/src/render.ps1
# Chrome headless rend chaque page a 2x ; la hauteur de fenetre est celle
# declaree dans le tableau ci-dessous (hauteur logique de la page).

$ErrorActionPreference = 'Stop'

$chrome = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chrome) { throw "Chrome ou Edge introuvable." }

$src = $PSScriptRoot
$out = Split-Path $src -Parent

$figures = @(
    @{ name = 'architecture_globale';     width = 2000; height = 1060 },
    @{ name = 'architecture_deploiement'; width = 1900; height = 1080 },
    @{ name = 'architecture_bureau';      width = 2000; height = 1020 },
    @{ name = 'architecture_cuisine';     width = 2000; height = 1020 }
)

foreach ($f in $figures) {
    $html = Join-Path $src "$($f.name).html"
    $png = Join-Path $out "$($f.name).png"
    # Chrome headless renvoie un code de sortie non nul meme quand la capture
    # reussit : on efface la cible puis on verifie qu'elle a bien ete recreee.
    if (Test-Path $png) { Remove-Item $png -Force }
    & $chrome --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=2 `
        --virtual-time-budget=3000 `
        --window-size="$($f.width),$($f.height)" `
        --screenshot="$png" ("file:///" + $html.Replace('\', '/')) 2>$null
    # Le PNG peut etre ecrit par un processus fils, juste apres la sortie du
    # parent : on attend qu'il apparaisse et que sa taille se stabilise.
    $size = -1
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Milliseconds 250
        if (-not (Test-Path $png)) { continue }
        $now = (Get-Item $png).Length
        if ($now -gt 0 -and $now -eq $size) { break }
        $size = $now
    }
    if (-not (Test-Path $png) -or (Get-Item $png).Length -eq 0) {
        throw "Echec du rendu de $($f.name)."
    }
    Write-Host "  $($f.name).png"
}

Write-Host "Figures regenerees dans $out"
