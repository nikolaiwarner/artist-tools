export interface SyncSettings {
  serverUrl: string;
  syncKey: string;
}

export type SyncConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
