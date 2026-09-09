/* Accès au moteur d'inférence (ai_engine, :5000).
   En développement, Vite proxifie /api vers le service Flask (vite.config.js),
   ce qui évite toute question de CORS. */

export class ApiError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

const OFFLINE =
    "Moteur d'inférence injoignable. Vérifiez que le service ai_engine tourne sur le port 5000.";

async function request(path, options = {}) {
    let response;
    try {
        response = await fetch(path, options);
    } catch {
        throw new ApiError(OFFLINE, 0);
    }

    let payload = null;
    try {
        payload = await response.json();
    } catch {
        payload = null;
    }

    if (!response.ok || payload?.ok === false) {
        throw new ApiError(payload?.error ?? `Erreur ${response.status}`, response.status);
    }
    return payload;
}

function postJson(path, body) {
    return request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

export function getHealth() {
    return request('/api/health');
}

export function getDefaults(scenarioId) {
    return request(`/api/config/defaults/${scenarioId}`);
}

export function getSavedConfig(scenarioId) {
    return request(`/api/config/${scenarioId}`);
}

export function saveConfig(scenarioId, config) {
    return request(`/api/config/${scenarioId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
    });
}

export function testSource(type, value) {
    return postJson('/api/source/test', { type, value });
}

export function testEmail(scenarioId, recipient) {
    return postJson('/api/email/test', { scenario: scenarioId, recipient });
}

/* Le démarrage renvoie 202 : la séquence se poursuit côté moteur et son
   avancement se lit avec getEngineStatus. */
export function startEngine(scenarioId, config) {
    return postJson('/api/engine/start', { scenario: scenarioId, config });
}

export function getEngineStatus() {
    return request('/api/engine/status');
}

export function getEngineSnapshot() {
    return request('/api/engine/snapshot');
}

export function stopEngine() {
    return postJson('/api/engine/stop', {});
}

export const ENGINE_STREAM_URL = '/api/engine/stream';

export async function downloadExport(kind, params) {
    const query = new URLSearchParams({ format: 'csv', ...params });
    let response;
    try {
        response = await fetch(`/api/export/${kind}?${query}`);
    } catch {
        throw new ApiError(
            'Backend Laravel injoignable. Vérifiez que le service tourne sur le port 8000.',
            0,
        );
    }

    if (!response.ok) {
        let message = `Erreur ${response.status}`;
        try {
            const payload = await response.json();
            message = payload.error ?? payload.message ?? message;
            if (payload.errors) {
                const first = Object.values(payload.errors)[0];
                if (Array.isArray(first) && first[0]) message = first[0];
            }
        } catch {
            /* réponse non JSON (proxy, 502…) */
        }
        throw new ApiError(message, response.status);
    }

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const match = disposition.match(/filename=\"?([^\";]+)\"?/i);
    const fallback = kind === 'occupation' ? 'occupations.csv' : 'alertes.csv';
    const filename = match?.[1] ?? fallback;

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

/* Le téléversement passe par XMLHttpRequest : fetch n'expose pas la
   progression d'envoi, et une vidéo de plusieurs centaines de Mo mérite une
   barre de progression réelle. */
export function uploadFile(file, onProgress) {
    return new Promise((resolve, reject) => {
        const form = new FormData();
        form.append('file', file);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/source/upload');

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && onProgress) {
                onProgress(Math.round((event.loaded / event.total) * 100));
            }
        };

        xhr.onload = () => {
            let payload = null;
            try {
                payload = JSON.parse(xhr.responseText);
            } catch {
                payload = null;
            }
            if (xhr.status >= 200 && xhr.status < 300 && payload?.ok !== false) {
                resolve(payload);
            } else {
                reject(new ApiError(payload?.error ?? `Erreur ${xhr.status}`, xhr.status));
            }
        };

        xhr.onerror = () => reject(new ApiError(OFFLINE, 0));
        xhr.onabort = () => reject(new ApiError('Téléversement annulé.', 0));
        xhr.send(form);
    });
}
