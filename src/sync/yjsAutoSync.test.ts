import { describe, expect, it } from 'vitest';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import { buildProviderOptions } from './yjsAutoSync';

function providerUrl(token: string): string {
  const options = { ...buildProviderOptions(token), connect: false };
  const provider = new WebsocketProvider('ws://127.0.0.1:3579/yjs-ws', 'room', new Y.Doc(), options);
  const { url } = provider;
  provider.destroy();
  return url;
}

describe('buildProviderOptions', () => {
  it('appends the token to the WebSocket URL', () => {
    expect(providerUrl('secret value')).toBe('ws://127.0.0.1:3579/yjs-ws/room?token=secret%20value');
  });

  it('leaves the URL alone when there is no token', () => {
    expect(providerUrl('')).toBe('ws://127.0.0.1:3579/yjs-ws/room');
  });
});
