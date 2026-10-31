import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const serverPath = fileURLToPath(new URL('./server.js', import.meta.url));
const TOKEN = 'test-token';
let proc;
let port;
let dataDir;

function freePort() {
  return new Promise((resolve) => {
    const probe = createServer().listen(0, () => {
      const { port: found } = probe.address();
      probe.close(() => resolve(found));
    });
  });
}

function statsStatus(query = '') {
  return fetch(`http://127.0.0.1:${port}/stats${query}`).then((res) => res.status);
}

function socketOpens(query = '') {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/yjs-ws/room${query}`);
    ws.on('open', () => {
      ws.close();
      resolve(true);
    });
    ws.on('error', () => resolve(false));
  });
}

before(async () => {
  port = await freePort();
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artist-tools-auth-'));
  proc = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, SYNC_TOKEN: TOKEN },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i += 1) {
    try {
      await fetch(`http://127.0.0.1:${port}/health`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error('server did not start');
});

after(() => {
  proc.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('health needs no token', async () => {
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(res.status, 200);
});

test('stats requires the right token', async () => {
  assert.equal(await statsStatus(), 401);
  assert.equal(await statsStatus('?token=wrong'), 401);
  assert.equal(await statsStatus(`?token=${TOKEN}`), 200);
});

test('sync socket requires the right token', async () => {
  assert.equal(await socketOpens(), false);
  assert.equal(await socketOpens('?token=wrong'), false);
  assert.equal(await socketOpens(`?token=${TOKEN}`), true);
});
