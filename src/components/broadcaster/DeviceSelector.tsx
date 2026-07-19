/**
 * DeviceSelector — Camera and microphone selection dropdowns.
 */

import type { MediaDeviceOption } from '../../types/broadcast';
import './DeviceSelector.css';

interface DeviceSelectorProps {
  cameras: MediaDeviceOption[];
  microphones: MediaDeviceOption[];
  selectedCameraId: string | null;
  selectedMicId: string | null;
  onCameraChange: (id: string) => void;
  onMicChange: (id: string) => void;
  disabled?: boolean;
}

export function DeviceSelector({
  cameras,
  microphones,
  selectedCameraId,
  selectedMicId,
  onCameraChange,
  onMicChange,
  disabled = false,
}: DeviceSelectorProps) {
  return (
    <div className="device-selector">
      <div className="device-selector__field">
        <label className="device-selector__label" htmlFor="camera-select">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M2 6a2 2 0 012-2h6l2 2h4a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            <path d="M14.5 9.5l3-1.5v5l-3-1.5" />
          </svg>
          Camera
        </label>
        <select
          id="camera-select"
          className="device-selector__select"
          value={selectedCameraId ?? ''}
          onChange={(e) => onCameraChange(e.target.value)}
          disabled={disabled || cameras.length === 0}
        >
          {cameras.length === 0 ? (
            <option value="">No cameras found</option>
          ) : (
            cameras.map((cam) => (
              <option key={cam.deviceId} value={cam.deviceId}>
                {cam.label}
              </option>
            ))
          )}
        </select>
      </div>

      <div className="device-selector__field">
        <label className="device-selector__label" htmlFor="mic-select">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
          </svg>
          Microphone
        </label>
        <select
          id="mic-select"
          className="device-selector__select"
          value={selectedMicId ?? ''}
          onChange={(e) => onMicChange(e.target.value)}
          disabled={disabled || microphones.length === 0}
        >
          {microphones.length === 0 ? (
            <option value="">No microphones found</option>
          ) : (
            microphones.map((mic) => (
              <option key={mic.deviceId} value={mic.deviceId}>
                {mic.label}
              </option>
            ))
          )}
        </select>
      </div>
    </div>
  );
}
