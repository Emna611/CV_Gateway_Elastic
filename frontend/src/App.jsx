import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AppHeader from './components/AppHeader.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import ScenarioSelect from './pages/ScenarioSelect.jsx';
import ScenarioConfig from './pages/ScenarioConfig.jsx';
import EngineStart from './pages/EngineStart.jsx';
import Supervision from './pages/Supervision.jsx';

export default function App() {
    return (
        <BrowserRouter>
            <Shell />
        </BrowserRouter>
    );
}

function Shell() {
    const { pathname } = useLocation();
    const monitor = pathname.startsWith('/supervision');

    return (
        <div className="app-shell" data-skin={monitor ? 'monitor' : undefined}>
            <AppHeader />
            <main className="app-main">
                <ErrorBoundary>
                    <Routes>
                        <Route path="/" element={<ScenarioSelect />} />
                        <Route path="/scenario/:scenarioId" element={<ScenarioConfig />} />
                        <Route path="/engine/:scenarioId" element={<EngineStart />} />
                        <Route path="/supervision/:scenarioId" element={<Supervision />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </ErrorBoundary>
            </main>
        </div>
    );
}
