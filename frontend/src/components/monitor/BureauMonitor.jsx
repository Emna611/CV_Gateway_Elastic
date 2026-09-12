import { formatDuration } from '../../utils/format.js';
import MonitorStage from './MonitorStage.jsx';
import './Monitor.css';

const STATE_LABELS = {
    ACTIVE: 'Actif',
    IDLE: 'Inactif',
    STANDING: 'Debout',
    SLEEPING: 'Sommeil',
    FATIGUE: 'Fatigue',
    ON_PHONE: 'Téléphone',
};

export default function BureauMonitor({
    running,
    starting,
    streamUrl,
    streamBroken,
    onStreamError,
    fps,
    confidence,
    detections,
    defaults,
    onDetectionsChange,
    saving,
    stats,
    empty,
    sourceType,
}) {
    const zones = stats?.zones ?? [];
    const occupied = stats?.occupied ?? zones.filter((zone) => zone.occupied).length;
    const absent = Math.max(zones.length - occupied, 0);
    const fatigue = zones.filter((zone) => zone.occupied && zone.alert === 'FATIGUE').length;
    const sleep = zones.filter((zone) => zone.occupied && zone.alert === 'SLEEPING').length;
    const phone = zones.filter((zone) => zone.occupied && zone.alert === 'ON_PHONE').length;
    const activeZones = zones.filter((zone) => zone.occupied && zone.activity_state === 'ACTIVE').length;
    const entries = Object.entries(defaults?.detections ?? {});
    const active = detections ?? [];

    function toggle(id, checked) {
        if (saving || !running) return;
        const keys = entries.map(([key]) => key);
        const next = checked
            ? keys.filter((key) => key === id || active.includes(key))
            : active.filter((key) => key !== id);
        if (next.length === 0) return;
        onDetectionsChange(next);
    }

    return (
        <div className="monitor monitor--bureau">
            <div className="monitor__chips">
                <span className="monitor__chip">
                    <i data-tone="ok" />
                    {occupied} occupée{occupied > 1 ? 's' : ''}
                </span>
                <span className="monitor__chip">
                    <i data-tone="active" />
                    {activeZones} active{activeZones > 1 ? 's' : ''}
                </span>
                <span className="monitor__chip">
                    <i data-tone="off" />
                    {absent} absente{absent > 1 ? 's' : ''}
                </span>
                <span className="monitor__chip">
                    <i data-tone="warn" />
                    {fatigue} fatigue
                </span>
                <span className="monitor__chip">
                    <i data-tone="sleep" />
                    {sleep} sommeil
                </span>
                {phone > 0 && (
                    <span className="monitor__chip">
                        <i data-tone="phone" />
                        {phone} téléphone
                    </span>
                )}
            </div>

            {entries.length > 0 && (
                <div className="monitor__scenario-bar">
                    {entries.map(([id, spec]) => (
                        <button
                            key={id}
                            type="button"
                            className="monitor__preset"
                            data-active={active.includes(id) || undefined}
                            disabled={saving || !running || (active.includes(id) && active.length === 1)}
                            onClick={() => toggle(id, !active.includes(id))}
                        >
                            {spec.label}
                        </button>
                    ))}
                </div>
            )}

            <div className="monitor__bureau-grid">
                <MonitorStage
                    starting={starting}
                    streamUrl={streamUrl}
                    streamBroken={streamBroken}
                    onStreamError={onStreamError}
                    fps={fps}
                    confidence={confidence}
                    liveLabel={sourceType === 'rtsp' ? 'LIVE RTSP' : running ? 'LIVE' : null}
                    empty={empty}
                />

                <aside className="monitor__cabins">
                    <p className="monitor__section">État des cabines</p>
                    {zones.length === 0 ? (
                        <p className="monitor__hint">
                            {running
                                ? 'Aucune zone : le suivi porte sur les personnes détectées.'
                                : 'Les postes apparaîtront une fois l’analyse lancée.'}
                        </p>
                    ) : (
                        zones.map((zone, index) => {
                            const alert = zone.occupied ? zone.alert : 'LIBRE';
                            const tone = !zone.occupied
                                ? 'off'
                                : alert === 'SLEEPING'
                                  ? 'sleep'
                                  : alert === 'FATIGUE'
                                    ? 'warn'
                                    : alert === 'ON_PHONE'
                                      ? 'phone'
                                      : zone.activity_state === 'IDLE'
                                        ? 'idle'
                                        : 'ok';
                            return (
                                <article
                                    key={zone.id}
                                    className="monitor__cabin"
                                    data-alert={alert}
                                >
                                    <i data-tone={tone} />
                                    <div>
                                        <span className="monitor__cabin-name">
                                            {zone.name || `Cabine ${index + 1}`}
                                        </span>
                                        <span className="monitor__cabin-status" data-tone={tone}>
                                            {zone.occupied ? (
                                                <>
                                                    {STATE_LABELS[zone.activity_state] ?? 'Présent'}
                                                    {zone.occupants?.length
                                                        ? `  ID: #${zone.occupants.join(', #')}`
                                                        : ''}
                                                </>
                                            ) : (
                                                'Absent'
                                            )}
                                        </span>
                                    </div>
                                    <span className="monitor__cabin-time">
                                        {formatDuration(zone.occupied_seconds ?? 0)}
                                    </span>
                                </article>
                            );
                        })
                    )}
                </aside>
            </div>
        </div>
    );
}
