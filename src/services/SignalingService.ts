/**
 * SignalingService
 *
 * Supabase Realtime implementation for SkiCast signaling.
 * Handles:
 *   - Session creation (studio) with collision detection
 *   - Session joining (broadcaster)
 *   - Relaying WebRTC signals (offer, answer, ICE candidates) via Broadcast
 *   - Peer presence detection via Supabase Presence
 *   - Application-level heartbeat (ping/pong) and reconnect logic
 */

import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, RECONNECT_CONFIG } from '../config/webrtc';

// ── Types ─────────────────────────────────────────────────────

export type SignalingRole = 'broadcaster' | 'studio';

export type SignalingEventType =
  | 'connected'
  | 'disconnected'
  | 'session-created'
  | 'session-joined'
  | 'session-rejoined'
  | 'peer-joined'
  | 'peer-left'
  | 'signal'
  | 'error';

export interface SignalingEvent {
  type: SignalingEventType;
  code?: string;
  role?: SignalingRole;
  payload?: unknown;
  message?: string;
}

type SignalingListener = (event: SignalingEvent) => void;

// Initialize Supabase Client
// We only initialize if the URL is provided to prevent crashes if missing
const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// ── Service ───────────────────────────────────────────────────

export class SignalingService {
  private _channel: RealtimeChannel | null = null;
  private _listeners: SignalingListener[] = [];
  
  private _sessionCode: string | null = null;
  private _role: SignalingRole | null = null;
  
  private _connected = false;
  private _peerPresent = false;
  
  private _intentionalClose = false;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _reconnectAttempts = 0;
  
  private _pingTimer: ReturnType<typeof setInterval> | null = null;
  private _isAlive = true;

  // ── Public API ──────────────────────────────────────────────

  get isConnected(): boolean {
    return this._connected;
  }

  get sessionCode(): string | null {
    return this._sessionCode;
  }

  on(listener: SignalingListener): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter(l => l !== listener);
    };
  }

  connect(): Promise<void> {
    if (!supabase) {
      return Promise.reject(
        new Error(
          'Supabase not configured. ' +
          'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel.'
        )
      );
    }

    // Supabase client manages its own global connection socket.
    // For API compatibility, we just resolve immediately and set connected.
    this._intentionalClose = false;
    this._connected = true;
    this._emit({ type: 'connected' });
    return Promise.resolve();
  }

  createSession(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!supabase) return reject(new Error('Supabase not configured'));

      const timeout = setTimeout(() => reject(new Error('Session creation timeout')), 10_000);

      const attemptCreate = () => {
        const code = this._generateCode();
        // Use presence to verify collision, allow broadcast for signaling
        const channel = supabase.channel(`skicast-${code}`, {
          config: { presence: { key: 'studio' }, broadcast: { self: false } }
        });

        channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            const state = channel.presenceState();
            // Verify session is truly empty
            if (Object.keys(state).length > 0) {
              console.warn(`[Signaling] Code collision for ${code}, retrying...`);
              channel.unsubscribe();
              attemptCreate();
              return;
            }

            clearTimeout(timeout);
            this._channel = channel;
            this._sessionCode = code;
            this._role = 'studio';
            this._reconnectAttempts = 0;
            
            this._setupChannelListeners(channel);
            await channel.track({ role: 'studio' });
            
            this._startHeartbeat();
            this._emit({ type: 'session-created', code });
            resolve(code);
            
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            clearTimeout(timeout);
            reject(new Error(`Failed to create session: ${status}`));
          }
        });
      };

      attemptCreate();
    });
  }

  joinSession(code: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!supabase) return reject(new Error('Supabase not configured'));

      const timeout = setTimeout(() => reject(new Error('Join timeout — check the session code')), 10_000);
      const upperCode = code.toUpperCase();

      const channel = supabase.channel(`skicast-${upperCode}`, {
        config: { presence: { key: 'broadcaster' }, broadcast: { self: false } }
      });

      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          this._channel = channel;
          this._sessionCode = upperCode;
          this._role = 'broadcaster';
          this._reconnectAttempts = 0;
          
          this._setupChannelListeners(channel);
          await channel.track({ role: 'broadcaster' });
          
          this._startHeartbeat();
          this._emit({ type: 'session-joined', code: upperCode });
          resolve();
          
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout);
          reject(new Error(`Failed to join session: ${status}`));
        }
      });
    });
  }

  rejoinSession(code: string, role: SignalingRole): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!supabase) return reject(new Error('Supabase not configured'));

      const timeout = setTimeout(() => reject(new Error('Rejoin timeout')), 10_000);
      const upperCode = code.toUpperCase();

      const channel = supabase.channel(`skicast-${upperCode}`, {
        config: { presence: { key: role }, broadcast: { self: false } }
      });

      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          this._channel = channel;
          this._sessionCode = upperCode;
          this._role = role;
          
          this._setupChannelListeners(channel);
          await channel.track({ role });
          
          this._startHeartbeat();
          this._emit({ type: 'session-rejoined', code: upperCode });
          resolve();
          
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout);
          reject(new Error(`Failed to rejoin session: ${status}`));
        }
      });
    });
  }

  sendSignal(payload: unknown): void {
    if (this._channel) {
      this._channel.send({
        type: 'broadcast',
        event: 'signal',
        payload
      });
    }
  }

  disconnect(): void {
    this._intentionalClose = true;
    this._clearTimers();
    this._connected = false;
    this._peerPresent = false;
    if (this._channel) {
      this._channel.unsubscribe();
      this._channel = null;
    }
  }

  // ── Private ─────────────────────────────────────────────────

  private _setupChannelListeners(channel: RealtimeChannel): void {
    // 1. WebRTC Signals
    channel.on('broadcast', { event: 'signal' }, (payload) => {
      this._emit({ type: 'signal', payload: payload.payload });
    });

    // 2. Application-level Heartbeat
    channel.on('broadcast', { event: 'ping' }, () => {
      channel.send({ type: 'broadcast', event: 'pong', payload: {} });
    });
    
    channel.on('broadcast', { event: 'pong' }, () => {
      this._isAlive = true;
    });

    // 3. Peer Presence
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const peerRole = this._role === 'studio' ? 'broadcaster' : 'studio';
      let isPeerThere = false;

      // Supabase groups presences by the key we provided in config
      if (state[peerRole] && state[peerRole].length > 0) {
        isPeerThere = true;
      }

      if (isPeerThere && !this._peerPresent) {
        this._peerPresent = true;
        this._emit({ type: 'peer-joined', role: peerRole });
      } else if (!isPeerThere && this._peerPresent) {
        this._peerPresent = false;
        this._emit({ type: 'peer-left', role: peerRole });
      }
    });
  }

  private _generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  private _startHeartbeat(): void {
    this._clearTimers();
    this._isAlive = true;

    this._pingTimer = setInterval(() => {
      // If we didn't receive a pong since the last ping, assume connection is dead
      if (!this._isAlive) {
        console.warn('[SignalingService] Connection dead (heartbeat timeout)');
        this._handleDisconnect();
        return;
      }
      this._isAlive = false;
      if (this._channel) {
        this._channel.send({ type: 'broadcast', event: 'ping', payload: {} });
      }
    }, 15_000); // 15s interval
  }

  private _handleDisconnect(): void {
    this._clearTimers();
    this._connected = false;
    this._peerPresent = false;
    
    if (this._channel) {
      this._channel.unsubscribe();
      this._channel = null;
    }

    this._emit({ type: 'disconnected' });

    if (!this._intentionalClose) {
      this._scheduleReconnect();
    }
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

    this._reconnectTimer = setTimeout(() => {
      // Re-establish connection using application-level logic
      this.connect().then(() => {
        if (this._sessionCode && this._role) {
          this.rejoinSession(this._sessionCode, this._role).catch(err => {
            console.error('[SignalingService] Rejoin failed:', err);
            this._handleDisconnect(); // Loop back into exponential backoff
          });
        }
      });
    }, delay);
  }

  private _clearTimers(): void {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  private _emit(event: SignalingEvent): void {
    this._listeners.forEach(l => l(event));
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
