/**
 * BroadcastContext
 *
 * Global application state powered by React Context + useReducer.
 * Bridges ConnectionManager (framework-agnostic service) into React.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from 'react';
import { getConnectionManager, resetConnectionManager } from '../services/ConnectionManager';
import { loadAsset } from '../utils/db';
import type { AppMode, AppState, OverlayConfig, SessionMeta, SceneType, WebRTCMetrics } from '../types/broadcast';

// ── State & Actions ───────────────────────────────────────────

interface BroadcastState {
  mode: AppMode | null;
  connectionState: AppState;
  selectedCameraId: string | null;
  selectedMicId: string | null;
  sessionMeta: SessionMeta;
  overlayConfig: OverlayConfig;
  errorMessage: string | null;
  sessionCode: string | null;
  remoteStream: MediaStream | null;
  peerJoined: boolean;
  activeScene: SceneType;
  metrics: WebRTCMetrics | null;
  pauseBgUrl: string | null;
}

type BroadcastAction =
  | { type: 'SET_MODE'; mode: AppMode }
  | { type: 'SET_CONNECTION_STATE'; state: AppState }
  | { type: 'SET_CAMERA'; deviceId: string | null }
  | { type: 'SET_MIC'; deviceId: string | null }
  | { type: 'SET_SESSION_META'; meta: Partial<SessionMeta> }
  | { type: 'SET_OVERLAY_CONFIG'; config: Partial<OverlayConfig> }
  | { type: 'SET_ERROR'; message: string | null }
  | { type: 'SET_SESSION_CODE'; code: string | null }
  | { type: 'SET_REMOTE_STREAM'; stream: MediaStream | null }
  | { type: 'SET_PEER_JOINED'; joined: boolean }
  | { type: 'SET_SCENE'; scene: SceneType }
  | { type: 'SET_METRICS'; metrics: WebRTCMetrics | null }
  | { type: 'SET_PAUSE_BG'; url: string | null }
  | { type: 'RESET' };

const DEFAULT_SESSION_META: SessionMeta = {
  skierName: '',
  clubName: '',
  className: '',
  eventName: '',
};

const DEFAULT_OVERLAY_CONFIG: OverlayConfig = {
  showSkierName: false,
  showClubInfo: false,
  showPauseScreen: false,
  pauseMessage: 'Connection Lost',
  customText: '',
};

const INITIAL_STATE: BroadcastState = {
  mode: null,
  connectionState: 'Disconnected',
  selectedCameraId: null,
  selectedMicId: null,
  sessionMeta: DEFAULT_SESSION_META,
  overlayConfig: DEFAULT_OVERLAY_CONFIG,
  errorMessage: null,
  sessionCode: null,
  remoteStream: null,
  peerJoined: false,
  activeScene: 'live',
  metrics: null,
  pauseBgUrl: null,
};

function broadcastReducer(state: BroadcastState, action: BroadcastAction): BroadcastState {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, mode: action.mode };
    case 'SET_CONNECTION_STATE':
      return { ...state, connectionState: action.state, errorMessage: null };
    case 'SET_CAMERA':
      return { ...state, selectedCameraId: action.deviceId };
    case 'SET_MIC':
      return { ...state, selectedMicId: action.deviceId };
    case 'SET_SESSION_META':
      return { ...state, sessionMeta: { ...state.sessionMeta, ...action.meta } };
    case 'SET_OVERLAY_CONFIG':
      return { ...state, overlayConfig: { ...state.overlayConfig, ...action.config } };
    case 'SET_ERROR':
      return { ...state, errorMessage: action.message };
    case 'SET_SESSION_CODE':
      return { ...state, sessionCode: action.code };
    case 'SET_REMOTE_STREAM':
      return { ...state, remoteStream: action.stream };
    case 'SET_PEER_JOINED':
      return { ...state, peerJoined: action.joined };
    case 'SET_SCENE':
      return { ...state, activeScene: action.scene };
    case 'SET_METRICS':
      return { ...state, metrics: action.metrics };
    case 'SET_PAUSE_BG':
      return { ...state, pauseBgUrl: action.url };
    case 'RESET':
      return { ...INITIAL_STATE };
  }
}

// ── Context ───────────────────────────────────────────────────

interface BroadcastContextValue {
  state: BroadcastState;
  // Mode
  selectMode: (mode: AppMode) => void;
  // Camera
  setCamera: (deviceId: string | null) => void;
  setMic: (deviceId: string | null) => void;
  // Connection actions
  startCamera: () => Promise<void>;
  createSession: (role?: 'broadcaster' | 'studio') => Promise<string>;
  joinSession: (code: string, role?: 'broadcaster' | 'studio') => Promise<void>;
  stopBroadcast: () => void;
  pauseBroadcast: () => void;
  resumeBroadcast: () => void;
  // Metadata
  updateSessionMeta: (meta: Partial<SessionMeta>) => void;
  updateOverlayConfig: (config: Partial<OverlayConfig>) => void;
  setScene: (scene: SceneType) => void;
  updatePauseBg: (url: string | null) => void;
  // Reset
  resetSession: () => void;
}

const BroadcastContext = createContext<BroadcastContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────

export function BroadcastProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(broadcastReducer, INITIAL_STATE);
  const manager = useMemo(() => getConnectionManager(), []);

  // Load assets from IndexedDB
  useEffect(() => {
    async function load() {
      try {
        const bgData = await loadAsset('pause-bg');
        if (bgData instanceof Blob) {
          const url = URL.createObjectURL(bgData);
          dispatch({ type: 'SET_PAUSE_BG', url });
        }
      } catch (err) {
        console.warn('Failed to load pause bg', err);
      }
    }
    load();
  }, []);

  // Sync ConnectionManager events into React state
  useEffect(() => {
    const unsubscribe = manager.on((event) => {
      switch (event.type) {
        case 'stateChange':
          if (event.state) dispatch({ type: 'SET_CONNECTION_STATE', state: event.state });
          break;
        case 'sessionCode':
          if (event.sessionCode) dispatch({ type: 'SET_SESSION_CODE', code: event.sessionCode });
          break;
        case 'remoteStream':
          dispatch({ type: 'SET_REMOTE_STREAM', stream: event.stream ?? null });
          break;
        case 'peerJoined':
          dispatch({ type: 'SET_PEER_JOINED', joined: true });
          break;
        case 'error':
          if (event.error) dispatch({ type: 'SET_ERROR', message: event.error });
          break;
        case 'metricsUpdate':
          if (event.metrics) dispatch({ type: 'SET_METRICS', metrics: event.metrics });
          break;
      }
    });
    return unsubscribe;
  }, [manager]);

  const selectMode = useCallback((mode: AppMode) => {
    dispatch({ type: 'SET_MODE', mode });
  }, []);

  const setCamera = useCallback((deviceId: string | null) => {
    dispatch({ type: 'SET_CAMERA', deviceId });
  }, []);

  const setMic = useCallback((deviceId: string | null) => {
    dispatch({ type: 'SET_MIC', deviceId });
  }, []);

  // Broadcaster: request camera access
  const startCamera = useCallback(async () => {
    dispatch({ type: 'SET_ERROR', message: null });
    await manager.requestMedia(state.selectedCameraId, state.selectedMicId);
  }, [manager, state.selectedCameraId, state.selectedMicId]);

  const createSession = useCallback(async (role: 'broadcaster' | 'studio' = 'studio') => {
    dispatch({ type: 'SET_ERROR', message: null });
    return manager.createSession(role);
  }, [manager]);

  const joinSession = useCallback(async (code: string, role: 'broadcaster' | 'studio' = 'broadcaster') => {
    dispatch({ type: 'SET_ERROR', message: null });
    dispatch({ type: 'SET_SESSION_CODE', code: code.toUpperCase() });
    await manager.joinSession(code, role);
  }, [manager]);

  const stopBroadcast = useCallback(() => {
    manager.stop();
    dispatch({ type: 'SET_SESSION_CODE', code: null });
    dispatch({ type: 'SET_REMOTE_STREAM', stream: null });
    dispatch({ type: 'SET_PEER_JOINED', joined: false });
  }, [manager]);

  const pauseBroadcast = useCallback(() => {
    manager.pause();
  }, [manager]);

  const resumeBroadcast = useCallback(() => {
    manager.resume();
  }, [manager]);

  const updateSessionMeta = useCallback((meta: Partial<SessionMeta>) => {
    dispatch({ type: 'SET_SESSION_META', meta });
  }, []);

  const updateOverlayConfig = useCallback((config: Partial<OverlayConfig>) => {
    dispatch({ type: 'SET_OVERLAY_CONFIG', config });
  }, []);

  const setScene = useCallback((scene: SceneType) => {
    dispatch({ type: 'SET_SCENE', scene });
  }, []);

  const updatePauseBg = useCallback((url: string | null) => {
    dispatch({ type: 'SET_PAUSE_BG', url });
  }, []);

  const resetSession = useCallback(() => {
    resetConnectionManager();
    dispatch({ type: 'RESET' });
  }, []);

  const value: BroadcastContextValue = {
    state,
    selectMode,
    setCamera,
    setMic,
    startCamera,
    createSession,
    joinSession,
    stopBroadcast,
    pauseBroadcast,
    resumeBroadcast,
    updateSessionMeta,
    updateOverlayConfig,
    setScene,
    updatePauseBg,
    resetSession,
  };

  return (
    <BroadcastContext.Provider value={value}>{children}</BroadcastContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────

export function useBroadcast(): BroadcastContextValue {
  const ctx = useContext(BroadcastContext);
  if (!ctx) {
    throw new Error('useBroadcast must be used inside <BroadcastProvider>');
  }
  return ctx;
}
