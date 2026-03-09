/**
 * Lifecycle management for disposable resources.
 *
 * Provides a Disposable interface and DisposableGroup for collecting
 * interval/timeout handles and cleaning them up together.
 */

/**
 * A resource that can be cleaned up.
 */
export interface Disposable {
  dispose(): void;
}

/**
 * Collects disposable resources and disposes them all at once.
 * Useful for cleaning up timers, event listeners, and other resources
 * when a panel or handler is torn down.
 */
export class DisposableGroup implements Disposable {
  private disposables: Disposable[] = [];

  /**
   * Add a disposable resource to the group.
   */
  add(disposable: Disposable): void {
    this.disposables.push(disposable);
  }

  /**
   * Register an interval and track it for disposal.
   */
  addInterval(id: ReturnType<typeof setInterval>): void {
    this.disposables.push({ dispose: () => clearInterval(id) });
  }

  /**
   * Register a timeout and track it for disposal.
   */
  addTimeout(id: ReturnType<typeof setTimeout>): void {
    this.disposables.push({ dispose: () => clearTimeout(id) });
  }

  /**
   * Dispose all tracked resources.
   */
  dispose(): void {
    for (const d of this.disposables) {
      try {
        d.dispose();
      } catch {
        // Ignore disposal errors
      }
    }
    this.disposables = [];
  }

  /**
   * Get the number of tracked disposables (for debugging).
   */
  get size(): number {
    return this.disposables.length;
  }
}
