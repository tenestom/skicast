/**
 * StudioPage — Desktop production interface.
 *
 * User flow:
 *   1. Enter the 6-character session code from the Broadcaster
 *   2. Connect → WebRTC negotiation starts
 *   3. Receive live video from broadcaster
 *   4. Control overlays (skier name, club, pause screen)
 */

import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppHeader } from '../components/common/AppHeader';
import { VideoReceiver } from '../components/studio/VideoReceiver';
import { OverlayEditor } from '../components/studio/OverlayEditor';
import { useBroadcast } from '../contexts/BroadcastContext';
import './StudioPage.css';

export function StudioPage() {
  const navigate = useNavigate();
  const { state, updateSessionMeta, updateOverlayConfig, joinSession, stopBroadcast, resetSession } = useBroadcast();
  const { connectionState, sessionMeta, overlayConfig, remoteStream, sessionCode, errorMessage } = state;

  const [codeInput, setCodeInput] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const isDisconnected = connectionState === 'Disconnected' || connectionState === 'Stopped';
  const isConnecting = connectionState === 'Connecting' || connectionState === 'Reconnecting';
  const isConnected = connectionState === 'Connected' || connectionState === 'Paused';

  // ── Session code input (6 individual boxes) ──────────────────

  const handleCodeBoxInput = (index: number, value: string) => {
    const char = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(-1);
    const chars = codeInput.padEnd(6, ' ').split('');
    chars[index] = char || ' ';
    const next = chars.join('').trimEnd();
    setCodeInput(next);
    setJoinError(null);
    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleCodeBoxKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !codeInput[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
    setCodeInput(pasted);
    setJoinError(null);
    e.preventDefault();
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const handleConnect = useCallback(async () => {
    const code = codeInput.replace(/\s/g, '');
    if (code.length < 6) {
      setJoinError('Please enter the full 6-character code.');
      return;
    }
    setIsJoining(true);
    setJoinError(null);
    try {
      await joinSession(code);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to connect. Check the code and try again.');
    } finally {
      setIsJoining(false);
    }
  }, [codeInput, joinSession]);

  const handleDisconnect = useCallback(() => {
    stopBroadcast();
    setCodeInput('');
  }, [stopBroadcast]);

  const handleBack = useCallback(() => {
    resetSession();
    navigate('/');
  }, [resetSession, navigate]);

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
          {(errorMessage ?? joinError) && (
            <div className="studio__error" role="alert">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {errorMessage ?? joinError}
            </div>
          )}
        </section>

        {/* ── Right: Controls panel ── */}
        <aside className="studio__controls-panel" aria-label="Production controls">

          {/* SESSION CONNECT (shown when disconnected) */}
          {isDisconnected && (
            <div className="studio__connect-panel">
              <h2 className="studio__connect-title">Connect to Broadcaster</h2>
              <p className="studio__connect-hint">
                Enter the 6-character code shown on the Broadcaster's screen.
              </p>

              <div className="studio__code-input-group" onPaste={handleCodePaste}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <input
                    key={i}
                    ref={el => { inputRefs.current[i] = el; }}
                    id={`code-box-${i}`}
                    type="text"
                    inputMode="text"
                    autoCapitalize="characters"
                    maxLength={1}
                    value={codeInput[i] ?? ''}
                    onChange={e => handleCodeBoxInput(i, e.target.value)}
                    onKeyDown={e => handleCodeBoxKeyDown(i, e)}
                    className="studio__code-box"
                    aria-label={`Code character ${i + 1}`}
                  />
                ))}
              </div>

              <button
                id="btn-connect-studio"
                className="btn btn--primary btn--lg btn--full"
                onClick={handleConnect}
                disabled={isJoining || codeInput.replace(/\s/g, '').length < 6}
                aria-busy={isJoining}
              >
                {isJoining ? (
                  <><span className="btn__spinner" aria-hidden="true" /> Connecting…</>
                ) : 'Connect to Broadcaster'}
              </button>
            </div>
          )}

          {/* CONNECTING STATE */}
          {isConnecting && (
            <div className="studio__connecting-panel">
              <div className="studio__connecting-spinner" aria-hidden="true" />
              <p className="studio__connecting-title">
                {connectionState === 'Reconnecting' ? 'Reconnecting…' : 'Waiting for video…'}
              </p>
              <p className="studio__connecting-hint">
                {connectionState === 'Reconnecting'
                  ? 'Connection lost — attempting to restore automatically.'
                  : 'Waiting for the broadcaster to send their video feed.'}
              </p>
              <p className="studio__connecting-code">Session: <strong>{sessionCode}</strong></p>
              <button className="btn btn--ghost btn--sm" onClick={handleDisconnect}>Cancel</button>
            </div>
          )}

          {/* CONNECTED — show production controls */}
          {isConnected && (
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

              <button className="btn btn--danger btn--sm studio__disconnect-btn" onClick={handleDisconnect}>
                Disconnect
              </button>
            </>
          )}

          <button className="btn btn--ghost studio__back-btn" onClick={handleBack}>
            ← Change mode
          </button>
        </aside>
      </main>
    </div>
  );
}
