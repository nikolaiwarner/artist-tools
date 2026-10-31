export interface SyncSettings {
  serverUrl: string;
  syncKey: string;
  syncToken: string;
}

export type SyncConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
