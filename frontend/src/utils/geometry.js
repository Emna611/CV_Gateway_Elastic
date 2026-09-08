/* Géométrie de l'éditeur de zones.

   RÈGLE CENTRALE : un polygone est TOUJOURS stocké en coordonnées normalisées
   0..1. La conversion en pixels n'existe que pour le dessin et le pointage, et
   elle est refaite à chaque rendu à partir de la taille courante du canvas. Le
   canvas d'édition n'a pas la taille de la frame native (1920x1080), donc un
   stockage en pixels casserait tout au moindre changement de résolution. */

/** Palette du thème clair, assez contrastée pour se superposer à une image. */
export const ZONE_COLORS = [
    '#2563EB',
    '#0E9F6E',
    '#D97706',
    '#DC2626',
    '#7C3AED',
    '#0891B2',
    '#DB2777',
    '#65A30D',
];

/** Couleur déduite de l'identifiant : elle reste stable après suppression. */
export function zoneColor(id) {
    let hash = 0;
    for (let index = 0; index < id.length; index += 1) {
        hash = (hash * 31 + id.charCodeAt(index)) % 100000;
    }
    return ZONE_COLORS[hash % ZONE_COLORS.length];
}

export function clamp01(value) {
    return Math.min(1, Math.max(0, value));
}

/** Normalisé (0..1) vers pixels d'affichage. */
export function toPixels([x, y], width, height) {
    return [x * width, y * height];
}

/** Distance en pixels entre un point normalisé et un point en pixels. */
export function pixelDistance(normalized, pixel, width, height) {
    const [px, py] = toPixels(normalized, width, height);
    return Math.hypot(px - pixel[0], py - pixel[1]);
}

export function polygonCentroid(polygon) {
    const sum = polygon.reduce(([sx, sy], [x, y]) => [sx + x, sy + y], [0, 0]);
    return [sum[0] / polygon.length, sum[1] / polygon.length];
}

/** Test d'appartenance par lancer de rayon, en coordonnées normalisées. */
export function pointInPolygon([x, y], polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        const intersects =
            yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
        if (intersects) inside = !inside;
    }
    return inside;
}

/** Identifiant libre suivant, robuste aux suppressions intermédiaires. */
export function nextZoneId(zones) {
    const used = zones
        .map((zone) => Number.parseInt(String(zone.id).replace(/\D+/g, ''), 10))
        .filter((value) => Number.isFinite(value));
    return `zone_${(used.length ? Math.max(...used) : 0) + 1}`;
}

/** Nom par défaut : « Poste 1 », « Poste 2 »… sans collision. */
export function nextZoneName(zones) {
    const taken = new Set(zones.map((zone) => zone.name));
    let index = zones.length + 1;
    while (taken.has(`Poste ${index}`)) index += 1;
    return `Poste ${index}`;
}
