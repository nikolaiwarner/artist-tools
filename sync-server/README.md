# Artist Tools Sync Server

A minimal self-hosted realtime sync server for [Artist Tools](https://nikolaiwarner.github.io/artist-tools). Run it on any machine you can reach from your devices to keep clients synced automatically.

## How It Works

- Each user picks a unique **sync key** (any string — treat it like a password).
- Clients sync **realtime** over WebSocket at `ws://<server>/yjs-ws/<key>`.
- One sync key maps to one Yjs room/document.
- One server can hold data for any number of users (one file per key in `data/`).
- Yjs CRDT merge handles concurrent edits automatically.

## Running the Server

### 1. Install dependencies

```bash
cd sync-server
npm install
```

### 2. Start

```bash
npm start
```

The server runs on port **3579** by default.

### Environment variables

| Variable   | Default              | Description                      |
|------------|----------------------|----------------------------------|
| `PORT`     | `3579`               | TCP port to listen on            |
| `DATA_DIR` | `./data` (next to server.js) | Directory where Yjs room state is stored |
| `WS_PERMESSAGE_DEFLATE` | `true` | Enable WebSocket per-message compression (`false` disables) |
| `WS_COMPRESSION_THRESHOLD` | `2048` | Compress outbound frames at/above this byte size |
| `MEM_LOG_INTERVAL` | _(unset)_ | Minutes between memory usage log lines |
| `METRICS_LOG_INTERVAL` | _(unset)_ | Minutes between sync traffic metrics log lines |

### Example with custom port

```bash
PORT=8080 npm start
```

### Running behind a reverse proxy (nginx, Caddy, etc.)

The server is plain HTTP. Put it behind a TLS-terminating reverse proxy for production use so traffic is encrypted in transit.

Example Caddy block:

```
sync.example.com {
    reverse_proxy localhost:3579
}
```

## Security Notes

- The sync key is the only protection for a user's data. Use a long, random key (e.g. a UUID or passphrase).
- The server does **not** authenticate requests beyond matching the key in the URL path.
- Limit network exposure: only expose the port to trusted clients or behind a reverse proxy with TLS.
- Room state files are stored as plain JSON in `data/`. Back up that directory if you want persistence.

## Persistence Format

Yjs room state is persisted per key with this shape:

```json
{
  "updateBase64": "..."
}
```

Realtime transport details:

- WebSocket endpoint: `/yjs-ws/:key`
- Protocol: Yjs sync protocol (`y-protocols/sync` + `y-protocols/awareness`)
- Persistence: server writes merged Yjs doc state to `data/<key>.yjs.json`

## Monitoring

- `GET /health` returns basic liveness.
- `GET /stats` returns cumulative inbound/outbound bytes/messages plus per-room activity and persistence counters.
- Set `METRICS_LOG_INTERVAL` (minutes) to print periodic bandwidth summaries to stdout.
