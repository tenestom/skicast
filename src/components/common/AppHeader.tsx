/**
 * AppHeader — Top navigation bar with logo, mode label, and status badge.
 */

import { useNavigate } from 'react-router-dom';
import { StatusBadge } from './StatusBadge';
import type { AppMode, AppState } from '../../types/broadcast';
import './AppHeader.css';

interface AppHeaderProps {
  mode?: AppMode | null;
  connectionState?: AppState;
  onLogoClick?: () => void;
}

const MODE_LABELS: Record<AppMode, string> = {
  broadcaster: 'Broadcaster',
  studio: 'Studio',
};

export function AppHeader({ mode, connectionState = 'Disconnected', onLogoClick }: AppHeaderProps) {
  const navigate = useNavigate();

  const handleLogoClick = () => {
    if (onLogoClick) {
      onLogoClick();
    } else {
      navigate('/');
    }
  };

  return (
    <header className="app-header">
      <button className="app-header__logo" onClick={handleLogoClick} aria-label="Go to home">
        <svg className="app-header__logo-icon" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="16" cy="16" r="9" stroke="currentColor" strokeWidth="2" fill="none" />
          <circle cx="16" cy="16" r="4" fill="currentColor" />
          <circle cx="16" cy="16" r="1.5" fill="var(--color-bg-primary)" />
        </svg>
        <span className="app-header__logo-text">SkiCast</span>
      </button>

      <div className="app-header__center">
        {mode && (
          <span className="app-header__mode-label">{MODE_LABELS[mode]}</span>
        )}
      </div>

      <div className="app-header__right">
        <StatusBadge state={connectionState} />
      </div>
    </header>
  );
}
