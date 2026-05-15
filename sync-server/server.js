import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3579;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ENABLE_WS_COMPRESSION = process.env.WS_PERMESSAGE_DEFLATE !== 'false';
const WS_COMPRESSION_THRESHOLD = Number(process.env.WS_COMPRESSION_THRESHOLD) || 2048;

fs.mkdirSync(DATA_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: '200mb' }));

// CORS: allow any origin so the static GitHub Pages site can reach a self-hosted server
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});
app.options('*', (_req, res) => res.sendStatus(204));

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

const GLOBAL_METRICS = {
  startedAt: Date.now(),
  inboundMessages: 0,
  outboundMessages: 0,
  inboundBytes: 0,
  outboundBytes: 0,
  inboundSyncMessages: 0,
  outboundSyncMessages: 0,
  inboundAwarenessMessages: 0,
  outboundAwarenessMessages: 0,
  persistenceWrites: 0,
  persistenceBytes: 0,
};

const roomMetrics = new Map();

const docs = new Map();
const persistenceTimers = new Map(); // Track debounce timers for each doc
const PERSISTENCE_DEBOUNCE_MS = 5000; // Batch writes: persist every 5 seconds max

function getPayloadBytes(payload) {
  if (payload instanceof Uint8Array) return payload.byteLength;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(payload)) return payload.byteLength;
  if (payload instanceof ArrayBuffer) return payload.byteLength;
  return 0;
}

function getOrCreateRoomMetrics(key) {
  let metrics = roomMetrics.get(key);
  if (metrics) return metrics;

  metrics = {
    key,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    inboundMessages: 0,
    outboundMessages: 0,
    inboundBytes: 0,
    outboundBytes: 0,
    inboundSyncMessages: 0,
    outboundSyncMessages: 0,
    inboundAwarenessMessages: 0,
    outboundAwarenessMessages: 0,
    persistenceWrites: 0,
    persistenceBytes: 0,
  };
  roomMetrics.set(key, metrics);
  return metrics;
}

function recordInboundMetrics(docState, messageType, bytes) {
  const room = getOrCreateRoomMetrics(docState.key);
  room.lastActivityAt = Date.now();
  room.inboundMessages += 1;
  room.inboundBytes += bytes;
  GLOBAL_METRICS.inboundMessages += 1;
  GLOBAL_METRICS.inboundBytes += bytes;

  if (messageType === MESSAGE_SYNC) {
    room.inboundSyncMessages += 1;
    GLOBAL_METRICS.inboundSyncMessages += 1;
  } else if (messageType === MESSAGE_AWARENESS) {
    room.inboundAwarenessMessages += 1;
    GLOBAL_METRICS.inboundAwarenessMessages += 1;
  }
}

function recordOutboundMetrics(docState, messageType, bytes, count = 1) {
  if (count <= 0) return;

  const room = getOrCreateRoomMetrics(docState.key);
  room.lastActivityAt = Date.now();
  room.outboundMessages += count;
  room.outboundBytes += bytes * count;
  GLOBAL_METRICS.outboundMessages += count;
  GLOBAL_METRICS.outboundBytes += bytes * count;

  if (messageType === MESSAGE_SYNC) {
    room.outboundSyncMessages += count;
    GLOBAL_METRICS.outboundSyncMessages += count;
  } else if (messageType === MESSAGE_AWARENESS) {
    room.outboundAwarenessMessages += count;
    GLOBAL_METRICS.outboundAwarenessMessages += count;
  }
}

function recordPersistenceMetrics(docState, bytes) {
  const room = getOrCreateRoomMetrics(docState.key);
  room.lastActivityAt = Date.now();
  room.persistenceWrites += 1;
  room.persistenceBytes += bytes;
  GLOBAL_METRICS.persistenceWrites += 1;
  GLOBAL_METRICS.persistenceBytes += bytes;
}

function sendMessage(docState, conn, payload, messageType) {
  if (conn.readyState !== WebSocket.OPEN) return false;
  conn.send(payload);
  recordOutboundMetrics(docState, messageType, getPayloadBytes(payload));
  return true;
}

function keyToYjsPath(rawKey) {
  const sanitized = rawKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (sanitized.length === 0) return null;
  return path.join(DATA_DIR, `${sanitized}.yjs.json`);
}

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function base64ToBytes(base64) {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

function broadcast(docState, payload, except, messageType) {
  const payloadBytes = getPayloadBytes(payload);
  let sentCount = 0;
  for (const conn of docState.conns.keys()) {
    if (conn !== except && conn.readyState === WebSocket.OPEN) {
      conn.send(payload);
      sentCount += 1;
    }
  }
  recordOutboundMetrics(docState, messageType, payloadBytes, sentCount);
}

function getOrCreateDoc(key) {
  let docState = docs.get(key);
  if (docState) return docState;

  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  const conns = new Map();
  const persistPath = keyToYjsPath(key);
  getOrCreateRoomMetrics(key);

  if (persistPath && fs.existsSync(persistPath)) {
    try {
      const saved = JSON.parse(fs.readFileSync(persistPath, 'utf8'));
      if (typeof saved.updateBase64 === 'string') {
        Y.applyUpdate(doc, base64ToBytes(saved.updateBase64));
      }
    } catch {
      // ignore invalid persisted state
    }
  }

  // Debounce persistence: batch writes instead of per-update
  function schedulePersistence() {
    if (!persistPath) return;
    
    // Clear existing timer for this doc
    const existingTimer = persistenceTimers.get(key);
    if (existingTimer) clearTimeout(existingTimer);
    
    // Schedule new write
    const timer = setTimeout(() => {
      try {
        const fullState = Y.encodeStateAsUpdate(doc);
        fs.writeFileSync(persistPath, JSON.stringify({ updateBase64: bytesToBase64(fullState) }), 'utf8');
        recordPersistenceMetrics(docState, fullState.byteLength);
        persistenceTimers.delete(key);
      } catch (err) {
        console.error(`Persistence failed for key ${key}:`, err);
        persistenceTimers.delete(key);
      }
    }, PERSISTENCE_DEBOUNCE_MS);
    
    persistenceTimers.set(key, timer);
  }

  doc.on('update', (update, origin) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    broadcast(docState, encoding.toUint8Array(encoder), origin, MESSAGE_SYNC);

    // Debounce persistence instead of writing on every update
    schedulePersistence();
  });

  awareness.on('update', ({ added, updated, removed }, origin) => {
    const changedClients = added.concat(updated, removed);
    if (changedClients.length === 0) return;

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients)
    );
    broadcast(docState, encoding.toUint8Array(encoder), origin, MESSAGE_AWARENESS);
  });

  docState = { key, doc, awareness, conns };
  docs.set(key, docState);
  return docState;
}

function closeConnection(docState, conn) {
  const controlledIds = docState.conns.get(conn);
  docState.conns.delete(conn);
  if (controlledIds && controlledIds.size > 0) {
    awarenessProtocol.removeAwarenessStates(docState.awareness, Array.from(controlledIds), conn);
  }

  if (docState.conns.size === 0) {
    // Document is unused: flush any pending persistence and clean up
    const timer = persistenceTimers.get(docState.key);
    if (timer) {
      clearTimeout(timer);
      // Force immediate final write before cleanup
      try {
        const persistPath = keyToYjsPath(docState.key);
        if (persistPath) {
          const fullState = Y.encodeStateAsUpdate(docState.doc);
          fs.writeFileSync(persistPath, JSON.stringify({ updateBase64: bytesToBase64(fullState) }), 'utf8');
          recordPersistenceMetrics(docState, fullState.byteLength);
        }
      } catch (err) {
        console.error(`Final persistence failed for key ${docState.key}:`, err);
      }
      persistenceTimers.delete(docState.key);
    }
    // Destroy doc to free memory
    docState.doc.destroy();
    docs.delete(docState.key);
  }
}

function getAwarenessUpdateClientIds(update) {
  const ids = [];
  const decoder = decoding.createDecoder(update);
  const len = decoding.readVarUint(decoder);
  for (let i = 0; i < len; i++) {
    const clientId = decoding.readVarUint(decoder);
    // clock and state are part of awareness protocol payload; we only need ids here
    decoding.readVarUint(decoder);
    decoding.readVarString(decoder);
    ids.push(clientId);
  }
  return ids;
}

function handleWSMessage(docState, conn, data) {
  const raw = new Uint8Array(data);
  const decoder = decoding.createDecoder(raw);
  const messageType = decoding.readVarUint(decoder);
  recordInboundMetrics(docState, messageType, raw.byteLength);

  if (messageType === MESSAGE_SYNC) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.readSyncMessage(decoder, encoder, docState.doc, conn);
    if (encoding.length(encoder) > 1 && conn.readyState === WebSocket.OPEN) {
      sendMessage(docState, conn, encoding.toUint8Array(encoder), MESSAGE_SYNC);
    }
    return;
  }

  if (messageType === MESSAGE_AWARENESS) {
    const update = decoding.readVarUint8Array(decoder);
    awarenessProtocol.applyAwarenessUpdate(docState.awareness, update, conn);

    const controlled = docState.conns.get(conn) ?? new Set();
    getAwarenessUpdateClientIds(update).forEach((id) => {
      if (docState.awareness.getStates().has(id)) {
        controlled.add(id);
      } else {
        controlled.delete(id);
      }
    });
    docState.conns.set(conn, controlled);
  }
}

function setupWSConnection(docState, conn) {
  docState.conns.set(conn, new Set());

  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(encoder, docState.doc);
  sendMessage(docState, conn, encoding.toUint8Array(encoder), MESSAGE_SYNC);

  const awarenessStates = Array.from(docState.awareness.getStates().keys());
  if (awarenessStates.length > 0) {
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(docState.awareness, awarenessStates)
    );
    sendMessage(docState, conn, encoding.toUint8Array(awarenessEncoder), MESSAGE_AWARENESS);
  }

  conn.on('message', (data) => {
    try {
      handleWSMessage(docState, conn, data);
    } catch (err) {
      console.error('Yjs websocket message handling failed:', err);
      closeConnection(docState, conn);
      conn.close();
    }
  });

  conn.on('close', () => closeConnection(docState, conn));
}

// GET /health — simple liveness check
app.get('/health', (_req, res) => res.json({ ok: true }));

// GET /stats — lightweight sync bandwidth and room activity snapshot
app.get('/stats', (_req, res) => {
  const now = Date.now();
  const rooms = Array.from(roomMetrics.values())
    .map((metrics) => {
      const activeDoc = docs.get(metrics.key);
      return {
        key: metrics.key,
        activeConnections: activeDoc ? activeDoc.conns.size : 0,
        createdAt: metrics.createdAt,
        lastActivityAt: metrics.lastActivityAt,
        inboundMessages: metrics.inboundMessages,
        outboundMessages: metrics.outboundMessages,
        inboundBytes: metrics.inboundBytes,
        outboundBytes: metrics.outboundBytes,
        inboundSyncMessages: metrics.inboundSyncMessages,
        outboundSyncMessages: metrics.outboundSyncMessages,
        inboundAwarenessMessages: metrics.inboundAwarenessMessages,
        outboundAwarenessMessages: metrics.outboundAwarenessMessages,
        persistenceWrites: metrics.persistenceWrites,
        persistenceBytes: metrics.persistenceBytes,
      };
    })
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt);

  res.json({
    startedAt: GLOBAL_METRICS.startedAt,
    uptimeMs: now - GLOBAL_METRICS.startedAt,
    activeDocs: docs.size,
    roomsTracked: rooms.length,
    metrics: {
      ...GLOBAL_METRICS,
    },
    rooms,
  });
});

// Optional: log memory usage periodically for debugging (set MEM_LOG_INTERVAL env var in minutes)
if (process.env.MEM_LOG_INTERVAL) {
  const intervalMinutes = parseInt(process.env.MEM_LOG_INTERVAL, 10);
  if (!isNaN(intervalMinutes) && intervalMinutes > 0) {
    setInterval(() => {
      const mem = process.memoryUsage();
      console.log(
        `Memory: ${Math.round(mem.heapUsed / 1024 / 1024)}MB / ${Math.round(mem.heapTotal / 1024 / 1024)}MB heap, ` +
        `RSS: ${Math.round(mem.rss / 1024 / 1024)}MB, Docs: ${docs.size}`
      );
    }, intervalMinutes * 60 * 1000);
  }
}

const server = app.listen(PORT, () => {
  console.log(`Artist Tools sync server listening on port ${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
  console.log('Press Ctrl+C to stop.');
  console.log(`Persistence debounce: ${PERSISTENCE_DEBOUNCE_MS}ms (batches writes)`);
  console.log(`WebSocket compression: ${ENABLE_WS_COMPRESSION ? `enabled (threshold ${WS_COMPRESSION_THRESHOLD} bytes)` : 'disabled'}`);
  console.log('Set MEM_LOG_INTERVAL env var (minutes) to enable periodic memory logging');
  console.log('GET /stats returns sync traffic and room metrics');
});

const wss = new WebSocketServer({
  noServer: true,
  perMessageDeflate: ENABLE_WS_COMPRESSION
    ? {
      threshold: WS_COMPRESSION_THRESHOLD,
      zlibDeflateOptions: { level: 6 },
      zlibInflateOptions: { chunkSize: 32 * 1024 },
    }
    : false,
});

if (process.env.METRICS_LOG_INTERVAL) {
  const intervalMinutes = parseInt(process.env.METRICS_LOG_INTERVAL, 10);
  if (!isNaN(intervalMinutes) && intervalMinutes > 0) {
    setInterval(() => {
      console.log(
        `Metrics: in=${GLOBAL_METRICS.inboundBytes}B out=${GLOBAL_METRICS.outboundBytes}B, ` +
        `msgs(in/out)=${GLOBAL_METRICS.inboundMessages}/${GLOBAL_METRICS.outboundMessages}, ` +
        `rooms=${roomMetrics.size}, activeDocs=${docs.size}`
      );
    }, intervalMinutes * 60 * 1000);
  }
}

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
  if (!url.pathname.startsWith('/yjs-ws/')) {
    socket.destroy();
    return;
  }

  const rawKey = url.pathname.slice('/yjs-ws/'.length);
  const sanitizedKey = rawKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!sanitizedKey) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (conn) => {
    const docState = getOrCreateDoc(sanitizedKey);
    setupWSConnection(docState, conn);
  });
});
