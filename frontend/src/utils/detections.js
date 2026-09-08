/* Conséquences de l'activation des classes détectées.
   Les règles sont déclarées dans config.yaml et relues ici : rien n'est
   dupliqué en dur côté frontend.

   Ces fonctions tolèrent une liste ou un catalogue manquants : elles sont
   appelées pendant le chargement, avant que les valeurs par défaut du moteur
   ne soient arrivées. */

function specs(defaults) {
    return defaults?.detections ?? {};
}

function list(active) {
    return Array.isArray(active) ? active : [];
}

/** Seuils réellement gouvernés par les classes actives, dans l'ordre du YAML. */
export function activeThresholdKeys(defaults, active) {
    const catalogue = specs(defaults);
    const keys = [];
    for (const id of list(active)) {
        for (const key of catalogue[id]?.thresholds ?? []) {
            if (defaults?.thresholds?.[key] && !keys.includes(key)) keys.push(key);
        }
    }
    return keys;
}

/** Modèles à charger : union des exigences des classes actives. */
export function activeModels(defaults, active) {
    const catalogue = specs(defaults);
    const names = new Set();
    for (const id of list(active)) {
        for (const name of catalogue[id]?.models ?? []) names.add(name);
    }
    return (defaults?.models ?? []).filter((model) => names.has(model.name));
}

/** Le traçage de zones n'est exigé que si une classe active en dépend. */
export function requiresZones(defaults, active) {
    const catalogue = specs(defaults);
    return list(active).some((id) => Boolean(catalogue[id]?.requires_zones));
}

/** Classes prérequises d'une détection qui ne sont pas encore actives. */
export function unmetRequirements(defaults, active, id) {
    const current = list(active);
    return (specs(defaults)[id]?.requires ?? []).filter(
        (required) => !current.includes(required)
    );
}

/** Désactive une classe et, en cascade, celles qui en dépendent.

    Sans cette cascade, désactiver « Gants » laisserait « Conformité totale
    3/3 » active alors qu'elle n'a plus de sens. */
export function cascadeOff(defaults, active, id) {
    const catalogue = specs(defaults);
    const current = list(active);
    const removed = new Set([id]);

    let changed = true;
    while (changed) {
        changed = false;
        for (const candidate of current) {
            if (removed.has(candidate)) continue;
            const requires = catalogue[candidate]?.requires ?? [];
            if (requires.some((required) => removed.has(required))) {
                removed.add(candidate);
                changed = true;
            }
        }
    }
    return current.filter((candidate) => !removed.has(candidate));
}
