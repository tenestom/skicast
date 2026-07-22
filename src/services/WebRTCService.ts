/**
 * WebRTCService
 *
 * Wraps RTCPeerConnection and handles:
 *   - Track management (adding local camera/mic tracks)
 *   - Offer/answer creation and handling
 *   - ICE candidate exchange
 *   - Remote stream reception
 *   - ICE connection state monitoring → triggers reconnect in ConnectionManager
 *
 * This class is NOT React-aware. It emits events via callbacks.
 * ConnectionManager orchestrates this + SignalingService.
 *
 * Phase 1B: Broadcaster is always the offerer.
 */

import { RTC_CONFIGURATION } from '../config/webrtc';
import type { WebRTCMetrics } from '../types/broadcast';

// ── Events ────────────────────────────────────────────────────

export type WebRTCEventType =
  | 'iceCandidate'       // New local ICE candidate ready to send to peer
  | 'remoteStream'       // Remote MediaStream received (studio only)
  | 'iceStateChange'     // RTCIceConnectionState changed
  | 'connectionChange'   // RTCPeerConnectionState changed
  | 'metricsUpdate'      // Stats polling
  | 'negotiationNeeded'  // renegotiation needed (future use)
  | 'error';

export interface WebRTCEvent {
  type: WebRTCEventType;
  candidate?: RTCIceCandidateInit;
  stream?: MediaStream;
  iceState?: RTCIceConnectionState;
  connectionState?: RTCPeerConnectionState;
  metrics?: WebRTCMetrics;
  error?: string;
}

type WebRTCEventListener = (event: WebRTCEvent) => void;

// ── Service ───────────────────────────────────────────────────

export class WebRTCService {
  private _pc: RTCPeerConnection | null = null;
  private _listeners: WebRTCEventListener[] = [];
  private _remoteStream: MediaStream | null = null;
  private _pendingCandidates: RTCIceCandidateInit[] = [];
  private _hasRemoteDescription = false;
  
  private _statsInterval: ReturnType<typeof setInterval> | null = null;
  private _lastBytesReceived = 0;
  private _lastFramesDecoded = 0;
  private _lastStatsTimestamp = 0;
  private _connectionStartTime = 0;

  private _diagnostics = {
    offerCreated: false,
    offerSent: false,
    answerReceived: false,
    iceSent: 0,
    iceReceived: 0,
  };

  // ── Public API ──────────────────────────────────────────────

  get peerConnection(): RTCPeerConnection | null {
    return this._pc;
  }

  getDiagnostics() {
    return {
      connectionState: this._pc?.connectionState ?? 'new',
      iceConnectionState: this._pc?.iceConnectionState ?? 'new',
      ...this._diagnostics
    };
  }

  get remoteStream(): MediaStream | null {
    return this._remoteStream;
  }

  get iceConnectionState(): RTCIceConnectionState | null {
    return this._pc?.iceConnectionState ?? null;
  }

  /** Subscribe to WebRTC events */
  on(listener: WebRTCEventListener): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter(l => l !== listener);
    };
  }

  /**
   * Initialize a new RTCPeerConnection.
   * Call this before creating offer or setting remote offer.
   */
  init(): void {
    console.log('[LIFECYCLE] WebRTCService: init() called. Creating new RTCPeerConnection.');
    this.close(); // clean up existing connection

    const pc = new RTCPeerConnection(RTC_CONFIGURATION);
    this._pc = pc;
    this._pendingCandidates = [];
    this._hasRemoteDescription = false;
    this._remoteStream = null;

    // ICE candidate handler — relay to peer via SignalingService
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this._diagnostics.iceSent++;
        this._emit({
          type: 'iceCandidate',
          candidate: event.candidate.toJSON(),
        });
      }
    };

    // ICE connection state monitoring
    pc.oniceconnectionstatechange = () => {
      this._emit({ type: 'iceStateChange', iceState: pc.iceConnectionState });
    };

    // Overall connection state
    pc.onconnectionstatechange = () => {
      this._emit({ type: 'connectionChange', connectionState: pc.connectionState });
      if (pc.connectionState === 'connected') {
        this._startStatsPolling();
      } else {
        this._stopStatsPolling();
      }
    };

    // Remote track reception (Studio receives broadcaster's camera)
    pc.ontrack = (event) => {
      if (!this._remoteStream) {
        this._remoteStream = new MediaStream();
      }
      this._remoteStream.addTrack(event.track);
      this._emit({ type: 'remoteStream', stream: this._remoteStream });
    };

    pc.onnegotiationneeded = () => {
      this._emit({ type: 'negotiationNeeded' });
    };
  }

  /**
   * Add local MediaStream tracks to the peer connection.
   * Call this (as broadcaster) after init() and before createOffer().
   */
  addLocalStream(stream: MediaStream): void {
    if (!this._pc) throw new Error('WebRTCService: not initialized');
    stream.getTracks().forEach(track => {
      this._pc!.addTrack(track, stream);
    });
  }

  /**
   * Create an SDP offer (broadcaster side).
   * @returns The local session description to send to studio via signaling.
   */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this._pc) throw new Error('WebRTCService: not initialized');

    try {
      const offer = await this._pc.createOffer();
      await this._pc.setLocalDescription(offer);
      this._diagnostics.offerCreated = true;
      this._diagnostics.offerSent = true;
      return offer;
    } catch (err) {
      console.error('[WebRTCService] Error creating offer:', err);
      throw err;
    }
  }

  /**
   * Receive the remote SDP answer (broadcaster side).
   */
  async setRemoteAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this._pc) throw new Error('WebRTCService: not initialized');
    try {
      await this._pc.setRemoteDescription(new RTCSessionDescription(answer));
      this._hasRemoteDescription = true;
      this._diagnostics.answerReceived = true;
      
      await this._flushPendingCandidates();
    } catch (err) {
      console.error('[WebRTCService] Error setting remote answer:', err);
      throw err;
    }
  }

  /**
   * Receive the remote SDP offer and create an answer (studio side).
   * @returns The local answer SDP to send to broadcaster via signaling.
   */
  async receiveOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this._pc) throw new Error('WebRTCService: not initialized');
    await this._pc.setRemoteDescription(new RTCSessionDescription(offer));
    this._hasRemoteDescription = true;
    await this._flushPendingCandidates();

    const answer = await this._pc.createAnswer();
    await this._pc.setLocalDescription(answer);
    return answer;
  }

  /**
   * Add a remote ICE candidate received from the peer via signaling.
   * Queues candidates if remote description is not yet set.
   */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    this._diagnostics.iceReceived++;
    if (!this._pc) {
      console.warn('[WebRTCService] Received candidate but PC is null');
      return;
    }

    if (!this._hasRemoteDescription) {
      // Queue for later — candidates must arrive after setRemoteDescription
      this._pendingCandidates.push(candidate);
      return;
    }

    try {
      await this._pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      // Non-fatal: stale candidates happen during reconnect
      console.warn('[WebRTCService] addIceCandidate failed (stale?):', err);
    }
  }

  /**
   * Restart ICE — used for reconnection without full renegotiation.
   * Phase 1B: triggers a new offer with iceRestart=true from broadcaster side.
   */
  async restartIce(): Promise<RTCSessionDescriptionInit | null> {
    if (!this._pc) return null;
    try {
      const offer = await this._pc.createOffer({ iceRestart: true });
      await this._pc.setLocalDescription(offer);
      return offer;
    } catch {
      return null;
    }
  }

  /**
   * Close and clean up the peer connection.
   * Safe to call multiple times.
   */
  close(): void {
    console.log('[LIFECYCLE] WebRTCService: close() called');
    if (this._pc) {
      console.log('[LIFECYCLE] WebRTCService: closing existing RTCPeerConnection');
      this._pc.onicecandidate = null;
      this._pc.oniceconnectionstatechange = null;
      this._pc.onconnectionstatechange = null;
      this._pc.ontrack = null;
      this._pc.onnegotiationneeded = null;
      this._pc.close();
      this._pc = null;
    }
    this._remoteStream = null;
    this._pendingCandidates = [];
    this._hasRemoteDescription = false;
    this._stopStatsPolling();
  }

  // ── Private ─────────────────────────────────────────────────

  private _emit(event: WebRTCEvent): void {
    this._listeners.forEach(l => l(event));
  }

  private async _flushPendingCandidates(): Promise<void> {
    const pending = this._pendingCandidates.splice(0);
    for (const candidate of pending) {
      try {
        await this._pc?.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('[WebRTCService] Flushing pending candidate failed:', err);
      }
    }
  }

  private _startStatsPolling(): void {
    if (this._statsInterval) return;
    
    this._connectionStartTime = Date.now();
    this._lastBytesReceived = 0;
    this._lastFramesDecoded = 0;
    this._lastStatsTimestamp = 0;

    this._statsInterval = setInterval(async () => {
      if (!this._pc || this._pc.connectionState !== 'connected') {
        this._stopStatsPolling();
        return;
      }

      try {
        const stats = await this._pc.getStats(null);
        let bytesReceived = 0;
        let framesDecoded = 0;
        let packetsLost = 0;
        let rttMs = 0;
        let resolution = '';
        let codecId = '';
        let codec = '';

        stats.forEach((report) => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            bytesReceived = report.bytesReceived || 0;
            framesDecoded = report.framesDecoded || 0;
            packetsLost = report.packetsLost || 0;
            codecId = report.codecId;
            
            // Frame width/height if available in inbound-rtp
            if (report.frameWidth && report.frameHeight) {
              resolution = `${report.frameWidth}x${report.frameHeight}`;
            }
          }
          if (report.type === 'remote-inbound-rtp' || report.type === 'candidate-pair') {
            if (report.currentRoundTripTime !== undefined) {
              rttMs = report.currentRoundTripTime * 1000;
            }
          }
          if (report.type === 'track' && report.kind === 'video') {
            if (report.frameWidth && report.frameHeight) {
              resolution = `${report.frameWidth}x${report.frameHeight}`;
            }
          }
          if (report.type === 'codec' && report.id === codecId) {
             codec = report.mimeType?.split('/')[1] || '';
          }
        });

        // Some stats put codec inside candidate-pair or we just find it globally
        if (!codec) {
          stats.forEach(report => {
            if (report.type === 'codec' && report.mimeType?.toLowerCase().includes('video')) {
              codec = report.mimeType.split('/')[1] || '';
            }
          });
        }

        const now = Date.now();
        const timeDelta = (now - this._lastStatsTimestamp) / 1000; // seconds
        
        let bitrateKbps = 0;
        let fps = 0;

        if (this._lastStatsTimestamp > 0 && timeDelta > 0) {
          const bytesDelta = bytesReceived - this._lastBytesReceived;
          const framesDelta = framesDecoded - this._lastFramesDecoded;
          
          bitrateKbps = Math.max(0, Math.round((bytesDelta * 8) / timeDelta / 1000));
          fps = Math.max(0, Math.round(framesDelta / timeDelta));
        }

        this._lastBytesReceived = bytesReceived;
        this._lastFramesDecoded = framesDecoded;
        this._lastStatsTimestamp = now;

        const durationSeconds = Math.floor((now - this._connectionStartTime) / 1000);

        const metrics: WebRTCMetrics = {
          bitrateKbps,
          fps,
          rttMs: Math.round(rttMs),
          packetLoss: packetsLost,
          resolution,
          codec,
          durationSeconds,
        };

        this._emit({ type: 'metricsUpdate', metrics });
      } catch (err) {
        console.warn('[WebRTCService] getStats error', err);
      }
    }, 1000);
  }

  private _stopStatsPolling(): void {
    if (this._statsInterval) {
      clearInterval(this._statsInterval);
      this._statsInterval = null;
    }
  }
}
