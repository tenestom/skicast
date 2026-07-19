/**
 * VideoReceiver — Placeholder for incoming remote video feed in Studio mode.
 * Phase 1B will wire this to a WebRTC remote stream.
 */

import { useRef, useEffect } from 'react';
import type { AppState } from '../../types/broadcast';
import './VideoReceiver.css';

interface VideoReceiverProps {
  stream: MediaStream | null;
  connectionState: AppState;
  overlayContent?: React.ReactNode;
}

export function VideoReceiver({ stream, connectionState, overlayContent }: VideoReceiverProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
  }, [stream]);

  const isWaiting = connectionState === 'Disconnected' || connectionState === 'Stopped';
  const isConnecting = connectionState === 'Connecting' || connectionState === 'Reconnecting';

  return (
    <div className="video-receiver" role="region" aria-label="Incoming video feed">
      {/* Video element — hidden when no stream */}
      <video
        ref={videoRef}
        className={`video-receiver__video ${stream ? 'video-receiver__video--active' : ''}`}
        autoPlay
        playsInline
        aria-label="Remote camera feed"
      />

      {/* Overlay states */}
      {!stream && (
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
              <p className="video-receiver__state-title">
                {connectionState === 'Reconnecting' ? 'Reconnecting…' : 'Connecting…'}
              </p>
              <p className="video-receiver__state-subtitle">
                {connectionState === 'Reconnecting'
                  ? 'Connection lost — attempting to reconnect'
                  : 'Establishing broadcast connection'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Production overlays rendered on top of video */}
      {overlayContent && (
        <div className="video-receiver__production-overlay">
          {overlayContent}
        </div>
      )}

      {/* Safe area label */}
      <div className="video-receiver__label">
        <span>Program Output</span>
        {/* Phase 1B: Resolution / bitrate indicator here */}
      </div>
    </div>
  );
}
