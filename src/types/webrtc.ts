/**
 * WebRTC-related types.
 * Kept separate so future WebRTC implementation can extend without
 * touching broadcast.ts.
 */

/** ICE connection state mapped to our internal AppState */
export type IceConnectionState =
  | 'new'
  | 'checking'
  | 'connected'
  | 'completed'
  | 'failed'
  | 'disconnected'
  | 'closed';

/** Signaling message types for WebSocket exchange */
export type SignalingMessageType =
  | 'offer'
  | 'answer'
  | 'ice-candidate'
  | 'join'
  | 'leave'
  | 'ping'
  | 'pong'
  | 'error';

export interface SignalingMessage {
  type: SignalingMessageType;
  sessionId: string;
  payload: unknown;
  timestamp: number;
}

/** Connection quality metrics (populated once WebRTC is active) */
export interface ConnectionMetrics {
  bitrate: number | null;       // kbps
  packetLoss: number | null;    // 0–1
  roundTripTime: number | null; // ms
  framesPerSecond: number | null;
}

/** STUN/TURN configuration */
export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** Full WebRTC peer connection configuration */
export interface WebRTCConfig {
  iceServers: IceServerConfig[];
  reconnectDelayMs: number;
  maxReconnectAttempts: number;
}

export const DEFAULT_WEBRTC_CONFIG: WebRTCConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
  reconnectDelayMs: 2000,
  maxReconnectAttempts: 10,
};
