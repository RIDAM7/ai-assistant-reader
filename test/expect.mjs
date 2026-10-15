/**
 * What a real fixture's sidecar records, written once for import-capture,
 * regen-expected and the test that asserts it.
 *
 * Shape, never wording: counts, domains in order, which layer answered. A
 * fixture asserting the answer's exact text fails whenever the text walk
 * changes, and teaches everyone to ignore it.
 */
export function expectationsOf(d) {
  return {
    parserVersion: d.diagnostics.parserVersion,
    question: d.metadata.question,
    model: d.metadata.model ?? null,
    webSources: d.metadata.webSources,
    answerNonEmpty: d.answer.length > 0,
    linkCount: d.links.length,
    linkDomains: d.links.map((l) => l.domain),
    sourceCount: d.sources.length,
    sourceDomains: d.sources.map((s) => s.domain),
    layers: d.diagnostics.layers,
  };
}

/** Capture identity: describes the capture, not the parser, and cannot be re-derived from HTML. */
export const IDENTITY = ['origin', 'capturedAt', 'url', 'assistant'];
