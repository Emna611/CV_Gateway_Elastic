import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppHeader from './components/AppHeader.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import ScenarioSelect from './pages/ScenarioSelect.jsx';
import ScenarioConfig from './pages/ScenarioConfig.jsx';
import EngineStart from './pages/EngineStart.jsx';
import Supervision from './pages/Supervision.jsx';

export default function App() {
    return (
        <BrowserRouter>
            <div className="app-shell">
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
        </BrowserRouter>
    );
}
