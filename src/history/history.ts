/**
 * History page: list, filter, view, export, delete.
 *
 * Renders from the summaries store, so listing hundreds of captures never
 * loads a snapshot. The full record is fetched only when a row is opened.
 */
import type { BackgroundResponse } from '../types/messages';
import type { AnswerData, AnswerSummary } from '../types/answer';
import { ASSISTANT_NAMES } from '../parser/sites';
import { download, exportAll } from '../shared/files';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const rowsEl = $('rows');
const emptyEl = $('empty');
const subEl = $('sub');
const filterEl = $<HTMLInputElement>('filter');
const assistantEl = $<HTMLSelectElement>('assistant');
const viewer = $<HTMLDialogElement>('viewer');
const viewerBody = $('viewer-body');
const viewerTitle = $('viewer-title');

let summaries: AnswerSummary[] = [];
let openRecord: AnswerData | undefined;

const send = (msg: unknown): Promise<BackgroundResponse> =>
  chrome.runtime.sendMessage(msg) as Promise<BackgroundResponse>;

/** Local time, for reading; the records themselves hold UTC. */
const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
};

const cell = (textValue: string, className = '') => {
  const td = document.createElement('td');
  td.textContent = textValue;
  if (className) td.className = className;
  return td;
};

function render() {
  const q = filterEl.value.trim().toLowerCase();
  const who = assistantEl.value;
  const shown = summaries.filter(
    (s) =>
      (!who || s.assistant === who) &&
      (!q || s.question.toLowerCase().includes(q) || (s.model ?? '').toLowerCase().includes(q)),
  );

  rowsEl.textContent = '';
  emptyEl.hidden = shown.length > 0;

  for (const s of shown) {
    const tr = document.createElement('tr');
    tr.className = 'row';

    const question = document.createElement('td');
    const qSpan = document.createElement('span');
    qSpan.className = 'q';
    qSpan.textContent = s.question || '(no question found)';
    qSpan.addEventListener('click', () => view(s.id));
    question.append(qSpan);

    const assistant = document.createElement('td');
    const chip = document.createElement('span');
    chip.className = s.webSources ? 'chip web' : 'chip';
    chip.textContent = ASSISTANT_NAMES[s.assistant];
    chip.title = s.webSources ? 'Web sources appear in this answer' : 'No web sources in this answer';
    assistant.append(chip);

    const actions = document.createElement('td');
    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.className = 'danger';
    del.addEventListener('click', async () => {
      if (!confirm(`Delete this ${ASSISTANT_NAMES[s.assistant]} capture? This cannot be undone.`)) return;
      await send({ type: 'DELETE', id: s.id });
      await load();
    });
    actions.append(del);

    tr.append(
      question,
      assistant,
      cell(when(s.collectedAt)),
      cell(s.model ?? '–', s.model ? '' : 'muted'),
      cell(String(s.linkCount), 'num'),
      cell(String(s.sourceCount), 'num'),
      actions,
    );
    rowsEl.append(tr);
  }

  const filtered = q || who;
  subEl.textContent = `${summaries.length} capture(s)${filtered ? ` · ${shown.length} matching` : ''}`;
}

async function view(id: string) {
  const res = await send({ type: 'GET', id });
  if (!res.ok || res.type !== 'GET' || !res.data) return;
  openRecord = res.data;
  viewerTitle.textContent = `${ASSISTANT_NAMES[res.data.metadata.assistant]} · ${res.data.metadata.question || 'Answer'}`;
  // rawHtml is dropped from the preview: it is the biggest field and unreadable
  // in a <pre>. It stays in storage and in a full JSON export.
  viewerBody.textContent = JSON.stringify({ ...res.data, rawHtml: res.data.rawHtml ? `(${res.data.rawHtml.length} characters, in the export)` : undefined }, null, 2);
  viewer.showModal();
}

async function load() {
  const res = await send({ type: 'LIST' });
  summaries = res.ok && res.type === 'LIST' ? res.summaries : [];
  render();
}

filterEl.addEventListener('input', render);
assistantEl.addEventListener('change', render);
$('viewer-close').addEventListener('click', () => viewer.close());
$('viewer-json').addEventListener('click', () => {
  if (!openRecord) return;
  const slug = openRecord.metadata.question.toLowerCase().replace(/\W+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  download(`answer-${openRecord.metadata.assistant}-${slug || openRecord.id}.json`, JSON.stringify(openRecord, null, 2));
});

$('export').addEventListener('click', async () => {
  const res = await send({ type: 'GET_ALL' });
  if (!res.ok || res.type !== 'GET_ALL' || !res.answers.length) return;
  exportAll(res.answers);
});

$('clear').addEventListener('click', async () => {
  if (!confirm(`Delete all ${summaries.length} captures? This cannot be undone.`)) return;
  await send({ type: 'CLEAR' });
  await load();
});

void load();
