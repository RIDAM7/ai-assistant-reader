/**
 * Re-baseline the .expected.json sidecars from the fixture HTML.
 *
 *   node test/regen-expected.mjs                     # all real fixtures
 *   node test/regen-expected.mjs real-chatgpt-       # those starting with this
 *
 * Run this ONLY after reviewing the diff it prints. The sidecars exist to fail
 * when parsing changes; regenerating without reading the change turns a
 * regression test into a rubber stamp. SERP Reader's rule.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseHTML } from 'linkedom';
import { collectAnswer } from './.parser.mjs';
import { expectationsOf, IDENTITY } from './expect.mjs';

const FIXTURES = 'test/fixtures';
const only = process.argv.slice(2);

const files = readdirSync(FIXTURES)
  .filter((f) => f.startsWith('real-') && f.endsWith('.html'))
  .filter((f) => only.length === 0 || only.some((o) => f.startsWith(o)));

if (files.length === 0) {
  console.error(only.length ? `no fixture matches ${only.join(', ')}` : 'no fixtures found');
  process.exit(1);
}

let changed = 0;
for (const file of files) {
  const base = file.replace(/\.html$/, '');
  const path = join(FIXTURES, `${base}.expected.json`);
  const prev = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  const parsed = collectAnswer(parseHTML(readFileSync(join(FIXTURES, file), 'utf8')).document, prev.url ?? '', {
    assistant: prev.assistant,
  });
  const identity = Object.fromEntries(IDENTITY.filter((k) => k in prev).map((k) => [k, prev[k]]));
  const next = { ...identity, ...expectationsOf(parsed) };

  const diffs = [];
  for (const key of Object.keys(next)) {
    const a = JSON.stringify(prev[key]);
    const b = JSON.stringify(next[key]);
    if (a !== b) diffs.push(`    ${key}: ${a ?? '(absent)'} -> ${b}`);
  }
  console.log(base);
  if (!diffs.length) {
    console.log('    unchanged');
    continue;
  }
  console.log(diffs.join('\n'));
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
  changed++;
}
console.log(`\n${changed} sidecar(s) rewritten. Read the diff above before committing it.`);
