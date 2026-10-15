/**
 * Popup. Asks the content script to read the page, asks the worker for counts.
 *
 * Deliberately thin: no parsing here, because the popup cannot see the answer —
 * it lives in the extension's own document. Everything it shows came from one
 * of the two message round-trips below.
 */
import type { BackgroundResponse, ContentResponse } from '../types/messages';
import { ASSISTANT_NAMES } from '../parser/sites';
import { exportAll } from '../shared/files';
import { diagnosticsLines, savedLine } from '../shared/lines';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const els = {
  context: $('context'),
  assistant: $('s-assistant'),
  model: $('s-model'),
  answer: $('s-answer'),
  links: $('s-links'),
  sources: $('s-sources'),
  web: $('s-web'),
  total: $('s-total'),
  collect: $<HTMLButtonElement>('collect'),
  history: $<HTMLButtonElement>('history'),
  exportAll: $<HTMLButtonElement>('export'),
  msg: $('msg'),
  rawHtml: $<HTMLInputElement>('raw-html'),
  diagWrap: $<HTMLDetailsElement>('diag-wrap'),
  diag: $('diag'),
};

function say(text: string, tone: '' | 'ok' | 'error' | 'busy' = '') {
  els.msg.textContent = text;
  els.msg.className = `msg ${tone}`;
}

const toBackground = (msg: unknown): Promise<BackgroundResponse> =>
  chrome.runtime.sendMessage(msg) as Promise<BackgroundResponse>;

async function toContent(msg: unknown): Promise<ContentResponse> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab.');
  try {
    return (await chrome.tabs.sendMessage(tab.id, msg)) as ContentResponse;
  } catch {
    /*
     * The usual cause is not a bug: this tab is not ChatGPT, Perplexity, Claude
     * or Google, or it was open before the extension was loaded and needs one
     * refresh.
     */
    throw new Error('No Answer Reader on this tab. Open ChatGPT, Perplexity, Claude or Google AI Mode, then reload it once.');
  }
}

async function refresh() {
  const totals = await toBackground({ type: 'COUNT' });
  if (totals.ok && totals.type === 'COUNT') els.total.textContent = String(totals.count);

  try {
    const res = await toContent({ type: 'PREVIEW' });
    if (!res.ok) {
      els.context.textContent = res.error;
      els.collect.disabled = true;
      return;
    }
    if (res.type !== 'PREVIEW') return;
    els.context.textContent = res.question ? `Question: ${res.question}` : 'No question found yet';
    els.assistant.textContent = ASSISTANT_NAMES[res.assistant];
    els.model.textContent = res.model ?? 'not shown';
    els.answer.textContent = res.answerChars ? `${res.answerChars} characters` : 'none yet';
    els.links.textContent = String(res.links);
    els.sources.textContent = String(res.sources);
    els.web.textContent = res.webSources ? 'yes' : 'no';
    els.collect.disabled = res.answerChars === 0;
    if (res.streaming) say('The answer looks unfinished. Collect when it is done.', 'busy');
  } catch (err) {
    els.context.textContent = err instanceof Error ? err.message : String(err);
    els.collect.disabled = true;
  }
}

els.collect.addEventListener('click', async () => {
  els.collect.disabled = true;
  say('Reading answer…', 'busy');
  try {
    const res = await toContent({ type: 'COLLECT', includeRawHtml: els.rawHtml.checked });
    if (!res.ok) {
      say(res.error, 'error');
      return;
    }
    if (res.type !== 'COLLECTED') return;
    say(savedLine(res.data), res.data.diagnostics.streaming ? 'busy' : 'ok');
    els.diag.textContent = diagnosticsLines(res.data).join('\n');
    els.diagWrap.hidden = false;
    await refresh();
  } catch (err) {
    say(err instanceof Error ? err.message : String(err), 'error');
  } finally {
    els.collect.disabled = false;
  }
});

els.history.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
});

els.exportAll.addEventListener('click', async () => {
  say('Building export…', 'busy');
  const res = await toBackground({ type: 'GET_ALL' });
  if (!res.ok || res.type !== 'GET_ALL') {
    say('Could not read stored captures.', 'error');
    return;
  }
  if (!res.answers.length) {
    say('Nothing collected yet.', 'error');
    return;
  }
  exportAll(res.answers);
  say(`Exported ${res.answers.length} capture(s): 1 JSON + 2 CSVs.`, 'ok');
});

void refresh();
