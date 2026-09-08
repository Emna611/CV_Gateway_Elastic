/* Conséquences de l'activation des classes détectées.
   Les règles sont déclarées dans config.yaml et relues ici : rien n'est
   dupliqué en dur côté frontend. */

/** Seuils réellement gouvernés par les classes actives, dans l'ordre du YAML. */
export function activeThresholdKeys(defaults, active) {
    const keys = [];
    for (const id of active) {
        for (const key of defaults.detections[id]?.thresholds ?? []) {
            if (defaults.thresholds[key] && !keys.includes(key)) keys.push(key);
        }
    }
    return keys;
}

/** Modèles à charger : union des exigences des classes actives. */
export function activeModels(defaults, active) {
    const names = new Set();
    for (const id of active) {
        for (const name of defaults.detections[id]?.models ?? []) names.add(name);
    }
    return defaults.models.filter((model) => names.has(model.name));
}

/** Le traçage de zones n'est exigé que si une classe active en dépend. */
export function requiresZones(defaults, active) {
    return active.some((id) => Boolean(defaults.detections[id]?.requires_zones));
}

/** Classes prérequises d'une détection qui ne sont pas encore actives. */
export function unmetRequirements(defaults, active, id) {
    return (defaults.detections[id]?.requires ?? []).filter(
        (required) => !active.includes(required)
    );
}

/** Désactive une classe et, en cascade, celles qui en dépendent.

    Sans cette cascade, désactiver « Gants » laisserait « Conformité totale
    3/3 » active alors qu'elle n'a plus de sens. */
export function cascadeOff(defaults, active, id) {
    const removed = new Set([id]);
    let changed = true;
    while (changed) {
        changed = false;
        for (const candidate of active) {
            if (removed.has(candidate)) continue;
            const requires = defaults.detections[candidate]?.requires ?? [];
            if (requires.some((required) => removed.has(required))) {
                removed.add(candidate);
                changed = true;
            }
        }
    }
    return active.filter((candidate) => !removed.has(candidate));
}
