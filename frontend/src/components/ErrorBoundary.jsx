import { Component } from 'react';
import './ErrorBoundary.css';

/* Un plantage de rendu ne doit pas laisser un écran blanc : la règle du projet
   est de toujours afficher une erreur exploitable avec une sortie de secours. */
export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error('[CV-Gateway] plantage de rendu', error, info);
    }

    render() {
        if (!this.state.error) {
            return this.props.children;
        }

        return (
            <section className="crash">
                <span className="section-label">Erreur d&apos;affichage</span>
                <h1 className="crash__title">L&apos;écran n&apos;a pas pu s&apos;afficher</h1>
                <p className="crash__lead">
                    La configuration en cours n&apos;a pas été perdue côté serveur. Rechargez la
                    page pour repartir des valeurs enregistrées.
                </p>
                <pre className="crash__detail">{String(this.state.error)}</pre>
                <div className="crash__actions">
                    <button
                        type="button"
                        className="btn btn--primary"
                        onClick={() => window.location.reload()}
                    >
                        Recharger la page
                    </button>
                    <a className="btn" href="/">
                        Retour au choix du scénario
                    </a>
                </div>
            </section>
        );
    }
}
