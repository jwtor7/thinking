import { describe, it, expect, vi } from 'vitest';
import { EventReceiver } from './event-receiver.ts';
import type { WebSocketHub } from './websocket-hub.ts';

class MockWebSocketHub implements Pick<WebSocketHub, 'broadcast' | 'getClientCount'> {
  broadcast(): void {}
  getClientCount(): number {
    return 0;
  }
}

describe('EventReceiver lifecycle', () => {
  it('clears stale-tool cleanup interval on destroy', () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    const receiver = new EventReceiver(new MockWebSocketHub() as unknown as WebSocketHub);
    receiver.destroy();

    expect(clearIntervalSpy).toHaveBeenCalled();

    clearIntervalSpy.mockRestore();
    vi.useRealTimers();
  });
});
