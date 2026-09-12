import './controls.css';

export function Panel({ index, title, hint, children }) {
    return (
        <section className="panel">
            <div className="panel__head">
                {index && <span className="panel__index">{index}</span>}
                <h2 className="panel__title">{title}</h2>
                {hint && <span className="panel__hint">{hint}</span>}
            </div>
            <div className="panel__body">{children}</div>
        </section>
    );
}

export function Tabs({ options, value, onChange, label }) {
    return (
        <div className="tabs" role="tablist" aria-label={label}>
            {options.map((option) => (
                <button
                    key={option.id}
                    type="button"
                    role="tab"
                    aria-selected={value === option.id}
                    className="tabs__item"
                    onClick={() => onChange(option.id)}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

export function Toggle({ checked, onChange, label, id, disabled }) {
    return (
        <label className="toggle" htmlFor={id} data-disabled={disabled || undefined}>
            <input
                id={id}
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(event) => onChange(event.target.checked)}
            />
            <span className="toggle__track">
                <span className="toggle__knob" />
            </span>
            <span className="toggle__label">{label}</span>
        </label>
    );
}

export function Slider({
    label,
    description,
    severity,
    value,
    min,
    max,
    step,
    onChange,
    formatValue,
    formatBound,
    disabled,
}) {
    const render = formatValue ?? ((raw) => raw);
    const bound = formatBound ?? render;

    return (
        <div className="slider">
            <div className="slider__head">
                {severity && <span className="severity-dot" data-severity={severity} />}
                <span className="slider__label">{label}</span>
                <span className="slider__value">{render(value)}</span>
            </div>
            {description && <p className="slider__description">{description}</p>}
            <input
                className="slider__input"
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                disabled={disabled}
                onChange={(event) => onChange(Number(event.target.value))}
                aria-label={label}
            />
            <div className="slider__bounds">
                <span>{bound(min)}</span>
                <span>{bound(max)}</span>
            </div>
        </div>
    );
}

const STATUS_ICONS = {
    idle: '○',
    ok: '✓',
    warning: '!',
    error: '✗',
};

export function StatusBanner({ status, title, hint }) {
    return (
        <div className="status" data-status={status} role="status">
            <span className="status__icon">
                {status === 'pending' ? <span className="spinner" /> : STATUS_ICONS[status]}
            </span>
            <span className="status__text">
                <span className="status__title">{title}</span>
                {hint && <span className="status__hint">{hint}</span>}
            </span>
        </div>
    );
}

export function Checkbox({ checked, onChange, label, disabled }) {
    return (
        <label className="checkbox" data-checked={checked} data-disabled={disabled || undefined}>
            <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(event) => onChange(event.target.checked)}
            />
            <span className="checkbox__label">{label}</span>
        </label>
    );
}
