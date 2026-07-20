# SkiCast Signaling Server

WebSocket signaling server for SkiCast. Relays WebRTC offer/answer/ICE candidates between
Broadcaster (phone in boat) and Studio (laptop at shore).

> **Video does NOT pass through this server.**
> Only small JSON control messages are relayed. Video flows peer-to-peer via WebRTC.

---

## Running Locally

```bash
cd signaling
npm install
npm start
# Listening on ws://localhost:3001
```

Or with auto-reload during development:
```bash
npm run dev
```

Health check: `http://localhost:3001/health`

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `3001`  | WebSocket port |

---

## Deployment

### Render (recommended free tier)

1. Create a new **Web Service** on [render.com](https://render.com)
2. Connect your GitHub repo
3. Set root directory: `signaling/`
4. Build command: `npm install`
5. Start command: `node server.js`
6. Render sets `PORT` automatically

After deployment, copy the WebSocket URL (e.g. `wss://skicast-signaling.onrender.com`)
and set it as `VITE_SIGNALING_URL` in Vercel.

### Railway

1. Create new project from GitHub repo
2. Set root directory: `signaling/`
3. Railway sets `PORT` automatically
4. Deploy — Railway provides a public URL

### Environment on Vercel (frontend)

Set the following environment variable in your Vercel project settings:
```
VITE_SIGNALING_URL=wss://your-server.onrender.com
```

---

## Protocol

### Client → Server

| Message | Fields | Description |
|---------|--------|-------------|
| `create-session` | — | Create a new session, get back a code |
| `join-session` | `code` | Studio joins broadcaster session |
| `rejoin-session` | `code`, `role` | Reconnect to existing session |
| `signal` | `payload` | Relay a WebRTC signal to the peer |
| `ping` | — | Keepalive |

### Server → Client

| Message | Fields | Description |
|---------|--------|-------------|
| `session-created` | `code` | New session created, broadcaster's code |
| `session-joined` | `code` | Studio successfully joined |
| `session-rejoined` | `code` | Reconnection successful |
| `peer-joined` | `role` | The other party connected |
| `peer-left` | `role` | The other party disconnected |
| `signal` | `payload` | Forwarded WebRTC signal from peer |
| `pong` | — | Keepalive response |
| `error` | `message` | Error description |

---

## Session Lifecycle

```
1. Broadcaster → server:  create-session
2. Server → Broadcaster:  session-created { code: "ABC123" }
3. Studio → server:       join-session { code: "ABC123" }
4. Server → Studio:       session-joined
5. Server → Broadcaster:  peer-joined (studio is ready)
6. Broadcaster → server:  signal { payload: { type: "offer", sdp: "..." } }
7. Server → Studio:       signal { payload: { type: "offer", sdp: "..." } }
8. Studio → server:       signal { payload: { type: "answer", sdp: "..." } }
9. Server → Broadcaster:  signal { payload: { type: "answer", sdp: "..." } }
10. Both sides exchange ICE candidates via signal messages
11. WebRTC connection established — video flows P2P (no server involvement)
```

---

## Reliability

- Sessions persist for 4 hours to allow reconnection
- Heartbeat ping/pong every 30 seconds to detect dead connections
- Reconnection: client rejoins with same code using `rejoin-session`
- Peer is notified when their counterpart leaves/reconnects
