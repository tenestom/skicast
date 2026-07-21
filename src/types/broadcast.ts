/**
 * Application connection / session states.
 * These form the state machine that drives all UI feedback.
 *
 * Transitions:
 *  Disconnected → WaitingForCamera → Connecting → Connected
 *  Connected     → Reconnecting → Connected (auto)
 *  Connected     → Paused → Connected
 *  Any           → Stopped
 *  Any           → Disconnected (manual disconnect / error)
 */
export type ConnectionState = 'Disconnected' | 'Connecting' | 'Reconnecting' | 'Connected' | 'Paused' | 'Stopped';

export type SceneType = 'live' | 'pause' | 'results' | 'sponsor' | 'interview';

export interface WebRTCMetrics {
  bitrateKbps: number;
  fps: number;
  rttMs: number;
  packetLoss: number;
  resolution: string;
  codec: string;
  durationSeconds: number;
}

/** The operational mode chosen on the landing page */
export type AppMode = 'broadcaster' | 'studio';

/** Camera / microphone device info */
export interface MediaDeviceOption {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

/** Broadcast session metadata shown in overlays */
export interface SessionMeta {
  skierName: string;
  clubName: string;
  className: string;
  eventName: string;
}

/** Overlay configuration for the studio */
export interface OverlayConfig {
  showSkierName: boolean;
  showClubInfo: boolean;
  showPauseScreen: boolean;
  pauseMessage: string;
  customText: string;
}

/** Overall application state shape */
export interface AppStateShape {
  mode: AppMode | null;
  connectionState: ConnectionState;
  sessionCode: string | null;
  errorMessage: string | null;
  peerJoined: boolean;

  // Media & Production
  selectedCameraId: string | null;
  selectedMicId: string | null;
  remoteStream: MediaStream | null;
  
  // Production Scene Management
  activeScene: SceneType;
  
  // Configuration
  sessionMeta: SessionMeta;
  overlayConfig: OverlayConfig;

  // Statistics
  metrics: WebRTCMetrics | null;
}

export type BroadcastAction =
  | { type: 'SET_CONNECTION_STATE'; state: ConnectionState }
  | { type: 'SET_SESSION_CODE'; code: string | null }
  | { type: 'SET_ERROR'; message: string | null }
  | { type: 'SET_PEER_JOINED'; joined: boolean }
  | { type: 'SET_CAMERA'; id: string | null }
  | { type: 'SET_MIC'; id: string | null }
  | { type: 'SET_REMOTE_STREAM'; stream: MediaStream | null }
  | { type: 'SET_META'; meta: Partial<SessionMeta> }
  | { type: 'SET_OVERLAY'; config: Partial<OverlayConfig> }
  | { type: 'SET_SCENE'; scene: SceneType }
  | { type: 'SET_METRICS'; metrics: WebRTCMetrics | null };
