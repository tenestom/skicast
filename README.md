# SkiCast

**Live broadcasting system for waterskiing competitions.**

A single web application that runs in the browser — no native app required.
Supports two operating modes: **Broadcaster** (phone in the boat) and **Studio** (laptop at the shore).

---

## Status: Phase 1A — Architecture Foundation ✅

The project structure, state machine, and UI shells are complete.
WebRTC transmission is the next milestone (Phase 1B).

---

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open in browser
# http://localhost:5173
```

### Build for Production

```bash
npm run build
```

---

## Operating Modes

### 📱 Broadcaster Mode
Used on a smartphone mounted in the boat.

- Requests camera and microphone permission
- Shows live camera preview with mirror toggle
- Device selection (camera + microphone)
- State-driven UI (always shows current system status)
- Auto-reconnect on signal loss (Phase 1B: WebRTC)

### 🖥 Studio Mode
Used on a laptop at the shore.

- Receives the incoming broadcast stream (Phase 1B: WebRTC)
- Production controls:
  - Skier name, club, class information
  - Lower-third overlay toggle
  - Pause screen with custom message
- Live preview of overlay compositions
- Connection metrics panel (Phase 1B)

---

## Architecture Highlights

### State Machine
The application uses an explicit 7-state machine:

```
Disconnected → WaitingForCamera → Connecting → Connected ↔ Reconnecting
Connected → Paused → Connected
Any → Stopped
```

The UI always reflects the current state. Unknown states are not possible by design.

### Service Abstraction
- **`ConnectionManager`** — Owns the broadcast lifecycle. Framework-agnostic.
- **`SignalingService`** — WebSocket signaling abstraction (stubbed in Phase 1A).

These services are decoupled from React, making them testable and portable.

### Auto-Reconnect
The `ConnectionManager` implements exponential-backoff reconnection (up to 10 attempts, max 30s delay).
This is built into the architecture from day one — reliable reconnection on a 5G boat connection is a core requirement.

---

## Tech Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| Vite | 5 | Build tool |
| React | 18 | UI framework |
| TypeScript | 5 | Type safety |
| React Router | 6 | Routing |
| Vanilla CSS | — | Styling |
| WebRTC | Native | Video (Phase 1B) |

---

## Project Structure

```
skicast/
├── src/
│   ├── types/          # TypeScript types (broadcast, WebRTC)
│   ├── services/       # ConnectionManager, SignalingService
│   ├── contexts/       # BroadcastContext (React bridge)
│   ├── hooks/          # useMediaStream, useConnectionState
│   ├── components/     # common/, broadcaster/, studio/
│   └── pages/          # LandingPage, BroadcasterPage, StudioPage
├── docs/
│   ├── ARCHITECTURE.md
│   └── ROADMAP.md
└── PROJECT_RULES.md
```

---

## Roadmap

| Phase | Feature | Status |
|-------|---------|--------|
| **1A** | Architecture, UI foundation, state machine | ✅ Complete |
| **1B** | WebRTC peer connection, signaling server | 🔜 Next |
| **2A** | Session management, multi-viewer | 📋 Planned |
| **2B** | RTMP output (Facebook Live / YouTube) | 📋 Planned |
| **3** | Recording, replay, multi-camera | 💡 Future |

See [ROADMAP.md](docs/ROADMAP.md) and [ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

---

## Development Rules

See [PROJECT_RULES.md](PROJECT_RULES.md) for full rules. Summary:

- One major feature per commit
- Test before committing
- Reliability is more important than video quality
- Auto-reconnect is always a core feature
- No paid infrastructure without explicit approval
