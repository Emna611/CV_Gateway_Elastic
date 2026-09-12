import { Panel } from '../ui/controls.jsx';
import DetectionsToggles from './DetectionsToggles.jsx';

export default function DetectionsPanel({ state, dispatch }) {
    const { defaults, detections } = state;
    const entries = Object.entries(defaults.detections);
    const allActive = detections.length === entries.length;

    return (
        <Panel
            index="2.2"
            title="Classes détectées"
            hint={`${detections.length} / ${entries.length} activée${detections.length > 1 ? 's' : ''}`}
        >
            <p className="detections__lead">
                Choisissez librement une seule classe, deux, ou toutes. Seuls les seuils et les
                modèles des classes actives seront utilisés. Vous pourrez encore les modifier
                pendant l&apos;analyse.
            </p>

            <DetectionsToggles
                defaults={defaults}
                detections={detections}
                onChange={(value) => dispatch({ type: 'detections', value })}
            />

            <div className="source__actions">
                <button
                    type="button"
                    className="btn"
                    disabled={allActive}
                    onClick={() =>
                        dispatch({ type: 'detections', value: entries.map(([key]) => key) })
                    }
                >
                    Tout activer
                </button>
            </div>
        </Panel>
    );
}
