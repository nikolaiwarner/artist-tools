import { useState, useEffect, useRef, useCallback, type ChangeEvent } from 'react';
import { AppMenuButton } from '../components/AppMenuButton';
import type { SyncSettings } from './syncTypes';
import {
  applySyncSettings,
  getSyncRuntimeState,
  getSyncSettingsFromStorage,
  saveSyncSettingsToStorage,
  subscribeSyncRuntime,
} from './syncRuntime';
import {
  buildBackupDocument,
  collectSnapshot,
  parseBackupDocument,
  restoreSnapshot,
} from './syncData';

interface ServerStats {
  startedAt: number;
  uptimeMs: number;
  activeDocs: number;
  roomsTracked: number;
  metrics: {
    inboundBytes: number;
    outboundBytes: number;
    inboundMessages: number;
    outboundMessages: number;
  };
}

const STATS_AUTO_REFRESH_INTERVAL_MS = 30_000;

function loadSettings(): SyncSettings {
  return getSyncSettingsFromStorage();
}

function saveSettings(settings: SyncSettings): void {
  saveSyncSettingsToStorage(settings);
}

function buildStatsUrl(serverUrl: string): string {
  return `${serverUrl.replace(/\/$/, '')}/stats`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return index === 0 ? `${Math.round(value)} ${units[index]}` : `${value.toFixed(2)} ${units[index]}`;
}

export function SyncPage() {
  const [settings, setSettings] = useState<SyncSettings>(loadSettings);
  const [draftSettings, setDraftSettings] = useState<SyncSettings>(settings);
  const [runtimeState, setRuntimeState] = useState(getSyncRuntimeState());
  const [backupStatus, setBackupStatus] = useState<string>('');
  const [backupError, setBackupError] = useState<string>('');
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState('');
  const [statsUpdatedAt, setStatsUpdatedAt] = useState<number | null>(null);
  const [statsAutoRefresh, setStatsAutoRefresh] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const statsRequestInFlightRef = useRef(false);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => subscribeSyncRuntime(setRuntimeState), []);

  function generateKey() {
    setDraftSettings((s) => ({ ...s, syncKey: crypto.randomUUID() }));
  }

  function saveAndConnect() {
    const nextSettings = {
      serverUrl: draftSettings.serverUrl.trim(),
      syncKey: draftSettings.syncKey.trim(),
    };

    setSettings(nextSettings);
    applySyncSettings(nextSettings);
  }

  const refreshServerStats = useCallback(async () => {
    if (statsRequestInFlightRef.current) return;

    const serverUrl = settings.serverUrl.trim();
    if (!serverUrl) {
      setStatsError('Set a server URL and click Save and connect first.');
      return;
    }

    if (typeof fetch !== 'function') {
      setStatsError('This browser environment does not support fetch().');
      return;
    }

    setStatsLoading(true);
    setStatsError('');
    statsRequestInFlightRef.current = true;

    try {
      const response = await fetch(buildStatsUrl(serverUrl));
      if (!response.ok) {
        throw new Error(`Server responded ${response.status} ${response.statusText}`.trim());
      }

      const nextStats = await response.json() as ServerStats;
      setStats(nextStats);
      setStatsUpdatedAt(Date.now());
    } catch (error) {
      setStatsError(error instanceof Error ? error.message : 'Failed to fetch server stats.');
    } finally {
      statsRequestInFlightRef.current = false;
      setStatsLoading(false);
    }
  }, [settings.serverUrl]);

  useEffect(() => {
    if (!statsAutoRefresh) return;
    if (!settings.serverUrl.trim()) return;
    if (runtimeState.connectionStatus === 'disconnected') return;

    void refreshServerStats();
    const intervalId = setInterval(() => {
      void refreshServerStats();
    }, STATS_AUTO_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [statsAutoRefresh, settings.serverUrl, runtimeState.connectionStatus, refreshServerStats]);

  async function exportBackup() {
    try {
      setBackupError('');

      const snapshot = await collectSnapshot();
      const backupDocument = buildBackupDocument(snapshot);
      const blob = new Blob([JSON.stringify(backupDocument, null, 2)], {
        type: 'application/json',
      });

      const url = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `artist-tools-backup-${timestamp}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      setBackupStatus('Backup exported. Keep this file in a safe place.');
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : 'Backup export failed.');
    }
  }

  async function importBackupFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setBackupError('');

      const text = await file.text();
      const snapshot = parseBackupDocument(text);
      await restoreSnapshot(snapshot);

      setBackupStatus('Backup imported. Tool data has been restored on this device.');
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : 'Backup import failed.');
    } finally {
      event.target.value = '';
    }
  }

  return (
    <div className="home-layout">
      <div className="hero-card">
        <div className="hero-card-head">
          <AppMenuButton />
          <div className="hero-card-copy">
            <p className="eyebrow">Automatic realtime sync</p>
            <h1>Sync Settings</h1>
            <p>
              Devices using the same server address and
              sync key stay in sync live.
            </p>
          </div>
        </div>
      </div>

      <div className="sync-body">
        <section className="tool-card sync-section">
          <h2>Server</h2>

          <label className="field-label" htmlFor="server-url">
            Server URL
          </label>
          <input
            id="server-url"
            type="url"
            className="text-input"
            placeholder="http://192.168.100.100:3579"
            value={draftSettings.serverUrl}
            onChange={(e) => setDraftSettings((s) => ({ ...s, serverUrl: e.target.value }))}
          />

          <label className="field-label" htmlFor="sync-key">
            Sync key
          </label>
          <div className="sync-key-row">
            <input
              id="sync-key"
              type="text"
              className="text-input"
              placeholder="A long, secret, unique key"
              value={draftSettings.syncKey}
              onChange={(e) => setDraftSettings((s) => ({ ...s, syncKey: e.target.value }))}
            />
            <button type="button" className="secondary-button" onClick={generateKey}>
              Generate
            </button>
          </div>
          <div className="sync-actions-row">
            <button type="button" className="primary-button" onClick={saveAndConnect}>
              Save and connect
            </button>
          </div>
          <p className="field-hint">
            Treat the sync key like a password — anyone with the key can read and overwrite your data on that server.
          </p>
        </section>

        <section className="tool-card sync-section">
          <h2>Realtime status</h2>
          <p className="sync-description">
            Sync runs automatically. Changes on one connected client are replicated to other connected
            clients using the same sync key.
          </p>
          <p
            className={`sync-status ${runtimeState.connectionStatus === 'connected' ? 'success' : runtimeState.connectionStatus === 'error' ? 'error' : ''}`}
          >
            {runtimeState.connectionStatus.toUpperCase()} - {runtimeState.statusMessage}
          </p>
        </section>

        <section className="tool-card sync-section">
          <h2>Server stats</h2>
          <p className="sync-description">
            Pull a live traffic snapshot from your sync server&apos;s <code>/stats</code> endpoint.
          </p>
          <div className="sync-actions-row">
            <button
              type="button"
              className="secondary-button"
              onClick={() => void refreshServerStats()}
              disabled={statsLoading}
            >
              {statsLoading ? 'Refreshing…' : 'Refresh server stats'}
            </button>
          </div>
          <label className="field-label" htmlFor="stats-auto-refresh">
            <input
              id="stats-auto-refresh"
              type="checkbox"
              checked={statsAutoRefresh}
              onChange={(event) => setStatsAutoRefresh(event.target.checked)}
              disabled={!settings.serverUrl.trim()}
            />
            {' '}Auto refresh server stats every 30s
          </label>
          {!settings.serverUrl.trim() ? (
            <p className="field-hint">Set a server URL and click Save and connect to enable stats refresh.</p>
          ) : null}
          {statsError ? <p className="sync-status error">{statsError}</p> : null}
          {stats ? (
            <div>
              <p>Outbound: {formatBytes(stats.metrics.outboundBytes)}</p>
              <p>Inbound: {formatBytes(stats.metrics.inboundBytes)}</p>
              <p>Outbound messages: {stats.metrics.outboundMessages}</p>
              <p>Inbound messages: {stats.metrics.inboundMessages}</p>
              <p>Active docs: {stats.activeDocs}</p>
              <p>Rooms tracked: {stats.roomsTracked}</p>
              {statsUpdatedAt ? (
                <p className="field-hint">Last refreshed at {new Date(statsUpdatedAt).toLocaleTimeString()}.</p>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="tool-card sync-section">
          <h2>Backup</h2>
          <p className="sync-description">
            Export all current tool data to a file and import it later to restore everything on another device.
          </p>
          <div className="sync-button-row">
            <button type="button" onClick={exportBackup}>
              Export backup
            </button>
            <button
              type="button"
              onClick={() => importFileRef.current?.click()}
            >
              Import backup
            </button>
          </div>
          <label htmlFor="backup-file-input" className="field-label">
            Import backup file
          </label>
          <input
            ref={importFileRef}
            id="backup-file-input"
            type="file"
            accept="application/json,.json"
            className="text-input"
            onChange={importBackupFile}
          />
          {backupStatus ? <p className="sync-status success">{backupStatus}</p> : null}
          {backupError ? <p className="sync-status error">{backupError}</p> : null}
        </section>

        <section className="tool-card sync-section sync-notes">
          <h2>Setup guide</h2>
          <ol>
            <li>
              Clone or download the <code>sync-server/</code> directory from the repository.
            </li>
            <li>
              Run <code>npm install</code> then <code>npm start</code> inside that directory.
            </li>
            <li>
              Enter the server address above (e.g.{' '}
              <code>http://&lt;your-machine-ip&gt;:3579</code>).
            </li>
            <li>
              Generate or type a sync key on your first device.
            </li>
            <li>
              Enter the same address and key on a second device. Both clients will sync automatically.
            </li>
          </ol>
          <p>
            See <code>sync-server/README.md</code> for options, security notes, and reverse proxy
            setup.
          </p>
        </section>
      </div>
    </div>
  );
}
