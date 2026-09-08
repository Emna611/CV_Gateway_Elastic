import { formatDuration, formatResolution } from '../../utils/format.js';

const SOURCE_LABELS = { file: 'Fichier local', youtube: 'YouTube', rtsp: 'Flux RTSP' };

export default function PreviewPanel({ state, derived, sourceValue }) {
    const { test, defaults, email, zones, detections, sourceType } = state;
    const preview = test.preview;

    return (
        <div className="preview">
            <div className="preview__stage">
                {preview?.url ? (
                    <>
                        <img
                            className="preview__image"
                            src={preview.url}
                            alt="Première frame de la source vidéo"
                        />
                        <span className="preview__badge">
                            {preview.kind === 'frame'
                                ? 'Première frame décodée'
                                : 'Miniature YouTube — flux non décodé ici'}
                        </span>
                    </>
                ) : (
                    <div className="preview__empty">
                        <span className="preview__empty-title">
                            {test.status === 'pending'
                                ? 'Extraction de la première frame…'
                                : 'Aucun aperçu disponible'}
                        </span>
                        <span className="preview__empty-hint">
                            {test.status === 'error'
                                ? 'Le test de la source a échoué : corrigez la source puis relancez le test.'
                                : 'Testez la source pour que le moteur extraie la première frame.'}
                        </span>
                    </div>
                )}
            </div>

            <div className="summary">
                <span className="section-label">Résumé de la configuration</span>
                <dl className="summary__grid">
                    <div>
                        <dt>Type de source</dt>
                        <dd>{SOURCE_LABELS[sourceType]}</dd>
                    </div>
                    <div>
                        <dt>Source</dt>
                        <dd className="summary__mono" title={test.hint || sourceValue}>
                            {test.hint || sourceValue || 'non renseignée'}
                        </dd>
                    </div>
                    <div>
                        <dt>Résolution native</dt>
                        <dd>{formatResolution(test.meta)}</dd>
                    </div>
                    <div>
                        <dt>Durée</dt>
                        <dd>
                            {sourceType === 'rtsp'
                                ? 'flux continu'
                                : formatDuration(test.meta?.duration_seconds)}
                        </dd>
                    </div>
                    {defaults.has_zones && (
                        <div>
                            <dt>Zones tracées</dt>
                            <dd>
                                {derived.zonesRequired ? zones.length : 'non requises'}
                            </dd>
                        </div>
                    )}
                    <div>
                        <dt>Alertes email</dt>
                        <dd>
                            {email.enabled
                                ? `activées (${email.types.length} type${email.types.length > 1 ? 's' : ''})`
                                : 'désactivées'}
                        </dd>
                    </div>
                    <div className="summary__wide">
                        <dt>
                            Classes détectées ({detections.length} /{' '}
                            {Object.keys(defaults.detections).length})
                        </dt>
                        <dd className="summary__classes">
                            {detections.length === 0
                                ? 'aucune'
                                : detections
                                      .map((id) => defaults.detections[id].label)
                                      .join(' · ')}
                        </dd>
                    </div>
                    <div className="summary__wide">
                        <dt>Modèles qui seront chargés</dt>
                        <dd className="summary__models">
                            {derived.models.length === 0 ? (
                                'aucun'
                            ) : (
                                derived.models.map((model) => (
                                    <span
                                        key={model.name}
                                        className="model-badge"
                                        title={model.role}
                                    >
                                        {model.name}
                                    </span>
                                ))
                            )}
                        </dd>
                    </div>
                </dl>
            </div>
        </div>
    );
}
