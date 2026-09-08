import { Panel, Slider } from '../ui/controls.jsx';
import { formatSeconds } from '../../utils/format.js';

export default function ThresholdsPanel({ state, dispatch }) {
    const { defaults, thresholds, confidence } = state;
    const confidenceSpec = defaults.confidence;

    return (
        <Panel index="2.2" title="Seuils de détection" hint="Valeurs issues de config.yaml">
            {Object.entries(defaults.thresholds).map(([key, spec]) => (
                <Slider
                    key={key}
                    label={spec.label}
                    description={spec.description}
                    severity={spec.severity}
                    value={thresholds[key]}
                    min={spec.min}
                    max={spec.max}
                    step={spec.step}
                    onChange={(value) => dispatch({ type: 'threshold', key, value })}
                    formatValue={(value) => `${value} s`}
                    formatBound={(value) => formatSeconds(value)}
                />
            ))}

            <div className="thresholds__confidence">
                <Slider
                    label="CONFIANCE"
                    description="Score minimum pour retenir une détection, tous types confondus. Plus bas = plus de détections mais plus de faux positifs."
                    value={confidence}
                    min={confidenceSpec.min}
                    max={confidenceSpec.max}
                    step={confidenceSpec.step}
                    onChange={(value) =>
                        dispatch({ type: 'confidence', value: Number(value.toFixed(2)) })
                    }
                    formatValue={(value) => value.toFixed(2)}
                    formatBound={(value) => value.toFixed(2)}
                />
            </div>
        </Panel>
    );
}
