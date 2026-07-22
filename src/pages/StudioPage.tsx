/**
 * StudioPage — Desktop production interface.
 *
 * User flow (QR led):
 *   1. Studio clicks "Create Broadcast"
 *   2. Generates session code + displays QR code
 *   3. Broadcaster scans QR → phone joins session
 *   4. Receive live video
 *   5. Control overlays
 */

import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import { AppHeader } from '../components/common/AppHeader';
import { VideoReceiver } from '../components/studio/VideoReceiver';
import { OverlayEditor } from '../components/studio/OverlayEditor';
import { StartListManager } from '../components/studio/StartListManager';
import { useBroadcast } from '../contexts/BroadcastContext';
import './StudioPage.css';

export function StudioPage() {
  const navigate = useNavigate();
  const { state, updateSessionMeta, updateOverlayConfig, createSession, stopBroadcast, resetSession } = useBroadcast();
  const { connectionState, sessionMeta, overlayConfig, remoteStream, sessionCode, errorMessage, peerJoined, activeSkier } = state;

  const displaySkierName = activeSkier?.name || sessionMeta.skierName;
  const displayClubName = activeSkier?.club || sessionMeta.clubName;
  const displayClassName = activeSkier?.className || sessionMeta.className;

  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overlays' | 'startlist'>('overlays');

  const isDisconnected = connectionState === 'Disconnected' || connectionState === 'Stopped';
  const isConnecting = connectionState === 'Connecting' || connectionState === 'Reconnecting';
  const isConnected = connectionState === 'Connected' || connectionState === 'Paused';

  const handleCreateBroadcast = useCallback(async () => {
    setIsCreating(true);
    setCreateError(null);
    try {
      await createSession('studio');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create broadcast session.');
    } finally {
      setIsCreating(false);
    }
  }, [createSession]);

  const handleDisconnect = useCallback(() => {
    stopBroadcast();
  }, [stopBroadcast]);

  const handleBack = useCallback(() => {
    resetSession();
    navigate('/');
  }, [resetSession, navigate]);

  // Dynamically generate the broadcaster join URL
  const getJoinUrl = () => {
    if (!sessionCode) return '';
    const origin = window.location.origin;
    return `${origin}/broadcaster?code=${sessionCode}`;
  };

  // ── Production overlay (rendered on top of video) ────────────

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
          {overlayConfig.showSkierName && displaySkierName && (
            <div className="studio-overlay__skier-name">{displaySkierName}</div>
          )}
          {overlayConfig.showClubInfo && (displayClubName || displayClassName) && (
            <div className="studio-overlay__club-info">
              {[displayClubName, displayClassName].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="studio">
      <AppHeader mode="studio" connectionState={connectionState} />

      <main className="studio__body">
        {/* ── Left: Video panel ── */}
        <section className="studio__video-panel" aria-label="Video output">
          <VideoReceiver
            stream={remoteStream}
            connectionState={connectionState}
            overlayContent={productionOverlay}
          />

          {/* Connection info bar */}
          <div className="studio__info-bar">
            <div className="studio__info-item">
              <span className="studio__info-label">Session</span>
              <span className="studio__info-value studio__info-value--mono">
                {sessionCode ?? '—'}
              </span>
            </div>
            <div className="studio__info-item">
              <span className="studio__info-label">Status</span>
              <span className="studio__info-value">{connectionState}</span>
            </div>
            <div className="studio__info-item">
              <span className="studio__info-label">Video</span>
              <span className="studio__info-value">
                {remoteStream ? `${remoteStream.getVideoTracks().length} track` : '—'}
              </span>
            </div>
          </div>

          {/* Error banner */}
          {(errorMessage ?? createError) && (
            <div className="studio__error" role="alert">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {errorMessage ?? createError}
            </div>
          )}
        </section>

        {/* ── Right: Controls panel ── */}
        <aside className="studio__controls-panel" aria-label="Production controls">

          <div className="studio__connection-section">
            {/* SESSION CONNECT (shown when disconnected) */}
            {isDisconnected && (
              <div className="studio__connect-panel">
                <h2 className="studio__connect-title">Start Production</h2>
                <p className="studio__connect-hint">
                  Create a new broadcast session and show the QR code for the boat to scan.
                </p>

                <button
                  id="btn-create-broadcast"
                  className="btn btn--primary btn--lg btn--full"
                  onClick={handleCreateBroadcast}
                  disabled={isCreating}
                  aria-busy={isCreating}
                  style={{ marginTop: '20px' }}
                >
                  {isCreating ? (
                    <><span className="btn__spinner" aria-hidden="true" /> Creating…</>
                  ) : 'Create Broadcast'}
                </button>
              </div>
            )}

            {/* CONNECTING STATE (QR Code or Spinner) */}
            {isConnecting && (
              <div className="studio__connecting-panel">
                {connectionState === 'Reconnecting' ? (
                  <>
                    <div className="studio__connecting-spinner" aria-hidden="true" />
                    <p className="studio__connecting-title">Reconnecting…</p>
                    <p className="studio__connecting-hint">Connection lost — attempting to restore automatically.</p>
                  </>
                ) : !peerJoined ? (
                  <>
                    <p className="studio__connecting-title">Waiting for boat…</p>
                    <p className="studio__connecting-hint">Scan this QR code with the phone in the boat to start broadcasting.</p>
                    
                    <div className="studio__qr-container">
                      {(() => {
                        const qrValue = getJoinUrl();
                        console.log("QR VALUE:", qrValue);
                        return (
                          <>
                            <QRCodeCanvas 
                              value={qrValue} 
                              size={220}
                              bgColor="#ffffff"
                              fgColor="#0a0e1a"
                              level="H"
                              includeMargin={true}
                            />
                            <div style={{ marginTop: '10px', fontSize: '11px', wordBreak: 'break-all', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                              Debug URL: {qrValue}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                    
                    <p className="studio__connecting-code" style={{ marginTop: '16px' }}>
                      Or enter code manually: <strong>{sessionCode}</strong>
                    </p>
                  </>
                ) : (
                  <>
                    <div className="studio__connecting-spinner" aria-hidden="true" />
                    <p className="studio__connecting-title">Boat connected!</p>
                    <p className="studio__connecting-hint">Negotiating video connection…</p>
                  </>
                )}
                
                <button className="btn btn--ghost btn--sm" style={{ marginTop: '20px' }} onClick={handleDisconnect}>Cancel</button>
              </div>
            )}
            
            {/* CONNECTED STATE - Disconnect button */}
            {isConnected && (
              <div className="studio__connected-panel">
                <button className="btn btn--danger btn--sm studio__disconnect-btn" style={{ width: '100%', marginBottom: '20px' }} onClick={handleDisconnect}>
                  Stop Broadcast
                </button>
              </div>
            )}
          </div>

          <div className="studio__divider" style={{ height: '1px', background: 'var(--color-border)', margin: '16px 0' }} />

          <div className="studio__tabs" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button 
              className={`btn btn--sm ${activeTab === 'overlays' ? 'btn--primary' : 'btn--ghost'}`}
              style={{ flex: 1 }}
              onClick={() => setActiveTab('overlays')}
            >
              Overlays
            </button>
            <button 
              className={`btn btn--sm ${activeTab === 'startlist' ? 'btn--primary' : 'btn--ghost'}`}
              style={{ flex: 1 }}
              onClick={() => setActiveTab('startlist')}
            >
              Start List
            </button>
          </div>

          {/* PRODUCTION CONTROLS (Always Visible) */}
          {activeTab === 'overlays' && (
            <>
              <OverlayEditor
                sessionMeta={sessionMeta}
                overlayConfig={overlayConfig}
                onMetaChange={updateSessionMeta}
                onOverlayChange={updateOverlayConfig}
              />

              {/* Lower-third preview card */}
              {(overlayConfig.showSkierName || overlayConfig.showClubInfo) && !overlayConfig.showPauseScreen && (
                <div className="studio__preview-card" role="region" aria-label="Overlay preview">
                  <p className="studio__preview-label">Lower Third Preview</p>
                  <div className="studio__preview-lower-third">
                    {overlayConfig.showSkierName && (
                      <span className="studio__preview-name">
                        {displaySkierName || 'Skier Name'}
                      </span>
                    )}
                    {overlayConfig.showClubInfo && (
                      <span className="studio__preview-club">
                        {[displayClubName, displayClassName].filter(Boolean).join(' · ') || 'Club · Class'}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'startlist' && (
            <StartListManager />
          )}

          <button className="btn btn--ghost studio__back-btn" onClick={handleBack}>
            ← Change mode
          </button>
        </aside>
      </main>
    </div>
  );
}
