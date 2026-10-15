/**
 * Local storage. IndexedDB, owned by the extension. SERP Reader's design.
 *
 * Not chrome.storage.local: every write there serialises the whole value, and
 * the point is to keep every month's captures with their snapshots.
 *
 * This module must only ever run in the service worker or an extension page.
 * A content script's IndexedDB belongs to chatgpt.com or claude.ai, so storing
 * there would scatter captures across four origins and lose them the moment
 * that site's data is cleared — or the person logs out.
 *
 * Two stores, on purpose. `answers` holds the full record including rawHtml;
 * `summaries` holds the row the history list shows.
 */
import type { AnswerData, AnswerSummary } from '../types/answer';

const DB_NAME = 'answer-reader';
const DB_VERSION = 1;
const ANSWERS = 'answers';
const SUMMARIES = 'summaries';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ANSWERS)) db.createObjectStore(ANSWERS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(SUMMARIES)) {
        const s = db.createObjectStore(SUMMARIES, { keyPath: 'id' });
        s.createIndex('collectedAt', 'collectedAt');
        s.createIndex('assistant', 'assistant');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string | string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => Promise<T> | T): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        let out: Promise<T> | T;
        try {
          out = fn(t);
        } catch (e) {
          reject(e);
          return;
        }
        t.oncomplete = () => {
          db.close();
          Promise.resolve(out).then(resolve, reject);
        };
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

const asPromise = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export function summarise(d: AnswerData): AnswerSummary {
  return {
    id: d.id,
    assistant: d.metadata.assistant,
    question: d.metadata.question,
    collectedAt: d.collectedAt,
    model: d.metadata.model,
    linkCount: d.links.length,
    sourceCount: d.sources.length,
    webSources: d.metadata.webSources,
  };
}

export async function saveAnswer(data: AnswerData): Promise<AnswerSummary> {
  const summary = summarise(data);
  await tx([ANSWERS, SUMMARIES], 'readwrite', (t) => {
    t.objectStore(ANSWERS).put(data);
    t.objectStore(SUMMARIES).put(summary);
  });
  return summary;
}

export function getAnswer(id: string): Promise<AnswerData | undefined> {
  return tx(ANSWERS, 'readonly', (t) => asPromise(t.objectStore(ANSWERS).get(id) as IDBRequest<AnswerData | undefined>));
}

export async function listSummaries(): Promise<AnswerSummary[]> {
  const all = await tx(SUMMARIES, 'readonly', (t) =>
    asPromise(t.objectStore(SUMMARIES).getAll() as IDBRequest<AnswerSummary[]>),
  );
  return all.sort((a, b) => b.collectedAt.localeCompare(a.collectedAt));
}

export function getAllAnswers(): Promise<AnswerData[]> {
  return tx(ANSWERS, 'readonly', (t) => asPromise(t.objectStore(ANSWERS).getAll() as IDBRequest<AnswerData[]>));
}

export function deleteAnswer(id: string): Promise<void> {
  return tx([ANSWERS, SUMMARIES], 'readwrite', (t) => {
    t.objectStore(ANSWERS).delete(id);
    t.objectStore(SUMMARIES).delete(id);
  });
}

export function clearAll(): Promise<void> {
  return tx([ANSWERS, SUMMARIES], 'readwrite', (t) => {
    t.objectStore(ANSWERS).clear();
    t.objectStore(SUMMARIES).clear();
  });
}

export function count(): Promise<number> {
  return tx(SUMMARIES, 'readonly', (t) => asPromise(t.objectStore(SUMMARIES).count()));
}
