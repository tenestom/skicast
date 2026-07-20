/**
 * useMediaStream
 *
 * Hook for enumerating available media devices and requesting
 * a local MediaStream with the selected camera/mic.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaDeviceOption } from '../types/broadcast';

interface UseMediaStreamResult {
  cameras: MediaDeviceOption[];
  microphones: MediaDeviceOption[];
  stream: MediaStream | null;
  isLoading: boolean;
  error: string | null;
  enumerateDevices: () => Promise<void>;
  startStream: (cameraId?: string | null, micId?: string | null) => Promise<void>;
  stopStream: () => void;
}

export function useMediaStream(): UseMediaStreamResult {
  const [cameras, setCameras] = useState<MediaDeviceOption[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceOption[]>([]);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(
        devices
          .filter((d) => d.kind === 'videoinput')
          .map((d) => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 6)}`, kind: d.kind }))
      );
      setMicrophones(
        devices
          .filter((d) => d.kind === 'audioinput')
          .map((d) => ({ deviceId: d.deviceId, label: d.label || `Mic ${d.deviceId.slice(0, 6)}`, kind: d.kind }))
      );
    } catch (err) {
      console.error('[useMediaStream] Failed to enumerate devices', err);
    }
  }, []);

  const startStream = useCallback(
    async (cameraId?: string | null, micId?: string | null) => {
      console.log('[DEBUG] useMediaStream: startStream called with cameraId=', cameraId, 'micId=', micId);
      setIsLoading(true);
      setError(null);

      // Save reference to old stream so we can stop it safely AFTER replaceTrack
      const oldStream = streamRef.current;

      const constraints: MediaStreamConstraints = {
        video: cameraId
          ? { deviceId: { exact: cameraId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: micId ? { deviceId: { exact: micId } } : true,
      };

      console.log('[DEBUG] useMediaStream: calling getUserMedia with constraints=', JSON.stringify(constraints));

      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        const newTrack = mediaStream.getVideoTracks()[0];
        console.log(`[DEBUG] useMediaStream: getUserMedia success. New track id=${newTrack?.id}, readyState=${newTrack?.readyState}, enabled=${newTrack?.enabled}`);
        
        streamRef.current = mediaStream;
        setStream(mediaStream);
        
        // After permission granted, refresh device list with labels
        await enumerateDevices();
        
        // Give replaceTrack plenty of time to execute using the old track before we stop it.
        // Stopping it too early causes iOS Safari RTCPeerConnection to freeze.
        if (oldStream) {
          setTimeout(() => {
            console.log('[DEBUG] useMediaStream: stopping old stream tracks safely');
            oldStream.getTracks().forEach((t) => t.stop());
          }, 1000);
        }
      } catch (err) {
        const msg =
          err instanceof DOMException
            ? err.name === 'NotAllowedError'
              ? 'Camera permission denied. Please allow camera access in your browser.'
              : err.name === 'NotFoundError'
              ? 'No camera found on this device.'
              : err.message
            : 'Failed to access camera.';
        setError(msg);
        streamRef.current = null;
        setStream(null);
      } finally {
        setIsLoading(false);
      }
    },
    [enumerateDevices]
  );

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setStream(null);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return { cameras, microphones, stream, isLoading, error, enumerateDevices, startStream, stopStream };
}
