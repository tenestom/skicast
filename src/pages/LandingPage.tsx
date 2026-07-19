/**
 * LandingPage — Mode selection screen.
 * The operator chooses between Broadcaster (boat/phone) and Studio (shore/laptop).
 */

import { useNavigate } from 'react-router-dom';
import { useBroadcast } from '../contexts/BroadcastContext';
import './LandingPage.css';

export function LandingPage() {
  const navigate = useNavigate();
  const { selectMode } = useBroadcast();

  const handleSelectBroadcaster = () => {
    selectMode('broadcaster');
    navigate('/broadcaster');
  };

  const handleSelectStudio = () => {
    selectMode('studio');
    navigate('/studio');
  };

  return (
    <main className="landing">
      {/* Background orbs */}
      <div className="landing__bg-orb landing__bg-orb--blue" aria-hidden="true" />
      <div className="landing__bg-orb landing__bg-orb--purple" aria-hidden="true" />

      <div className="landing__content">
        {/* Logo + title */}
        <header className="landing__hero">
          <div className="landing__logo" aria-hidden="true">
            <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="24" cy="24" r="13" stroke="url(#grad)" strokeWidth="2.5" fill="none" />
              <circle cx="24" cy="24" r="6" fill="url(#grad)" />
              <circle cx="24" cy="24" r="2.5" fill="#0a0e1a" />
              <defs>
                <linearGradient id="grad" x1="11" y1="11" x2="37" y2="37" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#60a5fa" />
                  <stop offset="1" stopColor="#a78bfa" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className="landing__title">SkiCast</h1>
          <p className="landing__subtitle">Live Broadcasting for Waterskiing</p>
        </header>

        {/* Mode cards */}
        <div className="landing__modes" role="group" aria-label="Select operating mode">
          {/* Broadcaster card */}
          <button
            id="btn-broadcaster-mode"
            className="landing__mode-card landing__mode-card--broadcaster"
            onClick={handleSelectBroadcaster}
            aria-label="Enter Broadcaster mode"
          >
            <div className="landing__mode-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"
                  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="landing__mode-body">
              <h2 className="landing__mode-title">Broadcaster</h2>
              <p className="landing__mode-description">
                Use on a smartphone in the boat. Captures live camera video and sends it over the internet.
              </p>
              <ul className="landing__mode-features">
                <li>Mobile-first interface</li>
                <li>Camera & microphone access</li>
                <li>Auto-reconnect on signal loss</li>
              </ul>
            </div>
            <div className="landing__mode-arrow" aria-hidden="true">→</div>
          </button>

          {/* Studio card */}
          <button
            id="btn-studio-mode"
            className="landing__mode-card landing__mode-card--studio"
            onClick={handleSelectStudio}
            aria-label="Enter Studio mode"
          >
            <div className="landing__mode-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M7 7h4M7 10h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="16" cy="8.5" r="2" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </div>
            <div className="landing__mode-body">
              <h2 className="landing__mode-title">Studio</h2>
              <p className="landing__mode-description">
                Use on a laptop at the shore. Receives the broadcast feed and provides a simple production interface.
              </p>
              <ul className="landing__mode-features">
                <li>Desktop production layout</li>
                <li>Skier name & club overlays</li>
                <li>Pause screen control</li>
              </ul>
            </div>
            <div className="landing__mode-arrow" aria-hidden="true">→</div>
          </button>
        </div>

        <p className="landing__footer">
          Phase 1A — Architecture Foundation · WebRTC coming in Phase 1B
        </p>
      </div>
    </main>
  );
}
