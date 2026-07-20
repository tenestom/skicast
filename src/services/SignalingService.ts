/**
 * SignalingService
 *
 * Real WebSocket client for SkiCast signaling server.
 * Handles:
 *   - Connection and reconnection to the signaling WebSocket
 *   - Session creation (broadcaster) and joining (studio)
 *   - Relaying WebRTC signals (offer, answer, ICE candidates)
 *   - Heartbeat ping/pong to detect dead connections
 *   - Automatic WebSocket reconnection with backoff
 *
 * Does NOT handle RTCPeerConnection — that's WebRTCService's job.
 * Does NOT pass video — only small JSON control messages.
 */

import { RECONNECT_CONFIG, SIGNALING_URL } from '../config/webrtc';

// ── Types ─────────────────────────────────────────────────────

export type SignalingRole = 'broadcaster' | 'studio';

export type SignalingEventType =
  | 'connected'       // WebSocket connected to signaling server
  | 'disconnected'    // WebSocket closed
  | 'session-created' // Server confirmed session creation
  | 'session-joined'  // Server confirmed session join
  | 'session-rejoined'
  | 'peer-joined'     // The other party connected to the session
  | 'peer-left'       // The other party disconnected
  | 'signal'          // WebRTC signal relayed from peer
  | 'error';          // Signaling error

export interface SignalingEvent {
  type: SignalingEventType;
  code?: string;
  role?: SignalingRole;
  payload?: unknown;   // WebRTC offer/answer/ICE
  message?: string;    // Error message
}

type SignalingListener = (event: SignalingEvent) => void;

// ── Service ───────────────────────────────────────────────────

export class SignalingService {
  private _ws: WebSocket | null = null;
  private _listeners: SignalingListener[] = [];
  private _url: string = SIGNALING_URL;
  private _sessionCode: string | null = null;
  private _role: SignalingRole | null = null;
  private _connected = false;
  private _intentionalClose = false;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _reconnectAttempts = 0;
  private _pingTimer: ReturnType<typeof setInterval> | null = null;
  private _connectPromise: Promise<void> | null = null;
  private _connectResolve: (() => void) | null = null;
  private _connectReject: ((err: Error) => void) | null = null;
  /** Timer that fires if WebSocket handshake takes too long */
  private _connectTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  /** True while the initial connect() call is still pending */
  private _initialConnecting = false;

  // ── Public API ──────────────────────────────────────────────

  get isConnected(): boolean {
    return this._connected;
  }

  get sessionCode(): string | null {
    return this._sessionCode;
  }

  /** Subscribe to signaling events */
  on(listener: SignalingListener): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter(l => l !== listener);
    };
  }

  /**
   * Connect to the signaling server.
   * Returns a promise that resolves when WebSocket is open.
   */
  connect(url?: string): Promise<void> {
    if (url) this._url = url;

    if (!this._url) {
      return Promise.reject(
        new Error(
          'Signaling server not configured. ' +
          'Set the VITE_SIGNALING_URL environment variable on Vercel to point to your signaling server.'
        )
      );
    }

    // Already connected
    if (this._connected && this._ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    this._intentionalClose = false;
    this._initialConnecting = true;

    this._connectPromise = new Promise<void>((resolve, reject) => {
      this._connectResolve = resolve;
      this._connectReject = reject;

      // Timeout: if WebSocket hasn't opened in 8 seconds, reject.
      // Browsers can hold connection attempts open for 30–90s on unreachable hosts.
      this._connectTimeoutTimer = setTimeout(() => {
        this._connectTimeoutTimer = null;
        const err = new Error(
          `Cannot reach signaling server at ${this._url}. ` +
          'Make sure the signaling server is running and VITE_SIGNALING_URL is correct.'
        );
        this._connectReject?.(err);
        this._connectResolve = null;
        this._connectReject = null;
        // Close the socket that's still attempting to connect
        if (this._ws) {
          this._intentionalClose = true; // don't trigger reconnect loop
          this._ws.close();
          this._ws = null;
        }
        this._initialConnecting = false;
      }, 8_000);

      this._openSocket();
    });

    return this._connectPromise;
  }

  /**
   * Create a new broadcast session.
   * Returns the 6-character session code.
   * Must call connect() first.
   */
  createSession(): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Session creation timeout')), 10_000);

      const unsub = this.on((event) => {
        if (event.type === 'session-created' && event.code) {
          clearTimeout(timeout);
          unsub();
          this._sessionCode = event.code;
          resolve(event.code);
        } else if (event.type === 'error') {
          clearTimeout(timeout);
          unsub();
          reject(new Error(event.message ?? 'Failed to create session'));
        }
      });

      this._send({ type: 'create-session' });
    });
  }

  /**
   * Join an existing session as studio.
   * Must call connect() first.
   */
  joinSession(code: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Join timeout — check the session code')), 10_000);

      const unsub = this.on((event) => {
        if (event.type === 'session-joined') {
          clearTimeout(timeout);
          unsub();
          this._sessionCode = code.toUpperCase();
          resolve();
        } else if (event.type === 'error') {
          clearTimeout(timeout);
          unsub();
          reject(new Error(event.message ?? 'Failed to join session'));
        }
      });

      this._send({ type: 'join-session', code: code.toUpperCase() });
    });
  }

  /**
   * Rejoin an existing session after reconnection.
   */
  rejoinSession(code: string, role: SignalingRole): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Rejoin timeout')), 10_000);

      const unsub = this.on((event) => {
        if (event.type === 'session-rejoined') {
          clearTimeout(timeout);
          unsub();
          resolve();
        } else if (event.type === 'error') {
          clearTimeout(timeout);
          unsub();
          reject(new Error(event.message ?? 'Failed to rejoin session'));
        }
      });

      this._send({ type: 'rejoin-session', code, role });
    });
  }

  /**
   * Send a WebRTC signal (offer, answer, or ICE candidate) to the peer.
   */
  sendSignal(payload: unknown): void {
    this._send({ type: 'signal', payload });
  }

  /**
   * Cleanly disconnect from the signaling server.
   */
  disconnect(): void {
    this._intentionalClose = true;
    this._clearTimers();
    this._connected = false;
    this._sessionCode = null;
    this._role = null;
    if (this._ws) {
      this._ws.close(1000, 'Client disconnected');
      this._ws = null;
    }
  }

  // ── Private ─────────────────────────────────────────────────

  private _openSocket(): void {
    try {
      this._ws = new WebSocket(this._url);
    } catch (err) {
      this._connectReject?.(new Error(`Cannot connect to signaling server: ${String(err)}`));
      return;
    }

    const ws = this._ws;

    ws.onopen = () => {
      // Cancel the connection timeout — we made it
      if (this._connectTimeoutTimer) {
        clearTimeout(this._connectTimeoutTimer);
        this._connectTimeoutTimer = null;
      }
      this._initialConnecting = false;
      console.debug('[SignalingService] Connected to', this._url);
      this._connected = true;
      this._reconnectAttempts = 0;
      this._startPing();
      this._emit({ type: 'connected' });
      this._connectResolve?.();
      this._connectResolve = null;
      this._connectReject = null;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as { type: string; [key: string]: unknown };
        this._handleMessage(msg);
      } catch {
        console.error('[SignalingService] Bad message:', event.data);
      }
    };

    ws.onclose = (event) => {
      console.debug('[SignalingService] Closed', event.code, event.reason);
      const wasInitialConnect = this._initialConnecting;
      this._initialConnecting = false;
      this._connected = false;
      this._clearPing();
      this._emit({ type: 'disconnected' });

      // Only schedule background reconnect for established connections that drop.
      // Don't loop if the very first connect() attempt failed — the caller already
      // received a rejected promise and will handle the error in the UI.
      if (!this._intentionalClose && !wasInitialConnect) {
        this._scheduleReconnect();
      }
    };

    ws.onerror = () => {
      // Cancel timeout — onerror + onclose will both fire; reject once here.
      if (this._connectTimeoutTimer) {
        clearTimeout(this._connectTimeoutTimer);
        this._connectTimeoutTimer = null;
      }
      // onclose fires right after this — don't reject again there
      const err = new Error(
        `Cannot connect to signaling server (${this._url}). ` +
        'Check that the server is running and VITE_SIGNALING_URL is set correctly.'
      );
      this._connectReject?.(err);
      this._connectResolve = null;
      this._connectReject = null;
    };
  }

  private _handleMessage(msg: { type: string; [key: string]: unknown }): void {
    switch (msg.type) {
      case 'session-created':
        this._emit({ type: 'session-created', code: msg.code as string });
        break;
      case 'session-joined':
        this._emit({ type: 'session-joined', code: msg.code as string });
        break;
      case 'session-rejoined':
        this._emit({ type: 'session-rejoined', code: msg.code as string });
        break;
      case 'peer-joined':
        this._emit({ type: 'peer-joined', role: msg.role as SignalingRole });
        break;
      case 'peer-left':
        this._emit({ type: 'peer-left', role: msg.role as SignalingRole });
        break;
      case 'signal':
        this._emit({ type: 'signal', payload: msg.payload });
        break;
      case 'pong':
        // Heartbeat response — no action needed
        break;
      case 'error':
        this._emit({ type: 'error', message: msg.message as string });
        break;
      default:
        console.warn('[SignalingService] Unknown message type:', msg.type);
    }
  }

  private _send(data: Record<string, unknown>): void {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(data));
    } else {
      console.warn('[SignalingService] Cannot send — not connected', data.type);
    }
  }

  private _emit(event: SignalingEvent): void {
    this._listeners.forEach(l => l(event));
  }

  private _scheduleReconnect(): void {
    if (this._reconnectAttempts >= RECONNECT_CONFIG.maxAttempts) {
      console.warn('[SignalingService] Max reconnect attempts reached');
      this._emit({ type: 'error', message: 'Lost connection to signaling server. Please refresh.' });
      return;
    }

    const delay = Math.min(
      RECONNECT_CONFIG.initialDelayMs * Math.pow(RECONNECT_CONFIG.backoffFactor, this._reconnectAttempts),
      RECONNECT_CONFIG.maxDelayMs
    );

    console.debug(`[SignalingService] Reconnecting in ${Math.round(delay)}ms (attempt ${this._reconnectAttempts + 1})`);
    this._reconnectAttempts++;

    this._reconnectTimer = setTimeout(async () => {
      this._openSocket();
      // If we have a session, rejoin after reconnect
      if (this._sessionCode && this._role) {
        const code = this._sessionCode;
        const role = this._role;
        // Wait for 'connected' then rejoin
        const unsub = this.on((event) => {
          if (event.type === 'connected') {
            unsub();
            this.rejoinSession(code, role).catch(err => {
              console.error('[SignalingService] Rejoin failed:', err);
            });
          }
        });
      }
    }, delay);
  }

  private _startPing(): void {
    this._pingTimer = setInterval(() => {
      this._send({ type: 'ping' });
    }, 25_000); // ping every 25s (server timeout is 60s)
  }

  private _clearPing(): void {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
  }

  private _clearTimers(): void {
    this._clearPing();
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._connectTimeoutTimer) {
      clearTimeout(this._connectTimeoutTimer);
      this._connectTimeoutTimer = null;
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────

let _instance: SignalingService | null = null;

export function getSignalingService(): SignalingService {
  if (!_instance) _instance = new SignalingService();
  return _instance;
}

export function resetSignalingService(): void {
  if (_instance) {
    _instance.disconnect();
    _instance = null;
  }
}
