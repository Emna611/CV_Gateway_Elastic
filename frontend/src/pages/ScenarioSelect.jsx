import ScenarioCard from '../components/ScenarioCard.jsx';
import { OfficeIcon, KitchenIcon } from '../components/icons.jsx';
import { SCENARIOS } from '../data/scenarios.js';
import './ScenarioSelect.css';

export default function ScenarioSelect() {
    return (
        <section className="scenario-select">
            <div className="scenario-select__intro">
                <span className="section-label">Étape 1 sur 3 — Choix du scénario</span>
                <h1 className="scenario-select__title">Quel environnement supervisez-vous ?</h1>
                <p className="scenario-select__lead">
                    Le scénario détermine les modèles chargés par le moteur, les états
                    détectables et les options de configuration disponibles à l&apos;étape
                    suivante.
                </p>
            </div>

            <div className="scenario-select__grid">
                <ScenarioCard scenario={SCENARIOS.bureau} icon={<OfficeIcon />} />
                <ScenarioCard scenario={SCENARIOS.cuisine} icon={<KitchenIcon />} />
            </div>
        </section>
    );
}
