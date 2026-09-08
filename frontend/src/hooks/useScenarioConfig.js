import { useCallback, useEffect, useMemo, useReducer } from 'react';
import * as api from '../api/client.js';
import { EMAIL_RE } from '../utils/format.js';
import { activeModels, activeThresholdKeys, requiresZones } from '../utils/detections.js';

const IDLE_TEST = {
    status: 'idle',
    title: 'Source non testée',
    hint: "Lancez le test pour vérifier que le moteur peut réellement lire cette source.",
    preview: null,
    meta: null,
};

const initialState = {
    phase: 'loading',
    loadError: null,
    defaults: null,
    sourceType: 'file',
    file: { value: '', name: '', meta: null },
    youtube: { url: '' },
    rtsp: { url: '' },
    test: IDLE_TEST,
    detections: [],
    thresholds: {},
    confidence: 0.15,
    email: { enabled: false, recipient: '', types: [], cooldownMinutes: 5 },
    zones: [],
    save: { status: 'idle', message: '' },
};

function reducer(state, action) {
    switch (action.type) {
        case 'loaded': {
            const { defaults, saved } = action;
            const thresholds = {};
            for (const [key, spec] of Object.entries(defaults.thresholds)) {
                thresholds[key] = saved?.thresholds?.[key] ?? spec.default;
            }

            const sourceType = saved?.source?.type ?? 'file';
            const savedValue = saved?.source?.value ?? '';
            const detections = saved?.detections ?? defaults.default_detections;
            const selectableTypes = activeThresholdKeys(defaults, detections);

            return {
                ...state,
                phase: 'ready',
                defaults,
                detections,
                thresholds,
                confidence: saved?.confidence ?? defaults.confidence.default,
                sourceType,
                file:
                    sourceType === 'file'
                        ? { value: savedValue, name: savedValue, meta: null }
                        : state.file,
                youtube: sourceType === 'youtube' ? { url: savedValue } : state.youtube,
                rtsp: sourceType === 'rtsp' ? { url: savedValue } : state.rtsp,
                zones: saved?.zones ?? [],
                email: {
                    enabled: saved?.email?.enabled ?? false,
                    recipient: saved?.email?.recipient ?? '',
                    types: (saved?.email?.types ?? defaults.email.default_types).filter(
                        (key) => selectableTypes.includes(key)
                    ),
                    cooldownMinutes:
                        saved?.email?.cooldown_minutes ??
                        defaults.email.cooldown_minutes.default,
                },
                // Une configuration rechargée n'est pas une source testée :
                // le statut repart systématiquement de zéro.
                test: IDLE_TEST,
            };
        }

        case 'loadFailed':
            return { ...state, phase: 'failed', loadError: action.message };

        /* Toute modification de la source invalide le test précédent. */
        case 'sourceType':
            return { ...state, sourceType: action.value, test: IDLE_TEST };

        case 'youtube':
            return { ...state, youtube: { url: action.value }, test: IDLE_TEST };

        case 'rtsp':
            return { ...state, rtsp: { url: action.value }, test: IDLE_TEST };

        case 'fileCleared':
            return { ...state, file: { value: '', name: '', meta: null }, test: IDLE_TEST };

        case 'testStart':
            return {
                ...state,
                test: {
                    status: 'pending',
                    title: action.title,
                    hint: '',
                    preview: null,
                    meta: null,
                },
            };

        case 'testOk': {
            const { result } = action;
            const next = {
                ...state,
                test: {
                    status: result.degraded ? 'warning' : 'ok',
                    title: result.message,
                    hint: result.display ?? '',
                    preview: result.preview ?? null,
                    meta: result.meta ?? null,
                },
            };
            if (action.fileValue) {
                next.file = {
                    value: action.fileValue,
                    name: result.meta?.name ?? action.fileValue,
                    meta: result.meta ?? null,
                };
            }
            return next;
        }

        case 'testFailed':
            return {
                ...state,
                test: {
                    status: 'error',
                    title: 'Test échoué',
                    hint: action.message,
                    preview: null,
                    meta: null,
                },
            };

        /* Désactiver une classe retire aussi ses événements de la sélection
           email : promettre un email pour un événement qui ne sera jamais
           produit serait mensonger. */
        case 'detections': {
            const selectable = activeThresholdKeys(state.defaults, action.value);
            return {
                ...state,
                detections: action.value,
                email: {
                    ...state.email,
                    types: state.email.types.filter((key) => selectable.includes(key)),
                },
                save: { status: 'idle', message: '' },
            };
        }

        case 'threshold':
            return {
                ...state,
                thresholds: { ...state.thresholds, [action.key]: action.value },
                save: { status: 'idle', message: '' },
            };

        case 'confidence':
            return { ...state, confidence: action.value, save: { status: 'idle', message: '' } };

        case 'email':
            return {
                ...state,
                email: { ...state.email, ...action.patch },
                save: { status: 'idle', message: '' },
            };

        case 'zones':
            return { ...state, zones: action.zones };

        case 'saveStart':
            return { ...state, save: { status: 'pending', message: '' } };

        case 'saveOk':
            return { ...state, save: { status: 'ok', message: action.message } };

        case 'saveFailed':
            return { ...state, save: { status: 'error', message: action.message } };

        default:
            return state;
    }
}

export function useScenarioConfig(scenarioId) {
    const [state, dispatch] = useReducer(reducer, initialState);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                // La configuration enregistrée est optionnelle : son absence ne
                // doit pas empêcher l'écran de s'afficher.
                const [defaultsResponse, savedResponse] = await Promise.all([
                    api.getDefaults(scenarioId),
                    api.getSavedConfig(scenarioId).catch(() => null),
                ]);
                if (!cancelled) {
                    dispatch({
                        type: 'loaded',
                        defaults: defaultsResponse.defaults,
                        saved: savedResponse?.config ?? null,
                    });
                }
            } catch (error) {
                if (!cancelled) {
                    dispatch({ type: 'loadFailed', message: error.message });
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [scenarioId]);

    /* Conséquences des classes actives : seuils affichés, modèles réellement
       chargés, nécessité de tracer des zones. */
    const derived = useMemo(() => {
        if (!state.defaults) {
            return { thresholdKeys: [], models: [], zonesRequired: false };
        }
        return {
            thresholdKeys: activeThresholdKeys(state.defaults, state.detections),
            models: activeModels(state.defaults, state.detections),
            zonesRequired: requiresZones(state.defaults, state.detections),
        };
    }, [state.defaults, state.detections]);

    const sourceValue = useMemo(() => {
        if (state.sourceType === 'file') return state.file.value;
        if (state.sourceType === 'youtube') return state.youtube.url.trim();
        return state.rtsp.url.trim();
    }, [state.sourceType, state.file.value, state.youtube.url, state.rtsp.url]);

    const testSource = useCallback(
        async (titleByType) => {
            if (!sourceValue) return;
            dispatch({ type: 'testStart', title: titleByType });
            try {
                const result = await api.testSource(state.sourceType, sourceValue);
                dispatch({ type: 'testOk', result });
            } catch (error) {
                dispatch({ type: 'testFailed', message: error.message });
            }
        },
        [sourceValue, state.sourceType]
    );

    const uploadFile = useCallback(async (file, onProgress) => {
        dispatch({ type: 'testStart', title: 'Téléversement et analyse du fichier…' });
        try {
            const result = await api.uploadFile(file, onProgress);
            dispatch({ type: 'testOk', result, fileValue: result.value });
        } catch (error) {
            dispatch({ type: 'testFailed', message: error.message });
        }
    }, []);

    const buildPayload = useCallback(
        () => ({
            scenario: scenarioId,
            source: { type: state.sourceType, value: sourceValue },
            detections: state.detections,
            zones: state.zones,
            thresholds: state.thresholds,
            confidence: state.confidence,
            email: {
                enabled: state.email.enabled,
                recipient: state.email.recipient.trim(),
                types: state.email.types,
                cooldown_minutes: state.email.cooldownMinutes,
            },
        }),
        [
            scenarioId,
            state.sourceType,
            sourceValue,
            state.detections,
            state.zones,
            state.thresholds,
            state.confidence,
            state.email,
        ]
    );

    const save = useCallback(async () => {
        dispatch({ type: 'saveStart' });
        try {
            await api.saveConfig(scenarioId, buildPayload());
            dispatch({ type: 'saveOk', message: 'Configuration enregistrée.' });
        } catch (error) {
            dispatch({ type: 'saveFailed', message: error.message });
        }
    }, [scenarioId, buildPayload]);

    /* Ce qui empêche de démarrer l'analyse, formulé pour être affiché tel quel. */
    const blockers = useMemo(() => {
        const list = [];
        if (state.test.status !== 'ok' && state.test.status !== 'warning') {
            list.push("la source n'a pas été testée avec succès");
        }
        if (state.detections.length === 0) {
            list.push('aucune classe à détecter n\u2019est activée');
        }
        if (derived.zonesRequired && state.zones.length === 0) {
            list.push('aucune zone de poste n\u2019est tracée');
        }
        if (state.email.enabled && !EMAIL_RE.test(state.email.recipient.trim())) {
            list.push("l'adresse email de l'administrateur est invalide");
        }
        if (state.email.enabled && state.email.types.length === 0) {
            list.push('aucun type d\u2019événement ne déclenche d\u2019email');
        }
        return list;
    }, [
        state.test.status,
        state.detections.length,
        derived.zonesRequired,
        state.zones.length,
        state.email,
    ]);

    return {
        state,
        derived,
        sourceValue,
        blockers,
        canSave: Boolean(sourceValue) && state.phase === 'ready',
        dispatch,
        testSource,
        uploadFile,
        save,
        buildPayload,
    };
}
