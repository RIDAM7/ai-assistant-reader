/**
 * Turn real captures into test fixtures.
 *
 *   node test/import-capture.mjs path/to/answers-2026-10-20.json
 *
 * Writes, per capture with a snapshot, test/fixtures/real-<assistant>-<slug>.html
 * (the snapshot as exported) and a sidecar .expected.json recording what the
 * CURRENT parser reads from it — not what the export says. The export was made
 * by whatever version was installed, bugs included; the HTML is the evidence,
 * and the expectations are today's reading of it. SERP Reader's rule.
 *
 * Exports made with "Keep the conversation's HTML" unticked have nothing to
 * import, and this says so rather than writing empty files.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseHTML } from 'linkedom';
import { collectAnswer } from './.parser.mjs';
import { expectationsOf } from './expect.mjs';

const [input] = process.argv.slice(2);
if (!input) {
  console.error('usage: node test/import-capture.mjs <answers-YYYY-MM-DD.json>');
  process.exit(1);
}

const FIXTURES = 'test/fixtures';
mkdirSync(FIXTURES, { recursive: true });

const payload = JSON.parse(readFileSync(input, 'utf8'));
const answers = Array.isArray(payload) ? payload : (payload.answers ?? [payload]);
const slug = (s) =>
  (s || 'answer')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);

let written = 0;
let skipped = 0;
for (const a of answers) {
  if (!a.rawHtml) {
    skipped++;
    continue;
  }
  /*
   * The fixture is the snapshot taken again with TODAY's privacy rules, not the
   * export's copy. A capture made by an older version keeps whatever that
   * version failed to strip: the first Claude export carried the linked
   * computer's name from the chat header, and a fixture is committed.
   */
  const resnap = collectAnswer(parseHTML(a.rawHtml).document, a.metadata.url, { assistant: a.metadata.assistant, includeRawHtml: true });
  const html = resnap.rawHtml ?? a.rawHtml;
  // Named from today's reading of the question: an older export may have missed it.
  const base = `real-${a.metadata.assistant}-${slug(resnap.metadata.question || a.metadata.question)}`;
  writeFileSync(join(FIXTURES, `${base}.html`), html);
  const parsed = collectAnswer(parseHTML(html).document, a.metadata.url, { assistant: a.metadata.assistant });
  const expected = {
    origin: `Answer Reader capture, from ${basename(input)}`,
    capturedAt: a.collectedAt,
    url: a.metadata.url,
    assistant: a.metadata.assistant,
    ...expectationsOf(parsed),
  };
  writeFileSync(join(FIXTURES, `${base}.expected.json`), `${JSON.stringify(expected, null, 2)}\n`);
  written++;
  console.log(
    `  ${base}.html  (${parsed.links.length} links, ${parsed.sources.length} sources; answer from the ${parsed.diagnostics.layers.answer} layer)`,
  );
}

console.log(`\n${written} fixture(s) written to ${FIXTURES}/`);
if (skipped) console.log(`${skipped} capture(s) had no rawHtml: collect again with "Keep the conversation's HTML" ticked.`);
if (written) console.log('\nnpm test now includes them. Read each sidecar: it is what the parser reads today, right or wrong.');
