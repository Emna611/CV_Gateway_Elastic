import { Link, useLocation } from 'react-router-dom';
import './AppHeader.css';

const USER = { name: 'Emna Mansouri', role: 'Administrateur', initials: 'EM' };

export default function AppHeader() {
    const { pathname } = useLocation();
    const monitor = pathname.startsWith('/supervision');

    return (
        <header className="app-header" data-skin={monitor ? 'monitor' : undefined}>
            <Link to="/" className="app-header__brand">
                <img
                    className="app-header__logo"
                    src="/elastic-solutions-logo.png"
                    alt="Elastic Solutions"
                    width="42"
                    height="42"
                />
                <span className="app-header__brand-text">
                    <span className="app-header__company">Elastic Solutions</span>
                    <span className="app-header__tagline">Computer Vision</span>
                </span>
            </Link>

            {pathname === '/' && (
                <p className="app-header__project">CV-Gateway Elastic</p>
            )}

            <div className="app-header__user">
                <span className="app-header__user-text">
                    <span className="app-header__user-name">{USER.name}</span>
                    <span className="app-header__user-role">{USER.role}</span>
                </span>
                <span className="app-header__avatar" aria-hidden="true">
                    {USER.initials}
                </span>
            </div>
        </header>
    );
}
