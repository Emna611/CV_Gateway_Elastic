import { Link, Navigate, useParams } from 'react-router-dom';
import { SCENARIOS } from '../data/scenarios.js';
import './ScenarioConfig.css';

/* Réservé à la phase 2 (source vidéo, seuils, alertes email, traçage de zones).
   La route existe dès la phase 1 pour que le choix du scénario soit navigable. */
export default function ScenarioConfig() {
    const { scenarioId } = useParams();
    const scenario = SCENARIOS[scenarioId];

    if (!scenario) {
        return <Navigate to="/" replace />;
    }

    return (
        <section className="scenario-config">
            <span className="section-label">Étape 2 sur 3 — Configuration</span>
            <h1 className="scenario-config__title">{scenario.title}</h1>
            <p className="scenario-config__subtitle">{scenario.subtitle}</p>

            <div className="scenario-config__placeholder">
                Scénario sélectionné. Cet écran sera construit à la phase 2 :
                <ul>
                    <li>source vidéo (fichier, YouTube, RTSP) avec test de connexion réel</li>
                    <li>seuils de détection et confiance du modèle</li>
                    <li>alertes email et délai anti-spam</li>
                    {scenario.hasZones && <li>traçage des zones de postes (phase 3)</li>}
                </ul>
            </div>

            <Link to="/" className="scenario-config__back">
                Retour au choix du scénario
            </Link>
        </section>
    );
}
