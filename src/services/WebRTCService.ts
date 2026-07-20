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

// ── Events ────────────────────────────────────────────────────

export type WebRTCEventType =
  | 'iceCandidate'       // New local ICE candidate ready to send to peer
  | 'remoteStream'       // Remote MediaStream received (studio only)
  | 'iceStateChange'     // RTCIceConnectionState changed
  | 'connectionChange'   // RTCPeerConnectionState changed
  | 'negotiationNeeded'  // renegotiation needed (future use)
  | 'error';

export interface WebRTCEvent {
  type: WebRTCEventType;
  candidate?: RTCIceCandidateInit;
  stream?: MediaStream;
  iceState?: RTCIceConnectionState;
  connectionState?: RTCPeerConnectionState;
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

  // ── Public API ──────────────────────────────────────────────

  get peerConnection(): RTCPeerConnection | null {
    return this._pc;
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

    const offer = await this._pc.createOffer({
      offerToReceiveAudio: false,  // Broadcaster sends; studio doesn't send back
      offerToReceiveVideo: false,
    });
    await this._pc.setLocalDescription(offer);
    return offer;
  }

  /**
   * Receive the remote SDP answer (broadcaster side).
   */
  async setRemoteAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this._pc) throw new Error('WebRTCService: not initialized');
    await this._pc.setRemoteDescription(new RTCSessionDescription(answer));
    this._hasRemoteDescription = true;
    await this._flushPendingCandidates();
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
    if (!this._pc) return;

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
}
