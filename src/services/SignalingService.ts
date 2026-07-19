/**
 * SignalingService — WebSocket-based signaling abstraction.
 *
 * Phase 1A: Stub only. All methods are no-ops.
 *           Real implementation (Phase 1B) will open a WebSocket,
 *           exchange SDP offers/answers, and relay ICE candidates.
 *
 * Keeping this separate from ConnectionManager ensures that the
 * signaling transport can be swapped (e.g., Socket.io, Firebase)
 * without touching peer connection logic.
 */

import type { SignalingMessage } from '../types/webrtc';

type MessageHandler = (msg: SignalingMessage) => void;

export class SignalingService {
  private _socket: WebSocket | null = null;
  private _handlers: MessageHandler[] = [];
  private _connected = false;

  get isConnected(): boolean {
    return this._connected;
  }

  /**
   * Connect to the signaling server.
   * TODO Phase 1B: Implement WebSocket connection.
   */
  async connect(serverUrl: string, _sessionId: string): Promise<void> {
    console.debug('[SignalingService] connect() called — stub (Phase 1A)', { serverUrl });
    // Phase 1B: this._socket = new WebSocket(serverUrl);
    // Phase 1B: await waitForOpen(this._socket);
    this._connected = false; // stays false until real implementation
  }

  /** Send a signaling message to the server */
  send(message: Omit<SignalingMessage, 'timestamp'>): void {
    if (!this._socket || !this._connected) {
      console.debug('[SignalingService] send() called — stub (Phase 1A)', message);
      return;
    }
    const fullMessage: SignalingMessage = { ...message, timestamp: Date.now() };
    this._socket.send(JSON.stringify(fullMessage));
  }

  /** Subscribe to incoming signaling messages */
  onMessage(handler: MessageHandler): () => void {
    this._handlers.push(handler);
    return () => {
      this._handlers = this._handlers.filter((h) => h !== handler);
    };
  }

  /** Cleanly close the signaling connection */
  disconnect(): void {
    if (this._socket) {
      this._socket.close();
      this._socket = null;
    }
    this._connected = false;
    console.debug('[SignalingService] disconnected');
  }

  /** @internal Phase 1B: call this from WebSocket onmessage handler */
  protected _handleMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw) as SignalingMessage;
      this._handlers.forEach((h) => h(msg));
    } catch {
      console.error('[SignalingService] Failed to parse message', raw);
    }
  }
}

let _instance: SignalingService | null = null;

export function getSignalingService(): SignalingService {
  if (!_instance) {
    _instance = new SignalingService();
  }
  return _instance;
}
