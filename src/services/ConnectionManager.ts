/**
 * ConnectionManager
 *
 * Central abstraction for managing the lifecycle of a broadcast connection.
 * Phase 1A: Stub implementation — no real WebRTC yet.
 *           Manages state transitions and media stream only.
 *
 * Phase 1B will extend this with real RTCPeerConnection logic.
 * Phase 2 will add RTMP output.
 *
 * The ConnectionManager does NOT know about React — it is a plain class
 * that emits events via callbacks. This keeps video/streaming logic fully
 * decoupled from the UI.
 */

import type { AppState } from '../types/broadcast';
import type { ConnectionMetrics } from '../types/webrtc';

export type ConnectionEventType =
  | 'stateChange'
  | 'error'
  | 'metricsUpdate'
  | 'streamReady';

export interface ConnectionEvent {
  type: ConnectionEventType;
  state?: AppState;
  error?: string;
  metrics?: ConnectionMetrics;
  stream?: MediaStream;
}

type ConnectionEventListener = (event: ConnectionEvent) => void;

export class ConnectionManager {
  private _state: AppState = 'Disconnected';
  private _listeners: ConnectionEventListener[] = [];
  private _localStream: MediaStream | null = null;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _reconnectAttempts = 0;
  private readonly _maxReconnectAttempts = 10;
  private readonly _reconnectDelayMs = 2000;

  // ── Public API ────────────────────────────────────────────────

  get state(): AppState {
    return this._state;
  }

  get localStream(): MediaStream | null {
    return this._localStream;
  }

  /** Subscribe to connection events */
  on(listener: ConnectionEventListener): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Request camera + microphone access.
   * Transitions: Disconnected → WaitingForCamera → (stream obtained) → Connecting
   */
  async requestMedia(cameraId?: string | null, micId?: string | null): Promise<void> {
    this._transition('WaitingForCamera');

    const constraints: MediaStreamConstraints = {
      video: cameraId
        ? { deviceId: { exact: cameraId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: micId ? { deviceId: { exact: micId } } : true,
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this._localStream = stream;
      this._emit({ type: 'streamReady', stream });
      // Phase 1A: jump straight to Connected (no actual peer connection yet)
      this._transition('Connected');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Camera access denied';
      this._emit({ type: 'error', error: message });
      this._transition('Disconnected');
    }
  }

  /**
   * Initiate a broadcast connection.
   * Phase 1A: Simulates connecting state; real WebRTC goes here in Phase 1B.
   */
  async connect(_sessionId: string): Promise<void> {
    if (this._state === 'Connected') return;
    this._transition('Connecting');

    // TODO Phase 1B: Replace with RTCPeerConnection setup + signaling
    // For now, if we have a local stream we're "connected" for preview purposes
    if (this._localStream) {
      this._transition('Connected');
    } else {
      this._emit({ type: 'error', error: 'No media stream available' });
      this._transition('Disconnected');
    }
  }

  /** Pause the broadcast (keeps connection alive) */
  pause(): void {
    if (this._state === 'Connected') {
      this._transition('Paused');
    }
  }

  /** Resume from pause */
  resume(): void {
    if (this._state === 'Paused') {
      this._transition('Connected');
    }
  }

  /** Stop the session entirely */
  stop(): void {
    this._clearReconnectTimer();
    this._stopLocalStream();
    this._transition('Stopped');
  }

  /** Disconnect without fully stopping (triggers reconnect) */
  disconnect(): void {
    this._clearReconnectTimer();
    this._transition('Disconnected');
  }

  /**
   * Simulate a network interruption (for testing reconnect logic).
   * Remove in production.
   */
  simulateDisconnect(): void {
    if (this._state === 'Connected' || this._state === 'Paused') {
      this._handleNetworkLoss();
    }
  }

  /** Release all resources */
  destroy(): void {
    this._clearReconnectTimer();
    this._stopLocalStream();
    this._listeners = [];
    this._state = 'Stopped';
  }

  // ── Private helpers ───────────────────────────────────────────

  private _transition(next: AppState): void {
    if (this._state === next) return;
    this._state = next;
    this._emit({ type: 'stateChange', state: next });
  }

  private _emit(event: ConnectionEvent): void {
    this._listeners.forEach((l) => l(event));
  }

  private _stopLocalStream(): void {
    if (this._localStream) {
      this._localStream.getTracks().forEach((t) => t.stop());
      this._localStream = null;
    }
  }

  private _clearReconnectTimer(): void {
    if (this._reconnectTimer !== null) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  /**
   * Handle an unexpected network loss — enters Reconnecting state
   * and schedules exponential-backoff retry.
   */
  private _handleNetworkLoss(): void {
    this._transition('Reconnecting');
    this._scheduleReconnect();
  }

  private _scheduleReconnect(): void {
    if (this._reconnectAttempts >= this._maxReconnectAttempts) {
      this._emit({ type: 'error', error: 'Max reconnect attempts reached' });
      this._transition('Disconnected');
      this._reconnectAttempts = 0;
      return;
    }

    const delay = Math.min(
      this._reconnectDelayMs * Math.pow(1.5, this._reconnectAttempts),
      30000
    );

    this._reconnectAttempts++;
    this._reconnectTimer = setTimeout(() => {
      // TODO Phase 1B: Attempt actual WebRTC reconnection here
      if (this._localStream) {
        this._transition('Connected');
        this._reconnectAttempts = 0;
      } else {
        this._scheduleReconnect();
      }
    }, delay);
  }
}

/** Singleton — one manager per application instance */
let _instance: ConnectionManager | null = null;

export function getConnectionManager(): ConnectionManager {
  if (!_instance) {
    _instance = new ConnectionManager();
  }
  return _instance;
}

export function resetConnectionManager(): void {
  if (_instance) {
    _instance.destroy();
    _instance = null;
  }
}
