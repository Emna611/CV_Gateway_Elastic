<x-mail::message>
# Alerte {{ $label }}

Un événement vient d'être confirmé par le moteur d'analyse CV-Gateway Elastic.

**Type :** {{ $type }} ({{ $label }})
**Zone :** {{ $zone }}
**Scénario :** {{ $scenario }}
**Horodatage :** {{ $when }}

<x-mail::button :url="$dashboardUrl">
Ouvrir le tableau de supervision
</x-mail::button>

Si une capture était disponible au moment de l'alerte, elle est jointe à ce message.

Merci,<br>
{{ config('app.name') }}
</x-mail::message>
