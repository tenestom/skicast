# SkiCast Development Roadmap

## Current Phase: 1A — Architecture Foundation

---

## Phase 1A — Foundation ✅ (Current)

**Goal:** Establish the project structure, state machine, and UI shells.

- [x] Vite + React 18 + TypeScript setup
- [x] Global dark design system (CSS custom properties)
- [x] Application state machine (7 states)
- [x] ConnectionManager service abstraction
- [x] SignalingService stub
- [x] Landing page with mode selection
- [x] Broadcaster mode UI (camera preview, device selection)
- [x] Studio mode UI (video placeholder, overlay controls)
- [x] StatusBadge — always reflects current state
- [x] Mobile-first responsive layout
- [x] Auto-reconnect architecture (exponential backoff)

---

## Phase 1B — WebRTC Core 🔜

**Goal:** Real-time video transmission between broadcaster and studio.

**Scope:**
- [ ] Signaling server (Node.js + WebSocket or hosted Livekit/Mediasoup)
- [ ] `RTCPeerConnection` implementation in `ConnectionManager`
- [ ] Real `SignalingService` WebSocket client
- [ ] ICE candidate exchange
- [ ] Remote stream display in `VideoReceiver`
- [ ] Connection quality metrics (bitrate, packet loss, RTT)
- [ ] Session ID generation and management

**Key decisions to make:**
- SFU vs. peer-to-peer (P2P sufficient for Phase 1B, SFU needed for multi-viewer)
- Signaling server hosting (self-hosted vs. Livekit Cloud free tier)

---

## Phase 2A — Session Management

**Goal:** Robust multi-viewer support and session handling.

- [ ] Session persistence across reconnects
- [ ] Viewer count display
- [ ] Multiple studio viewers (SFU architecture)
- [ ] Connection quality dashboard
- [ ] Stream health alerts

---

## Phase 2B — Production Output (RTMP)

**Goal:** Output broadcast to Facebook Live / YouTube.

- [ ] RTMP push from signaling server (FFmpeg or GStreamer)
- [ ] YouTube / Facebook RTMP key management
- [ ] Scene composition server-side (future: OBS-style)

**Note:** No paid infrastructure without explicit approval.

---

## Phase 3 — Advanced Features

- [ ] Recording (server-side)
- [ ] Replay / highlight clips
- [ ] Multi-camera switching in studio
- [ ] Scoreboard overlay integration
- [ ] PWA / offline resilience

---

## Architecture Constraints

Per `PROJECT_RULES.md`:
- One major feature per commit
- Test before commit  
- Mobile and desktop UX remain separate
- **Reliability > maximum video quality**
- No paid infrastructure without approval
- **Auto-reconnect is always a core feature**
