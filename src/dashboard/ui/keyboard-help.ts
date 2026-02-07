/**
 * Keyboard Shortcut Help Overlay
 *
 * Shows all available keyboard shortcuts in a modal dialog.
 * Triggered by pressing '?' key.
 */

let backdropElement: HTMLElement | null = null;
let previouslyFocused: Element | null = null;

const SHORTCUT_GROUPS = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['a'], desc: 'All view' },
      { keys: ['t'], desc: 'Thinking view' },
      { keys: ['o'], desc: 'Tools view' },
      { keys: ['h'], desc: 'Hooks view' },
      { keys: ['m'], desc: 'Team view' },
      { keys: ['k'], desc: 'Tasks view' },
      { keys: ['l'], desc: 'Timeline view' },
      { keys: ['p'], desc: 'Plan view' },
    ],
  },
  {
    title: 'Panels',
    shortcuts: [
      { keys: ['Shift', 'T'], desc: 'Toggle Thinking panel' },
      { keys: ['Shift', 'O'], desc: 'Toggle Tools panel' },
      { keys: ['Shift', 'H'], desc: 'Toggle Hooks panel' },
      { keys: ['Shift', 'M'], desc: 'Toggle Team panel' },
      { keys: ['Shift', 'K'], desc: 'Toggle Tasks panel' },
      { keys: ['Shift', 'L'], desc: 'Toggle Timeline panel' },
      { keys: ['Shift', 'P'], desc: 'Panel visibility settings' },
    ],
  },
  {
    title: 'Actions',
    shortcuts: [
      { keys: ['/'], desc: 'Focus filter input' },
      { keys: ['s'], desc: 'Toggle auto-scroll' },
      { keys: ['c'], desc: 'Clear all panels' },
      { keys: ['Esc'], desc: 'Clear filters / close modal' },
      { keys: ['?'], desc: 'Show this help' },
    ],
  },
  {
    title: 'Commands',
    shortcuts: [
      { keys: ['\u2318', 'K'], desc: 'Global search' },
      { keys: ['\u2318', 'E'], desc: 'Export as Markdown' },
      { keys: ['\u2318', 'O'], desc: 'Open plan in editor' },
      { keys: ['\u2318', 'Shift', 'R'], desc: 'Reveal plan in Finder' },
    ],
  },
];

function renderKey(key: string): string {
  return `<kbd>${key}</kbd>`;
}

function createModal(): HTMLElement {
  const backdrop = document.createElement('div');
  backdrop.className = 'keyboard-help-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'Keyboard shortcuts');

  const modal = document.createElement('div');
  modal.className = 'keyboard-help-modal';

  // Header
  const header = document.createElement('div');
  header.className = 'keyboard-help-header';
  header.innerHTML = `
    <h2 class="keyboard-help-title">Keyboard Shortcuts</h2>
    <button class="keyboard-help-close" aria-label="Close">&times;</button>
  `;

  // Body
  const body = document.createElement('div');
  body.className = 'keyboard-help-body';

  const grid = document.createElement('div');
  grid.className = 'keyboard-help-grid';

  for (const group of SHORTCUT_GROUPS) {
    const section = document.createElement('div');
    section.className = 'keyboard-help-section';

    const title = document.createElement('h3');
    title.className = 'keyboard-help-section-title';
    title.textContent = group.title;
    section.appendChild(title);

    const list = document.createElement('dl');
    list.className = 'keyboard-help-list';

    for (const shortcut of group.shortcuts) {
      const row = document.createElement('div');
      row.className = 'keyboard-help-row';

      const dt = document.createElement('dt');
      dt.className = 'keyboard-help-keys';
      dt.innerHTML = shortcut.keys.map(renderKey).join(' ');

      const dd = document.createElement('dd');
      dd.className = 'keyboard-help-desc';
      dd.textContent = shortcut.desc;

      row.appendChild(dt);
      row.appendChild(dd);
      list.appendChild(row);
    }

    section.appendChild(list);
    grid.appendChild(section);
  }

  body.appendChild(grid);
  modal.appendChild(header);
  modal.appendChild(body);
  backdrop.appendChild(modal);

  return backdrop;
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closeKeyboardHelp();
    return;
  }

  if (event.key === 'Tab' && backdropElement) {
    const focusable = backdropElement.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }
}

export function openKeyboardHelp(): void {
  if (backdropElement) return; // Already open

  previouslyFocused = document.activeElement;

  backdropElement = createModal();
  document.body.appendChild(backdropElement);

  // Backdrop click closes
  backdropElement.addEventListener('click', (e) => {
    if (e.target === backdropElement) closeKeyboardHelp();
  });

  // Close button
  const closeBtn = backdropElement.querySelector('.keyboard-help-close');
  closeBtn?.addEventListener('click', closeKeyboardHelp);

  // Keyboard handling
  document.addEventListener('keydown', handleKeydown);

  // Show with animation
  requestAnimationFrame(() => {
    backdropElement?.classList.add('visible');
    (closeBtn as HTMLElement)?.focus();
  });
}

export function closeKeyboardHelp(): void {
  if (!backdropElement) return;

  document.removeEventListener('keydown', handleKeydown);

  backdropElement.classList.remove('visible');

  // Remove after transition
  const el = backdropElement;
  setTimeout(() => {
    el.remove();
  }, 200);

  backdropElement = null;

  // Restore focus
  if (previouslyFocused instanceof HTMLElement) {
    previouslyFocused.focus();
  }
  previouslyFocused = null;
}

export function isKeyboardHelpOpen(): boolean {
  return backdropElement !== null;
}
