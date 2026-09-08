import { Panel } from '../ui/controls.jsx';
import { cascadeOff, unmetRequirements } from '../../utils/detections.js';

export default function DetectionsPanel({ state, dispatch }) {
    const { defaults, detections } = state;
    const entries = Object.entries(defaults.detections);
    const allActive = detections.length === entries.length;

    function toggle(id, checked) {
        const next = checked
            ? entries.map(([key]) => key).filter((key) => key === id || detections.includes(key))
            : cascadeOff(defaults, detections, id);
        dispatch({ type: 'detections', value: next });
    }

    return (
        <Panel
            index="2.2"
            title="Classes détectées"
            hint={`${detections.length} / ${entries.length} activée${detections.length > 1 ? 's' : ''}`}
        >
            <p className="detections__lead">
                Choisissez librement une seule classe, deux, ou toutes. Seuls les seuils et les
                modèles des classes actives seront utilisés.
            </p>

            <div className="detections__list">
                {entries.map(([id, spec]) => {
                    const active = detections.includes(id);
                    const unmet = unmetRequirements(defaults, detections, id);
                    const locked = !active && unmet.length > 0;
                    const lockReason = locked
                        ? `Exige d'abord : ${unmet
                              .map((key) => defaults.detections[key].label)
                              .join(', ')}.`
                        : '';
                    // Dernière classe active : la désactiver laisserait le
                    // moteur sans rien à détecter.
                    const lastOne = active && detections.length === 1;

                    return (
                        <label
                            key={id}
                            className="detection"
                            data-active={active}
                            data-locked={locked || lastOne || undefined}
                            title={lockReason || (lastOne ? 'Au moins une classe doit rester active.' : '')}
                        >
                            <input
                                type="checkbox"
                                checked={active}
                                disabled={locked || lastOne}
                                onChange={(event) => toggle(id, event.target.checked)}
                            />
                            <span className="detection__text">
                                <span className="detection__label">{spec.label}</span>
                                <span className="detection__description">
                                    {lockReason || spec.description}
                                </span>
                            </span>
                            <span className="detection__thresholds">
                                {spec.thresholds.map((key) => (
                                    <span
                                        key={key}
                                        className="severity-dot"
                                        data-severity={defaults.thresholds[key]?.severity}
                                        title={defaults.thresholds[key]?.label}
                                    />
                                ))}
                            </span>
                        </label>
                    );
                })}
            </div>

            <div className="source__actions">
                <button
                    type="button"
                    className="btn"
                    disabled={allActive}
                    onClick={() =>
                        dispatch({ type: 'detections', value: entries.map(([key]) => key) })
                    }
                >
                    Tout activer
                </button>
            </div>
        </Panel>
    );
}
