/**
 * StudioPage — Desktop production interface.
 *
 * Responsibilities:
 * - Display incoming video (placeholder for now, Phase 1B wires WebRTC)
 * - Overlay editor: skier name, club, pause screen
 * - Session metadata entry
 * - Production control panel
 */

import { useNavigate } from 'react-router-dom';
import { AppHeader } from '../components/common/AppHeader';
import { VideoReceiver } from '../components/studio/VideoReceiver';
import { OverlayEditor } from '../components/studio/OverlayEditor';
import { useBroadcast } from '../contexts/BroadcastContext';
import './StudioPage.css';

export function StudioPage() {
  const navigate = useNavigate();
  const { state, updateSessionMeta, updateOverlayConfig, resetSession } = useBroadcast();

  const { connectionState, sessionMeta, overlayConfig } = state;

  // Build the production overlay that will be composited on the video
  const productionOverlay = (
    <div className="studio-overlay">
      {overlayConfig.showPauseScreen && (
        <div className="studio-overlay__pause-screen">
          <div className="studio-overlay__pause-logo" aria-hidden="true">
            <svg viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="13" stroke="url(#grad2)" strokeWidth="2.5" fill="none" />
              <circle cx="24" cy="24" r="6" fill="url(#grad2)" />
              <circle cx="24" cy="24" r="2.5" fill="#0a0e1a" />
              <defs>
                <linearGradient id="grad2" x1="11" y1="11" x2="37" y2="37">
                  <stop stopColor="#60a5fa" />
                  <stop offset="1" stopColor="#a78bfa" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <span className="studio-overlay__pause-text">
            {overlayConfig.pauseMessage || 'Stand By'}
          </span>
        </div>
      )}

      {!overlayConfig.showPauseScreen && (
        <div className="studio-overlay__lower-third">
          {overlayConfig.showSkierName && sessionMeta.skierName && (
            <div className="studio-overlay__skier-name">{sessionMeta.skierName}</div>
          )}
          {overlayConfig.showClubInfo && (sessionMeta.clubName || sessionMeta.className) && (
            <div className="studio-overlay__club-info">
              {[sessionMeta.clubName, sessionMeta.className].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const handleBack = () => {
    resetSession();
    navigate('/');
  };

  return (
    <div className="studio">
      <AppHeader mode="studio" connectionState={connectionState} />

      <main className="studio__body">
        {/* Left: Video output */}
        <section className="studio__video-panel" aria-label="Video output">
          <VideoReceiver
            stream={null} /* Phase 1B: wire remote stream here */
            connectionState={connectionState}
            overlayContent={productionOverlay}
          />

          {/* Connection info bar */}
          <div className="studio__info-bar">
            <div className="studio__info-item">
              <span className="studio__info-label">Session ID</span>
              <span className="studio__info-value studio__info-value--mono">—</span>
            </div>
            <div className="studio__info-item">
              <span className="studio__info-label">Bitrate</span>
              <span className="studio__info-value">—</span>
            </div>
            <div className="studio__info-item">
              <span className="studio__info-label">Latency</span>
              <span className="studio__info-value">—</span>
            </div>
            <div className="studio__info-item">
              <span className="studio__info-label">Resolution</span>
              <span className="studio__info-value">—</span>
            </div>
          </div>

          {/* Phase 1B notice */}
          <div className="studio__phase-notice" role="note">
            <span>📡</span>
            <span>
              <strong>Phase 1A:</strong> Video reception via WebRTC is coming in Phase 1B.
              The overlay controls and production layout are fully functional.
            </span>
          </div>
        </section>

        {/* Right: Production controls */}
        <aside className="studio__controls-panel" aria-label="Production controls">
          <OverlayEditor
            sessionMeta={sessionMeta}
            overlayConfig={overlayConfig}
            onMetaChange={updateSessionMeta}
            onOverlayChange={updateOverlayConfig}
          />

          {/* Output preview of lower-third */}
          {(overlayConfig.showSkierName || overlayConfig.showClubInfo) && !overlayConfig.showPauseScreen && (
            <div className="studio__preview-card" role="region" aria-label="Overlay preview">
              <p className="studio__preview-label">Lower Third Preview</p>
              <div className="studio__preview-lower-third">
                {overlayConfig.showSkierName && (
                  <span className="studio__preview-name">
                    {sessionMeta.skierName || 'Skier Name'}
                  </span>
                )}
                {overlayConfig.showClubInfo && (
                  <span className="studio__preview-club">
                    {[sessionMeta.clubName, sessionMeta.className].filter(Boolean).join(' · ') || 'Club · Class'}
                  </span>
                )}
              </div>
            </div>
          )}

          <button className="btn btn--ghost studio__back-btn" onClick={handleBack}>
            ← Change mode
          </button>
        </aside>
      </main>
    </div>
  );
}
