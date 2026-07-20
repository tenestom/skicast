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
export type AppState =
  | 'Disconnected'
  | 'WaitingForCamera'
  | 'Connecting'
  | 'Connected'
  | 'Reconnecting'
  | 'Paused'
  | 'Stopped';

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
  connectionState: AppState;
  sessionMeta: SessionMeta;
  overlayConfig: OverlayConfig;
  selectedCameraId: string | null;
  selectedMicId: string | null;
  errorMessage: string | null;
  /** Session code for this broadcast (shown to broadcaster, entered by studio) */
  sessionCode: string | null;
  /** Remote video stream (available in Studio mode when connected) */
  remoteStream: MediaStream | null;
}
