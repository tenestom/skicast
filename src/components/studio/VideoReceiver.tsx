/**
 * VideoReceiver — Placeholder for incoming remote video feed in Studio mode.
 * Phase 1B will wire this to a WebRTC remote stream.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import type { AppState, WebRTCMetrics } from '../../types/broadcast';
import { useBroadcast } from '../../contexts/BroadcastContext';
import './VideoReceiver.css';

interface VideoReceiverProps {
  stream: MediaStream | null;
  connectionState: AppState;
  overlayContent?: React.ReactNode;
}

export function VideoReceiver({ stream, connectionState, overlayContent }: VideoReceiverProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { state: { metrics, pauseBgUrl, overlayConfig, activeScene } } = useBroadcast();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
  }, [stream]);

  const handleFullscreenToggle = useCallback(async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn('Fullscreen error:', err);
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'f' && e.target === document.body) {
        handleFullscreenToggle();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleFullscreenToggle]);

  const isWaiting = connectionState === 'Disconnected' || connectionState === 'Stopped';
  const isConnecting = connectionState === 'Connecting';
  const isReconnecting = connectionState === 'Reconnecting';
  
  // The pause scene is shown when reconnecting, or manually triggered
  const showPauseScene = isReconnecting || activeScene === 'pause';

  return (
    <div 
      ref={containerRef}
      className={`video-receiver ${isFullscreen ? 'video-receiver--fullscreen' : ''}`}
      role="region" 
      aria-label="Incoming video feed"
      onDoubleClick={handleFullscreenToggle}
    >
      {/* Video element — hidden when no stream */}
      <video
        ref={videoRef}
        className={`video-receiver__video ${stream ? 'video-receiver__video--active' : ''}`}
        autoPlay
        playsInline
        aria-label="Remote camera feed"
      />

      <div 
        className="video-receiver__pause-scene"
        style={{
          opacity: showPauseScene ? 1 : 0,
          pointerEvents: showPauseScene ? 'auto' : 'none',
          backgroundImage: pauseBgUrl ? `url(${pauseBgUrl})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          transition: 'opacity 0.5s ease',
        }}
      >
        {isReconnecting && (
          <div className="video-receiver__pause-content">
            <p className="video-receiver__pause-message">
              Connection to broadcaster lost{'\n\n'}Reconnecting...
            </p>
          </div>
        )}
      </div>

      {/* Initial Connection Overlays */}
      {!stream && !showPauseScene && (
        <div className="video-receiver__overlay">
          {isWaiting && (
            <div className="video-receiver__state">
              <div className="video-receiver__icon">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"
                    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="video-receiver__state-title">Waiting for Broadcaster</p>
              <p className="video-receiver__state-subtitle">No active broadcast connection</p>
            </div>
          )}

          {isConnecting && (
            <div className="video-receiver__state">
              <div className="video-receiver__spinner" aria-label="Connecting" />
              <p className="video-receiver__state-title">Connecting…</p>
              <p className="video-receiver__state-subtitle">Establishing broadcast connection</p>
            </div>
          )}
        </div>
      )}

      {/* Production overlays rendered on top of video */}
      {overlayContent && !showPauseScene && (
        <div className="video-receiver__production-overlay">
          {overlayContent}
        </div>
      )}

      {/* Fullscreen toggle button */}
      <button 
        className="video-receiver__fullscreen-btn" 
        onClick={handleFullscreenToggle}
        title={isFullscreen ? 'Exit Fullscreen (f)' : 'Enter Fullscreen (f)'}
      >
        {isFullscreen ? '↙️' : '⛶'}
      </button>

      {/* Safe area label */}
      <div className="video-receiver__label">
        <span>Program Output</span>
      </div>
    </div>
  );
}
