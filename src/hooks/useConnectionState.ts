/**
 * useConnectionState
 *
 * Subscribes to ConnectionManager state changes and exposes
 * helper booleans for common UI conditions.
 */

import { useEffect, useState } from 'react';
import { getConnectionManager } from '../services/ConnectionManager';
import type { AppState } from '../types/broadcast';

export interface UseConnectionStateResult {
  state: AppState;
  isConnected: boolean;
  isConnecting: boolean;
  isReconnecting: boolean;
  isPaused: boolean;
  isStopped: boolean;
  isDisconnected: boolean;
  isLive: boolean; // connected and not paused
}

export function useConnectionState(): UseConnectionStateResult {
  const manager = getConnectionManager();
  const [state, setState] = useState<AppState>(manager.state);

  useEffect(() => {
    const unsub = manager.on((event) => {
      if (event.type === 'stateChange' && event.state) {
        setState(event.state);
      }
    });
    return unsub;
  }, [manager]);

  return {
    state,
    isConnected: state === 'Connected',
    isConnecting: state === 'Connecting',
    isReconnecting: state === 'Reconnecting',
    isPaused: state === 'Paused',
    isStopped: state === 'Stopped',
    isDisconnected: state === 'Disconnected',
    isLive: state === 'Connected',
  };
}
