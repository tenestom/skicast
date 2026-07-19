/**
 * StatusBadge — Displays the current connection state with a colored indicator.
 * Always visible so the operator knows the system status at a glance.
 */

import type { AppState } from '../../types/broadcast';
import './StatusBadge.css';

interface StatusBadgeProps {
  state: AppState;
  className?: string;
}

const STATE_LABELS: Record<AppState, string> = {
  Disconnected: 'Offline',
  WaitingForCamera: 'Camera…',
  Connecting: 'Connecting',
  Connected: 'LIVE',
  Reconnecting: 'Reconnecting',
  Paused: 'Paused',
  Stopped: 'Stopped',
};

const STATE_VARIANTS: Record<AppState, string> = {
  Disconnected: 'disconnected',
  WaitingForCamera: 'waiting',
  Connecting: 'connecting',
  Connected: 'live',
  Reconnecting: 'reconnecting',
  Paused: 'paused',
  Stopped: 'stopped',
};

export function StatusBadge({ state, className = '' }: StatusBadgeProps) {
  const variant = STATE_VARIANTS[state];
  const label = STATE_LABELS[state];
  const isPulsing = state === 'Connected' || state === 'Reconnecting' || state === 'Connecting';

  return (
    <div className={`status-badge status-badge--${variant} ${className}`} role="status" aria-live="polite">
      <span className={`status-badge__dot ${isPulsing ? 'status-badge__dot--pulse' : ''}`} />
      <span className="status-badge__label">{label}</span>
    </div>
  );
}
