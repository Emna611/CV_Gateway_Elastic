import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import * as api from '../api/client.js';
import EmailPanel from '../components/config/EmailPanel.jsx';
import BureauMonitor from '../components/monitor/BureauMonitor.jsx';
import KitchenMonitor from '../components/monitor/KitchenMonitor.jsx';
import { Tabs } from '../components/ui/controls.jsx';
import { SCENARIOS, SEVERITY_LABELS } from '../data/scenarios.js';
import { activeThresholdKeys } from '../utils/detections.js';
import { EMAIL_RE, formatClock, formatDuration } from '../utils/format.js';
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
    STANDING: 'Debout',
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
    const [exporting, setExporting] = useState(null);
    const [exportError, setExportError] = useState(null);
    const [clearing, setClearing] = useState(false);
    const [period, setPeriod] = useState('today');
    const [customFrom, setCustomFrom] = useState(() => startOfTodayInput());
    const [customTo, setCustomTo] = useState(() => nowInput());
    const [defaults, setDefaults] = useState(null);
    const [savingDetections, setSavingDetections] = useState(false);
    const [notifyDraft, setNotifyDraft] = useState(null);
    const [savingNotify, setSavingNotify] = useState(false);
    const notifyTimer = useRef(null);
    const [journal, setJournal] = useState({
        occupations: [],
        alerts: [],
        occCount: 0,
        alertCount: 0,
    });
    const [journalError, setJournalError] = useState(null);
    const [selectedCaptureId, setSelectedCaptureId] = useState(null);
    const [lightbox, setLightbox] = useState(null);
    const [dashView, setDashView] = useState('live');

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

    useEffect(() => {
        let cancelled = false;
        api.getDefaults(scenarioId)
            .then((response) => {
                if (!cancelled) setDefaults(response.defaults);
            })
            .catch(() => {
                if (!cancelled) setDefaults(null);
            });
        return () => {
            cancelled = true;
        };
    }, [scenarioId]);

    const sessionId = snapshot?.session_id;
    const exportPeriod = sessionId ? period : period === 'session' ? 'today' : period;

    const captures = useMemo(
        () => (journal.alerts ?? []).filter((row) => row.snapshot_url),
        [journal.alerts],
    );

    useEffect(() => {
        if (captures.length === 0) {
            setSelectedCaptureId(null);
            return;
        }
        setSelectedCaptureId((current) =>
            captures.some((row) => row.id === current) ? current : captures[0].id,
        );
    }, [captures]);

    const selectedCapture = captures.find((row) => row.id === selectedCaptureId) ?? captures[0] ?? null;

    const periodOptions = useMemo(() => {
        const options = [
            { id: 'today', label: "Aujourd'hui" },
            { id: '7d', label: '7 jours' },
            { id: 'custom', label: 'Période' },
        ];
        if (sessionId) {
            options.unshift({ id: 'session', label: 'Cette session' });
        }
        return options;
    }, [sessionId]);

    useEffect(() => {
        if (!catalogue) {
            return undefined;
        }

        let cancelled = false;

        async function pull() {
            const params = buildExportParams({
                period: exportPeriod,
                scenarioId,
                sessionId,
                customFrom,
                customTo,
            });
            try {
                const [occupations, storedAlerts] = await Promise.all([
                    api.fetchJournal('occupation', params),
                    api.fetchJournal('alerts', params),
                ]);
                if (!cancelled) {
                    setJournal({
                        occupations: occupations.rows ?? [],
                        alerts: storedAlerts.rows ?? [],
                        occCount: occupations.count ?? 0,
                        alertCount: storedAlerts.count ?? 0,
                    });
                    setJournalError(null);
                }
            } catch (error) {
                if (!cancelled) setJournalError(error.message);
            }
        }

        pull();
        const timer = setInterval(pull, 4000);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [catalogue, scenarioId, sessionId, exportPeriod, customFrom, customTo]);

    useEffect(() => {
        if (snapshot?.state !== 'running') {
            setNotifyDraft(null);
            return undefined;
        }
        setNotifyDraft((current) => current ?? toNotifyDraft(snapshot));
        return undefined;
    }, [snapshot?.state, snapshot?.session_id]);

    useEffect(
        () => () => {
            if (notifyTimer.current) clearTimeout(notifyTimer.current);
        },
        [],
    );

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

    async function handleDetectionsChange(next) {
        setSavingDetections(true);
        setLoadError(null);
        try {
            const response = await api.updateEngineDetections(next);
            setSnapshot(response.status);
        } catch (error) {
            setLoadError(error.message);
        } finally {
            setSavingDetections(false);
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

    const kpis = [
        {
            id: 'fps',
            label: 'FPS',
            value: running ? String(status.fps ?? 0) : '—',
            hint: running ? 'inférence live' : 'hors analyse',
            icon: 'gauge',
        },
        {
            id: 'people',
            label: stats?.kind === 'cuisine' ? 'Contrôles' : 'Personnes',
            value: String(
                stats?.kind === 'cuisine'
                    ? (stats.equipment ?? []).length
                    : (stats?.people ?? stats?.occupied ?? 0),
            ),
            hint:
                stats?.kind === 'bureau'
                    ? `${stats.occupied ?? 0} poste${(stats.occupied ?? 0) > 1 ? 's' : ''} occupé${(stats.occupied ?? 0) > 1 ? 's' : ''}`
                    : running
                      ? 'détections courantes'
                      : 'en attente',
            icon: 'people',
        },
        {
            id: 'alerts',
            label: 'Alertes',
            value: String(journal.alertCount),
            hint: `${captures.length} capture${captures.length > 1 ? 's' : ''}`,
            icon: 'alert',
        },
        {
            id: 'resolution',
            label: 'Résolution',
            value:
                status.source?.width && status.source?.height
                    ? `${status.source.width} × ${status.source.height}`
                    : '—',
            hint: status.source?.type ?? 'source',
            icon: 'camera',
        },
    ];

    function applyNotifyDraft(next, immediate) {
        const run = async () => {
            if (!notifyValid(next)) return;
            setSavingNotify(true);
            setLoadError(null);
            try {
                const payload = toApiPayload(next, defaults, status.detections);
                const response = await api.updateEngineAlerts(payload.email, payload.sms);
                setSnapshot(response.status);
            } catch (error) {
                setLoadError(error.message);
            } finally {
                setSavingNotify(false);
            }
        };

        if (notifyTimer.current) clearTimeout(notifyTimer.current);
        if (immediate) {
            run();
            return;
        }
        notifyTimer.current = setTimeout(run, 700);
    }

    function handleEmailPatch(patch) {
        const current = notifyDraft ?? toNotifyDraft(status);
        const next = {
            email: { ...current.email, ...patch },
            sms: { enabled: false, phone: '' },
        };
        setNotifyDraft(next);
        applyNotifyDraft(next, 'enabled' in patch || 'types' in patch);
    }

    async function handleExport(kind) {
        setExporting(kind);
        setExportError(null);
        try {
            const params = buildExportParams({
                period: exportPeriod,
                scenarioId,
                sessionId,
                customFrom,
                customTo,
            });
            if (kind === 'alerts' && !params.from) {
                throw new Error('Choisissez une période pour exporter les alertes.');
            }
            await api.downloadExport(kind === 'occupation' ? 'occupation' : 'alerts', params);
        } catch (error) {
            setExportError(error.message);
        } finally {
            setExporting(null);
        }
    }

    async function handleClearJournal() {
        const occ = journal.occCount;
        const alertsStored = journal.alertCount;
        if (occ === 0 && alertsStored === 0) {
            return;
        }
        const confirmed = window.confirm(
            `Supprimer ${occ} occupation${occ > 1 ? 's' : ''} et ${alertsStored} alerte${alertsStored > 1 ? 's' : ''} de cette période ? Cette action est irréversible.`,
        );
        if (!confirmed) {
            return;
        }
        setClearing(true);
        setExportError(null);
        try {
            const params = buildExportParams({
                period: exportPeriod,
                scenarioId,
                sessionId,
                customFrom,
                customTo,
            });
            await api.deleteJournal(params);
            setJournal({ occupations: [], alerts: [], occCount: 0, alertCount: 0 });
            setLightbox(null);
        } catch (error) {
            setExportError(error.message);
        } finally {
            setClearing(false);
        }
    }

    return (
        <section className="watch" data-skin="monitor">
            <nav className="watch__rail" aria-label="Vues du dashboard">
                <button
                    type="button"
                    className="watch__rail-btn"
                    data-active={dashView === 'live' || undefined}
                    onClick={() => setDashView('live')}
                >
                    <KpiIcon name="camera" />
                    Live
                </button>
                <button
                    type="button"
                    className="watch__rail-btn"
                    data-active={dashView === 'alerts' || undefined}
                    onClick={() => setDashView('alerts')}
                >
                    <KpiIcon name="alert" />
                    Alertes
                    <span className="watch__rail-count">{alerts.length || journal.alertCount}</span>
                </button>
                <button
                    type="button"
                    className="watch__rail-btn"
                    data-active={dashView === 'journal' || undefined}
                    onClick={() => setDashView('journal')}
                >
                    <KpiIcon name="journal" />
                    Journal
                    <span className="watch__rail-count">{journal.occCount}</span>
                </button>
            </nav>

            <div className="watch__main">
            <header className="watch__head">
                <div>
                    <span className="section-label">Supervision</span>
                    <h1 className="watch__title">
                        {dashView === 'alerts'
                            ? 'Alertes'
                            : dashView === 'journal'
                              ? 'Journal persisté'
                              : scenarioId === 'cuisine'
                                ? 'PPE Monitor'
                                : 'Office Surveillance'}
                    </h1>
                    <p className="watch__subtitle">
                        {dashView === 'alerts'
                            ? 'Alertes de la session et historique enregistré'
                            : dashView === 'journal'
                              ? 'Occupations enregistrées dans Laravel'
                              : scenarioId === 'cuisine'
                                ? 'Restaurant Hygiene Detection System'
                                : 'Suivi temps réel — occupation · téléphone · vigilance'}
                    </p>
                </div>

                <div className="watch__meta">
                    <StateChip state={status.state} />
                    {running && (
                        <span className="watch__stat">{formatDuration(status.uptime_seconds)}</span>
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

            {dashView === 'live' && (
                <>
            {(idle || status.state === 'stopped' || status.state === 'ended' || status.state === 'failed') &&
                !starting &&
                !running && (
                    <div className="watch__empty-actions watch__empty-actions--bar">
                        <Link to={`/scenario/${scenarioId}`} className="btn">
                            Configuration
                        </Link>
                        {status.state === 'stopped' ||
                        status.state === 'ended' ||
                        status.state === 'failed' ? (
                            <Link to={`/engine/${scenarioId}`} className="btn btn--primary">
                                Relancer
                            </Link>
                        ) : (
                            <Link to={`/scenario/${scenarioId}`} className="btn btn--primary">
                                Démarrer une analyse
                            </Link>
                        )}
                        {status.error && (
                            <p className="watch__empty-hint">{status.error}</p>
                        )}
                    </div>
                )}

            {scenarioId === 'cuisine' ? (
                <KitchenMonitor
                    running={running}
                    starting={starting}
                    streamUrl={streamUrl}
                    streamBroken={streamBroken}
                    onStreamError={() => setBrokenStream(streamUrl)}
                    fps={status.fps}
                    confidence={defaults?.confidence?.default}
                    detections={status.detections ?? []}
                    defaults={defaults}
                    onDetectionsChange={handleDetectionsChange}
                    saving={savingDetections}
                    stats={stats}
                    empty={
                        streamBroken
                            ? 'Flux interrompu. Rechargez la page.'
                            : 'Aucune analyse en cours. Lancez une source depuis Configuration.'
                    }
                />
            ) : (
                <BureauMonitor
                    running={running}
                    starting={starting}
                    streamUrl={streamUrl}
                    streamBroken={streamBroken}
                    onStreamError={() => setBrokenStream(streamUrl)}
                    fps={status.fps}
                    confidence={defaults?.confidence?.default}
                    detections={status.detections ?? []}
                    defaults={defaults}
                    onDetectionsChange={handleDetectionsChange}
                    saving={savingDetections}
                    stats={stats}
                    sourceType={status.source?.type}
                    empty={
                        streamBroken
                            ? 'Flux interrompu. Rechargez la page.'
                            : 'Aucune analyse en cours. Lancez une source depuis Configuration.'
                    }
                />
            )}
                </>
            )}

            {dashView === 'alerts' && (
                <div className="watch__view">
                    <div className="watch__layout">
                        <SessionAlerts alerts={alerts} />
                        <CaptureGallery
                            captures={captures}
                            selected={selectedCapture}
                            onSelect={setSelectedCaptureId}
                            onOpen={setLightbox}
                        />
                    </div>
                    <JournalPanel
                        occupations={journal.occupations}
                        alerts={journal.alerts}
                        occCount={journal.occCount}
                        alertCount={journal.alertCount}
                        error={journalError}
                        onOpenCapture={setLightbox}
                        sections="alerts"
                    />
                    <section className="watch__chart panel">
                        <div className="panel__head">
                            <h2 className="panel__title">Alertes dans le temps</h2>
                            <span className="panel__hint">{journal.alertCount} au total</span>
                        </div>
                        <div className="watch__chart-body">
                            <AlertTrend alerts={journal.alerts} />
                        </div>
                    </section>
                </div>
            )}

            {dashView === 'journal' && (
                <div className="watch__view">
                    <JournalPanel
                        occupations={journal.occupations}
                        alerts={journal.alerts}
                        occCount={journal.occCount}
                        alertCount={journal.alertCount}
                        error={journalError}
                        onOpenCapture={setLightbox}
                        sections="occupations"
                    />
                    <ExportBar
                        period={exportPeriod}
                        options={periodOptions}
                        onPeriod={setPeriod}
                        customFrom={customFrom}
                        customTo={customTo}
                        onFrom={setCustomFrom}
                        onTo={setCustomTo}
                        exporting={exporting}
                        clearing={clearing}
                        canClear={journal.occCount + journal.alertCount > 0}
                        error={exportError}
                        onExport={handleExport}
                        onClear={handleClearJournal}
                    />
                </div>
            )}

            {dashView === 'live' && running && defaults && notifyDraft && (
                <div className="watch__notify-live">
                    <EmailPanel
                        scenarioId={scenarioId}
                        defaults={defaults}
                        email={notifyDraft.email}
                        thresholdKeys={activeThresholdKeys(
                            defaults,
                            status.detections ?? [],
                        )}
                        onEmailChange={handleEmailPatch}
                        disabled={savingNotify}
                        index={null}
                        idPrefix="live"
                    />
                </div>
            )}

            <footer className="watch__foot">
                <div className="watch__foot-nav">
                    <button type="button" className="btn" onClick={() => navigate(`/scenario/${scenarioId}`)}>
                        Configuration
                    </button>
                    <Link to="/" className="btn btn--ghost">
                        Changer de scénario
                    </Link>
                </div>
            </footer>

            {lightbox && (
                <button
                    type="button"
                    className="watch__lightbox"
                    onClick={() => setLightbox(null)}
                    aria-label="Fermer la capture"
                >
                    <img src={lightbox} alt="Capture d'alerte agrandie" />
                </button>
            )}
            </div>
        </section>
    );
}

function KpiIcon({ name }) {
    const common = {
        width: 22,
        height: 22,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: '1.8',
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
    };
    if (name === 'gauge') {
        return (
            <svg {...common}>
                <path d="M12 21a9 9 0 1 1 9-9" />
                <path d="m16 8-3.2 4.8" />
                <circle cx="12" cy="12" r="1.2" fill="currentColor" />
            </svg>
        );
    }
    if (name === 'people') {
        return (
            <svg {...common}>
                <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
                <circle cx="9.5" cy="7" r="3" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a3 3 0 0 1 0 5.74" />
            </svg>
        );
    }
    if (name === 'alert') {
        return (
            <svg {...common}>
                <path d="M10.3 3.2 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.2a2 2 0 0 0-3.4 0Z" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
            </svg>
        );
    }
    if (name === 'journal') {
        return (
            <svg {...common}>
                <path d="M8 7h8" />
                <path d="M8 11h8" />
                <path d="M8 15h5" />
                <rect x="4" y="3" width="16" height="18" rx="2" />
            </svg>
        );
    }
    return (
        <svg {...common}>
            <path d="M4 8h16" />
            <rect x="3" y="6" width="18" height="14" rx="2" />
            <circle cx="12" cy="13" r="3" />
        </svg>
    );
}

function KpiCard({ label, value, hint, icon }) {
    return (
        <article className="kpi">
            <div>
                <p className="kpi__label">{label}</p>
                <p className="kpi__value">{value}</p>
                <p className="kpi__hint">{hint}</p>
            </div>
            <span className="kpi__icon">
                <KpiIcon name={icon} />
            </span>
        </article>
    );
}

function SessionAlerts({ alerts }) {
    return (
        <section className="watch__alerts panel">
            <div className="panel__head">
                <h2 className="panel__title">Alertes de session</h2>
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
    );
}

function CaptureGallery({ captures, selected, onSelect, onOpen }) {
    return (
        <section className="watch__captures panel">
            <div className="panel__head">
                <h2 className="panel__title">Captures</h2>
                <span className="panel__hint">{captures.length}</span>
            </div>
            {selected ? (
                <button
                    type="button"
                    className="watch__capture-hero"
                    onClick={() => onOpen(selected.snapshot_url)}
                >
                    <img
                        src={selected.snapshot_url}
                        alt={selected.label ?? selected.type}
                    />
                    <span className="watch__capture-meta">
                        {selected.label ?? ALERT_LABELS[selected.type] ?? selected.type}
                        {' · '}
                        {selected.zone_name ?? 'scène'}
                        {' · '}
                        {formatStamp(selected.created_at)}
                    </span>
                </button>
            ) : (
                <div className="watch__stage-empty">Aucune capture pour cette période.</div>
            )}
            {captures.length > 0 && (
                <div className="watch__capture-strip">
                    {captures.map((row) => (
                        <button
                            key={row.id}
                            type="button"
                            className="watch__capture-thumb"
                            data-active={row.id === selected?.id || undefined}
                            onClick={() => onSelect(row.id)}
                        >
                            <img
                                src={row.snapshot_url}
                                alt={row.label ?? row.type}
                            />
                        </button>
                    ))}
                </div>
            )}
        </section>
    );
}

function AlertTrend({ alerts }) {
    const buckets = useMemo(() => {
        const now = Date.now();
        const size = 30 * 60 * 1000;
        const count = 12;
        const start = now - count * size;
        const list = Array.from({ length: count }, (_, index) => ({
            t: start + index * size,
            n: 0,
        }));
        for (const alert of alerts ?? []) {
            const at = Date.parse(alert.created_at);
            if (Number.isNaN(at) || at < start) continue;
            const i = Math.min(count - 1, Math.floor((at - start) / size));
            list[i].n += 1;
        }
        return list;
    }, [alerts]);

    const max = Math.max(1, ...buckets.map((bucket) => bucket.n));
    const width = 640;
    const height = 160;
    const pad = 8;
    const innerW = width - pad * 2;
    const innerH = height - 28;
    const points = buckets.map((bucket, index) => {
        const x = pad + (index / Math.max(buckets.length - 1, 1)) * innerW;
        const y = 10 + innerH - (bucket.n / max) * innerH;
        return `${x},${y}`;
    });
    const area = `M ${pad},${10 + innerH} L ${points.join(' L ')} L ${pad + innerW},${10 + innerH} Z`;

    return (
        <svg className="watch__trend" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Volume d'alertes">
            <path d={area} className="watch__trend-fill" />
            <polyline points={points.join(' ')} className="watch__trend-line" />
            {buckets.map((bucket, index) =>
                index % 2 === 0 ? (
                    <text
                        key={bucket.t}
                        x={pad + (index / Math.max(buckets.length - 1, 1)) * innerW}
                        y={height - 4}
                        className="watch__trend-label"
                    >
                        {new Date(bucket.t).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                        })}
                    </text>
                ) : null,
            )}
        </svg>
    );
}

function formatStamp(iso) {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

function JournalPanel({
    occupations,
    alerts,
    occCount,
    alertCount,
    error,
    onOpenCapture,
    sections = 'both',
}) {
    const showOccupations = sections !== 'alerts';
    const showAlerts = sections !== 'occupations';
    const title =
        sections === 'alerts'
            ? 'Alertes persistées'
            : sections === 'occupations'
              ? 'Occupations persistées'
              : 'Journal persisté';
    const hint =
        sections === 'alerts'
            ? `${alertCount} alerte${alertCount > 1 ? 's' : ''}`
            : sections === 'occupations'
              ? `${occCount} occupation${occCount > 1 ? 's' : ''}`
              : `${occCount} occupation${occCount > 1 ? 's' : ''} · ${alertCount} alerte${alertCount > 1 ? 's' : ''}`;

    return (
        <section className="watch__journal panel">
            <div className="panel__head">
                <h2 className="panel__title">{title}</h2>
                <span className="panel__hint">{hint}</span>
            </div>
            <div className="watch__journal-body">
                {error && (
                    <p className="watch__banner watch__banner--error" role="alert">
                        {error}
                    </p>
                )}
                <div
                    className="watch__journal-grid"
                    data-single={sections !== 'both' || undefined}
                >
                    {showOccupations && (
                    <div>
                        <h3 className="watch__journal-title">Occupations</h3>
                        {occupations.length === 0 ? (
                            <p className="watch__side-hint">Aucune occupation pour cette période.</p>
                        ) : (
                            <table className="watch__table">
                                <thead>
                                    <tr>
                                        <th>Poste</th>
                                        <th>Entrée</th>
                                        <th>Sortie</th>
                                        <th>Durée</th>
                                        <th>État</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {occupations.map((row) => (
                                        <tr key={row.id}>
                                            <td>{row.zone_name}</td>
                                            <td>{formatStamp(row.entered_at)}</td>
                                            <td>{row.open ? 'en cours' : formatStamp(row.exited_at)}</td>
                                            <td>{formatDuration(row.duration_seconds)}</td>
                                            <td>{STATE_LABELS[row.activity_state] ?? row.activity_state}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                    )}
                    {showAlerts && (
                    <div>
                        <h3 className="watch__journal-title">Alertes</h3>
                        {alerts.length === 0 ? (
                            <p className="watch__side-hint">Aucune alerte pour cette période.</p>
                        ) : (
                            <table className="watch__table">
                                <thead>
                                    <tr>
                                        <th>Type</th>
                                        <th>Zone</th>
                                        <th>Heure</th>
                                        <th>Capture</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {alerts.map((row) => (
                                        <tr key={row.id}>
                                            <td>
                                                <span
                                                    className="severity-tag"
                                                    data-severity={row.severity}
                                                >
                                                    {row.label ?? ALERT_LABELS[row.type] ?? row.type}
                                                </span>
                                            </td>
                                            <td>{row.zone_name ?? 'scène'}</td>
                                            <td>{formatStamp(row.created_at)}</td>
                                            <td>
                                                {row.snapshot_url ? (
                                                    <button
                                                        type="button"
                                                        className="watch__thumb-btn"
                                                        onClick={() => onOpenCapture(row.snapshot_url)}
                                                    >
                                                        <img
                                                            className="watch__thumb"
                                                            src={row.snapshot_url}
                                                            alt={`Capture ${row.label ?? row.type}`}
                                                        />
                                                    </button>
                                                ) : (
                                                    '—'
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                    )}
                </div>
            </div>
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

function pad(value) {
    return String(value).padStart(2, '0');
}

function toInputValue(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function startOfTodayInput() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return toInputValue(date);
}

function nowInput() {
    return toInputValue(new Date());
}

function toNotifyDraft(status) {
    const email = status?.email || {};
    return {
        email: {
            enabled: Boolean(email.enabled),
            recipient: email.recipient ?? '',
            types: Array.isArray(email.types) ? email.types : [],
            cooldownMinutes: email.cooldown_minutes ?? email.cooldownMinutes ?? 5,
        },
        sms: { enabled: false, phone: '' },
    };
}

function notifyValid(draft) {
    if (draft.email.enabled && !EMAIL_RE.test(draft.email.recipient.trim())) return false;
    if (draft.email.enabled && draft.email.types.length === 0) {
        return false;
    }
    return true;
}

function toApiPayload(draft, defaults, detections) {
    const types = draft.email.types.filter((key) =>
        activeThresholdKeys(defaults, detections ?? []).includes(key),
    );
    return {
        email: {
            enabled: draft.email.enabled,
            recipient: draft.email.recipient.trim(),
            types,
            cooldown_minutes: draft.email.cooldownMinutes,
        },
        sms: {
            enabled: false,
            phone: '',
            types,
            cooldown_minutes: draft.email.cooldownMinutes,
        },
    };
}

function buildExportParams({ period, scenarioId, sessionId, customFrom, customTo }) {
    const now = new Date();
    const params = { scenario: scenarioId };

    if (period === 'session' && sessionId) {
        params.session_id = sessionId;
        params.from = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
        params.to = now.toISOString();
        return params;
    }

    let from;
    let to = now;
    if (period === 'today') {
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === '7d') {
        from = new Date(now.getTime() - 7 * 86400000);
    } else {
        from = customFrom
            ? new Date(customFrom)
            : new Date(now.getFullYear(), now.getMonth(), now.getDate());
        to = customTo ? new Date(customTo) : now;
    }

    params.from = from.toISOString();
    params.to = to.toISOString();
    return params;
}

function ExportBar({
    period,
    options,
    onPeriod,
    customFrom,
    customTo,
    onFrom,
    onTo,
    exporting,
    clearing,
    canClear,
    error,
    onExport,
    onClear,
}) {
    return (
        <div className="watch__export">
            <div className="watch__export-row">
                <span className="watch__export-label">Export CSV</span>
                <Tabs options={options} value={period} onChange={onPeriod} label="Période d'export" />
                <button
                    type="button"
                    className="btn"
                    disabled={Boolean(exporting) || clearing}
                    onClick={() => onExport('occupation')}
                >
                    {exporting === 'occupation' ? 'Export…' : 'Occupations'}
                </button>
                <button
                    type="button"
                    className="btn"
                    disabled={Boolean(exporting) || clearing}
                    onClick={() => onExport('alerts')}
                >
                    {exporting === 'alerts' ? 'Export…' : 'Alertes'}
                </button>
                <button
                    type="button"
                    className="btn btn--danger"
                    disabled={!canClear || Boolean(exporting) || clearing}
                    onClick={onClear}
                >
                    {clearing ? 'Suppression…' : 'Supprimer le journal'}
                </button>
            </div>
            {period === 'custom' && (
                <div className="watch__export-custom">
                    <label className="field__label" htmlFor="export-from">
                        Du
                    </label>
                    <input
                        id="export-from"
                        className="text-input"
                        type="datetime-local"
                        value={customFrom}
                        onChange={(event) => onFrom(event.target.value)}
                    />
                    <label className="field__label" htmlFor="export-to">
                        Au
                    </label>
                    <input
                        id="export-to"
                        className="text-input"
                        type="datetime-local"
                        value={customTo}
                        onChange={(event) => onTo(event.target.value)}
                    />
                </div>
            )}
            {error && (
                <p className="watch__banner watch__banner--error" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}
