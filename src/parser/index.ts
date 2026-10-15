/**
 * The orchestrator: one rendered assistant page in, one AnswerData out.
 *
 * Every step is wrapped, as in SERP Reader. A panel the assistant restyled
 * should cost the sources and nothing else — a thrown selector must not lose
 * an answer that was read a millisecond earlier.
 */
import type { AnswerData, Assistant, Layer } from '../types/answer';
import { extractLinks } from './links';
import { genericTurns, siteTurns, type Turns } from './read';
import { GENERIC, GOOGLE_REPLY_LABEL, PARSER_VERSION } from './selectors';
import { ASSISTANT_NAMES, SITES, conversationId, detectAssistant, questionFromUrl } from './sites';
import { snapshot } from './snapshot';
import { readSources, type SourcesRead } from './sources';
import { blockText, domainFromMarkup, pick, pickAll, text, uuid } from './utils';

export interface CollectOptions {
  /** Keep the conversation's DOM so a future parser can re-read this capture. */
  includeRawHtml?: boolean;
  /** Hard ceiling on the snapshot, so one capture cannot fill the database. */
  maxRawHtmlBytes?: number;
  /** Which assistant, when the URL cannot say: a re-parse of a snapshot, a fixture. */
  assistant?: Assistant;
}

/** The assistant's own "I searched" line, in any of the four. */
const WEB_SEARCH_TEXT = /\b(Searched (the web|\d+ (sites?|sources?|results?|pages?))|Reviewed \d+ sources?|Searching the web)\b/i;

function safely<T>(label: string, warnings: string[], fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (err) {
    warnings.push(`${label} failed: ${err instanceof Error ? err.message : String(err)}`);
    return fallback;
  }
}

/** Which assistant a page or snapshot is. */
export function assistantOf(doc: Document, pageUrl: string, given?: Assistant): Assistant | null {
  if (given) return given;
  const fromUrl = detectAssistant(pageUrl);
  if (fromUrl) return fromUrl;
  const declared = doc.querySelector('[data-answer-reader-snapshot]')?.getAttribute('data-assistant') as Assistant | null;
  return declared && declared in SITES ? declared : null;
}

export function collectAnswer(doc: Document, pageUrl: string, opts: CollectOptions = {}): AnswerData {
  const started = Date.now();
  const warnings: string[] = [];

  const assistant = assistantOf(doc, pageUrl, opts.assistant);
  if (!assistant) throw new Error('Not a supported assistant page: ChatGPT, Perplexity, Claude, Gemini, or the AI Mode tab of Google.');
  const site = SITES[assistant];
  const name = ASSISTANT_NAMES[assistant];

  /* ---------------------------------------------------------------- turns */

  const root = pick(doc, GENERIC.roots) ?? doc.documentElement;
  const fromSite = safely<Turns | null>('site turns', warnings, () => siteTurns(doc, site), null);
  const turns: Turns =
    fromSite ??
    safely<Turns>('generic turns', warnings, () => genericTurns(root), {
      userTurns: [], assistantTurns: [], lastUser: null, lastAssistant: null, answer: null, scope: null, layer: 'none',
    });
  if (!fromSite) {
    warnings.push(`${name}'s turn selectors matched nothing; the generic layer read this page. Update parser/selectors.ts.`);
  }
  if (turns.layer === 'generic' && !turns.lastAssistant) {
    warnings.push('Nothing on the page is shaped like a turn: the answer is the whole conversation, question included.');
  }

  /* -------------------------------------------------------------- sources */

  const sourcesRead = safely<SourcesRead>(
    'sources',
    warnings,
    () =>
      readSources(doc, root, site, {
        pageUrl, assistant, answer: turns.answer, scope: turns.scope, lastUser: turns.lastUser,
      }),
    { sources: [], panels: [], layer: 'none' },
  );
  const { sources, panels } = sourcesRead;

  /* ------------------------------------------------------- answer, links */

  const textNoise = [...GENERIC.textNoise, ...site.answerNoise, ...site.sources.panels];
  const answer = safely('answer text', warnings, () => blockText(turns.answer, textNoise), '');

  // A Google /goto in the answer carries no destination; the source card with the same href does.
  const cardDomain = new Map(sources.filter((s) => s.urlIsRedirect && s.domain).map((s) => [s.url, s.domain]));
  const links = turns.answer
    ? safely(
        'links',
        warnings,
        () =>
          extractLinks(turns.answer!, {
            pageUrl,
            assistant,
            skip: panels,
            redirectDomain: (a, r) => cardDomain.get(r.href) ?? domainFromMarkup(a),
          }),
        [],
      )
    : [];

  /* ------------------------------------------------------------- question */

  let question = '';
  let questionLayer: Layer = 'none';
  if (turns.lastUser) {
    question = text(pick(turns.lastUser, site.questionText) ?? turns.lastUser, GENERIC.textNoise);
    questionLayer = turns.layer;
  }
  if (!question && assistant === 'google_ai_mode') {
    // "AI Mode reply for <query>": the reply names its own question.
    const where = turns.scope ?? turns.lastAssistant;
    const label = where ? pickAll(where, GOOGLE_REPLY_LABEL).map((h) => text(h)).find((t) => /^AI Mode reply for /i.test(t)) : undefined;
    if (label) {
      question = label.replace(/^AI Mode reply for /i, '').trim();
      questionLayer = 'site';
    }
  }
  if (!question) {
    question = questionFromUrl(pageUrl);
    if (question) questionLayer = 'url';
  }
  if (!question) warnings.push('No question found: no user turn matched and the URL carries none.');

  /* ---------------------------------------------------------------- model */

  let model: string | undefined;
  for (const attr of site.modelAttributes) {
    const holder = turns.lastAssistant?.closest(`[${attr}]`) ?? turns.lastAssistant?.querySelector(`[${attr}]`);
    const value = holder?.getAttribute(attr)?.trim();
    if (value) {
      model = value;
      break;
    }
  }
  const modelLabel = pick(doc, site.model);
  if (!model) {
    const label = text(modelLabel);
    // A picker that names no model ("Model", "Choose model") is not a label; Perplexity's said exactly that.
    if (label && label.length <= 80 && !/^(choose |select |switch )?models?$/i.test(label)) model = label;
  }
  // A snapshot carries the label its capture read; the composer it came from is not in it.
  if (!model) model = doc.querySelector('[data-answer-reader-snapshot]')?.getAttribute('data-model') || undefined;

  /* ------------------------------------------------------ streaming, web */

  const streaming = Boolean(pick(doc, site.streaming));
  if (streaming) warnings.push('The page looked like it was still writing the answer. Collect again when it has finished.');

  const turnArea = turns.scope ?? turns.lastAssistant;
  const searchedMarker = turnArea ? Boolean(pick(turnArea, site.webSearch)) || WEB_SEARCH_TEXT.test(text(turnArea)) : false;
  const webSources = links.length > 0 || sources.length > 0 || searchedMarker;

  if (!answer) warnings.push('The answer is empty.');

  /* ------------------------------------------------------------- snapshot */

  const language = doc.documentElement?.getAttribute('lang') || doc.querySelector('[data-answer-reader-snapshot]')?.getAttribute('data-lang') || undefined;
  const snap = opts.includeRawHtml
    ? safely(
        'snapshot',
        warnings,
        () =>
          snapshot(
            doc,
            {
              pageUrl, assistant, site, language,
              lastUser: turns.lastUser,
              answerTurn: turns.lastAssistant ?? turns.answer,
              model,
              extras: panels,
            },
            opts.maxRawHtmlBytes ?? 1_500_000,
          ),
        undefined,
      )
    : undefined;

  let host = '';
  try {
    host = new URL(pageUrl).hostname;
  } catch {
    /* recorded empty */
  }

  return {
    id: uuid(),
    metadata: {
      assistant,
      url: pageUrl,
      host,
      question,
      model,
      conversationId: conversationId(pageUrl),
      language,
      answerChars: answer.length,
      linkCount: links.length,
      sourceCount: sources.length,
      webSources,
    },
    answer,
    links,
    sources,
    diagnostics: {
      parserVersion: PARSER_VERSION,
      layers: {
        question: questionLayer,
        answer: answer ? turns.layer : 'none',
        links: links.length ? turns.layer : 'none',
        sources: sourcesRead.layer,
        model: model ? 'site' : 'none',
      },
      turns: { user: fromSite?.userTurns.length ?? 0, assistant: fromSite?.assistantTurns.length ?? 0 },
      streaming,
      snapshot: snap?.scope,
      warnings,
      durationMs: Date.now() - started,
    },
    rawHtml: snap?.html,
    collectedAt: new Date().toISOString(),
  };
}

export { ASSISTANT_NAMES, detectAssistant } from './sites';
export { PARSER_VERSION } from './selectors';
