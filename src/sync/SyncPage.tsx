import { useState, useEffect } from 'react';
import { AppMenuButton } from '../components/AppMenuButton';
import type { SyncSettings } from './syncTypes';
import {
  applySyncSettings,
  getSyncRuntimeState,
  getSyncSettingsFromStorage,
  saveSyncSettingsToStorage,
  subscribeSyncRuntime,
} from './syncRuntime';

function loadSettings(): SyncSettings {
  return getSyncSettingsFromStorage();
}

function saveSettings(settings: SyncSettings): void {
  saveSyncSettingsToStorage(settings);
}

export function SyncPage() {
  const [settings, setSettings] = useState<SyncSettings>(loadSettings);
  const [draftSettings, setDraftSettings] = useState<SyncSettings>(settings);
  const [runtimeState, setRuntimeState] = useState(getSyncRuntimeState());

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
