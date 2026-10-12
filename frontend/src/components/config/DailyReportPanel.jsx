import { useEffect, useState } from 'react';
import { Panel, StatusBanner, Tabs, Toggle } from '../ui/controls.jsx';
import {
    getDailyReport,
    previewDailyReport,
    saveDailyReport,
    sendDailyReportNow,
} from '../../api/client.js';
import { EMAIL_RE } from '../../utils/format.js';
import './EmailPanel.css';
import './DailyReportPanel.css';

/* Rapport quotidien « temps de travail » : réglages enregistrés côté Laravel
   (le planificateur les lit à chaque tour), indépendants de la configuration
   du moteur. Le bouton « Enregistrer » de ce panneau agit donc seul. */

const PERIODS = [
    { id: 'today', label: 'Journée en cours' },
    { id: 'yesterday', label: 'Journée précédente' },
];

const EMPTY = { enabled: false, recipient: '', send_at: '18:00', period: 'today' };

function hhmm(seconds) {
    const total = Math.max(0, Math.round(seconds ?? 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    return `${String(hours).padStart(2, '0')}h${String(minutes).padStart(2, '0')}`;
}

function formatNextRun(iso) {
    if (!iso) return null;
    return new Date(iso).toLocaleString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function DailyReportPanel({ fallbackRecipient = '', index = '2.5' }) {
    const [phase, setPhase] = useState('loading');
    const [loadError, setLoadError] = useState('');
    const [form, setForm] = useState(EMPTY);
    const [saved, setSaved] = useState(EMPTY);
    const [meta, setMeta] = useState({ smtp_configured: true, next_run_at: null, last_sent_at: null });
    const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState(null);
    const [result, setResult] = useState(null);

    useEffect(() => {
        let cancelled = false;
        Promise.all([getDailyReport(), previewDailyReport().catch(() => null)])
            .then(([report, summary]) => {
                if (cancelled) return;
                const settings = { ...EMPTY, ...report.settings };
                setForm(settings);
                setSaved(settings);
                setMeta({
                    smtp_configured: report.smtp_configured,
                    next_run_at: report.next_run_at,
                    last_sent_at: report.settings.last_sent_at,
                });
                setPreview(summary);
                setPhase('ready');
            })
            .catch((error) => {
                if (cancelled) return;
                setLoadError(error.message);
                setPhase('failed');
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const recipient = form.recipient.trim();
    const recipientValid = EMAIL_RE.test(recipient);
    const showRecipientError = form.enabled && recipient.length > 0 && !recipientValid;
    const dirty = JSON.stringify(form) !== JSON.stringify(saved);
    const canSave = dirty && (!form.enabled || recipientValid) && /^\d{2}:\d{2}$/.test(form.send_at);

    function patch(values) {
        setResult(null);
        setForm((current) => ({ ...current, ...values }));
    }

    function useFallbackRecipient() {
        patch({ recipient: fallbackRecipient });
    }

    async function handleSave() {
        setBusy('save');
        setResult(null);
        try {
            const response = await saveDailyReport({
                enabled: form.enabled,
                recipient: form.enabled ? recipient : recipient || null,
                send_at: form.send_at,
                period: form.period,
            });
            const settings = { ...EMPTY, ...response.settings };
            setForm(settings);
            setSaved(settings);
            setMeta((current) => ({ ...current, next_run_at: response.next_run_at }));
            setResult({
                status: 'ok',
                title: settings.enabled
                    ? `Rapport programmé chaque jour à ${settings.send_at}`
                    : 'Rapport quotidien désactivé',
                hint: settings.enabled ? formatNextRun(response.next_run_at) : undefined,
            });
        } catch (error) {
            setResult({ status: 'error', title: "Les réglages n'ont pas été enregistrés", hint: error.message });
        } finally {
            setBusy(null);
        }
    }

    async function handleSendNow() {
        setBusy('send');
        setResult(null);
        try {
            const response = await sendDailyReportNow({ recipient: recipient || undefined });
            setResult({
                status: 'ok',
                title: response.message,
                hint: `${response.postes} poste(s) · ${response.presences} présence(s) · ${hhmm(response.total_seconds)} au total`,
            });
        } catch (error) {
            setResult({ status: 'error', title: "Le rapport n'a pas été envoyé", hint: error.message });
        } finally {
            setBusy(null);
        }
    }

    if (phase === 'loading') {
        return (
            <Panel index={index} title="Rapport quotidien — temps de travail">
                <StatusBanner status="pending" title="Chargement des réglages…" />
            </Panel>
        );
    }

    if (phase === 'failed') {
        return (
            <Panel index={index} title="Rapport quotidien — temps de travail">
                <StatusBanner status="error" title="Réglages indisponibles" hint={loadError} />
            </Panel>
        );
    }

    return (
        <Panel
            index={index}
            title="Rapport quotidien — temps de travail"
            hint={saved.enabled ? `chaque jour à ${saved.send_at}` : 'désactivé'}
        >
            <Toggle
                id="daily-report-enabled"
                checked={form.enabled}
                onChange={(value) => patch({ enabled: value })}
                label="Envoyer chaque jour un email avec le CSV du temps de travail par poste"
            />

            {form.enabled && (
                <div className="email__body">
                    <div className="field">
                        <label className="field__label" htmlFor="daily-report-recipient">
                            Adresse du destinataire
                        </label>
                        <input
                            id="daily-report-recipient"
                            className="text-input"
                            type="email"
                            placeholder="rh@elastic-solutions.tn"
                            value={form.recipient}
                            data-invalid={showRecipientError}
                            onChange={(event) => patch({ recipient: event.target.value })}
                        />
                        {showRecipientError && (
                            <p className="field__error">Format d&apos;adresse invalide.</p>
                        )}
                        {!recipient && fallbackRecipient && (
                            <p className="field__help">
                                <button type="button" className="report__link" onClick={useFallbackRecipient}>
                                    Utiliser l&apos;adresse des alertes ({fallbackRecipient})
                                </button>
                            </p>
                        )}
                        {meta.smtp_configured === false && (
                            <p className="field__help">
                                SMTP non configuré côté serveur : renseignez MAIL_USERNAME et
                                MAIL_PASSWORD dans backend/.env.
                            </p>
                        )}
                    </div>

                    <div className="report__row">
                        <div className="field">
                            <label className="field__label" htmlFor="daily-report-time">
                                Heure d&apos;envoi
                            </label>
                            <input
                                id="daily-report-time"
                                className="text-input report__time"
                                type="time"
                                step="60"
                                value={form.send_at}
                                onChange={(event) => patch({ send_at: event.target.value })}
                            />
                        </div>
                        <div className="field">
                            <span className="field__label">Journée couverte</span>
                            <Tabs
                                label="Journée couverte par le rapport"
                                options={PERIODS}
                                value={form.period}
                                onChange={(value) => patch({ period: value })}
                            />
                        </div>
                    </div>
                    <p className="field__help">
                        Le fichier <code>temps_travail_AAAA-MM-JJ.csv</code> détaille, pour chaque
                        poste, la première entrée, la dernière sortie, le temps actif, inactif et
                        total. Un second fichier liste chaque présence. Envoyé à{' '}
                        {form.send_at || '—'} : choisissez « journée précédente » pour un envoi le
                        matin, « journée en cours » pour un envoi en fin de journée.
                    </p>
                </div>
            )}

            {preview && (
                <div className="report__preview">
                    <div className="report__preview-head">
                        <span className="field__label">
                            Aperçu — {new Date(`${preview.date}T00:00:00`).toLocaleDateString('fr-FR')}
                        </span>
                        <span className="panel__hint">
                            {preview.presences} présence(s) · {hhmm(preview.total_seconds)}
                        </span>
                    </div>
                    {preview.postes.length === 0 ? (
                        <p className="field__help">
                            Aucune présence enregistrée pour cette journée : lancez une analyse
                            bureau avec des zones tracées pour alimenter le rapport.
                        </p>
                    ) : (
                        <table className="report__table">
                            <thead>
                                <tr>
                                    <th>Poste</th>
                                    <th>Entrée</th>
                                    <th>Sortie</th>
                                    <th>Actif</th>
                                    <th>Inactif</th>
                                    <th>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {preview.postes.map((poste) => (
                                    <tr key={poste.poste}>
                                        <td>{poste.poste}</td>
                                        <td>{poste.premiere_entree || '—'}</td>
                                        <td>{poste.en_cours ? 'en cours' : poste.derniere_sortie || '—'}</td>
                                        <td>{hhmm(poste.actif_seconds)}</td>
                                        <td>{hhmm(poste.inactif_seconds)}</td>
                                        <td>
                                            <strong>{hhmm(poste.total_seconds)}</strong>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            <div className="email__actions report__actions">
                <button
                    type="button"
                    className="btn btn--primary"
                    disabled={!canSave || busy !== null}
                    onClick={handleSave}
                >
                    {busy === 'save' ? 'Enregistrement…' : 'Enregistrer le rapport'}
                </button>
                <button
                    type="button"
                    className="btn"
                    disabled={!recipientValid || busy !== null || meta.smtp_configured === false}
                    onClick={handleSendNow}
                    title={recipientValid ? '' : 'Indiquez un destinataire valide'}
                >
                    {busy === 'send' ? 'Envoi en cours…' : 'Envoyer le rapport maintenant'}
                </button>
                {saved.enabled && meta.next_run_at && !dirty && (
                    <span className="report__next">Prochain envoi : {formatNextRun(meta.next_run_at)}</span>
                )}
            </div>

            {result && <StatusBanner status={result.status} title={result.title} hint={result.hint} />}
        </Panel>
    );
}
