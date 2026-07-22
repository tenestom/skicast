/**
 * SkiCast Signaling Server
 *
 * Purpose:
 *   Exchange WebRTC signaling messages (offer, answer, ICE candidates) between
 *   a Broadcaster (phone in boat) and a Studio (laptop at shore).
 *
 * IMPORTANT: Video does NOT pass through this server.
 *   This server only relays small JSON control messages.
 *   Video flows peer-to-peer via WebRTC.
 *
 * Protocol:
 *   Client → Server:
 *     { type: "create-session" }
 *     { type: "join-session",  code: "ABC123" }
 *     { type: "signal",        payload: { type: "offer"|"answer"|"ice-candidate", ... } }
 *     { type: "ping" }
 *
 *   Server → Client:
 *     { type: "session-created", code: "ABC123" }
 *     { type: "session-joined",  code: "ABC123" }
 *     { type: "peer-joined" }
 *     { type: "peer-left" }
 *     { type: "signal",          payload: { ... } }
 *     { type: "pong" }
 *     { type: "error",           message: "..." }
 *
 * Deployment:
 *   - Render: Set PORT env var (Render sets it automatically)
 *   - Railway: Set PORT env var (Railway sets it automatically)
 *   - Local:   PORT=3001 node server.js
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { randomBytes } from 'crypto';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const CODE_LENGTH = 6;
const MAX_SESSIONS = 500;
const HEARTBEAT_INTERVAL_MS = 30_000;
const CLIENT_TIMEOUT_MS = 60_000;

// ── Session store ─────────────────────────────────────────────

/**
 * @typedef {{ broadcaster: WebSocket|null, studio: WebSocket|null, createdAt: number }} Session
 */

/** @type {Map<string, { broadcaster: WebSocket|null, studio: WebSocket|null, createdAt: number }>} */
const sessions = new Map();

/**
 * Generate a random uppercase alphanumeric session code.
 * @returns {string}
 */
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // omit ambiguous chars
  let code;
  let attempts = 0;
  do {
    code = Array.from(randomBytes(CODE_LENGTH))
      .map(b => chars[b % chars.length])
      .join('');
    attempts++;
    if (attempts > 100) throw new Error('Could not generate unique code');
  } while (sessions.has(code));
  return code;
}

/** Prune expired sessions */
function pruneSessions() {
  const now = Date.now();
  for (const [code, session] of sessions) {
    const expired = now - session.createdAt > SESSION_TTL_MS;
    const abandoned = !session.broadcaster && !session.studio;
    if (expired || abandoned) {
      sessions.delete(code);
      console.log(`[session] Removed ${code} (${expired ? 'expired' : 'abandoned'})`);
    }
  }
}

// ── WebSocket server ──────────────────────────────────────────

const httpServer = createServer((req, res) => {
  // Health check endpoint for Render/Railway
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'skicast-signaling',
      sessions: sessions.size,
      uptime: Math.floor(process.uptime()),
    }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer });

/**
 * Send a JSON message to a WebSocket client.
 * @param {WebSocket} ws
 * @param {object} data
 */
function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

/**
 * Get the role of a socket within a session.
 * @param {{ broadcaster: WebSocket|null, studio: WebSocket|null }} session
 * @param {WebSocket} ws
 * @returns {'broadcaster'|'studio'|null}
 */
function getRole(session, ws) {
  if (session.broadcaster === ws) return 'broadcaster';
  if (session.studio === ws) return 'studio';
  return null;
}

/**
 * Get the peer socket for a given socket in a session.
 * @param {{ broadcaster: WebSocket|null, studio: WebSocket|null }} session
 * @param {WebSocket} ws
 * @returns {WebSocket|null}
 */
function getPeer(session, ws) {
  const role = getRole(session, ws);
  if (role === 'broadcaster') return session.studio;
  if (role === 'studio') return session.broadcaster;
  return null;
}

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[ws] Client connected from ${clientIp} (total: ${wss.clients.size})`);

  /** @type {string|null} */
  ws._sessionCode = null;
  ws._isAlive = true;
  ws._lastSeen = Date.now();

  ws.on('pong', () => {
    ws._isAlive = true;
    ws._lastSeen = Date.now();
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: 'error', message: 'Invalid JSON' });
      return;
    }

    ws._lastSeen = Date.now();

    try {
      handleMessage(ws, msg);
    } catch (err) {
      console.error('[ws] handleMessage error:', err);
      send(ws, { type: 'error', message: 'Internal server error' });
    }
  });

  ws.on('close', () => {
    console.log(`[ws] Client disconnected from ${clientIp}`);
    handleDisconnect(ws);
  });

  ws.on('error', (err) => {
    console.error(`[ws] Error from ${clientIp}:`, err.message);
  });
});

/**
 * Handle an incoming message from a client.
 * @param {WebSocket} ws
 * @param {{ type: string, [key: string]: any }} msg
 */
function handleMessage(ws, msg) {
  switch (msg.type) {
    case 'ping':
      send(ws, { type: 'pong' });
      break;

    case 'create-session': {
      const { role } = msg;
      if (!role || (role !== 'broadcaster' && role !== 'studio')) {
        send(ws, { type: 'error', message: 'Missing or invalid role' });
        return;
      }

      // Enforce session limit
      pruneSessions();
      if (sessions.size >= MAX_SESSIONS) {
        send(ws, { type: 'error', message: 'Server at capacity. Try again later.' });
        return;
      }

      const code = generateCode();
      sessions.set(code, {
        broadcaster: role === 'broadcaster' ? ws : null,
        studio: role === 'studio' ? ws : null,
        createdAt: Date.now(),
      });
      ws._sessionCode = code;
      ws._role = role;

      console.log(`[session] Created ${code} as ${role} (total: ${sessions.size})`);
      send(ws, { type: 'session-created', code });
      break;
    }

    case 'join-session': {
      const { code, role } = msg;
      if (!code || typeof code !== 'string') {
        send(ws, { type: 'error', message: 'Missing session code' });
        return;
      }
      if (!role || (role !== 'broadcaster' && role !== 'studio')) {
        send(ws, { type: 'error', message: 'Missing or invalid role' });
        return;
      }

      const session = sessions.get(code.toUpperCase());
      if (!session) {
        send(ws, { type: 'error', message: `Session "${code}" not found. Check the code and try again.` });
        return;
      }

      if (session[role] && session[role].readyState === WebSocket.OPEN) {
        send(ws, { type: 'error', message: `Session already has a ${role} connected.` });
        return;
      }

      session[role] = ws;
      ws._sessionCode = code.toUpperCase();
      ws._role = role;

      console.log(`[session] ${role} joined ${code.toUpperCase()}`);

      // Tell the joiner it successfully joined
      send(ws, { type: 'session-joined', code: code.toUpperCase() });

      // Tell the existing peer (if any) that this peer joined
      const peerWs = getPeer(session, ws);
      if (peerWs && peerWs.readyState === WebSocket.OPEN) {
        send(peerWs, { type: 'peer-joined', role });
      }
      break;
    }

    case 'rejoin-session': {
      // Broadcaster reconnects with existing code
      const { code, role } = msg;
      if (!code || !role) {
        send(ws, { type: 'error', message: 'Missing code or role' });
        return;
      }

      const session = sessions.get(code.toUpperCase());
      if (!session) {
        send(ws, { type: 'error', message: `Session "${code}" not found or expired.` });
        return;
      }

      session[role] = ws;
      ws._sessionCode = code.toUpperCase();
      ws._role = role;

      send(ws, { type: 'session-rejoined', code: code.toUpperCase() });

      // Notify peer
      const peerWs = getPeer(session, ws);
      if (peerWs && peerWs.readyState === WebSocket.OPEN) {
        send(peerWs, { type: 'peer-joined', role });
      }
      break;
    }

    case 'signal': {
      const { payload } = msg;
      if (!payload) {
        send(ws, { type: 'error', message: 'Missing signal payload' });
        return;
      }

      const code = ws._sessionCode;
      if (!code) {
        send(ws, { type: 'error', message: 'Not in a session' });
        return;
      }

      const session = sessions.get(code);
      if (!session) {
        send(ws, { type: 'error', message: 'Session not found' });
        return;
      }

      const peer = getPeer(session, ws);
      if (!peer || peer.readyState !== WebSocket.OPEN) {
        // Peer not connected yet — queue? For now just notify
        send(ws, { type: 'error', message: 'Peer not connected' });
        return;
      }

      // Relay signal to peer
      send(peer, { type: 'signal', payload });
      break;
    }

    default:
      send(ws, { type: 'error', message: `Unknown message type: ${msg.type}` });
  }
}

/**
 * Clean up when a client disconnects.
 * @param {WebSocket} ws
 */
function handleDisconnect(ws) {
  const code = ws._sessionCode;
  if (!code) return;

  const session = sessions.get(code);
  if (!session) return;

  const role = getRole(session, ws);
  const peer = getPeer(session, ws);

  // Remove the disconnected socket from the session
  if (role === 'broadcaster') session.broadcaster = null;
  if (role === 'studio') session.studio = null;

  // Notify peer
  if (peer && peer.readyState === WebSocket.OPEN) {
    send(peer, { type: 'peer-left', role });
  }

  // Keep session alive for reconnection (don't delete immediately)
  console.log(`[session] ${role} left session ${code}`);
}

// ── Heartbeat ──────────────────────────────────────────────────

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws._isAlive) {
      console.log('[ws] Terminating unresponsive client');
      ws.terminate();
      return;
    }
    ws._isAlive = false;
    ws.ping();
  });

  pruneSessions();
}, HEARTBEAT_INTERVAL_MS);

wss.on('close', () => clearInterval(heartbeatInterval));

// ── Start ──────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`[skicast-signaling] Listening on port ${PORT}`);
  console.log(`[skicast-signaling] Health check: http://localhost:${PORT}/health`);
  console.log(`[skicast-signaling] WebSocket: ws://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[skicast-signaling] SIGTERM received, shutting down');
  wss.clients.forEach(ws => ws.close(1001, 'Server shutting down'));
  httpServer.close(() => process.exit(0));
});
