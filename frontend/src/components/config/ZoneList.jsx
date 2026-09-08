import { useEffect, useRef, useState } from 'react';
import { zoneColor } from '../../utils/geometry.js';

/* Monté avec une clé par zone : le nom initial vient directement de l'état
   local, sans effet de synchronisation. */
function ZoneNamePrompt({ zone, onConfirm, onCancel }) {
    const [name, setName] = useState(zone.name);
    const inputRef = useRef(null);

    useEffect(() => {
        inputRef.current?.select();
    }, []);

    function confirm() {
        const trimmed = name.trim();
        if (trimmed) onConfirm(zone.id, trimmed);
        else onCancel();
    }

    return (
        <div className="zones__naming">
            <span className="zones__naming-label">Nom de la zone</span>
            <input
                ref={inputRef}
                className="text-input"
                value={name}
                maxLength={60}
                autoFocus
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') confirm();
                    if (event.key === 'Escape') onCancel();
                }}
            />
            <button type="button" className="btn btn--primary" onClick={confirm}>
                Valider
            </button>
        </div>
    );
}

export default function ZoneList({
    zones,
    editing,
    pendingId,
    lastDeleted,
    onRename,
    onDelete,
    onRestore,
    onResolvePending,
}) {
    const pendingZone = zones.find((zone) => zone.id === pendingId) ?? null;

    return (
        <div className="zones">
            {pendingZone && (
                <ZoneNamePrompt
                    key={pendingZone.id}
                    zone={pendingZone}
                    onConfirm={(id, name) => {
                        onRename(id, name);
                        onResolvePending();
                    }}
                    onCancel={onResolvePending}
                />
            )}

            <div className="zones__head">
                <span className="section-label">
                    Zones tracées ({zones.length})
                </span>
                {lastDeleted && (
                    <button type="button" className="btn btn--ghost zones__undo" onClick={onRestore}>
                        Restaurer « {lastDeleted.name} »
                    </button>
                )}
            </div>

            {zones.length === 0 ? (
                <p className="zones__empty">
                    {editing
                        ? "Aucune zone. Cliquez sur l'aperçu pour poser les sommets d'un poste."
                        : 'Aucune zone. Activez le mode traçage dans la section 2.5.'}
                </p>
            ) : (
                <ul className="zones__list">
                    {zones.map((zone) => (
                        <li key={zone.id} className="zone-row">
                            <span
                                className="zone-row__color"
                                style={{ background: zoneColor(zone.id) }}
                                aria-hidden="true"
                            />
                            <input
                                className="zone-row__name"
                                value={zone.name}
                                maxLength={60}
                                aria-label={`Nom de ${zone.name}`}
                                onChange={(event) => onRename(zone.id, event.target.value)}
                            />
                            <span className="zone-row__meta">
                                {zone.polygon.length} sommets
                            </span>
                            <button
                                type="button"
                                className="zone-row__delete"
                                onClick={() => onDelete(zone.id)}
                                aria-label={`Supprimer ${zone.name}`}
                                title="Supprimer cette zone"
                            >
                                ✕
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {editing && (
                <dl className="zones__help">
                    <div>
                        <dt>Clic</dt>
                        <dd>ajouter un sommet</dd>
                    </div>
                    <div>
                        <dt>Clic sur le 1ᵉʳ sommet</dt>
                        <dd>fermer le polygone</dd>
                    </div>
                    <div>
                        <dt>Glisser un sommet</dt>
                        <dd>le déplacer</dd>
                    </div>
                    <div>
                        <dt>Clic droit sur une zone</dt>
                        <dd>la supprimer</dd>
                    </div>
                    <div>
                        <dt>Échap</dt>
                        <dd>annuler le polygone en cours</dd>
                    </div>
                </dl>
            )}
        </div>
    );
}
