/**
 * OverlayEditor — Production controls for studio overlays.
 * Allows the operator to toggle skier name, club info, and pause screens.
 */

import type { OverlayConfig, SessionMeta } from '../../types/broadcast';
import { useBroadcast } from '../../contexts/BroadcastContext';
import { saveAsset, deleteAsset } from '../../utils/db';
import './OverlayEditor.css';

interface OverlayEditorProps {
  sessionMeta: SessionMeta;
  overlayConfig: OverlayConfig;
  onMetaChange: (meta: Partial<SessionMeta>) => void;
  onOverlayChange: (config: Partial<OverlayConfig>) => void;
  disabled?: boolean;
}

export function OverlayEditor({
  sessionMeta,
  overlayConfig,
  onMetaChange,
  onOverlayChange,
  disabled = false,
}: OverlayEditorProps) {
  const { updatePauseBg, setScene, state: { pauseBgUrl, activeScene } } = useBroadcast();

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await saveAsset('pause-bg', file);
      const url = URL.createObjectURL(file);
      updatePauseBg(url);
    } catch (err) {
      console.error('Failed to save pause bg:', err);
    }
  };

  const handleClearImage = async () => {
    try {
      await deleteAsset('pause-bg');
      if (pauseBgUrl) URL.revokeObjectURL(pauseBgUrl);
      updatePauseBg(null);
    } catch (err) {
      console.error('Failed to delete pause bg:', err);
    }
  };

  return (
    <div className="overlay-editor">
      <h2 className="overlay-editor__title">Production Controls</h2>

      {/* Skier info */}
      <section className="overlay-editor__section">
        <h3 className="overlay-editor__section-title">Skier Information</h3>
        <div className="overlay-editor__fields">
          <div className="overlay-editor__field">
            <label htmlFor="skier-name" className="overlay-editor__label">Skier Name</label>
            <input
              id="skier-name"
              type="text"
              className="overlay-editor__input"
              value={sessionMeta.skierName}
              onChange={(e) => onMetaChange({ skierName: e.target.value })}
              placeholder="e.g. Anna Karlsson"
              disabled={disabled}
            />
          </div>
          <div className="overlay-editor__field">
            <label htmlFor="club-name" className="overlay-editor__label">Club</label>
            <input
              id="club-name"
              type="text"
              className="overlay-editor__input"
              value={sessionMeta.clubName}
              onChange={(e) => onMetaChange({ clubName: e.target.value })}
              placeholder="e.g. Stockholm WSC"
              disabled={disabled}
            />
          </div>
          <div className="overlay-editor__field">
            <label htmlFor="class-name" className="overlay-editor__label">Class</label>
            <input
              id="class-name"
              type="text"
              className="overlay-editor__input"
              value={sessionMeta.className}
              onChange={(e) => onMetaChange({ className: e.target.value })}
              placeholder="e.g. Open / Junior"
              disabled={disabled}
            />
          </div>
        </div>
      </section>

      {/* Overlay toggles */}
      <section className="overlay-editor__section">
        <h3 className="overlay-editor__section-title">Overlay Visibility</h3>
        <div className="overlay-editor__toggles">
          <label className="overlay-editor__toggle">
            <input
              type="checkbox"
              checked={overlayConfig.showSkierName}
              onChange={(e) => onOverlayChange({ showSkierName: e.target.checked })}
              disabled={disabled}
            />
            <span className="overlay-editor__toggle-track" />
            <span className="overlay-editor__toggle-label">Show skier name</span>
          </label>
          <label className="overlay-editor__toggle">
            <input
              type="checkbox"
              checked={overlayConfig.showClubInfo}
              onChange={(e) => onOverlayChange({ showClubInfo: e.target.checked })}
              disabled={disabled}
            />
            <span className="overlay-editor__toggle-track" />
            <span className="overlay-editor__toggle-label">Show club / class</span>
          </label>
        </div>
      </section>

      {/* Pause screen */}
      <section className="overlay-editor__section">
        <h3 className="overlay-editor__section-title">Pause Screen</h3>
        <div className="overlay-editor__fields">
          <div className="overlay-editor__field">
            <label htmlFor="pause-message" className="overlay-editor__label">Message</label>
            <input
              id="pause-message"
              type="text"
              className="overlay-editor__input"
              value={overlayConfig.pauseMessage}
              onChange={(e) => onOverlayChange({ pauseMessage: e.target.value })}
              placeholder="Stand By"
              disabled={disabled}
            />
          </div>
          <div className="overlay-editor__field">
            <label className="overlay-editor__label">Background Image</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="file"
                accept="image/png, image/jpeg"
                onChange={handleImageUpload}
                disabled={disabled}
                style={{ flex: 1, fontSize: '0.875rem' }}
              />
              {pauseBgUrl && (
                <button 
                  className="btn btn--danger btn--sm" 
                  onClick={handleClearImage}
                  disabled={disabled}
                  title="Remove image"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
        <label className="overlay-editor__toggle overlay-editor__toggle--danger">
          <input
            type="checkbox"
            checked={activeScene === 'pause'}
            onChange={(e) => setScene(e.target.checked ? 'pause' : 'live')}
            disabled={disabled}
          />
          <span className="overlay-editor__toggle-track overlay-editor__toggle-track--danger" />
          <span className="overlay-editor__toggle-label">Enable Pause Scene</span>
        </label>
      </section>
    </div>
  );
}
