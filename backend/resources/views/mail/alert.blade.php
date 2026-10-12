<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $label }}</title>
</head>
<body style="margin:0; padding:0; background-color:#f2f4f7; font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#101828;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f2f4f7; padding:24px 12px;">
<tr>
<td align="center">

    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px; background-color:#ffffff; border-radius:10px; overflow:hidden; border:1px solid #e4e7ec;">

        {{-- En-tête produit --}}
        <tr>
            <td style="background-color:#0f172a; padding:16px 24px; color:#ffffff; font-size:14px; font-weight:600; letter-spacing:0.4px;">
                {{ config('app.name') }}
            </td>
        </tr>

        {{-- Bandeau gravité --}}
        <tr>
            <td style="background-color:{{ $severityColor }}; padding:18px 24px; color:#ffffff;">
                <div style="font-size:11px; text-transform:uppercase; letter-spacing:1.2px; opacity:0.85;">
                    Gravité : {{ $severityLabel }}
                </div>
                <div style="font-size:24px; font-weight:700; padding-top:4px;">{{ $label }}</div>
                <div style="font-size:14px; padding-top:4px; opacity:0.92;">
                    {{ $zone }} &middot; {{ $scenarioLabel }}
                </div>
            </td>
        </tr>

        {{-- Capture intégrée au message (cid:) --}}
        @if ($snapshot)
        <tr>
            <td style="padding:20px 24px 4px 24px;">
                <div style="font-size:12px; text-transform:uppercase; letter-spacing:0.8px; color:#667085; padding-bottom:10px;">
                    Capture de la détection
                </div>
                <img src="{{ $message->embed($snapshot) }}"
                     alt="Capture de l'alerte {{ $label }}"
                     width="552"
                     style="display:block; width:100%; max-width:552px; height:auto; border-radius:8px; border:1px solid #e4e7ec;">
                <div style="font-size:12px; color:#667085; padding-top:8px;">
                    Image prise par la caméra au moment exact de la détection ({{ $heure }}).
                </div>
            </td>
        </tr>
        @else
        <tr>
            <td style="padding:20px 24px 4px 24px;">
                <div style="background-color:#f9fafb; border:1px dashed #d0d5dd; border-radius:8px; padding:18px; text-align:center; font-size:13px; color:#667085;">
                    Aucune capture n'était disponible au moment de cette alerte.
                </div>
            </td>
        </tr>
        @endif

        {{-- Horodatage détaillé --}}
        <tr>
            <td style="padding:22px 24px 4px 24px;">
                <div style="font-size:12px; text-transform:uppercase; letter-spacing:0.8px; color:#667085; padding-bottom:10px;">
                    Horodatage détaillé
                </div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px; border-collapse:collapse;">
                    @foreach ([
                        'Jour' => $dateLongue,
                        'Heure (h:min:s)' => $heure,
                        'Fuseau horaire' => $fuseau,
                        'Horodatage ISO 8601' => $iso,
                        'Durée de l\'événement' => $duree,
                        'Email envoyé le' => $envoyeLe,
                        'Délai détection → envoi' => $delai,
                    ] as $cle => $valeur)
                    <tr>
                        <td style="padding:9px 12px 9px 0; color:#667085; border-bottom:1px solid #f2f4f7; width:45%; vertical-align:top;">{{ $cle }}</td>
                        <td style="padding:9px 0; color:#101828; font-weight:600; border-bottom:1px solid #f2f4f7;">{{ $valeur }}</td>
                    </tr>
                    @endforeach
                </table>
            </td>
        </tr>

        {{-- Contexte de l'événement --}}
        <tr>
            <td style="padding:22px 24px 4px 24px;">
                <div style="font-size:12px; text-transform:uppercase; letter-spacing:0.8px; color:#667085; padding-bottom:10px;">
                    Détails de l'événement
                </div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px; border-collapse:collapse;">
                    @foreach ([
                        'Type d\'alerte' => $type.' ('.$label.')',
                        'Gravité' => $severityLabel,
                        'Zone' => $zone,
                        'Caméra' => $camera,
                        'Scénario' => $scenarioLabel,
                        'Confiance du modèle' => $confiance,
                        'Session d\'analyse' => $sessionId,
                        'N° d\'alerte' => '#'.$alerteId,
                    ] as $cle => $valeur)
                    <tr>
                        <td style="padding:9px 12px 9px 0; color:#667085; border-bottom:1px solid #f2f4f7; width:45%; vertical-align:top;">{{ $cle }}</td>
                        <td style="padding:9px 0; color:#101828; font-weight:600; border-bottom:1px solid #f2f4f7; word-break:break-all;">{{ $valeur }}</td>
                    </tr>
                    @endforeach
                </table>
            </td>
        </tr>

        {{-- Action --}}
        <tr>
            <td align="center" style="padding:26px 24px 28px 24px;">
                <a href="{{ $dashboardUrl }}"
                   style="display:inline-block; background-color:#0f172a; color:#ffffff; text-decoration:none; font-size:14px; font-weight:600; padding:12px 26px; border-radius:6px;">
                    Ouvrir le tableau de supervision
                </a>
            </td>
        </tr>

        {{-- Pied --}}
        <tr>
            <td style="background-color:#f9fafb; border-top:1px solid #e4e7ec; padding:16px 24px; font-size:12px; color:#667085;">
                Message automatique émis par le moteur d'analyse {{ config('app.name') }}.
                Pour ne plus recevoir ces alertes, désactivez les notifications email dans le tableau de supervision.
            </td>
        </tr>

    </table>

</td>
</tr>
</table>
</body>
</html>
