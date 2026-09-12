import { useEffect, useState } from 'react';
import { Checkbox, Panel, Slider, StatusBanner, Toggle } from '../ui/controls.jsx';
import { getEmailStatus, testEmail } from '../../api/client.js';
import { EMAIL_RE, formatSeconds } from '../../utils/format.js';
import './EmailPanel.css';

export default function EmailPanel({
    scenarioId,
    defaults,
    email,
    thresholdKeys,
    onEmailChange,
    disabled = false,
    index = '2.4',
    title = 'Alertes email',
    idPrefix = 'alert',
}) {
    const [sending, setSending] = useState(false);
    const [emailResult, setEmailResult] = useState(null);
    const [emailMeta, setEmailMeta] = useState(null);

    const recipient = email.recipient.trim();
    const recipientValid = EMAIL_RE.test(recipient);
    const showRecipientError = email.enabled && recipient.length > 0 && !recipientValid;

    useEffect(() => {
        let cancelled = false;
        getEmailStatus()
            .then((value) => {
                if (!cancelled) setEmailMeta(value);
            })
            .catch(() => {
                if (!cancelled) setEmailMeta({ configured: false });
            });
        return () => {
            cancelled = true;
        };
    }, []);

    function patchEmail(values) {
        setEmailResult(null);
        onEmailChange(values);
    }

    function toggleType(key, checked) {
        patchEmail({
            types: checked
                ? [...email.types, key]
                : email.types.filter((type) => type !== key),
        });
    }

    async function sendEmailTest() {
        setSending(true);
        setEmailResult(null);
        try {
            const response = await testEmail(scenarioId, recipient);
            setEmailResult({ status: 'ok', title: response.message, hint: `Via ${response.via}` });
        } catch (error) {
            setEmailResult({
                status: 'error',
                title: "L'email n'a pas été envoyé",
                hint: error.message,
            });
        } finally {
            setSending(false);
        }
    }

    return (
        <Panel index={index} title={title}>
            <Toggle
                id={`${idPrefix}-email-enabled`}
                checked={email.enabled}
                onChange={(value) => patchEmail({ enabled: value })}
                label="Notifier l'administrateur par email"
                disabled={disabled}
            />

            {email.enabled && (
                <div className="email__body">
                    <div className="field">
                        <label className="field__label" htmlFor={`${idPrefix}-email-recipient`}>
                            Adresse du destinataire
                        </label>
                        <input
                            id={`${idPrefix}-email-recipient`}
                            className="text-input"
                            type="email"
                            placeholder="admin@elastic-solutions.tn"
                            value={email.recipient}
                            data-invalid={showRecipientError}
                            disabled={disabled}
                            onChange={(event) => patchEmail({ recipient: event.target.value })}
                        />
                        {showRecipientError && (
                            <p className="field__error">Format d&apos;adresse invalide.</p>
                        )}
                        {emailMeta && emailMeta.configured === false && (
                            <p className="field__help">
                                SMTP non configuré côté serveur : renseignez MAIL_USERNAME
                                et MAIL_PASSWORD dans backend/.env. Avec Gmail, utilisez un
                                mot de passe d&apos;application. Relancez ensuite
                                <code> php artisan serve</code> et le worker de file.
                            </p>
                        )}
                    </div>

                    <div className="field">
                        <span className="field__label">Événements qui déclenchent une alerte</span>
                        <div className="email__types">
                            {thresholdKeys.map((key) => (
                                <Checkbox
                                    key={key}
                                    label={defaults.thresholds[key].label}
                                    checked={email.types.includes(key)}
                                    disabled={disabled}
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
                        onChange={(value) => patchEmail({ cooldownMinutes: value })}
                        formatValue={(value) => `${value} min`}
                        formatBound={(value) => formatSeconds(value * 60)}
                        disabled={disabled}
                    />

                    <div className="email__actions">
                        <button
                            type="button"
                            className="btn"
                            disabled={!recipientValid || sending || disabled}
                            onClick={sendEmailTest}
                        >
                            {sending ? 'Envoi en cours…' : 'Envoyer un email de test'}
                        </button>
                    </div>

                    {emailResult && (
                        <StatusBanner
                            status={emailResult.status}
                            title={emailResult.title}
                            hint={emailResult.hint}
                        />
                    )}
                </div>
            )}
        </Panel>
    );
}
