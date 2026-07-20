# SkiCast

**Live broadcasting system for waterskiing competitions.**

A single web app running in the browser — no native app required.
Phone in the boat streams live camera video to a laptop at the shore via WebRTC.

---

## Status: Phase 1B-1 — Real WebRTC Connection ✅

Full peer-to-peer video transmission between Broadcaster (phone) and Studio (laptop) is implemented.

---

## Quick Start

### 1. Start the signaling server

```bash
cd signaling
npm install
node server.js
# → ws://localhost:3001
```

### 2. Start the frontend

```bash
# In the project root
npm install
npm run dev
# → http://localhost:5173
```

### 3. Test locally (two browser tabs)

**Tab 1 — Broadcaster:**
1. Open `http://localhost:5173`
2. Click **Broadcaster**
3. Select camera → **Start Camera**
4. Click **Start Session** → note the 6-character code (e.g. `ABC123`)

**Tab 2 — Studio:**
1. Open `http://localhost:5173/studio`
2. Enter the 6-character code
3. Click **Connect to Broadcaster**
4. Live video appears

### 4. Test across devices (same WiFi)

Use the Network URL shown by Vite: `http://192.168.x.x:5173`

---

## Architecture

```
Phone (Broadcaster)                      Laptop (Studio)
  │                                           │
  │  ──── WebSocket (offer/answer/ICE) ───►  │
  │  ◄─── WebSocket (answer/ICE) ──────────  │
  │                                           │
  │  ══════════ WebRTC video (P2P) ══════════ │
  │     (never passes through server)         │
```

The **signaling server** only relays tiny JSON messages.
**Video flows peer-to-peer** between browser tabs/devices.

---

## Project Structure

```
skicast/
├── signaling/              ← Node.js WebSocket signaling server
│   ├── server.js           ← Main server
│   ├── package.json
│   └── README.md           ← Deploy instructions (Render/Railway)
│
├── src/
│   ├── config/
│   │   └── webrtc.ts       ← ICE servers, TURN config, env vars
│   ├── types/              ← TypeScript types
│   ├── services/
│   │   ├── ConnectionManager.ts   ← Orchestrates WebRTC lifecycle
│   │   ├── WebRTCService.ts       ← RTCPeerConnection wrapper
│   │   └── SignalingService.ts    ← WebSocket client
│   ├── contexts/
│   │   └── BroadcastContext.tsx   ← React state bridge
│   ├── hooks/              ← useMediaStream, useConnectionState
│   ├── components/         ← common/, broadcaster/, studio/
│   └── pages/              ← Landing, Broadcaster, Studio
│
├── docs/
│   ├── ARCHITECTURE.md
│   └── ROADMAP.md
└── .env.example            ← Environment variable template
```

---

## Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

| Variable | Description |
|----------|-------------|
| `VITE_SIGNALING_URL` | WebSocket URL of the signaling server |
| `VITE_TURN_URL` | Optional TURN server URL |
| `VITE_TURN_USERNAME` | Optional TURN username |
| `VITE_TURN_CREDENTIAL` | Optional TURN credential |

---

## Deploying

### Frontend → Vercel

```bash
# Connect GitHub repo to Vercel
# Set environment variable:
VITE_SIGNALING_URL=wss://your-signaling-server.onrender.com
```

### Signaling Server → Render

1. New Web Service on [render.com](https://render.com)
2. Root dir: `signaling/`
3. Build: `npm install`
4. Start: `node server.js`
5. Render sets `PORT` automatically

See [`signaling/README.md`](signaling/README.md) for full deploy instructions.

---

## Connection States

The UI always shows one of 7 states:

| State | Meaning |
|-------|---------|
| `Disconnected` | No active session |
| `WaitingForCamera` | Requesting camera permission |
| `Connecting` | Signaling exchange in progress |
| `Connected` | Live — video flowing |
| `Reconnecting` | Network interruption — auto-recovering |
| `Paused` | Session paused by operator |
| `Stopped` | Session ended |

---

## Network Requirements

- **STUN servers** (Google, Cloudflare) handle ~80% of connections
- **5G / carrier NAT**: May require TURN. See `src/config/webrtc.ts` for setup
- Signaling server: any server supporting WebSocket (Render free tier works)

---

## Roadmap

| Phase | Feature | Status |
|-------|---------|--------|
| **1A** | Architecture, UI, state machine | ✅ Done |
| **1B-1** | WebRTC video connection | ✅ Done |
| **1B-2** | Connection quality metrics, TURN | 🔜 Next |
| **2A** | Multi-viewer (SFU), session management | 📋 Planned |
| **2B** | RTMP output (Facebook Live / YouTube) | 📋 Planned |
| **3** | Recording, replay, multi-camera | 💡 Future |

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) and [ROADMAP.md](docs/ROADMAP.md).

---

## Development Rules

See [PROJECT_RULES.md](PROJECT_RULES.md). Key rules:
- One major feature per commit
- Reliability > video quality
- Auto-reconnect is always a core feature
- No paid infrastructure without explicit approval
