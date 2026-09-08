import { useCallback, useState } from 'react';
import { nextZoneId, nextZoneName } from '../utils/geometry.js';

/* Opérations d'édition des zones.

   Les zones elles-mêmes vivent dans l'état de la configuration (elles doivent
   être enregistrées) ; seules les broutilles d'interface sont locales : la
   zone dont on attend le nom, et la dernière suppression annulable. */
export function useZoneEditing(zones, onChange) {
    const [pendingId, setPendingId] = useState(null);
    const [lastDeleted, setLastDeleted] = useState(null);

    /** Ferme un polygone : la zone est créée puis son nom est demandé. */
    const addZone = useCallback(
        (polygon) => {
            const zone = { id: nextZoneId(zones), name: nextZoneName(zones), polygon };
            onChange([...zones, zone]);
            setPendingId(zone.id);
            setLastDeleted(null);
        },
        [zones, onChange]
    );

    const renameZone = useCallback(
        (id, name) => {
            onChange(zones.map((zone) => (zone.id === id ? { ...zone, name } : zone)));
        },
        [zones, onChange]
    );

    const moveVertex = useCallback(
        (id, vertexIndex, point) => {
            onChange(
                zones.map((zone) =>
                    zone.id === id
                        ? {
                              ...zone,
                              polygon: zone.polygon.map((vertex, index) =>
                                  index === vertexIndex ? point : vertex
                              ),
                          }
                        : zone
                )
            );
        },
        [zones, onChange]
    );

    /* La suppression est immédiate, comme spécifié pour le clic droit, mais
       reste annulable : un polygone tracé au sommet près ne doit pas
       disparaître sur un clic malheureux. */
    const deleteZone = useCallback(
        (id) => {
            const index = zones.findIndex((zone) => zone.id === id);
            if (index < 0) return;
            setLastDeleted({ zone: zones[index], index });
            setPendingId((current) => (current === id ? null : current));
            onChange(zones.filter((zone) => zone.id !== id));
        },
        [zones, onChange]
    );

    const restoreDeleted = useCallback(() => {
        if (!lastDeleted) return;
        const next = [...zones];
        next.splice(Math.min(lastDeleted.index, next.length), 0, lastDeleted.zone);
        onChange(next);
        setLastDeleted(null);
    }, [lastDeleted, zones, onChange]);

    return {
        pendingId,
        lastDeleted: lastDeleted?.zone ?? null,
        addZone,
        renameZone,
        moveVertex,
        deleteZone,
        restoreDeleted,
        resolvePending: useCallback(() => setPendingId(null), []),
    };
}
