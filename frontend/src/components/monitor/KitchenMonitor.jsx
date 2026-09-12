import { cascadeOff } from '../../utils/detections.js';
import MonitorStage from './MonitorStage.jsx';
import './Monitor.css';

const GROUPS = [
    {
        id: 'apron',
        title: 'Tablier (Apron)',
        positives: 'apron',
        negatives: 'no_apron',
    },
    {
        id: 'glove',
        title: 'Gants (Gloves)',
        positives: 'glove',
        negatives: 'no_glove',
    },
    {
        id: 'hairnet',
        title: 'Couvre-cheveux',
        positives: 'hairnet',
        negatives: 'no_hairnet',
    },
];

const PRESETS = [
    { id: 'apron', label: 'Apron', keys: ['apron'] },
    { id: 'glove', label: 'Gants', keys: ['glove'] },
    { id: 'hairnet', label: 'Cheveux', keys: ['hairnet'] },
    { id: 'apron-glove', label: 'Apron+Gants', keys: ['apron', 'glove'] },
    { id: 'apron-hair', label: 'Apron+Chev', keys: ['apron', 'hairnet'] },
    { id: 'glove-hair', label: 'Gants+Chev', keys: ['glove', 'hairnet'] },
];

function equipmentOf(detections) {
    return (detections ?? []).filter((key) => key !== 'compliance');
}

function withCompliance(keys) {
    const next = [...new Set(keys.filter((key) => key !== 'compliance'))];
    if (['apron', 'glove', 'hairnet'].every((key) => next.includes(key))) {
        next.push('compliance');
    }
    return next;
}

function sameEquipment(detections, keys) {
    const current = equipmentOf(detections).slice().sort().join(',');
    const target = keys.slice().sort().join(',');
    return current === target;
}

export default function KitchenMonitor({
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
}) {
    const active = detections ?? [];
    const missing = (stats?.equipment ?? []).filter((item) => !item.compliant).length;

    function applyKeys(keys) {
        const next = withCompliance(keys);
        if (next.length === 0) return;
        onDetectionsChange(next);
    }

    function toggleGroup(id, checked) {
        if (saving) return;
        if (checked) {
            applyKeys([...equipmentOf(active), id]);
            return;
        }
        const next = cascadeOff(defaults, active, id);
        if (next.length === 0) return;
        onDetectionsChange(next);
    }

    return (
        <div className="monitor monitor--kitchen">
            <aside className="monitor__sidebar">
                <p className="monitor__section">Presets rapides</p>
                <div className="monitor__presets">
                    {PRESETS.map((preset) => (
                        <button
                            key={preset.id}
                            type="button"
                            className="monitor__preset"
                            data-active={sameEquipment(active, preset.keys) || undefined}
                            disabled={saving || !running}
                            onClick={() => applyKeys(preset.keys)}
                        >
                            {preset.label}
                        </button>
                    ))}
                    <button
                        type="button"
                        className="monitor__preset monitor__preset--all"
                        data-active={
                            sameEquipment(active, ['apron', 'glove', 'hairnet']) || undefined
                        }
                        disabled={saving || !running}
                        onClick={() => applyKeys(['apron', 'glove', 'hairnet'])}
                    >
                        Tout activer
                    </button>
                    <button
                        type="button"
                        className="monitor__preset"
                        disabled={saving || !running || equipmentOf(active).length <= 1}
                        onClick={() => applyKeys([equipmentOf(active)[0]])}
                    >
                        Tout désactiver
                    </button>
                </div>

                <p className="monitor__section">Groupes de détection</p>
                <div className="monitor__groups">
                    {GROUPS.map((group) => {
                        const on = active.includes(group.id);
                        const lastOne = on && equipmentOf(active).length === 1;
                        return (
                            <article
                                key={group.id}
                                className="monitor__group"
                                data-active={on || undefined}
                            >
                                <div className="monitor__group-head">
                                    <span className="monitor__group-title">{group.title}</span>
                                    <label className="monitor-switch">
                                        <input
                                            type="checkbox"
                                            checked={on}
                                            disabled={saving || !running || lastOne}
                                            onChange={(event) =>
                                                toggleGroup(group.id, event.target.checked)
                                            }
                                        />
                                        <span />
                                    </label>
                                </div>
                                <p className="monitor__group-classes">
                                    <span data-ok>{group.positives}</span>
                                    {'  '}
                                    <span data-ko>{group.negatives}</span>
                                </p>
                            </article>
                        );
                    })}
                </div>

                <p className="monitor__section">Statistiques</p>
                <div className="monitor__stats">
                    <div>
                        <strong>{Number(fps ?? 0).toFixed(1)}</strong>
                        <span>FPS</span>
                    </div>
                    <div>
                        <strong>{missing}</strong>
                        <span>Manquants</span>
                    </div>
                </div>
            </aside>

            <MonitorStage
                starting={starting}
                streamUrl={streamUrl}
                streamBroken={streamBroken}
                onStreamError={onStreamError}
                fps={fps}
                confidence={confidence}
                liveLabel="LIVE"
                empty={empty}
            />
        </div>
    );
}
