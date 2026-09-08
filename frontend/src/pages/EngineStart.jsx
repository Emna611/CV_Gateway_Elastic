import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import * as api from '../api/client.js';
import { SCENARIOS } from '../data/scenarios.js';
import './EngineStart.css';

const POLL_INTERVAL = 1000;

/* Affichées avant la première réponse du moteur, toutes à « pending » : aucune
   étape n'est jamais montrée réussie tant que le moteur ne l'a pas confirmée. */
const PLACEHOLDER_STEPS = [
    { id: 'source', label: 'Connexion à la source', status: 'pending', detail: null },
    { id: 'models', label: 'Chargement des modèles', status: 'pending', detail: null },
    { id: 'zones', label: 'Initialisation des zones', status: 'pending', detail: null },
    { id: 'pipeline', label: 'Démarrage du pipeline', status: 'pending', detail: null },
];

function placeholderSteps(hasZones) {
    return PLACEHOLDER_STEPS.map((step) =>
        step.id === 'zones' && !hasZones
            ? { ...step, status: 'skipped', detail: 'Sans objet pour ce scénario' }
            : step
    );
}

const MARKS = {
    ok: '✓',
    failed: '✕',
    running: '',
    pending: '',
    cancelled: '–',
    skipped: '–',
};

/* Le premier import de Torch dure plusieurs minutes sur une machine sans GPU.
   Le dire vaut mieux que laisser croire à un blocage. */
const SLOW_STEP_HINT = 20;

export default function EngineStart() {
    const { scenarioId } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const catalogue = SCENARIOS[scenarioId];

    const [steps, setSteps] = useState(() => placeholderSteps(catalogue?.hasZones));
    const [phase, setPhase] = useState('starting');
    const [error, setError] = useState(null);
    const [conflict, setConflict] = useState(false);
    const [elapsed, setElapsed] = useState(0);

    const startedAt = useRef(0);
    const launched = useRef(false);

    const config = location.state?.config ?? null;

    useEffect(() => {
        const tick = setInterval(
            () => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)),
            1000
        );
        return () => clearInterval(tick);
    }, []);

    const launch = useCallback(async () => {
        setPhase('starting');
        setError(null);
        setConflict(false);
        setSteps(placeholderSteps(catalogue?.hasZones));
        startedAt.current = Date.now();

        try {
            // Sans configuration transmise par l'écran précédent (arrivée
            // directe, rechargement), on relit celle qui a été enregistrée.
            let payload = config;
            if (!payload) {
                const saved = await api.getSavedConfig(scenarioId);
                payload = saved?.config;
            }
            if (!payload) {
                throw new api.ApiError(
                    "Aucune configuration enregistrée pour ce scénario. Configurez-le d'abord.",
                    0
                );
            }
            const response = await api.startEngine(scenarioId, payload);
            setSteps(response.status.steps);
            setPhase('polling');
        } catch (caught) {
            setConflict(caught.status === 409);
            setError(caught.message);
            setPhase('failed');
        }
    }, [config, scenarioId, catalogue]);

    useEffect(() => {
        if (launched.current || !catalogue) return;
        launched.current = true;
        launch();
    }, [catalogue, launch]);

    useEffect(() => {
        if (phase !== 'polling') return undefined;

        let cancelled = false;
        const poll = setInterval(async () => {
            try {
                const response = await api.getEngineStatus();
                if (cancelled) return;
                const status = response.status;

                if (status.steps) setSteps(status.steps);

                if (status.state === 'running') {
                    setPhase('running');
                } else if (status.state === 'failed' || status.state === 'ended') {
                    setError(status.error ?? 'Le moteur s\u2019est arrêté sans message.');
                    setPhase('failed');
                } else if (status.state === 'idle' || status.state === 'stopped') {
                    setError("L'analyse a été arrêtée avant d'avoir démarré.");
                    setPhase('failed');
                }
            } catch (caught) {
                if (!cancelled) {
                    setError(caught.message);
                    setPhase('failed');
                }
            }
        }, POLL_INTERVAL);

        return () => {
            cancelled = true;
            clearInterval(poll);
        };
    }, [phase]);

    useEffect(() => {
        if (phase !== 'running') return undefined;
        // Court délai pour que la dernière étape s'affiche validée avant la
        // bascule, plutôt qu'un saut abrupt.
        const jump = setTimeout(() => navigate(`/supervision/${scenarioId}`, { replace: true }), 700);
        return () => clearTimeout(jump);
    }, [phase, navigate, scenarioId]);

    if (!catalogue) {
        return <Navigate to="/" replace />;
    }

    const runningStep = steps.find((step) => step.status === 'running');
    const showSlowHint = runningStep?.id === 'models' && elapsed > SLOW_STEP_HINT;

    return (
        <section className="boot">
            <div className="boot__card">
                <span className="section-label">Étape 3 sur 3 — Activation</span>
                <h1 className="boot__title">{catalogue.title}</h1>
                <p className="boot__subtitle">
                    {phase === 'running'
                        ? 'Moteur opérationnel, ouverture de la supervision…'
                        : phase === 'failed'
                          ? "Le moteur n'a pas pu démarrer."
                          : 'Le moteur exécute la séquence de démarrage.'}
                </p>

                <ol className="boot__steps">
                    {steps.map((step) => (
                        <li key={step.id} className={`boot__step boot__step--${step.status}`}>
                            <span className="boot__mark" aria-hidden="true">
                                {step.status === 'running' ? (
                                    <span className="boot__spinner" />
                                ) : (
                                    MARKS[step.status]
                                )}
                            </span>
                            <span className="boot__step-body">
                                <span className="boot__step-label">{step.label}</span>
                                {step.detail && (
                                    <span className="boot__step-detail">{step.detail}</span>
                                )}
                            </span>
                        </li>
                    ))}
                </ol>

                {showSlowHint && (
                    <p className="boot__hint">
                        Premier démarrage : l&apos;import de Torch et le chargement des poids
                        peuvent prendre plusieurs minutes sans GPU. Les lancements suivants
                        sont immédiats.
                    </p>
                )}

                {phase === 'failed' && (
                    <div className="boot__error" role="alert">
                        <p className="boot__error-title">{error}</p>
                        {conflict && (
                            <p className="boot__error-hint">
                                Une analyse occupe déjà le moteur.
                            </p>
                        )}
                    </div>
                )}

                <footer className="boot__actions">
                    <Link to={`/scenario/${scenarioId}`} className="btn">
                        Retour à la configuration
                    </Link>

                    {phase === 'failed' && conflict && (
                        <Link to={`/supervision/${scenarioId}`} className="btn">
                            Voir l&apos;analyse en cours
                        </Link>
                    )}

                    {phase === 'failed' && (
                        <button type="button" className="btn btn--primary" onClick={launch}>
                            Réessayer
                        </button>
                    )}

                    {phase !== 'failed' && (
                        <span className="boot__elapsed">{elapsed}s écoulées</span>
                    )}
                </footer>
            </div>
        </section>
    );
}
