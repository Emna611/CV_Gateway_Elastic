import { Link, Navigate, useParams } from 'react-router-dom';
import { useScenarioConfig } from '../hooks/useScenarioConfig.js';
import { SCENARIOS } from '../data/scenarios.js';
import SourcePanel from '../components/config/SourcePanel.jsx';
import ThresholdsPanel from '../components/config/ThresholdsPanel.jsx';
import EmailPanel from '../components/config/EmailPanel.jsx';
import ZonesPanel from '../components/config/ZonesPanel.jsx';
import PreviewPanel from '../components/config/PreviewPanel.jsx';
import { StatusBanner } from '../components/ui/controls.jsx';
import './ScenarioConfig.css';

/* Le démarrage effectif du moteur (POST /api/engine/start) est livré en
   phase 4. D'ici là le bouton reste désactivé avec un motif explicite plutôt
   que de déclencher un appel qui n'aboutirait pas. */
const ENGINE_START_PENDING = 'le démarrage du moteur est livré en phase 4';

export default function ScenarioConfig() {
    const { scenarioId } = useParams();
    const catalogue = SCENARIOS[scenarioId];
    const { state, sourceValue, blockers, canSave, dispatch, testSource, uploadFile, save } =
        useScenarioConfig(scenarioId);

    if (!catalogue) {
        return <Navigate to="/" replace />;
    }

    if (state.phase === 'loading') {
        return (
            <section className="config config--centered">
                <StatusBanner status="pending" title="Chargement de la configuration…" />
            </section>
        );
    }

    if (state.phase === 'failed') {
        return (
            <section className="config config--centered">
                <StatusBanner
                    status="error"
                    title="Configuration indisponible"
                    hint={state.loadError}
                />
                <p className="config__recover">
                    Démarrez le moteur puis rechargez la page :
                    <code>cd ai_engine ; python app.py</code>
                </p>
                <Link to="/" className="btn">
                    Retour au choix du scénario
                </Link>
            </section>
        );
    }

    const startBlockers = [...blockers, ENGINE_START_PENDING];
    const gateMessage = `Démarrage impossible : ${startBlockers.join(' ; ')}.`;

    return (
        <section className="config">
            <header className="config__head">
                <div>
                    <span className="section-label">Étape 2 sur 3 — Configuration</span>
                    <h1 className="config__title">{catalogue.title}</h1>
                    <p className="config__subtitle">{catalogue.subtitle}</p>
                </div>
            </header>

            <div className="config__columns">
                <div className="config__left">
                    <SourcePanel
                        state={state}
                        dispatch={dispatch}
                        sourceValue={sourceValue}
                        onTest={testSource}
                        onUpload={uploadFile}
                    />
                    <ThresholdsPanel state={state} dispatch={dispatch} />
                    <EmailPanel scenarioId={scenarioId} state={state} dispatch={dispatch} />
                    {state.defaults.has_zones && <ZonesPanel zones={state.zones} />}
                </div>

                <aside className="config__right">
                    <PreviewPanel state={state} sourceValue={sourceValue} />
                </aside>
            </div>

            <footer className="config__footer">
                <Link to="/" className="btn">
                    Retour
                </Link>

                <div className="config__footer-status">
                    {state.save.status !== 'idle' && (
                        <StatusBanner
                            status={state.save.status}
                            title={
                                state.save.status === 'pending'
                                    ? 'Enregistrement…'
                                    : state.save.message
                            }
                        />
                    )}
                    {startBlockers.length > 0 && state.save.status === 'idle' && (
                        <p className="config__blockers">
                            <span className="config__blockers-label">Il manque :</span>{' '}
                            {startBlockers.join(' · ')}
                        </p>
                    )}
                </div>

                <button
                    type="button"
                    className="btn"
                    disabled={!canSave || state.save.status === 'pending'}
                    onClick={save}
                >
                    Enregistrer
                </button>

                <span className="config__gate" title={gateMessage}>
                    <button type="button" className="btn btn--primary" disabled>
                        Démarrer l&apos;analyse
                    </button>
                    <span className="config__tooltip" role="tooltip">
                        {gateMessage}
                    </span>
                </span>
            </footer>
        </section>
    );
}
