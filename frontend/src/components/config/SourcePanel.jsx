import { useRef, useState } from 'react';
import { Panel, StatusBanner, Tabs } from '../ui/controls.jsx';
import {
    formatDuration,
    formatResolution,
    hasRtspPassword,
    maskRtspPassword,
} from '../../utils/format.js';

const TABS = [
    { id: 'file', label: 'Fichier local' },
    { id: 'youtube', label: 'YouTube' },
    { id: 'rtsp', label: 'RTSP' },
];

const TEST_LABELS = {
    file: 'Tester la lecture',
    youtube: 'Vérifier',
    rtsp: 'Tester la connexion',
};

const TEST_PENDING = {
    file: 'Lecture du fichier en cours…',
    youtube: 'Vérification auprès de YouTube…',
    rtsp: 'Connexion à la caméra en cours…',
};

export default function SourcePanel({ state, dispatch, sourceValue, onTest, onUpload }) {
    const { sourceType, test, defaults } = state;
    const extensions = defaults?.source?.allowed_extensions ?? ['.mp4', '.avi', '.mov'];

    const inputRef = useRef(null);
    const [dragging, setDragging] = useState(false);
    const [progress, setProgress] = useState(null);
    const [localError, setLocalError] = useState('');
    const [revealed, setRevealed] = useState(false);

    const busy = test.status === 'pending';

    function acceptFile(file) {
        setLocalError('');
        if (!file) return;
        const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
        if (!extensions.includes(extension)) {
            setLocalError(`Format ${extension || 'inconnu'} refusé. Acceptés : ${extensions.join(', ')}.`);
            return;
        }
        setProgress(0);
        onUpload(file, setProgress).finally(() => setProgress(null));
    }

    const rtspMasked = !revealed && hasRtspPassword(state.rtsp.url);

    return (
        <Panel index="2.1" title="Source vidéo" hint="Un seul mode à la fois">
            <Tabs
                label="Type de source vidéo"
                options={TABS}
                value={sourceType}
                onChange={(value) => dispatch({ type: 'sourceType', value })}
            />

            <div className="source__mode">
                {sourceType === 'file' && (
                    <>
                        <div
                            className="dropzone"
                            data-dragging={dragging}
                            onDragOver={(event) => {
                                event.preventDefault();
                                setDragging(true);
                            }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={(event) => {
                                event.preventDefault();
                                setDragging(false);
                                acceptFile(event.dataTransfer.files?.[0]);
                            }}
                            onClick={() => inputRef.current?.click()}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    inputRef.current?.click();
                                }
                            }}
                        >
                            <span className="dropzone__title">
                                Déposez une vidéo ici ou cliquez pour choisir un fichier
                            </span>
                            <span className="dropzone__hint">
                                Formats acceptés : {extensions.join(', ')} — téléversé vers
                                ai_engine/data/
                            </span>
                            <input
                                ref={inputRef}
                                type="file"
                                accept={extensions.join(',')}
                                hidden
                                onChange={(event) => {
                                    acceptFile(event.target.files?.[0]);
                                    event.target.value = '';
                                }}
                            />
                        </div>

                        {progress !== null && (
                            <div className="upload-progress">
                                <div className="upload-progress__bar">
                                    <span style={{ width: `${progress}%` }} />
                                </div>
                                <span className="upload-progress__value">
                                    {progress < 100 ? `Envoi ${progress}%` : 'Analyse du fichier…'}
                                </span>
                            </div>
                        )}

                        {localError && <p className="field__error">{localError}</p>}

                        {state.file.value && (
                            <dl className="meta-list">
                                <div>
                                    <dt>Fichier</dt>
                                    <dd className="meta-list__mono">
                                        {state.file.meta?.name ?? state.file.name}
                                    </dd>
                                </div>
                                <div>
                                    <dt>Durée</dt>
                                    <dd>{formatDuration(state.file.meta?.duration_seconds)}</dd>
                                </div>
                                <div>
                                    <dt>Résolution</dt>
                                    <dd>{formatResolution(state.file.meta)}</dd>
                                </div>
                                <div>
                                    <dt>Images / s</dt>
                                    <dd>{state.file.meta?.fps ?? '—'}</dd>
                                </div>
                            </dl>
                        )}
                    </>
                )}

                {sourceType === 'youtube' && (
                    <div className="field">
                        <label className="field__label" htmlFor="youtube-url">
                            URL de la vidéo
                        </label>
                        <input
                            id="youtube-url"
                            className="text-input"
                            type="url"
                            placeholder="https://www.youtube.com/watch?v=…"
                            value={state.youtube.url}
                            onChange={(event) =>
                                dispatch({ type: 'youtube', value: event.target.value })
                            }
                        />
                        <p className="field__help">
                            L&apos;existence de la vidéo est vérifiée auprès de YouTube, puis le
                            moteur tente de décoder réellement le flux.
                        </p>
                    </div>
                )}

                {sourceType === 'rtsp' && (
                    <div className="field">
                        <label className="field__label" htmlFor="rtsp-url">
                            URL du flux
                        </label>
                        <div className="field__row">
                            <input
                                id="rtsp-url"
                                className="text-input text-input--mono"
                                type="text"
                                placeholder="rtsp://user:pass@192.168.1.10:554/stream1"
                                value={rtspMasked ? maskRtspPassword(state.rtsp.url) : state.rtsp.url}
                                readOnly={rtspMasked}
                                onChange={(event) =>
                                    dispatch({ type: 'rtsp', value: event.target.value })
                                }
                            />
                            {hasRtspPassword(state.rtsp.url) && (
                                <button
                                    type="button"
                                    className="btn"
                                    onClick={() => setRevealed((value) => !value)}
                                >
                                    {revealed ? 'Masquer' : 'Afficher'}
                                </button>
                            )}
                        </div>
                        <p className="field__help">
                            Le mot de passe est masqué à l&apos;affichage et ne réapparaît jamais
                            dans les réponses du serveur.
                        </p>
                    </div>
                )}
            </div>

            <div className="source__actions">
                <button
                    type="button"
                    className="btn"
                    disabled={!sourceValue || busy}
                    onClick={() => onTest(TEST_PENDING[sourceType])}
                >
                    {busy ? 'Test en cours…' : TEST_LABELS[sourceType]}
                </button>
                {sourceType === 'file' && state.file.value && (
                    <button
                        type="button"
                        className="btn btn--ghost"
                        disabled={busy}
                        onClick={() => dispatch({ type: 'fileCleared' })}
                    >
                        Retirer le fichier
                    </button>
                )}
            </div>

            <StatusBanner status={test.status} title={test.title} hint={test.hint} />
        </Panel>
    );
}
