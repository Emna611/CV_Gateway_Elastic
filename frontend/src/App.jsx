import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppHeader from './components/AppHeader.jsx';
import ScenarioSelect from './pages/ScenarioSelect.jsx';
import ScenarioConfig from './pages/ScenarioConfig.jsx';

export default function App() {
    return (
        <BrowserRouter>
            <div className="app-shell">
                <AppHeader />
                <main className="app-main">
                    <Routes>
                        <Route path="/" element={<ScenarioSelect />} />
                        <Route path="/scenario/:scenarioId" element={<ScenarioConfig />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </main>
            </div>
        </BrowserRouter>
    );
}
