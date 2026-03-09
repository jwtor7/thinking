/**
 * DOM Filter Utilities
 *
 * Applies filter predicates to DOM entry collections.
 * Replaces duplicated querySelectorAll + forEach patterns across panels.
 */

/**
 * Apply a visibility predicate to all matching entries in a container.
 * Returns the count of visible entries.
 */
export function filterEntries(
  container: HTMLElement | null,
  selector: string,
  predicate: (el: HTMLElement) => boolean,
): number {
  if (!container) return 0;

  let visible = 0;
  const entries = container.querySelectorAll(selector);
  entries.forEach((entry) => {
    const el = entry as HTMLElement;
    const show = predicate(el);
    el.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  return visible;
}
