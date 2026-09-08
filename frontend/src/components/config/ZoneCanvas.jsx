import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
    clamp01,
    pixelDistance,
    pointInPolygon,
    polygonCentroid,
    toPixels,
    zoneColor,
} from '../../utils/geometry.js';

const VERTEX_HIT_PX = 10;
const CLICK_TOLERANCE_PX = 4;

/* Canvas d'édition superposé à la première frame.

   Le conteneur suit le ratio natif de l'image (width 100 %, height auto) au
   lieu d'un ratio imposé : sans cela, une frame non 16/9 serait affichée avec
   des bandes et le canvas ne coïnciderait plus avec les pixels de l'image, ce
   qui décalerait tous les polygones. */
export default function ZoneCanvas({
    frameUrl,
    zones,
    editing,
    onPolygonComplete,
    onMoveVertex,
    onDeleteZone,
}) {
    const canvasRef = useRef(null);
    const imageRef = useRef(null);
    const pointerDownRef = useRef(null);

    const [size, setSize] = useState({ width: 0, height: 0 });
    const [draft, setDraft] = useState([]);
    const [dragging, setDragging] = useState(null);
    const [hover, setHover] = useState({ closing: false, onVertex: false });

    /* Le canvas doit faire exactement la taille affichée de l'image. */
    useLayoutEffect(() => {
        const image = imageRef.current;
        if (!image) return undefined;

        const measure = () => {
            const rect = image.getBoundingClientRect();
            setSize({ width: rect.width, height: rect.height });
        };

        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(image);
        return () => observer.disconnect();
    }, [frameUrl]);

    /* Entrer ou sortir du mode traçage repart d'un polygone vierge. Ajustement
       pendant le rendu plutôt que dans un effet : pas de rendu en cascade. */
    const [editingSession, setEditingSession] = useState(editing);
    if (editingSession !== editing) {
        setEditingSession(editing);
        if (draft.length > 0) setDraft([]);
    }

    /* Échap annule le polygone en cours, sans toucher aux zones fermées. */
    useEffect(() => {
        if (!editing) return undefined;
        const onKeyDown = (event) => {
            if (event.key === 'Escape') setDraft([]);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [editing]);

    // ── dessin ──
    useEffect(() => {
        const canvas = canvasRef.current;
        const { width, height } = size;
        if (!canvas || width === 0 || height === 0) return;

        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);

        const ctx = canvas.getContext('2d');
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, width, height);

        const trace = (polygon) => {
            ctx.beginPath();
            polygon.forEach((point, index) => {
                const [x, y] = toPixels(point, width, height);
                if (index === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
        };

        zones.forEach((zone) => {
            const color = zoneColor(zone.id);
            trace(zone.polygon);
            ctx.closePath();
            ctx.fillStyle = `${color}2E`;
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.stroke();

            if (editing) {
                zone.polygon.forEach((point) => {
                    const [x, y] = toPixels(point, width, height);
                    ctx.beginPath();
                    ctx.arc(x, y, 5, 0, Math.PI * 2);
                    ctx.fillStyle = '#fff';
                    ctx.fill();
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 2;
                    ctx.stroke();
                });
            }

            const [cx, cy] = toPixels(polygonCentroid(zone.polygon), width, height);
            ctx.font = '600 12px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.strokeText(zone.name, cx, cy);
            ctx.fillStyle = color;
            ctx.fillText(zone.name, cx, cy);
        });

        if (draft.length > 0) {
            trace(draft);
            ctx.strokeStyle = '#2563EB';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 4]);
            ctx.stroke();
            ctx.setLineDash([]);

            draft.forEach((point, index) => {
                const [x, y] = toPixels(point, width, height);
                const first = index === 0;
                const radius = first ? (hover.closing ? 9 : 7) : 5;
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fillStyle = first && hover.closing ? '#2563EB' : '#fff';
                ctx.fill();
                ctx.strokeStyle = '#2563EB';
                ctx.lineWidth = 2;
                ctx.stroke();
            });
        }
    }, [zones, draft, size, editing, hover.closing]);

    // ── interactions ──
    const pointerPosition = useCallback((event) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const pixel = [event.clientX - rect.left, event.clientY - rect.top];
        return {
            pixel,
            normalized: [clamp01(pixel[0] / rect.width), clamp01(pixel[1] / rect.height)],
        };
    }, []);

    const findVertex = useCallback(
        (pixel) => {
            for (const zone of zones) {
                for (let index = 0; index < zone.polygon.length; index += 1) {
                    const distance = pixelDistance(
                        zone.polygon[index],
                        pixel,
                        size.width,
                        size.height
                    );
                    if (distance <= VERTEX_HIT_PX) {
                        return { id: zone.id, vertexIndex: index };
                    }
                }
            }
            return null;
        },
        [zones, size]
    );

    function handleMouseDown(event) {
        if (!editing || event.button !== 0) return;
        const { pixel } = pointerPosition(event);
        pointerDownRef.current = pixel;

        // Tant qu'un polygone est en cours, les clics le construisent : ils ne
        // doivent pas saisir par surprise le sommet d'une zone voisine.
        if (draft.length > 0) return;

        // Le sommet n'est pas déplacé dès l'appui, sinon il sauterait sous le
        // pointeur alors que le clic visait sa position d'origine.
        const vertex = findVertex(pixel);
        if (vertex) setDragging(vertex);
    }

    function handleMouseMove(event) {
        if (!editing) return;
        const { pixel, normalized } = pointerPosition(event);

        if (dragging) {
            onMoveVertex(dragging.id, dragging.vertexIndex, normalized);
            return;
        }

        const closing =
            draft.length >= 3 &&
            pixelDistance(draft[0], pixel, size.width, size.height) <= VERTEX_HIT_PX;
        const onVertex = draft.length === 0 && Boolean(findVertex(pixel));
        if (closing !== hover.closing || onVertex !== hover.onVertex) {
            setHover({ closing, onVertex });
        }
    }

    function handleMouseUp(event) {
        if (!editing || event.button !== 0) return;

        const wasDragging = Boolean(dragging);
        setDragging(null);

        const { pixel, normalized } = pointerPosition(event);
        const start = pointerDownRef.current;
        pointerDownRef.current = null;

        // Un glisser de sommet n'est pas un clic : sans ce garde-fou, relâcher
        // après un déplacement ajouterait un sommet parasite.
        const moved =
            start && Math.hypot(pixel[0] - start[0], pixel[1] - start[1]) > CLICK_TOLERANCE_PX;
        if (wasDragging || moved) return;

        if (
            draft.length >= 3 &&
            pixelDistance(draft[0], pixel, size.width, size.height) <= VERTEX_HIT_PX
        ) {
            onPolygonComplete(draft);
            setDraft([]);
            setHover({ closing: false, onVertex: false });
            return;
        }

        setDraft((current) => [...current, normalized]);
    }

    function handleContextMenu(event) {
        event.preventDefault();
        if (!editing) return;
        const { normalized } = pointerPosition(event);
        const target = [...zones]
            .reverse()
            .find((zone) => pointInPolygon(normalized, zone.polygon));
        if (target) onDeleteZone(target.id);
    }

    const cursor = !editing
        ? 'default'
        : dragging || hover.onVertex
          ? 'grab'
          : hover.closing
            ? 'pointer'
            : 'crosshair';

    return (
        <div className="zone-stage">
            <img
                ref={imageRef}
                className="zone-stage__image"
                src={frameUrl}
                alt="Première frame de la source vidéo"
                draggable={false}
            />
            <canvas
                ref={canvasRef}
                className="zone-stage__canvas"
                style={{ cursor, pointerEvents: editing ? 'auto' : 'none' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => {
                    setDragging(null);
                    setHover({ closing: false, onVertex: false });
                }}
                onContextMenu={handleContextMenu}
            />
            {editing && (
                <span className="zone-stage__hint">
                    {draft.length === 0
                        ? 'Cliquez pour poser le premier sommet'
                        : draft.length < 3
                          ? `${draft.length} sommet${draft.length > 1 ? 's' : ''} — 3 minimum`
                          : 'Cliquez le premier sommet pour fermer · Échap pour annuler'}
                </span>
            )}
        </div>
    );
}
