import { Link } from 'react-router-dom';
import { ArrowRightIcon } from './icons.jsx';
import { SEVERITY_LABELS } from '../data/scenarios.js';
import './ScenarioCard.css';

export default function ScenarioCard({ scenario, icon }) {
    return (
        <Link
            to={scenario.path}
            className="scenario-card"
            aria-label={`Configurer le scénario ${scenario.title}`}
        >
            <div className="scenario-card__head">
                <span className="scenario-card__icon">{icon}</span>
                <span className="scenario-card__head-text">
                    <span className="scenario-card__title">{scenario.title}</span>
                    <span className="scenario-card__subtitle">{scenario.subtitle}</span>
                </span>
            </div>

            <p className="scenario-card__description">{scenario.description}</p>

            <div className="scenario-card__states">
                <div className="scenario-card__states-head">
                    <span className="section-label">États détectés</span>
                </div>
                {scenario.states.map((state) => (
                    <div key={state.code} className="scenario-card__state">
                        <span className="severity-dot" data-severity={state.severity} />
                        <span className="scenario-card__state-code">{state.code}</span>
                        <span className="scenario-card__state-detail">{state.detail}</span>
                        <span className="severity-tag" data-severity={state.severity}>
                            {SEVERITY_LABELS[state.severity]}
                        </span>
                    </div>
                ))}
            </div>

            <div className="scenario-card__foot">
                <span className="scenario-card__models">
                    <span className="section-label">
                        {scenario.models.length > 1 ? 'Modèles chargés' : 'Modèle chargé'}
                    </span>
                    <span className="scenario-card__models-row">
                        {scenario.models.map((model) => (
                            <span key={model} className="model-badge">
                                {model}
                            </span>
                        ))}
                    </span>
                </span>

                <span className="scenario-card__cta">
                    Configurer
                    <ArrowRightIcon />
                </span>
            </div>
        </Link>
    );
}
