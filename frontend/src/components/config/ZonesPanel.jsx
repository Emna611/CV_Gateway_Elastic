import { Panel, StatusBanner } from '../ui/controls.jsx';

/* Section réservée au scénario bureau. L'éditeur de polygones lui-même est
   livré en phase 3 ; ce panneau expose déjà l'état réel du traçage pour que le
   pied de page puisse bloquer le démarrage en connaissance de cause. */
export default function ZonesPanel({ zones }) {
    return (
        <Panel index="2.4" title="Traçage de zones" hint="Scénario bureau uniquement">
            <StatusBanner
                status={zones.length > 0 ? 'ok' : 'idle'}
                title={
                    zones.length > 0
                        ? `${zones.length} zone${zones.length > 1 ? 's' : ''} tracée${zones.length > 1 ? 's' : ''}`
                        : 'Aucune zone tracée'
                }
                hint="L'éditeur de polygones superposé à la première frame est livré en phase 3. Les coordonnées seront stockées normalisées entre 0 et 1."
            />
        </Panel>
    );
}
