<x-mail::message>
# Email de test

Ceci est un email de test envoyé depuis l'écran de configuration de CV-Gateway Elastic.

**Scénario :** {{ $scenario }}

Si vous recevez ce message, les alertes email pourront être livrées à cette adresse.

<x-mail::button :url="$dashboardUrl">
Ouvrir CV-Gateway
</x-mail::button>

Merci,<br>
{{ config('app.name') }}
</x-mail::message>
