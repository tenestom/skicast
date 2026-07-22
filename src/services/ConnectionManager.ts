/**
 * ConnectionManager
 *
 * Orchestrates the full broadcast session lifecycle:
 *   1. Media capture (camera/mic via getUserMedia)
 *   2. Signaling (WebSocket session creation/joining)
 *   3. WebRTC peer connection (offer/answer/ICE)
 *   4. Auto-reconnect on network interruption
 *
 * Architecture:
 *   ConnectionManager ──► SignalingService (WebSocket signaling)
 *                    ──► WebRTCService    (RTCPeerConnection)
 *
 * This class is NOT React-aware. It emits events via callbacks.
 * BroadcastContext bridges it into React state.
 *
 * State machine:
 *   Disconnected → WaitingForCamera → Connecting → Connected
 *   Connected → Reconnecting → Connected  (auto)
 *   Connected → Paused → Connected
 *   Any → Stopped
 */

import type { AppState } from '../types/broadcast';
import { getSignalingService, resetSignalingService } from './SignalingService';
import { WebRTCService } from './WebRTCService';
import { RECONNECT_CONFIG } from '../config/webrtc';

// ── Events ────────────────────────────────────────────────────

export type ConnectionEventType =
  | 'stateChange'
  | 'sessionCode'     // Broadcaster received their session code
  | 'remoteStream'    // Studio received the broadcaster's video
  | 'error'
  | 'peerJoined'
  | 'metricsUpdate';

export interface ConnectionEvent {
  type: ConnectionEventType;
  state?: AppState;
  sessionCode?: string;
  stream?: MediaStream;
  error?: string;
  metrics?: WebRTCMetrics;
}

type ConnectionEventListener = (event: ConnectionEvent) => void;

export type BroadcastRole = 'broadcaster' | 'studio';

// ── Manager ───────────────────────────────────────────────────

export class ConnectionManager {
  private _state: AppState = 'Disconnected';
  private _listeners: ConnectionEventListener[] = [];
  private _role: BroadcastRole | null = null;
  private _localStream: MediaStream | null = null;
  private _remoteStream: MediaStream | null = null;
  private _sessionCode: string | null = null;

  private _webrtc = new WebRTCService();
  private _unsubSignaling: (() => void) | null = null;
  private _unsubWebRTC: (() => void) | null = null;

  private _reconnectAttempts = 0;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _isReconnecting = false;

  private _log(category: string, message: string) {
    if (!this._role) return;
    const prefix = `[${this._role.toUpperCase()} DEBUG]`;
    const time = new Date().toLocaleTimeString([], { hour12: false });
    console.log(`${prefix} [${time}] ${category} ${message}`);
  }

  // ── Public getters ──────────────────────────────────────────

  get state(): AppState { return this._state; }
  get localStream(): MediaStream | null { return this._localStream; }
  get remoteStream(): MediaStream | null { return this._remoteStream; }
  get sessionCode(): string | null { return this._sessionCode; }

  getDiagnostics() {
    const signaling = getSignalingService();
    return {
      signaling: signaling.getDiagnostics(),
      webrtc: this._webrtc.getDiagnostics(),
      media: {
        localStreamExists: !!this._localStream,
        localVideoState: this._localStream?.getVideoTracks()[0]?.readyState || 'none',
        remoteStreamExists: !!this._remoteStream,
        remoteVideoState: this._remoteStream?.getVideoTracks()[0]?.readyState || 'none',
      },
      reconnectAttempts: this._reconnectAttempts
    };
  }

  // ── Public API ──────────────────────────────────────────────

  /** Subscribe to connection events */
  on(listener: ConnectionEventListener): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter(l => l !== listener);
    };
  }

  /**
   * Request camera and microphone access.
   * Transitions: Disconnected → WaitingForCamera → (stream ready)
   */
  async requestMedia(cameraId?: string | null, micId?: string | null): Promise<void> {
    console.log(`[LIFECYCLE] ConnectionManager: requestMedia called. cameraId=${cameraId}, micId=${micId}`);
    this._transition('WaitingForCamera');

    const constraints: MediaStreamConstraints = {
      video: cameraId
        ? { deviceId: { exact: cameraId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: micId ? { deviceId: { exact: micId } } : true,
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log(`[LIFECYCLE] ConnectionManager: local stream acquired. Tracks: ${stream.getTracks().length}`);
      this._localStream = stream;
    } catch (err) {
      console.error(`[LIFECYCLE] ConnectionManager: requestMedia failed`, err);
      const msg = this._mediaErrorMessage(err);
      this._emit({ type: 'error', error: msg });
      this._transition('Disconnected');
      throw new Error(msg);
    }
  }

  /**
   * Create a new broadcast session.
   * Connects to signaling server, creates session, waits for peer.
   * Returns the 6-character session code.
   */
  async createSession(role: BroadcastRole = 'studio'): Promise<string> {
    this._role = role;
    this._transition('Connecting');

    const signaling = getSignalingService();
    this._setupSignalingListeners(signaling);

    try {
      await signaling.connect();
      const code = await signaling.createSession();
      this._sessionCode = code;
      this._emit({ type: 'sessionCode', sessionCode: code });
      // Stay in Connecting — waiting for studio to join
      return code;
    } catch (err) {
      this._emit({ type: 'error', error: String(err) });
      this._transition('Disconnected');
      throw err;
    }
  }

  /**
   * Join an existing session.
   * Connects to signaling server and joins session.
   */
  async joinSession(code: string, role: BroadcastRole = 'broadcaster'): Promise<void> {
    console.log(`[LIFECYCLE] ConnectionManager: joining session ${code} as ${role}`);
    this._role = role;
    this._sessionCode = code.toUpperCase();
    this._transition('Connecting');

    const signaling = getSignalingService();
    this._setupSignalingListeners(signaling);

    try {
      await signaling.connect();
      console.log(`[LIFECYCLE] ConnectionManager: signaling connected. Joining session...`);
      await signaling.joinSession(code);
      console.log(`[LIFECYCLE] ConnectionManager: signaling session joined successfully.`);
      if (this._role === 'broadcaster') {
        await this._startWebRTCBroadcaster();
      }
      // If studio, stay in Connecting — waiting for broadcaster's offer
    } catch (err) {
      console.error(`[LIFECYCLE] ConnectionManager: joinSession failed`, err);
      this._emit({ type: 'error', error: String(err) });
      this._transition('Disconnected');
      throw err;
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
    console.log('[LIFECYCLE] ConnectionManager: Stop Broadcast called. Resetting state.');
    this._clearReconnectTimer();
    this._cleanupWebRTC();
    this._cleanupSignaling();
    this._stopLocalStream();
    this._sessionCode = null;
    this._role = null;
    this._isReconnecting = false;
    this._reconnectAttempts = 0;
    this._transition('Stopped');
    console.log('[LIFECYCLE] ConnectionManager: Stop Broadcast complete.');
  }

  /** Release all resources */
  destroy(): void {
    this.stop();
    this._listeners = [];
  }

  // ── Signaling event handlers ─────────────────────────────────

  private _setupSignalingListeners(signaling: ReturnType<typeof getSignalingService>): void {
    if (this._unsubSignaling) this._unsubSignaling();

    this._unsubSignaling = signaling.on(async (event) => {
      switch (event.type) {
        case 'connected':
          this._log('SIGNAL', 'connected');
          break;
        case 'peer-joined':
          this._log('SIGNAL', 'peer joined');
          this._emit({ type: 'peerJoined' });
          break;

        case 'peer-left':
          this._log('SIGNAL', 'peer left');
          if (this._state === 'Connected' || this._state === 'Paused') {
            console.log('[ConnectionManager] Peer left — entering Reconnecting');
            this._cleanupWebRTC(); // Force destroy zombie WebRTC connection
            this._transition('Reconnecting');
            // Don't immediately reconnect — wait for peer to rejoin
          }
          break;

        case 'signal':
          await this._handleSignal(event.payload);
          break;

        case 'disconnected':
          this._log('SIGNAL', 'disconnected');
          if (!this._isReconnecting && this._state !== 'Stopped' && this._state !== 'Disconnected') {
            this._log('SIGNAL', `reconnect attempt ${this._reconnectAttempts + 1}`);
            this._transition('Reconnecting');
            this._scheduleReconnect();
          }
          break;

        case 'error':
          this._log('SIGNAL', `error: ${event.message}`);
          this._emit({ type: 'error', error: event.message ?? 'Signaling error' });
          break;
      }
    });
  }

  /** Handle incoming WebRTC signals from peer */
  private async _handleSignal(payload: unknown): Promise<void> {
    if (!payload || typeof payload !== 'object') return;

    const signal = payload as { type: string; sdp?: string; candidate?: RTCIceCandidateInit };
    
    if (this._role === 'studio') {
      this._log('SIGNAL', `Received WebRTC signal of type: ${signal.type}`);
    }

    try {
      if (signal.type === 'offer' && this._role === 'studio') {
        this._log('WEBRTC', `Offer received.`);
        console.log('[STUDIO DEBUG] Studio received offer');

        // Always create a fresh RTCPeerConnection if the current one is failed, disconnected, or closed.
        const currentPcState = this._webrtc.peerConnection?.connectionState;
        if (!currentPcState || currentPcState === 'failed' || currentPcState === 'disconnected' || currentPcState === 'closed' || currentPcState === 'new') {
           this._log('WEBRTC', `Studio recreating peer connection (old state: ${currentPcState})`);
           console.log('[STUDIO DEBUG] Studio recreated peer connection');
           this._initWebRTC(); // Close and dispose the old connection first, create a new one
        }

        const answer = await this._webrtc.receiveOffer(signal as RTCSessionDescriptionInit);
        this._log('WEBRTC', `Answer created successfully. Sending to peer.`);
        console.log('[STUDIO DEBUG] Studio sent answer');
        getSignalingService().sendSignal(answer);

      } else if (signal.type === 'answer' && this._role === 'broadcaster') {
        console.log('[BROADCASTER DEBUG] Broadcaster received answer');
        await this._webrtc.setRemoteAnswer(signal as RTCSessionDescriptionInit);

      } else if (signal.type === 'ice-candidate' && signal.candidate) {
        if (this._role === 'studio') this._log('ICE', `Received remote ICE candidate`);
        await this._webrtc.addIceCandidate(signal.candidate as RTCIceCandidateInit);

      } else if (signal.type === 'ice-restart-offer' && this._role === 'studio') {
        this._log('WEBRTC', `ICE Restart Offer received.`);
        // ICE restart from broadcaster
        const answer = await this._webrtc.receiveOffer(signal as RTCSessionDescriptionInit);
        this._log('WEBRTC', `ICE Restart Answer created successfully. Sending to peer.`);
        getSignalingService().sendSignal(answer);
      }
    } catch (err) {
      if (this._role === 'studio') this._log('ERROR', `Signal handling failed: ${err}`);
      console.error('[ConnectionManager] Signal handling error:', err);
      this._emit({ type: 'error', error: `WebRTC error: ${String(err)}` });
    }
  }

  // ── WebRTC setup ─────────────────────────────────────────────

  private _initWebRTC(): void {
    this._webrtc.close();
    this._webrtc.init();

    if (this._unsubWebRTC) this._unsubWebRTC();

    this._unsubWebRTC = this._webrtc.on((event) => {
      switch (event.type) {
        case 'iceCandidate':
          if (event.candidate) {
            getSignalingService().sendSignal({
              type: 'ice-candidate',
              candidate: event.candidate,
            });
          }
          break;

        case 'remoteStream':
          if (event.stream) {
            this._remoteStream = event.stream;
            this._emit({ type: 'remoteStream', stream: event.stream });
            this._transition('Connected');
          }
          break;

        case 'iceStateChange':
          this._log('ICE', `iceConnectionState -> ${event.iceState}`);
          this._handleIceStateChange(event.iceState!);
          break;

        case 'connectionChange':
          this._log('WEBRTC', `connectionState -> ${event.connectionState}`);
          this._handleConnectionStateChange(event.connectionState!);
          break;

        case 'metricsUpdate':
          if (event.metrics) {
            this._emit({ type: 'metricsUpdate', metrics: event.metrics });
          }
          break;

        case 'error':
          this._emit({ type: 'error', error: event.error });
          break;
      }
    });
  }

  private async _startWebRTCBroadcaster(): Promise<void> {
    console.log('[LIFECYCLE] ConnectionManager: starting WebRTC broadcaster');
    if (!this._localStream) {
      console.error('[LIFECYCLE] ConnectionManager: local stream is null!');
      this._emit({ type: 'error', error: 'No local stream available' });
      return;
    }

    this._initWebRTC();
    this._webrtc.addLocalStream(this._localStream);
    console.log('[LIFECYCLE] ConnectionManager: local stream attached to WebRTC');

    try {
      const offer = await this._webrtc.createOffer();
      console.log('[LIFECYCLE] ConnectionManager: WebRTC offer created successfully');
      getSignalingService().sendSignal(offer);
    } catch (err) {
      console.error('[LIFECYCLE] ConnectionManager: failed to create WebRTC offer', err);
      this._emit({ type: 'error', error: `Failed to create offer: ${String(err)}` });
      this._transition('Reconnecting');
      this._scheduleReconnect();
    }
  }

  private _handleIceStateChange(state: RTCIceConnectionState): void {
    console.debug('[ConnectionManager] ICE state:', state);

    switch (state) {
      case 'connected':
      case 'completed':
        if (this._role === 'broadcaster') {
          // Broadcaster is connected when ICE succeeds (studio connected via remoteStream)
          this._transition('Connected');
        }
        this._reconnectAttempts = 0;
        this._isReconnecting = false;
        break;

      case 'failed':
        console.warn('[ConnectionManager] ICE failed — attempting ICE restart');
        this._handleIceFailed();
        break;

      case 'disconnected':
        // Transient — give it a moment before acting
        setTimeout(() => {
          if (this._webrtc.iceConnectionState === 'disconnected') {
            this._transition('Reconnecting');
            this._handleIceFailed();
          }
        }, 3000);
        break;

      case 'closed':
        if (this._state !== 'Stopped') {
          this._transition('Reconnecting');
          this._scheduleReconnect();
        }
        break;
    }
  }

  private _handleConnectionStateChange(state: RTCPeerConnectionState): void {
    console.debug('[ConnectionManager] Connection state:', state);
    if (state === 'failed') {
      this._transition('Reconnecting');
      this._handleIceFailed();
    } else if (state === 'connected') {
      console.log('[DEBUG] Connection connected');
      this._isReconnecting = false;
      this._reconnectAttempts = 0;
      this._transition('Connected');
    }
  }

  private async _handleIceFailed(): Promise<void> {
    if (this._role === 'broadcaster') {
      console.log('[BROADCASTER DEBUG] Broadcaster ICE/Connection failed. Creating fresh RTCPeerConnection and sending new offer.');
      
      this._initWebRTC(); // Close the old RTCPeerConnection and Create a fresh RTCPeerConnection
      
      // Reattach the existing local media tracks
      if (this._localStream) {
        this._webrtc.addLocalStream(this._localStream);
      }
      
      // Generate and send a new offer
      try {
        const offer = await this._webrtc.createOffer();
        getSignalingService().sendSignal(offer);
        this._transition('Reconnecting');
        return;
      } catch (err) {
        console.error('Failed to create fresh offer for reconnect', err);
      }
    }
    // Fall back to full reconnect
    this._scheduleReconnect();
  }

  // ── Reconnection ─────────────────────────────────────────────

  private _scheduleReconnect(): void {
    if (this._state === 'Stopped') return;
    if (this._reconnectAttempts >= RECONNECT_CONFIG.maxAttempts) {
      this._emit({ type: 'error', error: 'Unable to reconnect after multiple attempts. Please restart.' });
      this._transition('Disconnected');
      return;
    }

    const delay = Math.min(
      RECONNECT_CONFIG.initialDelayMs * Math.pow(RECONNECT_CONFIG.backoffFactor, this._reconnectAttempts),
      RECONNECT_CONFIG.maxDelayMs
    );

    this._reconnectAttempts++;
    this._isReconnecting = true;
    this._transition('Reconnecting');

    console.log(`[ConnectionManager] Reconnecting in ${Math.round(delay)}ms (attempt ${this._reconnectAttempts})`);

    this._reconnectTimer = setTimeout(async () => {
      if (this._state === 'Stopped') return;

      try {
        const signaling = getSignalingService();
        const code = this._sessionCode;
        const role = this._role;

        if (!code || !role) {
          this._transition('Disconnected');
          return;
        }

        // Reconnect WebSocket if needed
        if (!signaling.isConnected) {
          await signaling.connect();
          await signaling.rejoinSession(code, role);
        }

        // Broadcaster re-initiates WebRTC offer
        if (role === 'broadcaster') {
          await this._startWebRTCBroadcaster();
        }
        // Studio waits for new offer from broadcaster
      } catch (err) {
        console.error('[ConnectionManager] Reconnect attempt failed:', err);
        this._scheduleReconnect();
      }
    }, delay);
  }

  // ── Cleanup helpers ──────────────────────────────────────────

  private _cleanupWebRTC(): void {
    console.log('[LIFECYCLE] ConnectionManager: cleaning up WebRTC service');
    if (this._unsubWebRTC) {
      this._unsubWebRTC();
      this._unsubWebRTC = null;
    }
    this._webrtc.close();
    this._webrtc = new WebRTCService(); // Guarantee fresh instance for next time
    this._remoteStream = null;
  }

  private _cleanupSignaling(): void {
    console.log('[LIFECYCLE] ConnectionManager: cleaning up signaling service');
    if (this._unsubSignaling) {
      this._unsubSignaling();
      this._unsubSignaling = null;
    }
    resetSignalingService();
  }

  private _stopLocalStream(): void {
    if (this._localStream) {
      console.log(`[LIFECYCLE] ConnectionManager: stopping local stream tracks (${this._localStream.getTracks().length})`);
      this._localStream.getTracks().forEach(t => t.stop());
      this._localStream = null;
    } else {
      console.log('[LIFECYCLE] ConnectionManager: _stopLocalStream called but stream was already null');
    }
  }

  private _clearReconnectTimer(): void {
    if (this._reconnectTimer !== null) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  private _transition(next: AppState): void {
    if (this._state === next) return;
    console.debug(`[ConnectionManager] ${this._state} → ${next}`);
    this._state = next;
    this._emit({ type: 'stateChange', state: next });
  }

  private _emit(event: ConnectionEvent): void {
    this._listeners.forEach(l => l(event));
  }

  private _mediaErrorMessage(err: unknown): string {
    if (err instanceof DOMException) {
      if (err.name === 'NotAllowedError') return 'Camera permission denied. Please allow camera access in your browser settings.';
      if (err.name === 'NotFoundError') return 'No camera found. Please connect a camera and try again.';
      if (err.name === 'NotReadableError') return 'Camera is in use by another application.';
      return err.message;
    }
    return 'Failed to access camera.';
  }
}

// ── Singleton ─────────────────────────────────────────────────

let _instance: ConnectionManager | null = null;

export function getConnectionManager(): ConnectionManager {
  if (!_instance) _instance = new ConnectionManager();
  return _instance;
}

export function resetConnectionManager(): void {
  if (_instance) {
    _instance.destroy();
    _instance = null;
  }
}
