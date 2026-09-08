import { Link } from 'react-router-dom';
import { LogoMark } from './icons.jsx';
import './AppHeader.css';

const USER = { name: 'Emna Mansouri', role: 'Administrateur', initials: 'EM' };

export default function AppHeader() {
    return (
        <header className="app-header">
            <Link to="/" className="app-header__brand">
                <LogoMark />
                <span className="app-header__brand-text">
                    <span className="app-header__company">Elastic Solutions</span>
                    <span className="app-header__tagline">Computer Vision</span>
                </span>
            </Link>

            <span className="app-header__divider" />

            <div className="app-header__project">
                <span className="app-header__project-name">CV-Gateway Elastic</span>
                <span className="app-header__project-desc">
                    Traçabilité comportementale multi-modale
                </span>
            </div>

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
