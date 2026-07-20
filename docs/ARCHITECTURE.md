# SkiCast Architecture

## Overview

SkiCast is a web-based live broadcasting system for waterskiing. It runs in a standard browser
— no native app required. The Broadcaster (phone in boat) streams live camera video to the
Studio (laptop at shore) using WebRTC.

---

## Core Design Principles

1. **Reliability over complexity** — operator always knows system state
2. **Automatic recovery** — 5G drops in a boat are expected; auto-reconnect is core
3. **Video never touches the server** — only tiny signaling JSON passes through
4. **Separation of concerns**:
   - Video capture → `useMediaStream`
   - WebRTC peer connection → `WebRTCService`
   - Connection orchestration → `ConnectionManager`
   - Signaling transport → `SignalingService`
   - UI state → `BroadcastContext`
5. **Mobile-first broadcaster** — designed for one-hand use on a phone

---

## System Architecture

```
┌──────────────────┐      WebSocket (JSON)      ┌──────────────────┐
│  Broadcaster     │ ◄───────────────────────── │ Signaling Server │
│  (Phone/Boat)    │ ──────────────────────────► │  (Node.js + ws)  │
└──────────────────┘                             └──────────────────┘
         │                                                │
         │         WebRTC (P2P video)                     │
         │ ════════════════════════════════════ ►         │
         │                                      │         │
         │                             ┌─────────────────┐│
         │                             │  Studio         ││
         │ ────────────────────────────│  (Laptop/Shore) ││
                                       └─────────────────┘│
```

The signaling server handles ~200 bytes per message. Video at 720p 30fps is ~1–3 Mbps and
flows entirely peer-to-peer.

---

## State Machine

```
                    ┌──────────────────────────────────────┐
                    │                                      │
Start ──► Disconnected ──► WaitingForCamera ──► Connecting ──► Connected
              ▲                                             │        │
              │◄──────────────── network loss ─────────────┤        │
              │                                             ▼        │
              │                                        Reconnecting  │
              │                                             │        │
              │◄────────────────── max retries ─────────────┘        │
              │                                                       │
              └──────────────────────── Stopped ◄──── Paused ◄───────┘
```

All UI components receive `AppState` and render accordingly.
**No unknown states are possible by design.**

---

## Reconnection Strategy

1. ICE failure detected (`iceConnectionState === 'failed'`)
2. **ICE restart** attempted first (broadcaster sends ice-restart-offer)
   - Faster: reuses existing DTLS session, just finds new ICE path
3. If restart fails → **full reconnect** (new RTCPeerConnection)
4. Exponential backoff: 2s → 3s → 4.5s → … → max 30s
5. Max 10 attempts before entering `Disconnected`

Broadcaster always re-initiates (creates new offer). Studio always waits for offer.

---

## Signaling Protocol

The signaling server relays messages between broadcaster and studio.
All messages are JSON. The server is stateless per-message (sessions held in-memory).

```
Broadcaster                  Server                    Studio
    │                           │                         │
    │── create-session ─────────►│                         │
    │◄── session-created {code} ─│                         │
    │                           │◄──── join-session {code} ─│
    │                           │──── session-joined ──────►│
    │◄── peer-joined ───────────│                         │
    │                           │                         │
    │── signal {offer} ─────────►│──── signal {offer} ─────►│
    │◄─ signal {answer} ─────────│◄─── signal {answer} ─────│
    │── signal {ice-cand} ───────►│──── signal {ice-cand} ───►│
    │◄─ signal {ice-cand} ───────│◄─── signal {ice-cand} ───│
    │                           │                         │
    ╔═══════════════════════════════════════════════════╗
    ║          WebRTC P2P video (server not involved)   ║
    ╚═══════════════════════════════════════════════════╝
```

---

## Directory Structure

```
src/
├── config/
│   └── webrtc.ts              # ICE config, TURN setup, env vars, reconnect config
│
├── types/
│   ├── broadcast.ts           # AppState, AppMode, SessionMeta, OverlayConfig
│   └── webrtc.ts              # WebRTC types (ICE servers, signaling messages)
│
├── services/
│   ├── ConnectionManager.ts   # Orchestrator — coordinates signaling + WebRTC
│   ├── WebRTCService.ts       # RTCPeerConnection wrapper (offer/answer/ICE/restart)
│   └── SignalingService.ts    # WebSocket client with ping/pong and reconnect
│
├── contexts/
│   └── BroadcastContext.tsx   # React bridge — exposes service actions as hooks
│
├── hooks/
│   ├── useMediaStream.ts      # getUserMedia, device enumeration
│   └── useConnectionState.ts  # Subscribes to ConnectionManager state
│
├── components/
│   ├── common/
│   │   ├── AppHeader.tsx      # Header with status badge
│   │   └── StatusBadge.tsx    # 7-state color-coded indicator
│   ├── broadcaster/
│   │   ├── CameraPreview.tsx  # Local video element
│   │   ├── DeviceSelector.tsx # Camera/mic dropdowns
│   │   └── SessionCodeDisplay.tsx # 6-char code with copy button
│   └── studio/
│       ├── VideoReceiver.tsx  # Remote video element + states
│       └── OverlayEditor.tsx  # Production controls
│
└── pages/
    ├── LandingPage.tsx        # Mode selection
    ├── BroadcasterPage.tsx    # Broadcaster flow (setup → code → live)
    └── StudioPage.tsx         # Studio flow (code entry → connecting → live)
```

---

## ICE / TURN Configuration

Located in `src/config/webrtc.ts`.

**Phase 1B-1:** STUN-only (Google + Cloudflare)
- Works for ~80% of connections
- Fails for symmetric NAT (some mobile carriers)

**Adding TURN (when needed):**
```typescript
// In src/config/webrtc.ts — or set env vars:
VITE_TURN_URL=turns:your-server.example.com:5349
VITE_TURN_USERNAME=username
VITE_TURN_CREDENTIAL=credential
```

Free TURN options: Metered.ca (50GB/month free), self-hosted coturn on Render.

---

## Signaling Server

Located in `signaling/`.

- Single `server.js` file (~200 lines)
- Dependency: `ws` (WebSocket library) only
- Sessions stored in-memory Map
- Session TTL: 4 hours (allows reconnection)
- Heartbeat: ping/pong every 30s

### Deploy on Render (free tier)

```
Root dir:      signaling/
Build cmd:     npm install
Start cmd:     node server.js
PORT:          set automatically by Render
```

---

## Phase Roadmap

| Phase | Feature | Status |
|-------|---------|--------|
| **1A** | Architecture, UI, state machine | ✅ Done |
| **1B-1** | WebRTC P2P video, signaling server | ✅ Done |
| **1B-2** | Connection quality metrics, TURN server | 🔜 Next |
| **2A** | Multi-viewer (SFU), session persistence | 📋 Planned |
| **2B** | RTMP output (Facebook Live / YouTube) | 📋 Planned |
| **3** | Recording, replay, multi-camera | 💡 Future |
