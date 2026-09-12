import { useEffect, useRef } from 'react';
import { ENGINE_FRAME_URL } from '../../api/client.js';
import { formatDuration } from '../../utils/format.js';

function LiveJpeg({ srcKey, onError }) {
    const canvasRef = useRef(null);
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;

    useEffect(() => {
        let cancelled = false;
        let misses = 0;

        async function paint(blob) {
            const bitmap = await createImageBitmap(blob);
            if (cancelled) {
                bitmap.close();
                return;
            }
            const canvas = canvasRef.current;
            if (!canvas) {
                bitmap.close();
                return;
            }
            if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
            }
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bitmap, 0, 0);
            bitmap.close();
        }

        async function tick() {
            while (!cancelled) {
                try {
                    const response = await fetch(`${ENGINE_FRAME_URL}?t=${Date.now()}`, {
                        cache: 'no-store',
                    });
                    if (!response.ok) {
                        misses += 1;
                        if (misses >= 12) onErrorRef.current?.();
                        await new Promise((resolve) => setTimeout(resolve, 120));
                        continue;
                    }
                    const blob = await response.blob();
                    if (cancelled) break;
                    misses = 0;
                    await paint(blob);
                    await new Promise((resolve) => requestAnimationFrame(resolve));
                } catch {
                    misses += 1;
                    if (misses >= 12) onErrorRef.current?.();
                    await new Promise((resolve) => setTimeout(resolve, 150));
                }
            }
        }

        tick();
        return () => {
            cancelled = true;
        };
    }, [srcKey]);

    return <canvas ref={canvasRef} className="monitor__stream" aria-label="Flux annoté du moteur" />;
}

export default function MonitorStage({
    starting,
    streamUrl,
    streamBroken,
    onStreamError,
    fps,
    confidence,
    liveLabel,
    empty,
    overlay,
}) {
    return (
        <div className="monitor__stage">
            {starting && !streamUrl && (
                <div className="monitor__empty">Séquence de démarrage…</div>
            )}
            {streamUrl && !streamBroken && (
                <LiveJpeg srcKey={streamUrl} onError={onStreamError} />
            )}
            {(!streamUrl || streamBroken) && !starting && (
                <div className="monitor__empty">{empty}</div>
            )}
            {streamUrl && !streamBroken && (
                <div className="monitor__hud">
                    <span>
                        FPS: {Number(fps ?? 0).toFixed(1)}
                        {confidence != null
                            ? `   Conf. ${Math.round(confidence * 100)}%`
                            : ''}
                    </span>
                    {liveLabel && <span className="monitor__live">{liveLabel}</span>}
                </div>
            )}
            {overlay}
        </div>
    );
}

export function formatCabinTime(seconds) {
    return formatDuration(seconds ?? 0);
}
