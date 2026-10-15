/**
 * The on-page Collect panel. SERP Reader's, in a shadow root for the same
 * reason: these apps restyle constantly, and without isolation the panel
 * inherits whatever rules exist that week.
 *
 * Draggable, and the position is remembered per site — it must never end up
 * parked over the answer, which is the part being read. It starts lower than
 * SERP Reader's so the two never stack on a Google page.
 */
const POSITION_KEY = 'answer-reader:panel-position';

export interface FloatingUI {
  setStatus(text: string, tone?: 'idle' | 'busy' | 'ok' | 'error'): void;
  setTitle(text: string): void;
  destroy(): void;
}

export function mountFloatingPanel(title: string, onCollect: () => void | Promise<void>): FloatingUI {
  const host = document.createElement('div');
  host.id = 'answer-reader-root';
  host.style.cssText = 'position:fixed;z-index:2147483647;top:260px;right:20px;';
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    .panel {
      font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      background: #ffffff; color: #202124;
      border: 1px solid #dadce0; border-radius: 10px;
      box-shadow: 0 2px 12px rgba(0,0,0,.18);
      width: 200px; overflow: hidden; user-select: none;
    }
    .head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 7px 10px; background: #f8f9fa; border-bottom: 1px solid #ecedef;
      cursor: grab; font-weight: 600; font-size: 12px;
    }
    .head:active { cursor: grabbing; }
    .body { padding: 10px; }
    button {
      width: 100%; padding: 8px 10px; font: inherit; font-weight: 600;
      color: #fff; background: #00796b; border: 0; border-radius: 6px; cursor: pointer;
    }
    button:hover { background: #00695c; }
    button:disabled { background: #9aa0a6; cursor: default; }
    .status { margin-top: 8px; font-size: 11.5px; color: #5f6368; min-height: 15px; }
    .status.ok { color: #188038; }
    .status.error { color: #c5221f; }
    .status.busy { color: #b06000; }
  `;

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="head"><span class="title"></span><span class="grip">⠿</span></div>
    <div class="body">
      <button type="button" class="collect">Collect answer</button>
      <div class="status">Ready</div>
    </div>`;

  shadow.append(style, panel);
  document.documentElement.appendChild(host);

  const titleEl = shadow.querySelector('.title') as HTMLElement;
  const button = shadow.querySelector('.collect') as HTMLButtonElement;
  const status = shadow.querySelector('.status') as HTMLElement;
  titleEl.textContent = title;

  const setStatus: FloatingUI['setStatus'] = (t, tone = 'idle') => {
    status.textContent = t;
    status.className = `status ${tone}`;
  };

  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await onCollect();
    } finally {
      button.disabled = false;
    }
  });

  // --- dragging -----------------------------------------------------------
  try {
    const saved = localStorage.getItem(POSITION_KEY);
    if (saved) {
      const { top, left } = JSON.parse(saved) as { top: number; left: number };
      host.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, top))}px`;
      host.style.left = `${Math.max(0, Math.min(window.innerWidth - 60, left))}px`;
      host.style.right = 'auto';
    }
  } catch {
    /* a blocked localStorage must not cost us the panel */
  }

  const head = shadow.querySelector('.head') as HTMLElement;
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  head.addEventListener('mousedown', (e) => {
    dragging = true;
    const r = host.getBoundingClientRect();
    offsetX = e.clientX - r.left;
    offsetY = e.clientY - r.top;
    e.preventDefault();
  });
  const onMove = (e: MouseEvent) => {
    if (!dragging) return;
    const left = Math.max(0, Math.min(window.innerWidth - 60, e.clientX - offsetX));
    const top = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - offsetY));
    host.style.left = `${left}px`;
    host.style.top = `${top}px`;
    host.style.right = 'auto';
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    try {
      const r = host.getBoundingClientRect();
      localStorage.setItem(POSITION_KEY, JSON.stringify({ top: r.top, left: r.left }));
    } catch {
      /* ignore */
    }
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);

  return {
    setStatus,
    setTitle: (t) => {
      titleEl.textContent = t;
    },
    destroy: () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      host.remove();
    },
  };
}
