<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Temps de travail — {{ $dateLongue }}</title>
</head>
<body style="margin:0; padding:0; background-color:#f2f4f7; font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#101828;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f2f4f7; padding:24px 12px;">
<tr>
<td align="center">

    <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:640px; background-color:#ffffff; border-radius:10px; overflow:hidden; border:1px solid #e4e7ec;">

        {{-- En-tête produit --}}
        <tr>
            <td style="background-color:#0f172a; padding:16px 24px; color:#ffffff; font-size:14px; font-weight:600; letter-spacing:0.4px;">
                {{ config('app.name') }}
            </td>
        </tr>

        {{-- Bandeau --}}
        <tr>
            <td style="background-color:#175cd3; padding:18px 24px; color:#ffffff;">
                <div style="font-size:11px; text-transform:uppercase; letter-spacing:1.2px; opacity:0.85;">
                    Rapport quotidien &middot; Surveillance bureau
                </div>
                <div style="font-size:24px; font-weight:700; padding-top:4px;">Temps de travail par poste</div>
                <div style="font-size:14px; padding-top:4px; opacity:0.92; text-transform:capitalize;">{{ $dateLongue }}</div>
            </td>
        </tr>

        {{-- Chiffres clés --}}
        <tr>
            <td style="padding:20px 24px 4px 24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate; border-spacing:8px 0;">
                    <tr>
                        @foreach (['Postes' => $nbPostes, 'Présences' => $nbPresences, 'Temps total' => $totalGeneral] as $cle => $valeur)
                        <td width="33%" style="background-color:#f9fafb; border:1px solid #e4e7ec; border-radius:8px; padding:12px 14px; text-align:center;">
                            <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:#667085;">{{ $cle }}</div>
                            <div style="font-size:22px; font-weight:700; color:#101828; padding-top:2px;">{{ $valeur }}</div>
                        </td>
                        @endforeach
                    </tr>
                </table>
            </td>
        </tr>

        {{-- Synthèse par poste --}}
        <tr>
            <td style="padding:22px 24px 4px 24px;">
                <div style="font-size:12px; text-transform:uppercase; letter-spacing:0.8px; color:#667085; padding-bottom:10px;">
                    Synthèse par poste
                </div>
                @if (count($postes) === 0)
                <div style="background-color:#f9fafb; border:1px dashed #d0d5dd; border-radius:8px; padding:18px; text-align:center; font-size:13px; color:#667085;">
                    Aucune présence enregistrée sur cette journée.
                </div>
                @else
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:13px; border-collapse:collapse;">
                    <tr style="background-color:#f9fafb;">
                        @foreach (['Poste', 'Entrée', 'Sortie', 'Présences', 'Actif', 'Inactif', 'Total'] as $entete)
                        <th align="left" style="padding:9px 8px; color:#667085; font-weight:600; border-bottom:1px solid #e4e7ec; font-size:12px;">{{ $entete }}</th>
                        @endforeach
                    </tr>
                    @foreach ($postes as $poste)
                    <tr>
                        <td style="padding:9px 8px; border-bottom:1px solid #f2f4f7; font-weight:600;">{{ $poste['poste'] }}</td>
                        <td style="padding:9px 8px; border-bottom:1px solid #f2f4f7;">{{ $poste['entree'] }}</td>
                        <td style="padding:9px 8px; border-bottom:1px solid #f2f4f7;">{{ $poste['sortie'] }}</td>
                        <td style="padding:9px 8px; border-bottom:1px solid #f2f4f7;">{{ $poste['presences'] }}</td>
                        <td style="padding:9px 8px; border-bottom:1px solid #f2f4f7; color:#067647;">{{ $poste['actif'] }}</td>
                        <td style="padding:9px 8px; border-bottom:1px solid #f2f4f7; color:#667085;">{{ $poste['inactif'] }}</td>
                        <td style="padding:9px 8px; border-bottom:1px solid #f2f4f7; font-weight:700;">{{ $poste['total'] }}</td>
                    </tr>
                    @endforeach
                </table>
                @endif
            </td>
        </tr>

        {{-- Pièces jointes --}}
        <tr>
            <td style="padding:22px 24px 4px 24px;">
                <div style="font-size:12px; text-transform:uppercase; letter-spacing:0.8px; color:#667085; padding-bottom:10px;">
                    Fichiers joints (CSV, séparateur « ; », lisibles dans Excel)
                </div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px; border-collapse:collapse;">
                    <tr>
                        <td style="padding:9px 12px 9px 0; color:#667085; border-bottom:1px solid #f2f4f7; width:45%;">Synthèse par poste</td>
                        <td style="padding:9px 0; color:#101828; font-weight:600; border-bottom:1px solid #f2f4f7;">{{ $fichierSynthese }}</td>
                    </tr>
                    <tr>
                        <td style="padding:9px 12px 9px 0; color:#667085; border-bottom:1px solid #f2f4f7;">Détail des présences</td>
                        <td style="padding:9px 0; color:#101828; font-weight:600; border-bottom:1px solid #f2f4f7;">{{ $fichierDetail }}</td>
                    </tr>
                    <tr>
                        <td style="padding:9px 12px 9px 0; color:#667085; border-bottom:1px solid #f2f4f7;">Généré le</td>
                        <td style="padding:9px 0; color:#101828; font-weight:600; border-bottom:1px solid #f2f4f7;">{{ $envoyeLe }} ({{ $fuseau }})</td>
                    </tr>
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
                Rapport automatique émis par {{ config('app.name') }}. Le temps « actif » correspond à une présence
                détectée au poste ; « inactif » à une présence hors du poste. Pour modifier l'heure d'envoi ou le
                destinataire, ouvrez la configuration du scénario bureau.
            </td>
        </tr>

    </table>

</td>
</tr>
</table>
</body>
</html>
