/**
 * Re-read an export with the current parser.
 *
 *   npm run reparse -- path/to/answers-2026-10-20.json
 *
 * Writes answers-2026-10-20.reparsed.json beside it: the same envelope, every
 * record with a snapshot read again, its id and collectedAt kept, so a capture
 * from last month benefits from a selector fixed today. Records without a
 * snapshot are copied unchanged and counted. Prints what moved per record.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { collectAnswer } from './.parser.mjs';

const [input] = process.argv.slice(2);
if (!input) {
  console.error('usage: npm run reparse -- <answers-YYYY-MM-DD.json>');
  process.exit(1);
}

const payload = JSON.parse(readFileSync(input, 'utf8'));
const answers = Array.isArray(payload) ? payload : (payload.answers ?? [payload]);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let reread = 0;
let kept = 0;
const out = answers.map((a) => {
  if (!a.rawHtml) {
    kept++;
    return a;
  }
  const d = collectAnswer(parseHTML(a.rawHtml).document, a.metadata.url, { assistant: a.metadata.assistant });
  const moved = [];
  if (d.metadata.question !== a.metadata.question) moved.push('question');
  if (d.answer !== a.answer) moved.push('answer');
  if (!same(d.links.map((l) => l.url), a.links.map((l) => l.url))) moved.push(`links ${a.links.length}->${d.links.length}`);
  if (!same(d.sources.map((s) => s.url), a.sources.map((s) => s.url))) moved.push(`sources ${a.sources.length}->${d.sources.length}`);
  const label = (a.metadata.question || '(no question)').slice(0, 60);
  console.log(`  ${a.metadata.assistant.padEnd(15)} ${label.padEnd(60)} ${moved.length ? moved.join(', ') : 'unchanged'}`);
  reread++;
  // Identity is the original's. So is the model label when the snapshot lacks the header it came from.
  return {
    ...d,
    id: a.id,
    collectedAt: a.collectedAt,
    metadata: { ...d.metadata, model: d.metadata.model ?? a.metadata.model },
    rawHtml: a.rawHtml,
  };
});

const target = input.replace(/\.json$/i, '.reparsed.json');
const envelope = { exportedAt: payload.exportedAt, reparsedAt: new Date().toISOString(), count: out.length, answers: out };
writeFileSync(target, JSON.stringify(envelope, null, 2));
console.log(`\n${reread} re-read, ${kept} without a snapshot kept as they were -> ${target}`);
