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
  it('clears its stale-tool cleanup interval on destroy', () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    const receiver = new EventReceiver(new MockWebSocketHub() as unknown as WebSocketHub);
    const receiverCleanupInterval =
      setIntervalSpy.mock.results[setIntervalSpy.mock.results.length - 1]?.value;

    expect(receiverCleanupInterval).toBeDefined();

    receiver.destroy();

    expect(clearIntervalSpy).toHaveBeenCalledWith(receiverCleanupInterval);

    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
    vi.useRealTimers();
  });
});
