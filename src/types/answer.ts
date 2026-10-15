/**
 * The data model.
 *
 * Deliberately additive, like SERP Reader's: every optional field can be absent
 * without a consumer breaking, because these apps ship layout changes weekly
 * and a parser that cannot return a partial result returns nothing at all.
 * Anything new gets added as optional.
 */

export type Assistant = 'chatgpt' | 'perplexity' | 'claude' | 'google_ai_mode';

/**
 * A link inside the answer text, in the order it first appears.
 *
 * One entry per destination. Assistants repeat a citation once per claim it
 * supports, and fifteen identical rows say less than one row with `count: 15`.
 */
export interface AnswerLink {
  /** First appearance, 1-based. */
  order: number;
  /** The href as the page had it, made absolute. */
  href: string;
  /**
   * The destination: a Google /url?q= unwrapped, and the tracking tag the
   * assistant itself appends (`utm_source=chatgpt.com`) removed. Nothing else
   * is rewritten.
   */
  url: string;
  /** Empty when the destination is not in the page (a signed Google /goto with no card to read it from). */
  domain: string;
  anchorText: string;
  /** How many times the answer links this destination. */
  count: number;
  /** True when `url` is a Google /goto whose destination is not in the page. Kept, never guessed at. */
  urlIsRedirect?: boolean;
}

/** One entry of the sources or citations panel, in the panel's order. */
export interface AnswerSource {
  order: number;
  title?: string;
  url: string;
  /** Empty when the page does not hold the destination; `siteName` then says what the card showed. */
  domain: string;
  /** The publisher name a card shows ("Microsoft Learn", "YouTube"), when it shows one. */
  siteName?: string;
  urlIsRedirect?: boolean;
}

/**
 * Which layer produced a field.
 *
 *   site     the assistant's own selectors (parser/selectors.ts)
 *   generic  the fallback, which knows no site: the last turn and its links
 *   heading  a panel found by its "Sources" / "Citations" heading
 *   url      read from the page URL (Google's q=, Perplexity's ?q=)
 *   none     nothing found
 */
export type Layer = 'site' | 'generic' | 'heading' | 'url' | 'none';

export interface AnswerMetadata {
  assistant: Assistant;
  /** The page the answer was read from. */
  url: string;
  host: string;
  /** The last user turn, as the page shows it. */
  question: string;
  /** The model label, when the page shows one. */
  model?: string;
  /** The conversation's id, when the URL carries one (/c/<id>, /chat/<id>, /search/<slug>). */
  conversationId?: string;
  /** <html lang>. */
  language?: string;
  answerChars: number;
  linkCount: number;
  sourceCount: number;
  /**
   * Whether web sources appear at all: a link out of the answer, a sources
   * panel, or the assistant's own "searched the web" marker. False is a fact
   * about this answer — it was written from the model alone.
   */
  webSources: boolean;
}

/** What the parser saw, so a thin answer can be told apart from a broken parser. */
export interface AnswerDiagnostics {
  parserVersion: string;
  layers: {
    question: Layer;
    answer: Layer;
    links: Layer;
    sources: Layer;
    model: Layer;
  };
  /** Turns the site's selectors matched. Zero on both means the generic layer did all the work. */
  turns: { user: number; assistant: number };
  /** A site marker said the answer was still being written. The capture is saved; collect again when it finishes. */
  streaming: boolean;
  /** What the raw HTML snapshot holds: the conversation, or only the last question and answer when the conversation was too big. */
  snapshot?: 'conversation' | 'last turn' | 'truncated';
  warnings: string[];
  durationMs: number;
}

export interface AnswerData {
  id: string;
  metadata: AnswerMetadata;
  /** The last assistant turn's text. */
  answer: string;
  links: AnswerLink[];
  sources: AnswerSource[];
  diagnostics: AnswerDiagnostics;
  /**
   * The conversation's DOM, not the page: no sidebar, no account menu, no
   * scripts, no draft in the composer. Kept so a future parser can re-read
   * this capture (`npm run reparse`).
   */
  rawHtml?: string;
  collectedAt: string;
}

/** Row shape stored for the history list, so listing does not load raw HTML. */
export interface AnswerSummary {
  id: string;
  assistant: Assistant;
  question: string;
  collectedAt: string;
  model?: string;
  linkCount: number;
  sourceCount: number;
  webSources: boolean;
}
