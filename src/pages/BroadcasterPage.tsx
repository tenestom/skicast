/**
 * BroadcasterPage — Mobile-first camera broadcasting interface.
 *
 * User flow (QR led):
 *   1. Scan QR code → opens page with ?code=ABC123
 *   2. Select camera/microphone
 *   3. Start camera (requests permission)
 *   4. Auto-joins session 'ABC123'
 *   5. WebRTC video begins
 *   6. Auto-reconnects on 5G interruption
 * 
 * Fallback:
 *   If no code in URL, user can manually type a 6-character code.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AppHeader } from '../components/common/AppHeader';
import { CameraPreview } from '../components/broadcaster/CameraPreview';
import { DeviceSelector } from '../components/broadcaster/DeviceSelector';
import { DebugPanel } from '../components/common/DebugPanel';
import { useBroadcast } from '../contexts/BroadcastContext';
import { useMediaStream } from '../hooks/useMediaStream';
import './BroadcasterPage.css';

export function BroadcasterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    state,
    setCamera,
    setMic,
    startCamera,
    joinSession,
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
  const autoJoinCode = useRef<string | null>(null);
  const hasRequestedInitialPermission = useRef(false);
  const prevStreamRef = useRef<MediaStream | null>(null);

  const [codeInput, setCodeInput] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const cs = state.connectionState;
  const isLive = cs === 'Connected';
  const isPaused = cs === 'Paused';
  const isReconnecting = cs === 'Reconnecting';
  const isConnecting = cs === 'Connecting';

  // Read code from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    if (code && code.length === 6) {
      autoJoinCode.current = code.toUpperCase();
    }
  }, [location]);

  // Request permission on mount to populate device labels
  useEffect(() => {
    if (!hasRequestedInitialPermission.current) {
      hasRequestedInitialPermission.current = true;
      startStream(null, null);
    }
  }, [startStream]);

  // If the user already has a sessionCode in state (e.g. they hit refresh 
  // but context restored it, or they are reconnecting), prioritize it.
  const activeCode = state.sessionCode || autoJoinCode.current;

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

  const doJoinSession = useCallback(async (code: string) => {
    setIsJoining(true);
    try {
      await joinSession(code, 'broadcaster');
    } catch {
      // Error handles via ConnectionManager -> context
    } finally {
      setIsJoining(false);
    }
  }, [joinSession]);

  const beginBroadcast = useCallback(async (code: string) => {
    if (hasStartedCamera.current) return;
    hasStartedCamera.current = true;
    try {
      await startCamera();
      await doJoinSession(code);
    } catch {
      hasStartedCamera.current = false;
    }
  }, [startCamera, doJoinSession]);

  const handleManualJoin = useCallback(() => {
    const code = codeInput.replace(/\s/g, '');
    if (code.length === 6) {
      beginBroadcast(code);
    }
  }, [codeInput, beginBroadcast]);

  const handleStop = useCallback(() => {
    stopBroadcast();
    hasStartedCamera.current = false;
    setPhase('setup');
  }, [stopBroadcast]);

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

          {/* PRE-BROADCAST PHASE: setup or camera-ready */}
          {(phase === 'setup' || phase === 'camera-ready') && (
            <>
              {activeCode ? (
                <p className="broadcaster__phase-hint">
                  Session <strong>{activeCode}</strong> found. 
                </p>
              ) : (
                <p className="broadcaster__phase-hint">
                  Set up your camera, then enter the session code.
                </p>
              )}
              
              <DeviceSelector
                cameras={cameras}
                microphones={microphones}
                selectedCameraId={state.selectedCameraId}
                selectedMicId={state.selectedMicId}
                onCameraChange={(deviceId) => {
                  setCamera(deviceId);
                  startStream(deviceId, state.selectedMicId);
                }}
                onMicChange={(deviceId) => {
                  setMic(deviceId);
                  startStream(state.selectedCameraId, deviceId);
                }}
                disabled={isLoading}
              />

              {activeCode ? (
                <button
                  id="btn-start-camera"
                  className="btn btn--primary btn--lg btn--full"
                  onClick={() => beginBroadcast(activeCode)}
                  disabled={isLoading || !stream}
                  aria-busy={isLoading || !stream}
                >
                  {isLoading || !stream ? (
                    <><span className="btn__spinner" aria-hidden="true" /> Camera initializing...</>
                  ) : (
                    <>
                      <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
                        <path d="M2 6a2 2 0 012-2h6l2 2h4a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                      </svg>
                      Start Broadcast
                    </>
                  )}
                </button>
              ) : (
                <div className="broadcaster__manual-join">
                  <input
                    type="text"
                    placeholder="CODE"
                    maxLength={6}
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                    className="broadcaster__code-input"
                    disabled={isJoining || isLoading || !stream}
                  />
                  <button
                    className="btn btn--primary btn--lg"
                    onClick={handleManualJoin}
                    disabled={isJoining || isLoading || !stream || codeInput.trim().length < 6}
                  >
                    {isJoining ? 'Joining…' : isLoading || !stream ? 'Waiting for camera...' : 'Join'}
                  </button>
                </div>
              )}
            </>
          )}

          {/* PHASE: waiting — connecting to studio */}
          {(phase === 'waiting' || (isConnecting && !isLive)) && (
            <div className="broadcaster__phase">
              <div className="broadcaster__connecting">
                <div className="broadcaster__connecting-spinner" aria-hidden="true" />
                <p className="broadcaster__connecting-label">
                  {isReconnecting ? 'Reconnecting to Studio…' : 'Connecting to Studio…'}
                </p>
                {activeCode && (
                  <p className="broadcaster__phase-hint" style={{ marginTop: '8px' }}>
                    Session: <strong>{activeCode}</strong>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* PHASE: live */}
          {phase === 'live' && (
            <div className="broadcaster__phase">
              {activeCode && (
                <div className="broadcaster__code-mini">
                  <span className="broadcaster__code-mini-label">Session</span>
                  <span className="broadcaster__code-mini-value">{activeCode}</span>
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
      <DebugPanel role="broadcaster" />
    </div>
  );
}
