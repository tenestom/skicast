/**
 * BroadcasterPage — Mobile-first camera broadcasting interface.
 *
 * Responsibilities:
 * - Request camera permission
 * - Show live camera preview
 * - Select camera/microphone device
 * - Manage connection state UI
 *
 * WebRTC transmission will be wired in Phase 1B via ConnectionManager.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppHeader } from '../components/common/AppHeader';
import { CameraPreview } from '../components/broadcaster/CameraPreview';
import { DeviceSelector } from '../components/broadcaster/DeviceSelector';
import { useBroadcast } from '../contexts/BroadcastContext';
import { useMediaStream } from '../hooks/useMediaStream';
import type { AppState } from '../types/broadcast';
import './BroadcasterPage.css';

const CANNOT_START: AppState[] = ['WaitingForCamera', 'Connecting', 'Reconnecting'];

export function BroadcasterPage() {
  const navigate = useNavigate();
  const { state, setCamera, setMic, startBroadcast, stopBroadcast, pauseBroadcast, resumeBroadcast } = useBroadcast();
  const { cameras, microphones, stream, isLoading, error, startStream, stopStream, enumerateDevices } = useMediaStream();
  const [mirrored, setMirrored] = useState(true);

  const cs = state.connectionState;
  const isActive = cs === 'Connected' || cs === 'Paused';
  const isBusy = CANNOT_START.includes(cs);

  // Enumerate devices on mount (no permission needed for basic list)
  useEffect(() => {
    enumerateDevices();
  }, [enumerateDevices]);

  // Sync selected device IDs into context
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

  const handleStart = async () => {
    await startStream(state.selectedCameraId, state.selectedMicId);
    await startBroadcast();
  };

  const handleStop = () => {
    stopStream();
    stopBroadcast();
  };

  const handleBack = () => {
    handleStop();
    navigate('/');
  };

  return (
    <div className="broadcaster">
      <AppHeader mode="broadcaster" connectionState={cs} />

      <div className="broadcaster__body">
        {/* Camera preview — full width, top */}
        <section className="broadcaster__preview-section" aria-label="Camera preview">
          <CameraPreview stream={stream} mirrored={mirrored} className="broadcaster__preview" />

          {/* Mirror toggle — overlaid on preview */}
          {stream && (
            <button
              className="broadcaster__mirror-btn"
              onClick={() => setMirrored((m) => !m)}
              aria-label={mirrored ? 'Disable mirror' : 'Enable mirror'}
              title="Toggle mirror"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M10 3v14M4 6l3 4-3 4M16 6l-3 4 3 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </section>

        {/* Controls */}
        <section className="broadcaster__controls" aria-label="Broadcaster controls">
          {/* Error banner */}
          {(error ?? state.errorMessage) && (
            <div className="broadcaster__error" role="alert">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {error ?? state.errorMessage}
            </div>
          )}

          {/* Device selector — only before going live */}
          {!isActive && (
            <DeviceSelector
              cameras={cameras}
              microphones={microphones}
              selectedCameraId={state.selectedCameraId}
              selectedMicId={state.selectedMicId}
              onCameraChange={setCamera}
              onMicChange={setMic}
              disabled={isBusy}
            />
          )}

          {/* Reconnecting notice */}
          {cs === 'Reconnecting' && (
            <div className="broadcaster__reconnect-notice" role="status">
              <div className="broadcaster__reconnect-spinner" />
              Reconnecting — please keep the app open…
            </div>
          )}

          {/* Primary action buttons */}
          <div className="broadcaster__actions">
            {!isActive ? (
              <button
                id="btn-start-broadcast"
                className="btn btn--primary btn--lg btn--full"
                onClick={handleStart}
                disabled={isBusy || isLoading}
                aria-busy={isBusy || isLoading}
              >
                {isLoading || isBusy ? (
                  <>
                    <span className="btn__spinner" aria-hidden="true" />
                    {isLoading ? 'Requesting camera…' : 'Connecting…'}
                  </>
                ) : (
                  <>
                    <span className="btn__dot btn__dot--red" aria-hidden="true" />
                    Start Broadcasting
                  </>
                )}
              </button>
            ) : (
              <div className="broadcaster__live-actions">
                {cs === 'Paused' ? (
                  <button
                    id="btn-resume-broadcast"
                    className="btn btn--success btn--lg"
                    onClick={resumeBroadcast}
                  >
                    ▶ Resume
                  </button>
                ) : (
                  <button
                    id="btn-pause-broadcast"
                    className="btn btn--secondary btn--lg"
                    onClick={pauseBroadcast}
                  >
                    ⏸ Pause
                  </button>
                )}
                <button
                  id="btn-stop-broadcast"
                  className="btn btn--danger btn--lg"
                  onClick={handleStop}
                >
                  ■ Stop
                </button>
              </div>
            )}
          </div>

          {/* Back link */}
          <button className="broadcaster__back-link" onClick={handleBack}>
            ← Change mode
          </button>
        </section>
      </div>
    </div>
  );
}
