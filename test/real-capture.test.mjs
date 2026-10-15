/**
 * Regression tests against real captures: the fixtures that prove the
 * selectors work, because they are the assistants' own markup.
 *
 *   node test/import-capture.mjs <answers-YYYY-MM-DD.json>
 *
 * What is asserted is shape, not wording (test/expect.mjs). The value shows up
 * on the day someone edits selectors.ts: if a count or a domain moves, the edit
 * changed something, and that is exactly what the synthetic fixtures cannot
 * catch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseHTML } from 'linkedom';

import { collectAnswer } from './.parser.mjs';
import { expectationsOf } from './expect.mjs';

const FIXTURES = 'test/fixtures';
const captures = existsSync(FIXTURES) ? readdirSync(FIXTURES).filter((f) => f.startsWith('real-') && f.endsWith('.html')) : [];

for (const assistant of ['chatgpt', 'perplexity', 'claude', 'google_ai_mode', 'gemini']) {
  if (!captures.some((f) => f.startsWith(`real-${assistant}-`))) {
    test(`real capture: none from ${assistant} yet`, { skip: 'Collect one answer, export, then run test/import-capture.mjs' }, () => {});
  }
}

for (const file of captures) {
  const base = file.replace(/\.html$/, '');
  const expectedPath = join(FIXTURES, `${base}.expected.json`);

  test(`real capture: ${base}`, () => {
    const expected = existsSync(expectedPath) ? JSON.parse(readFileSync(expectedPath, 'utf8')) : null;
    const doc = parseHTML(readFileSync(join(FIXTURES, file), 'utf8')).document;
    const d = collectAnswer(doc, expected?.url ?? '', { assistant: expected?.assistant });

    // Always true of a usable capture, sidecar or not.
    assert.ok(d.answer.length > 0, 'no answer read from a real capture');
    for (const l of [...d.links, ...d.sources]) {
      assert.ok(/^https?:\/\//.test(l.url), `a non-http url: ${l.url}`);
      assert.ok(l.order > 0);
    }
    assert.deepEqual(d.links.map((l) => l.order), d.links.map((_, i) => i + 1), 'link order is not 1..n');
    assert.deepEqual(d.sources.map((s) => s.order), d.sources.map((_, i) => i + 1), 'source order is not 1..n');

    if (!expected) return;
    const now = expectationsOf(d);
    for (const key of Object.keys(now)) {
      if (key === 'parserVersion' || !(key in expected)) continue;
      assert.deepEqual(now[key], expected[key], `${key} changed since import`);
    }
  });
}
