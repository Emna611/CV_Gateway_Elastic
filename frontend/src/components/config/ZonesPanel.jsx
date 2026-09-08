import { Panel, StatusBanner } from '../ui/controls.jsx';

/* Section réservée au scénario bureau. L'éditeur de polygones lui-même est
   livré en phase 3 ; ce panneau expose déjà l'état réel du traçage pour que le
   pied de page puisse bloquer le démarrage en connaissance de cause. */
export default function ZonesPanel({ zones, required }) {
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
                status={count > 0 ? 'ok' : 'idle'}
                title={count > 0 ? `${count} zone${plural} tracée${plural}` : 'Aucune zone tracée'}
                hint="L'éditeur de polygones superposé à la première frame est livré en phase 3. Les coordonnées seront stockées normalisées entre 0 et 1."
            />
        </Panel>
    );
}
