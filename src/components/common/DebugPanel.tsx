import { useEffect, useState } from 'react';
import { getConnectionManager } from '../../services/ConnectionManager';

export function DebugPanel({ role }: { role: 'broadcaster' | 'studio' }) {
  const [diag, setDiag] = useState<any>(null);

  useEffect(() => {
    const cm = getConnectionManager();
    const interval = setInterval(() => {
      setDiag(cm.getDiagnostics());
    }, 1000);
    // Initial fetch
    setDiag(cm.getDiagnostics());
    return () => clearInterval(interval);
  }, []);

  if (!diag) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '10px',
      right: '10px',
      background: 'rgba(0, 0, 0, 0.85)',
      color: '#0f0',
      padding: '12px',
      fontSize: '11px',
      zIndex: 99999,
      pointerEvents: 'auto',
      userSelect: 'text',
      fontFamily: 'monospace',
      width: '320px',
      borderRadius: '6px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
      whiteSpace: 'pre-wrap',
      lineHeight: '1.4'
    }}>
      <div style={{ borderBottom: '1px solid #0f0', marginBottom: '8px', paddingBottom: '4px', fontWeight: 'bold' }}>
        [{role.toUpperCase()} DEBUG]
      </div>
      <div>
        <strong>SIGNALING:</strong><br/>
        WebSocket: {diag.signaling.websocketState}<br/>
        Reconnects: {diag.signaling.reconnectAttempts}<br/>
        Last Success: {diag.signaling.lastReconnectSuccess ? new Date(diag.signaling.lastReconnectSuccess).toLocaleTimeString() : 'N/A'}<br/>
        Session: {diag.signaling.sessionCode}<br/>
        rejoinSession called: {diag.signaling.rejoinSessionCalled ? 'Yes' : 'No'}
      </div>
      <div style={{ marginTop: '8px' }}>
        <strong>WEBRTC:</strong><br/>
        Connection: {diag.webrtc.connectionState}<br/>
        ICE: {diag.webrtc.iceConnectionState}
      </div>
      <div style={{ marginTop: '8px' }}>
        <strong>NEGOTIATION:</strong><br/>
        Offer Created: {diag.webrtc.offerCreated ? 'Yes' : 'No'}<br/>
        Offer Sent: {diag.webrtc.offerSent ? 'Yes' : 'No'}<br/>
        Answer Received: {diag.webrtc.answerReceived ? 'Yes' : 'No'}<br/>
        ICE Sent: {diag.webrtc.iceSent}<br/>
        ICE Received: {diag.webrtc.iceReceived}
      </div>
      <div style={{ marginTop: '8px' }}>
        <strong>MEDIA:</strong><br/>
        Local Stream: {diag.media.localStreamExists ? 'Yes' : 'No'}<br/>
        Local Video: {diag.media.localVideoState}<br/>
        Remote Stream: {diag.media.remoteStreamExists ? 'Yes' : 'No'}<br/>
        Remote Video: {diag.media.remoteVideoState}
      </div>
    </div>
  );
}
