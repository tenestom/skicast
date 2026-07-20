/**
 * WebRTC ICE Configuration
 *
 * Centralized ICE server config for easy TURN addition in Phase 2.
 *
 * IMPORTANT — Network notes:
 *   STUN-only works for ~80% of connections (symmetric NAT fails).
 *   Mobile 5G networks with carrier-grade NAT (CGNAT) may fail without TURN.
 *   When video fails to connect on 5G → add TURN server credentials here.
 *
 * Adding TURN (Phase 2 / when needed):
 *   1. Provision a TURN server (Twilio, Metered.ca free tier, or self-hosted coturn)
 *   2. Add to TURN_SERVERS array below
 *   3. Set VITE_TURN_USERNAME and VITE_TURN_CREDENTIAL env vars on Vercel
 *
 * Budget note:
 *   Twilio TURN: ~$0.40/GB
 *   Metered TURN: free tier available (50GB/month)
 *   Self-hosted coturn on Render: free tier (512MB RAM sufficient)
 */

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** Public STUN servers — no auth required, no cost */
const STUN_SERVERS: IceServerConfig[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

/**
 * TURN server configuration.
 * Uncomment and configure when STUN-only proves insufficient on 5G.
 *
 * Set these env vars in Vercel:
 *   VITE_TURN_URL=turns:your-turn-server.example.com:5349
 *   VITE_TURN_USERNAME=your-username
 *   VITE_TURN_CREDENTIAL=your-credential
 */
const TURN_SERVERS: IceServerConfig[] = [];
const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined;
const turnUser = import.meta.env.VITE_TURN_USERNAME as string | undefined;
const turnCred = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined;
if (turnUrl && turnUser && turnCred) {
  TURN_SERVERS.push({ urls: turnUrl, username: turnUser, credential: turnCred });
}

/** Full ICE server list — STUN + optional TURN */
export const ICE_SERVERS: IceServerConfig[] = [...STUN_SERVERS, ...TURN_SERVERS];

/**
 * RTCConfiguration for peer connections.
 * bundlePolicy: 'max-bundle' — one connection for all tracks (less NAT holes needed)
 */
export const RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: ICE_SERVERS,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

/** Signaling server WebSocket URL */
export const SIGNALING_URL: string =
  (import.meta.env.VITE_SIGNALING_URL as string | undefined) ??
  (import.meta.env.DEV ? 'ws://localhost:3001' : '');

/** Reconnect configuration */
export const RECONNECT_CONFIG = {
  /** Initial delay before first reconnect attempt */
  initialDelayMs: 2000,
  /** Exponential backoff multiplier */
  backoffFactor: 1.5,
  /** Maximum delay between attempts */
  maxDelayMs: 30_000,
  /** Total number of reconnect attempts before giving up */
  maxAttempts: 10,
};
