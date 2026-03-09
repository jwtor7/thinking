import { describe, it, expect, vi } from 'vitest';
import { DisposableGroup } from './lifecycle.ts';

describe('DisposableGroup', () => {
  it('disposes all added resources', () => {
    const group = new DisposableGroup();
    const dispose1 = vi.fn();
    const dispose2 = vi.fn();
    group.add({ dispose: dispose1 });
    group.add({ dispose: dispose2 });
    expect(group.size).toBe(2);

    group.dispose();
    expect(dispose1).toHaveBeenCalled();
    expect(dispose2).toHaveBeenCalled();
    expect(group.size).toBe(0);
  });

  it('clears intervals on dispose', () => {
    vi.useFakeTimers();
    const group = new DisposableGroup();
    let count = 0;
    const id = setInterval(() => count++, 100);
    group.addInterval(id);

    vi.advanceTimersByTime(300);
    expect(count).toBe(3);

    group.dispose();
    vi.advanceTimersByTime(300);
    expect(count).toBe(3); // No more increments after dispose
    vi.useRealTimers();
  });

  it('clears timeouts on dispose', () => {
    vi.useFakeTimers();
    const group = new DisposableGroup();
    let called = false;
    const id = setTimeout(() => { called = true; }, 1000);
    group.addTimeout(id);

    group.dispose();
    vi.advanceTimersByTime(2000);
    expect(called).toBe(false);
    vi.useRealTimers();
  });

  it('ignores disposal errors', () => {
    const group = new DisposableGroup();
    group.add({
      dispose: () => { throw new Error('boom'); },
    });
    group.add({ dispose: vi.fn() });

    // Should not throw
    expect(() => group.dispose()).not.toThrow();
  });

  it('can be disposed multiple times safely', () => {
    const group = new DisposableGroup();
    const dispose = vi.fn();
    group.add({ dispose });

    group.dispose();
    group.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
