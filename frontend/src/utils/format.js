/* Formatage d'affichage. Aucune de ces fonctions ne modifie une valeur
   stockée : les seuils restent en secondes, les zones en 0..1. */

export function formatSeconds(seconds) {
    if (seconds == null) return '—';
    if (seconds < 60) return `${seconds} s`;
    const minutes = Math.floor(seconds / 60);
    const rest = Math.round(seconds % 60);
    return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
}

export function formatDuration(seconds) {
    if (seconds == null) return '—';
    const total = Math.round(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = total % 60;
    const pad = (value) => String(value).padStart(2, '0');
    return hours > 0
        ? `${hours}:${pad(minutes)}:${pad(rest)}`
        : `${minutes}:${pad(rest)}`;
}

export function formatResolution(meta) {
    if (!meta?.width || !meta?.height) return '—';
    return `${meta.width} × ${meta.height}`;
}

/* Masque le mot de passe d'une URL RTSP pour l'affichage.
   Le serveur applique le même masquage sur tout ce qu'il renvoie. */
export function maskRtspPassword(url) {
    return url.replace(/^(rtsp:\/\/[^:/@\s]+):([^@/\s]+)@/i, (_, prefix) => `${prefix}:••••@`);
}

export function hasRtspPassword(url) {
    return /^rtsp:\/\/[^:/@\s]+:[^@/\s]+@/i.test(url);
}

export const EMAIL_RE = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/;
