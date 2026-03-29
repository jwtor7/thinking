/**
 * In-memory text index for search.
 * Maps entry DOM ID → lowercase searchable text.
 * Updated incrementally as entries are added/removed, eliminating
 * the need to scan live DOM nodes during search.
 */

const index = new Map<string, string>();

/** Register an entry's searchable text. */
export function indexEntry(id: string, text: string): void {
  index.set(id, text.toLowerCase());
}

/** Remove an entry from the index (called on eviction). */
export function removeEntry(id: string): void {
  index.delete(id);
}

/** Find all entry IDs whose text contains the query. */
export function queryIndex(lowerQuery: string): string[] {
  const matched: string[] = [];
  for (const [id, text] of index) {
    if (text.includes(lowerQuery)) matched.push(id);
  }
  return matched;
}

/** Clear the entire index (called on panel reset). */
export function clearIndex(): void {
  index.clear();
}
