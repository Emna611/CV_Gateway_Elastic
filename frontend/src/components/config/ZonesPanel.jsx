import { Panel, StatusBanner } from '../ui/controls.jsx';

/* Section réservée au scénario bureau. L'éditeur lui-même est superposé à la
   frame dans la colonne d'aperçu : c'est le seul endroit où le tracé a un
   sens. Ce panneau commande le mode et rend compte de l'état réel. */
export default function ZonesPanel({ zones, required, editing, hasFrame, onToggleEditing }) {
    const count = zones.length;
    const plural = count > 1 ? 's' : '';

    if (!required) {
        return (
            <Panel index="2.5" title="Traçage de zones" hint="Non requis">
                <StatusBanner
                    status="idle"
                    title="Traçage inutile avec les classes actives"
                    hint="La classe « Occupation des postes » est désactivée : le moteur n'a pas besoin de zones pour fonctionner."
                />
            </Panel>
        );
    }

    return (
        <Panel index="2.5" title="Traçage de zones" hint="Requis par l'occupation des postes">
            <StatusBanner
                status={count > 0 ? 'ok' : hasFrame ? 'idle' : 'error'}
                title={
                    count > 0
                        ? `${count} poste${plural} délimité${plural}`
                        : hasFrame
                          ? 'Aucune zone tracée'
                          : 'Aucune frame sur laquelle tracer'
                }
                hint={
                    hasFrame
                        ? "L'éditeur est superposé à l'aperçu, à droite. Les coordonnées sont enregistrées normalisées entre 0 et 1."
                        : 'Testez la source ci-dessus : le traçage exige la première frame de la vidéo.'
                }
            />

            <div className="source__actions">
                <button
                    type="button"
                    className={editing ? 'btn btn--primary' : 'btn'}
                    // Reste actionnable si la frame disparaît en cours de
                    // traçage, sinon le mode serait impossible à quitter.
                    disabled={!hasFrame && !editing}
                    onClick={() => onToggleEditing(!editing)}
                >
                    {editing ? 'Terminer le traçage' : 'Tracer des zones'}
                </button>
            </div>
        </Panel>
    );
}
