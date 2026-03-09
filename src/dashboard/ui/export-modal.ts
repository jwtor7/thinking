/**
 * Export Modal Component
 *
 * Re-export shim - actual implementation split into:
 * - ./export/modal.ts  (modal lifecycle, focus trap, DOM creation, export logic)
 * - ./export/browser.ts (file browser, directory navigation)
 */

export type { ExportModalCallbacks } from './export/index.ts';
export {
  initExportModal,
  openExportModal,
  closeExportModal,
  toggleExportModal,
  isExportModalOpen,
  isExportAllowed,
  updateExportButtonState,
  tryOpenExportModal,
} from './export/index.ts';
