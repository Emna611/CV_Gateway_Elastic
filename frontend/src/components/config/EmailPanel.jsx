import { useState } from 'react';
import { Checkbox, Panel, Slider, StatusBanner, Toggle } from '../ui/controls.jsx';
import { testEmail } from '../../api/client.js';
import { EMAIL_RE, formatSeconds } from '../../utils/format.js';

export default function EmailPanel({ scenarioId, state, dispatch, thresholdKeys }) {
    const { defaults, email } = state;
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState(null);

    const recipient = email.recipient.trim();
    const recipientValid = EMAIL_RE.test(recipient);
    const showRecipientError = email.enabled && recipient.length > 0 && !recipientValid;

    function patch(values) {
        setResult(null);
        dispatch({ type: 'email', patch: values });
    }

    function toggleType(key, checked) {
        patch({
            types: checked
                ? [...email.types, key]
                : email.types.filter((type) => type !== key),
        });
    }

    async function sendTest() {
        setSending(true);
        setResult(null);
        try {
            const response = await testEmail(scenarioId, recipient);
            setResult({ status: 'ok', title: response.message, hint: `Via ${response.via}` });
        } catch (error) {
            setResult({ status: 'error', title: "L'email n'a pas été envoyé", hint: error.message });
        } finally {
            setSending(false);
        }
    }

    return (
        <Panel index="2.4" title="Alertes email">
            <Toggle
                id="email-enabled"
                checked={email.enabled}
                onChange={(value) => patch({ enabled: value })}
                label="Notifier l'administrateur par email"
            />

            {email.enabled && (
                <div className="email__body">
                    <div className="field">
                        <label className="field__label" htmlFor="email-recipient">
                            Adresse du destinataire
                        </label>
                        <input
                            id="email-recipient"
                            className="text-input"
                            type="email"
                            placeholder="admin@elastic-solutions.tn"
                            value={email.recipient}
                            data-invalid={showRecipientError}
                            onChange={(event) => patch({ recipient: event.target.value })}
                        />
                        {showRecipientError && (
                            <p className="field__error">Format d&apos;adresse invalide.</p>
                        )}
                    </div>

                    <div className="field">
                        <span className="field__label">
                            Événements qui déclenchent un email
                        </span>
                        <div className="email__types">
                            {thresholdKeys.map((key) => (
                                <Checkbox
                                    key={key}
                                    label={defaults.thresholds[key].label}
                                    checked={email.types.includes(key)}
                                    onChange={(checked) => toggleType(key, checked)}
                                />
                            ))}
                        </div>
                        <p className="field__help">
                            Par défaut, seuls les événements critiques sont notifiés. Seuls les
                            événements des classes actives sont proposés.
                        </p>
                    </div>

                    <Slider
                        label="ANTI-SPAM"
                        description="Un email du même type ne sera pas renvoyé avant ce délai."
                        value={email.cooldownMinutes}
                        min={defaults.email.cooldown_minutes.min}
                        max={defaults.email.cooldown_minutes.max}
                        step={defaults.email.cooldown_minutes.step}
                        onChange={(value) => patch({ cooldownMinutes: value })}
                        formatValue={(value) => `${value} min`}
                        formatBound={(value) => formatSeconds(value * 60)}
                    />

                    <div className="source__actions">
                        <button
                            type="button"
                            className="btn"
                            disabled={!recipientValid || sending}
                            onClick={sendTest}
                        >
                            {sending ? 'Envoi en cours…' : 'Envoyer un email de test'}
                        </button>
                    </div>

                    {result && (
                        <StatusBanner
                            status={result.status}
                            title={result.title}
                            hint={result.hint}
                        />
                    )}
                </div>
            )}
        </Panel>
    );
}
