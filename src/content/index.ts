/**
 * Content script: reads the answer that is already on screen.
 *
 * It never types, clicks, submits, scrolls, or makes a request of its own.
 * Automating questions to these services breaks their terms, and a capture is
 * only worth having if a person asked the question. A capture happens because
 * that person pressed a button — in the popup or the floating panel, both of
 * which land here — and what is read is the DOM they are looking at.
 *
 * Storage is not done here. This script runs in the assistant's origin, so its
 * IndexedDB would belong to chatgpt.com or claude.ai; the parsed record is
 * handed to the service worker, which owns the database.
 */
import { ASSISTANT_NAMES, collectAnswer, detectAssistant } from '../parser';
import { mountFloatingPanel, type FloatingUI } from './floating-ui';
import { savedLine } from '../shared/lines';
import type { ContentRequest, ContentResponse, Preview } from '../types/messages';
import type { AnswerData } from '../types/answer';

const current = () => detectAssistant(location.href);

function collect(includeRawHtml: boolean): AnswerData {
  return collectAnswer(document, location.href, { includeRawHtml });
}

async function save(data: AnswerData): Promise<void> {
  const res = await chrome.runtime.sendMessage({ type: 'SAVE', data });
  if (!res?.ok) throw new Error(res?.error ?? 'The extension could not save this capture.');
}

/** Counts for the popup, without building a snapshot or storing anything. */
function preview(): Preview {
  const d = collect(false);
  return {
    assistant: d.metadata.assistant,
    question: d.metadata.question,
    model: d.metadata.model,
    answerChars: d.metadata.answerChars,
    links: d.links.length,
    sources: d.sources.length,
    webSources: d.metadata.webSources,
    streaming: d.diagnostics.streaming,
  };
}

chrome.runtime.onMessage.addListener((msg: ContentRequest, _sender, sendResponse) => {
  (async (): Promise<ContentResponse> => {
    const assistant = current();
    if (msg.type === 'PING') return { ok: true, type: 'PONG', assistant };
    if (!assistant) {
      return {
        ok: false,
        code: 'NOT_SUPPORTED',
        error: 'Not an assistant answer page. Google search is read on its AI Mode tab only (udm=50); Gemini at gemini.google.com.',
      };
    }
    if (msg.type === 'PREVIEW') return { ok: true, type: 'PREVIEW', ...preview() };
    if (msg.type === 'COLLECT') {
      const data = collect(msg.includeRawHtml !== false);
      if (!data.answer) {
        return { ok: false, code: 'NO_ANSWER', error: 'No answer found on this page. Ask the question, wait for the answer, then collect.' };
      }
      await save(data);
      return { ok: true, type: 'COLLECTED', data };
    }
    return { ok: false, code: 'FAILED', error: 'Unknown request.' };
  })()
    .then(sendResponse)
    .catch((err) =>
      sendResponse({ ok: false, code: 'FAILED', error: err instanceof Error ? err.message : String(err) }),
    );
  return true;
});

/* -------------------------------------------------------------- floating UI */

let ui: FloatingUI | null = null;

function syncPanel() {
  const assistant = current();
  if (!assistant) {
    ui?.destroy();
    ui = null;
    return;
  }
  const title = `Answer Reader · ${ASSISTANT_NAMES[assistant]}`;
  if (ui) {
    ui.setTitle(title);
    return;
  }
  ui = mountFloatingPanel(title, async () => {
    ui?.setStatus('Reading answer…', 'busy');
    try {
      const data = collect(true);
      if (!data.answer) {
        ui?.setStatus('No answer found on this page', 'error');
        return;
      }
      await save(data);
      ui?.setStatus(data.diagnostics.streaming ? 'Saved, but it looked unfinished' : savedLine(data), data.diagnostics.streaming ? 'error' : 'ok');
    } catch (err) {
      ui?.setStatus(err instanceof Error ? err.message : 'Collection failed', 'error');
    }
  });
}

/*
 * These are single-page apps: a new chat, or Google's switch to the AI Mode
 * tab, changes the URL without reloading this script. A once-a-second look at
 * location.href — no DOM work, no requests — keeps the panel on the pages it
 * can read and off the ones it cannot.
 */
syncPanel();
let lastHref = location.href;
setInterval(() => {
  if (location.href === lastHref) return;
  lastHref = location.href;
  syncPanel();
}, 1000);
