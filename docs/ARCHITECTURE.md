# SkiCast Architecture

## Overview

SkiCast is a web-based live broadcasting system for waterskiing competitions. The application runs in
a standard browser with no native app required, making it fast to deploy and update.

## Core Design Principles

1. **Reliability over complexity** — The operator must always know the system state.
2. **Automatic recovery** — Network loss is expected on 5G in a boat. Auto-reconnect is a core feature.
3. **Separation of concerns**:
   - Video capture → `useMediaStream` hook
   - Connection lifecycle → `ConnectionManager` service
   - Signaling transport → `SignalingService`
   - UI state → `BroadcastContext`
4. **Mobile-first broadcaster** — Camera UI is designed for one-hand use on a phone.
5. **No paid infrastructure** — Uses free STUN servers and browser-native WebRTC.

## Application Modes

```
Landing Page
    ├── /broadcaster  →  BroadcasterPage  (phone in boat)
    └── /studio       →  StudioPage       (laptop at shore)
```

## State Machine

The application state is explicitly modeled as a finite state machine:

```
                    ┌─────────────────────────────────────┐
                    │                                     │
  Start ──► Disconnected ──► WaitingForCamera ──► Connecting ──► Connected
                 ▲                                            │        │
                 │◄────────────── network loss ──────────────┤        │
                 │                                            ▼        │
                 │                                       Reconnecting  │
                 │                                            │        │
                 │◄─────────────── max retries ──────────────┘        │
                 │                                                     │
                 └──────────────────────── Stopped ◄──── Paused ◄─────┘
```

All UI components receive the current `AppState` and render accordingly. 
**No unknown states are possible by design.**

## Directory Structure

```
src/
├── types/
│   ├── broadcast.ts        # App state types, session metadata, overlays
│   └── webrtc.ts           # WebRTC types, ICE config, signaling messages
│
├── services/
│   ├── ConnectionManager.ts   # Core lifecycle manager (NOT React-aware)
│   └── SignalingService.ts    # WebSocket signaling abstraction
│
├── contexts/
│   └── BroadcastContext.tsx   # React Context bridge to ConnectionManager
│
├── hooks/
│   ├── useMediaStream.ts      # Camera/mic access and device enumeration
│   └── useConnectionState.ts  # Subscribes to ConnectionManager state
│
├── components/
│   ├── common/
│   │   ├── AppHeader.tsx      # Navigation bar with status badge
│   │   └── StatusBadge.tsx    # Color-coded state indicator
│   ├── broadcaster/
│   │   ├── CameraPreview.tsx  # Local video preview
│   │   └── DeviceSelector.tsx # Camera/mic dropdowns
│   └── studio/
│       ├── VideoReceiver.tsx  # Remote video display (Phase 1B: WebRTC)
│       └── OverlayEditor.tsx  # Production controls panel
│
└── pages/
    ├── LandingPage.tsx        # Mode selection
    ├── BroadcasterPage.tsx    # Broadcaster UI
    └── StudioPage.tsx         # Studio UI
```

## Phase Roadmap

| Phase | Feature |
|-------|---------|
| **1A** ✅ | Project structure, state machine, camera preview, UI foundation |
| **1B** | WebRTC peer connection, signaling server, real-time transmission |
| **2A** | Session management, multiple viewers, connection quality metrics |
| **2B** | RTMP output to Facebook Live / YouTube |
| **3**  | Recording, replay, multi-camera support |

## WebRTC Integration Points (Phase 1B)

The architecture is pre-wired for WebRTC. Key integration points:

- **`ConnectionManager.connect()`** — Replace stub with `RTCPeerConnection` setup
- **`SignalingService.connect()`** — Implement real WebSocket
- **`VideoReceiver`** — Set `video.srcObject` from remote stream
- **`useConnectionState`** — Map ICE state to `AppState`

## Technology Stack

| Technology | Purpose |
|-----------|---------|
| Vite 5 | Build tool, dev server |
| React 18 | UI framework |
| TypeScript | Type safety throughout |
| React Router v6 | Client-side routing |
| Vanilla CSS | Styling (no framework lock-in) |
| WebRTC (Phase 1B) | Peer-to-peer video transmission |
| WebSocket (Phase 1B) | Signaling server |
