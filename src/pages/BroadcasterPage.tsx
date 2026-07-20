/**
 * BroadcasterPage — Mobile-first camera broadcasting interface.
 *
 * User flow:
 *   1. Select camera/microphone
 *   2. Start camera (requests permission)
 *   3. Start Session → receive 6-character code
 *   4. Share code with Studio operator
 *   5. Studio connects → WebRTC video begins
 *   6. Stay Live — auto-reconnects on 5G interruption
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppHeader } from '../components/common/AppHeader';
import { CameraPreview } from '../components/broadcaster/CameraPreview';
import { DeviceSelector } from '../components/broadcaster/DeviceSelector';
import { SessionCodeDisplay } from '../components/broadcaster/SessionCodeDisplay';
import { useBroadcast } from '../contexts/BroadcastContext';
import { useMediaStream } from '../hooks/useMediaStream';
import './BroadcasterPage.css';

export function BroadcasterPage() {
  const navigate = useNavigate();
  const {
    state,
    setCamera,
    setMic,
    startCamera,
    startSession,
    stopBroadcast,
    pauseBroadcast,
    resumeBroadcast,
  } = useBroadcast();

  const {
    cameras, microphones, stream, isLoading, error: mediaError,
    startStream, stopStream, enumerateDevices,
  } = useMediaStream();

  const [mirrored, setMirrored] = useState(true);
  const [phase, setPhase] = useState<'setup' | 'camera-ready' | 'waiting' | 'live'>('setup');
  const hasStartedCamera = useRef(false);

  const cs = state.connectionState;
  const isLive = cs === 'Connected';
  const isPaused = cs === 'Paused';
  const isReconnecting = cs === 'Reconnecting';
  const isConnecting = cs === 'Connecting';

  // Enumerate devices on mount
  useEffect(() => {
    enumerateDevices();
  }, [enumerateDevices]);

  // Sync first devices into context
  useEffect(() => {
    if (cameras.length > 0 && !state.selectedCameraId) {
      setCamera(cameras[0].deviceId);
    }
  }, [cameras, state.selectedCameraId, setCamera]);

  useEffect(() => {
    if (microphones.length > 0 && !state.selectedMicId) {
      setMic(microphones[0].deviceId);
    }
  }, [microphones, state.selectedMicId, setMic]);

  // Update phase based on connection state
  useEffect(() => {
    if (isLive || isPaused) setPhase('live');
    else if (isConnecting || isReconnecting) setPhase('waiting');
    else if (stream) setPhase('camera-ready');
    else setPhase('setup');
  }, [isLive, isPaused, isConnecting, isReconnecting, stream]);

  const handleStartCamera = useCallback(async () => {
    if (hasStartedCamera.current) return;
    hasStartedCamera.current = true;
    try {
      await startStream(state.selectedCameraId, state.selectedMicId);
      await startCamera();
    } catch {
      hasStartedCamera.current = false;
    }
  }, [startStream, startCamera, state.selectedCameraId, state.selectedMicId]);

  const handleStartSession = useCallback(async () => {
    await startSession();
    setPhase('waiting');
  }, [startSession]);

  const handleStop = useCallback(() => {
    stopStream();
    stopBroadcast();
    hasStartedCamera.current = false;
    setPhase('setup');
  }, [stopStream, stopBroadcast]);

  const handleBack = useCallback(() => {
    handleStop();
    navigate('/');
  }, [handleStop, navigate]);

  const displayError = mediaError ?? state.errorMessage;

  return (
    <div className="broadcaster">
      <AppHeader mode="broadcaster" connectionState={cs} />

      <div className="broadcaster__body">
        {/* Camera preview */}
        <section className="broadcaster__preview-section" aria-label="Camera preview">
          <CameraPreview stream={stream} mirrored={mirrored} className="broadcaster__preview" />

          {stream && (
            <button
              className="broadcaster__mirror-btn"
              onClick={() => setMirrored(m => !m)}
              aria-label={mirrored ? 'Disable mirror' : 'Enable mirror'}
              title="Toggle mirror"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M10 3v14M4 6l3 4-3 4M16 6l-3 4 3 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}

          {(isLive || isPaused) && (
            <div className={`broadcaster__live-indicator ${isPaused ? 'broadcaster__live-indicator--paused' : ''}`}>
              <span className="broadcaster__live-dot" aria-hidden="true" />
              {isPaused ? 'PAUSED' : 'LIVE'}
            </div>
          )}

          {isReconnecting && (
            <div className="broadcaster__reconnect-overlay">
              <div className="broadcaster__reconnect-spinner" aria-hidden="true" />
              <span>Reconnecting…</span>
            </div>
          )}
        </section>

        {/* Controls */}
        <section className="broadcaster__controls" aria-label="Broadcaster controls">
          {/* Error */}
          {displayError && (
            <div className="broadcaster__error" role="alert">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {displayError}
            </div>
          )}

          {/* PHASE: setup — choose devices */}
          {phase === 'setup' && (
            <>
              <DeviceSelector
                cameras={cameras}
                microphones={microphones}
                selectedCameraId={state.selectedCameraId}
                selectedMicId={state.selectedMicId}
                onCameraChange={setCamera}
                onMicChange={setMic}
                disabled={isLoading}
              />
              <button
                id="btn-start-camera"
                className="btn btn--primary btn--lg btn--full"
                onClick={handleStartCamera}
                disabled={isLoading}
                aria-busy={isLoading}
              >
                {isLoading ? (
                  <><span className="btn__spinner" aria-hidden="true" /> Starting camera…</>
                ) : (
                  <>
                    <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
                      <path d="M2 6a2 2 0 012-2h6l2 2h4a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    </svg>
                    Start Camera
                  </>
                )}
              </button>
            </>
          )}

          {/* PHASE: camera-ready — start session */}
          {phase === 'camera-ready' && (
            <div className="broadcaster__phase">
              <p className="broadcaster__phase-hint">Camera is ready. Start a session to get your connection code.</p>
              <button
                id="btn-start-session"
                className="btn btn--primary btn--lg btn--full"
                onClick={handleStartSession}
              >
                <span className="btn__dot btn__dot--red" aria-hidden="true" />
                Start Session
              </button>
              <button className="btn btn--ghost btn--sm" onClick={() => { setPhase('setup'); }}>
                ← Change camera
              </button>
            </div>
          )}

          {/* PHASE: waiting — show session code, waiting for studio */}
          {(phase === 'waiting' || isReconnecting) && state.sessionCode && (
            <div className="broadcaster__phase">
              <SessionCodeDisplay code={state.sessionCode} />
              <p className="broadcaster__phase-hint">
                {isReconnecting
                  ? 'Reconnecting — keep the app open. Studio will rejoin automatically.'
                  : 'Share this code with the Studio operator. Waiting for them to connect…'}
              </p>
            </div>
          )}

          {/* PHASE: live */}
          {phase === 'live' && (
            <div className="broadcaster__phase">
              {state.sessionCode && (
                <div className="broadcaster__code-mini">
                  <span className="broadcaster__code-mini-label">Code</span>
                  <span className="broadcaster__code-mini-value">{state.sessionCode}</span>
                </div>
              )}
              <div className="broadcaster__live-actions">
                {isPaused ? (
                  <button id="btn-resume-broadcast" className="btn btn--success btn--lg" onClick={resumeBroadcast}>
                    ▶ Resume
                  </button>
                ) : (
                  <button id="btn-pause-broadcast" className="btn btn--secondary btn--lg" onClick={pauseBroadcast}>
                    ⏸ Pause
                  </button>
                )}
                <button id="btn-stop-broadcast" className="btn btn--danger btn--lg" onClick={handleStop}>
                  ■ Stop
                </button>
              </div>
            </div>
          )}

          <button className="broadcaster__back-link" onClick={handleBack}>
            ← Change mode
          </button>
        </section>
      </div>
    </div>
  );
}
