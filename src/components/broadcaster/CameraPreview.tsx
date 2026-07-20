/**
 * CameraPreview — Shows the local camera feed inside a video element.
 * Handles muted autoplay (required by browsers for local preview).
 */

import { useEffect, useRef } from 'react';
import './CameraPreview.css';

interface CameraPreviewProps {
  stream: MediaStream | null;
  mirrored?: boolean;
  className?: string;
}

export function CameraPreview({ stream, mirrored = true, className = '' }: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    console.log('[DEBUG] CameraPreview: useEffect triggered, stream exists:', !!stream);
    if (videoRef.current) {
      if (stream) {
        console.log('[DEBUG] CameraPreview: setting video srcObject to stream', stream.id);
        videoRef.current.srcObject = stream;
      } else {
        console.log('[DEBUG] CameraPreview: clearing video srcObject');
        videoRef.current.srcObject = null;
      }
    }
  }, [stream]);

  if (!stream) {
    return (
      <div className={`camera-preview camera-preview--empty ${className}`}>
        <div className="camera-preview__placeholder">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p>Camera not active</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`camera-preview ${className}`}>
      <video
        ref={videoRef}
        className={`camera-preview__video ${mirrored ? 'camera-preview__video--mirrored' : ''}`}
        autoPlay
        muted
        playsInline
        aria-label="Camera preview"
      />
    </div>
  );
}
