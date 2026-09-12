import { cascadeOff, unmetRequirements } from '../../utils/detections.js';
import './DetectionsToggles.css';

export default function DetectionsToggles({ defaults, detections, onChange, disabled }) {
    const entries = Object.entries(defaults.detections ?? {});

    function toggle(id, checked) {
        if (disabled) return;
        const next = checked
            ? entries.map(([key]) => key).filter((key) => key === id || detections.includes(key))
            : cascadeOff(defaults, detections, id);
        onChange(next);
    }

    return (
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
                const lastOne = active && detections.length === 1;

                return (
                    <label
                        key={id}
                        className="detection"
                        data-active={active}
                        data-locked={locked || lastOne || disabled || undefined}
                        title={
                            lockReason ||
                            (lastOne ? 'Au moins une classe doit rester active.' : '')
                        }
                    >
                        <input
                            type="checkbox"
                            checked={active}
                            disabled={locked || lastOne || disabled}
                            onChange={(event) => toggle(id, event.target.checked)}
                        />
                        <span className="detection__text">
                            <span className="detection__label">{spec.label}</span>
                            <span className="detection__description">
                                {lockReason || spec.description}
                            </span>
                        </span>
                    </label>
                );
            })}
        </div>
    );
}
