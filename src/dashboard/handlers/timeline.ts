/**
 * Re-export from new timeline module for backward compatibility.
 */
export {
  initTimeline,
  addTimelineEntry,
  applyTimelineFilter,
  getTimelineCount,
  resetTypeChips,
  refreshSessionChips,
} from './timeline/index.ts';
export type { TimelineCallbacks } from './timeline/index.ts';
