/**
 * Export. Pure string builders — no DOM, no downloads, so these are testable.
 *
 *   answers-<date>.json            every record, snapshots included
 *   answers-<date>.csv             one row per capture
 *   answer_citations-<date>.csv    one row per link in an answer and per panel source
 *
 * Links and panel sources share a file because they are one shape (order,
 * title, url, domain) and one question — who does this assistant point at —
 * with a `kind` column saying which. Captures and citations are different
 * shapes and stay in different files, SERP Reader's rule.
 */
import type { AnswerData } from '../types/answer';

/** RFC 4180: quote anything containing a comma, quote or newline; double inner quotes. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const toCsv = (header: string[], rows: unknown[][]): string =>
  [header.join(','), ...rows.map((r) => r.map(cell).join(','))].join('\r\n') + '\r\n';

export function answersCsv(answers: AnswerData[]): string {
  const header = [
    'assistant', 'question', 'collected_at', 'model', 'web_sources', 'link_count', 'source_count',
    'answer_chars', 'answer_layer', 'url', 'parser_version', 'answer_id', 'answer',
  ];
  const rows = answers.map((a) => [
    a.metadata.assistant, a.metadata.question, a.collectedAt, a.metadata.model ?? '', a.metadata.webSources ? 'yes' : 'no',
    a.links.length, a.sources.length, a.answer.length, a.diagnostics.layers.answer, a.metadata.url,
    a.diagnostics.parserVersion, a.id, a.answer,
  ]);
  return toCsv(header, rows);
}

export function citationsCsv(answers: AnswerData[]): string {
  const header = [
    'assistant', 'question', 'collected_at', 'kind', 'order', 'title', 'url', 'domain', 'site_name', 'count', 'answer_id',
  ];
  const rows: unknown[][] = [];
  for (const a of answers) {
    for (const s of a.sources) {
      rows.push([a.metadata.assistant, a.metadata.question, a.collectedAt, 'source', s.order, s.title ?? '', s.url, s.domain, s.siteName ?? '', 1, a.id]);
    }
    for (const l of a.links) {
      rows.push([a.metadata.assistant, a.metadata.question, a.collectedAt, 'link', l.order, l.anchorText, l.url, l.domain, '', l.count, a.id]);
    }
  }
  return toCsv(header, rows);
}

/**
 * The full record set as JSON, in SERP Reader's envelope: `{ exportedAt, count, answers }`.
 *
 * `includeRawHtml` is REQUIRED, deliberately, for SERP Reader's reason: a
 * default of false once shipped fifteen captures with every snapshot silently
 * stripped. An answer from last month cannot be asked for again and get the
 * same reply, so the snapshot is the one part that cannot be regenerated.
 */
export function answersJson(answers: AnswerData[], includeRawHtml: boolean, exportedAt = new Date()): string {
  const payload = answers.map((a) => (includeRawHtml ? a : { ...a, rawHtml: undefined }));
  return JSON.stringify({ exportedAt: exportedAt.toISOString(), count: payload.length, answers: payload }, null, 2);
}

/** Today's date for a file name, in UTC like every timestamp in the records. */
export const exportStamp = (now = new Date()): string => now.toISOString().slice(0, 10);
