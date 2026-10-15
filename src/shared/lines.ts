/**
 * The few lines of text the panel, the popup and the history page all print
 * about a capture, written once so the three never disagree.
 */
import type { AnswerData } from '../types/answer';
import { ASSISTANT_NAMES } from '../parser/sites';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** What was saved, in one line. */
export function savedLine(d: AnswerData): string {
  const bits = [ASSISTANT_NAMES[d.metadata.assistant], plural(d.links.length, 'link'), plural(d.sources.length, 'source')];
  if (!d.metadata.webSources) bits.push('no web sources');
  if (d.diagnostics.layers.answer === 'generic') bits.push('generic layer');
  return `Saved · ${bits.join(' · ')}`;
}

/** The diagnostics block: which layer answered for each field, and why a capture is thin. */
export function diagnosticsLines(d: AnswerData): string[] {
  const g = d.diagnostics;
  return [
    `Assistant: ${ASSISTANT_NAMES[d.metadata.assistant]}`,
    `Question:  ${g.layers.question}`,
    `Answer:    ${g.layers.answer}  (${d.answer.length} characters)`,
    `Links:     ${g.layers.links}  (${d.links.length})`,
    `Sources:   ${g.layers.sources}  (${d.sources.length})`,
    `Model:     ${d.metadata.model ?? 'not shown'}`,
    `Turns matched by the site's selectors: ${g.turns.user} user, ${g.turns.assistant} assistant`,
    `Snapshot:  ${g.snapshot ?? 'not kept'}`,
    `Parser:    ${g.parserVersion}  (${g.durationMs}ms)`,
    ...(g.warnings.length ? ['', 'Warnings:', ...g.warnings.map((w) => `  ${w}`)] : []),
  ];
}
