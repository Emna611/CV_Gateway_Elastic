import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import * as api from '../api/client.js';
import { SCENARIOS, SEVERITY_LABELS } from '../data/scenarios.js';
import { formatClock, formatDuration } from '../utils/format.js';
import './Supervision.css';

const POLL_MS = 1000;

const ALERT_LABELS = {
    SLEEPING: 'Endormissement',
    FATIGUE: 'Fatigue',
    ON_PHONE: 'Téléphone',
    NO_GLOVE: 'Absence de gants',
    NO_HAIRNET: 'Absence de charlotte',
    NO_APRON: 'Absence de tablier',
};

const STATE_LABELS = {
    ACTIVE: 'Actif',
    IDLE: 'Inactif',
    SLEEPING: 'Sommeil',
    FATIGUE: 'Fatigue',
    ON_PHONE: 'Téléphone',
};

export default function Supervision() {
    const { scenarioId } = useParams();
    const navigate = useNavigate();
    const catalogue = SCENARIOS[scenarioId];

    const [snapshot, setSnapshot] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const [stopping, setStopping] = useState(false);
    const [brokenStream, setBrokenStream] = useState('');

    useEffect(() => {
        let cancelled = false;

        async function pull() {
            try {
                const response = await api.getEngineSnapshot();
                if (!cancelled) {
                    setSnapshot(response.status);
                    setLoadError(null);
                }
            } catch (error) {
                if (!cancelled) setLoadError(error.message);
            }
        }

        pull();
        const timer = setInterval(pull, POLL_MS);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [scenarioId]);

    if (!catalogue) {
        return <Navigate to="/" replace />;
    }

    async function handleStop() {
        setStopping(true);
        try {
            await api.stopEngine();
        } catch (error) {
            setLoadError(error.message);
        } finally {
            setStopping(false);
        }
    }

    const status = snapshot ?? { state: 'loading' };
    const running = status.state === 'running';
    const starting = status.state === 'starting';
    const idle = status.state === 'idle' || !snapshot;
    const mismatch = running && status.scenario && status.scenario !== scenarioId;
    const stats = status.stats;
    const alerts = status.alerts ?? [];
    const streamUrl =
        running && status.session_id
            ? `${api.ENGINE_STREAM_URL}?session=${status.session_id}`
            : null;
    const streamBroken = Boolean(streamUrl) && brokenStream === streamUrl;

    return (
        <section className="watch">
            <header className="watch__head">
                <div>
                    <span className="section-label">Supervision</span>
                    <h1 className="watch__title">{catalogue.title}</h1>
                    <p className="watch__subtitle">{catalogue.subtitle}</p>
                </div>

                <div className="watch__meta">
                    <StateChip state={status.state} />
                    {running && (
                        <>
                            <span className="watch__stat">
                                {status.fps ?? 0} fps
                            </span>
                            <span className="watch__stat">
                                {formatDuration(status.uptime_seconds)}
                            </span>
                        </>
                    )}
                    <button
                        type="button"
                        className="btn"
                        disabled={!running && !starting}
                        onClick={handleStop}
                    >
                        {stopping ? 'Arrêt…' : "Arrêter l'analyse"}
                    </button>
                </div>
            </header>

            {loadError && (
                <p className="watch__banner watch__banner--error" role="alert">
                    {loadError}
                </p>
            )}

            {mismatch && (
                <p className="watch__banner">
                    Une analyse « {SCENARIOS[status.scenario]?.title ?? status.scenario} » est
                    déjà en cours.{' '}
                    <Link to={`/supervision/${status.scenario}`}>Ouvrir cette supervision</Link>
                </p>
            )}

            {(idle || status.state === 'stopped' || status.state === 'ended' || status.state === 'failed') &&
                !starting && (
                    <div className="watch__empty panel">
                        <p className="watch__empty-title">
                            {status.state === 'failed'
                                ? "L'analyse s'est arrêtée sur une erreur"
                                : status.state === 'ended'
                                  ? 'Le flux source est terminé'
                                  : status.state === 'stopped'
                                    ? 'Analyse arrêtée'
                                    : 'Aucune analyse en cours'}
                        </p>
                        <p className="watch__empty-hint">
                            {status.error ||
                                'Configurez le scénario puis lancez le moteur pour voir le flux annoté et les états des postes.'}
                        </p>
                        <div className="watch__empty-actions">
                            <Link to={`/scenario/${scenarioId}`} className="btn">
                                Retour à la configuration
                            </Link>
                            {status.state === 'stopped' || status.state === 'ended' || status.state === 'failed' ? (
                                <Link to={`/engine/${scenarioId}`} className="btn btn--primary">
                                    Relancer
                                </Link>
                            ) : null}
                        </div>
                    </div>
                )}

            {(running || starting) && !mismatch && (
                <div className="watch__layout">
                    <div className="watch__stage panel">
                        {starting && !streamUrl && (
                            <div className="watch__stage-empty">Séquence de démarrage…</div>
                        )}
                        {streamUrl && !streamBroken && (
                            <img
                                className="watch__stream"
                                src={streamUrl}
                                alt="Flux annoté du moteur"
                                onError={() => setBrokenStream(streamUrl)}
                            />
                        )}
                        {streamBroken && (
                            <div className="watch__stage-empty">
                                Flux interrompu. Le moteur tourne encore : rechargez la page.
                            </div>
                        )}
                    </div>

                    <aside className="watch__side">
                        {stats?.kind === 'bureau' && (
                            <BureauPanel stats={stats} />
                        )}
                        {stats?.kind === 'cuisine' && (
                            <KitchenPanel stats={stats} />
                        )}
                        {!stats && starting && (
                            <p className="watch__side-hint">
                                En attente des premières détections.
                            </p>
                        )}

                        <section className="watch__alerts panel">
                            <div className="panel__head">
                                <h2 className="panel__title">Alertes</h2>
                                <span className="panel__hint">{alerts.length}</span>
                            </div>
                            <div className="panel__body">
                                {alerts.length === 0 ? (
                                    <p className="watch__side-hint">Aucune alerte pour cette session.</p>
                                ) : (
                                    <ol className="watch__alert-list">
                                        {alerts.map((alert) => (
                                            <li key={alert.id} className="watch__alert">
                                                <span
                                                    className="severity-dot"
                                                    data-severity={alert.severity}
                                                />
                                                <span className="watch__alert-body">
                                                    <span className="watch__alert-type">
                                                        {ALERT_LABELS[alert.type] ?? alert.type}
                                                    </span>
                                                    <span className="watch__alert-meta">
                                                        {alert.zone_name ?? 'scène'}
                                                        {' · '}
                                                        {formatClock(alert.at)}
                                                    </span>
                                                </span>
                                                <span
                                                    className="severity-tag"
                                                    data-severity={alert.severity}
                                                >
                                                    {SEVERITY_LABELS[alert.severity] ?? alert.severity}
                                                </span>
                                            </li>
                                        ))}
                                    </ol>
                                )}
                            </div>
                        </section>
                    </aside>
                </div>
            )}

            <footer className="watch__foot">
                <button type="button" className="btn" onClick={() => navigate(`/scenario/${scenarioId}`)}>
                    Configuration
                </button>
                <Link to="/" className="btn btn--ghost">
                    Changer de scénario
                </Link>
            </footer>
        </section>
    );
}

function StateChip({ state }) {
    const labels = {
        loading: 'Chargement',
        idle: 'Inactif',
        starting: 'Démarrage',
        running: 'En cours',
        stopped: 'Arrêté',
        ended: 'Terminé',
        failed: 'Échec',
    };
    const tone = {
        running: 'ok',
        starting: 'pending',
        failed: 'error',
        ended: 'warning',
        stopped: 'idle',
        idle: 'idle',
        loading: 'pending',
    }[state] ?? 'idle';

    return (
        <span className="watch__chip" data-status={tone}>
            {labels[state] ?? state}
        </span>
    );
}

function BureauPanel({ stats }) {
    const zones = stats.zones ?? [];
    const occupied = stats.occupied ?? zones.filter((zone) => zone.occupied).length;

    return (
        <section className="watch__cards">
            <div className="watch__chips">
                <span className="chip">
                    <span className="severity-dot" data-severity="compliant" />
                    {occupied} occupé{occupied > 1 ? 's' : ''}
                </span>
                <span className="chip">
                    <span className="severity-dot" data-severity="info" />
                    {Math.max(zones.length - occupied, 0)} libre
                    {zones.length - occupied > 1 ? 's' : ''}
                </span>
                <span className="chip">
                    {stats.people ?? 0} personne{(stats.people ?? 0) > 1 ? 's' : ''}
                </span>
            </div>
            {zones.length === 0 ? (
                <p className="watch__side-hint">
                    Aucune zone : le suivi porte sur les personnes détectées dans la scène.
                </p>
            ) : (
                zones.map((zone) => {
                    const alert = zone.occupied ? zone.alert : 'LIBRE';
                    const severity =
                        alert === 'SLEEPING'
                            ? 'critical'
                            : alert === 'FATIGUE'
                              ? 'high'
                              : alert === 'ON_PHONE'
                                ? 'moderate'
                                : zone.occupied
                                  ? 'compliant'
                                  : 'info';
                    return (
                        <article key={zone.id} className="cabin" data-alert={alert}>
                            <span className="severity-dot" data-severity={severity} />
                            <div className="cabin__body">
                                <span className="cabin__name">{zone.name}</span>
                                <span className="cabin__status">
                                    {zone.occupied
                                        ? STATE_LABELS[zone.activity_state] ?? zone.activity_state
                                        : 'Libre'}
                                    {zone.occupants?.length
                                        ? ` · #${zone.occupants.join(', #')}`
                                        : ''}
                                </span>
                            </div>
                            <div className="cabin__stats">
                                <span>{formatDuration(zone.occupied_seconds)}</span>
                                {zone.alert !== 'ACTIVE' && zone.occupied && (
                                    <span className="severity-tag" data-severity={severity}>
                                        {STATE_LABELS[zone.alert] ?? zone.alert}
                                    </span>
                                )}
                            </div>
                        </article>
                    );
                })
            )}
        </section>
    );
}

function KitchenPanel({ stats }) {
    const items = stats.equipment ?? [];
    return (
        <section className="watch__cards">
            <div className="watch__chips">
                <span className="chip">
                    <span
                        className="severity-dot"
                        data-severity={stats.compliant ? 'compliant' : 'critical'}
                    />
                    {stats.compliant ? 'Conforme' : 'Non conforme'}
                </span>
            </div>
            {items.map((item) => (
                <article key={item.id} className="cabin">
                    <span
                        className="severity-dot"
                        data-severity={item.compliant ? 'compliant' : item.severity}
                    />
                    <div className="cabin__body">
                        <span className="cabin__name">{item.name}</span>
                        <span className="cabin__status">
                            {item.compliant ? 'Porté' : `Manquant depuis ${formatDuration(item.missing_seconds)}`}
                        </span>
                    </div>
                    <span
                        className="severity-tag"
                        data-severity={item.compliant ? 'compliant' : item.severity}
                    >
                        {item.compliant ? 'OK' : 'Alerte'}
                    </span>
                </article>
            ))}
        </section>
    );
}
