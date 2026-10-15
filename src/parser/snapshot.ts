/**
 * The raw HTML kept with each capture.
 *
 * The conversation, not the page. These exports are filed into a research
 * repository, and a chat page carries things that must never get there: the
 * sidebar's list of the person's other conversations, the account menu with
 * their name and email, a half-typed draft in the composer, and inline scripts
 * holding session state. So the snapshot is the element that holds the
 * conversation, with every `private` selector removed from a copy, plus any
 * sources panel drawn outside it, in a side sheet.
 *
 * It is wrapped in one element recording the page URL, the assistant, the
 * language and the model label, so a snapshot re-parses on its own:
 * `npm run reparse`. The label is recorded rather than copied: Claude and
 * Gemini draw it inside the composer, which is private, and a button cut out
 * of its composer no longer matches the selector that found it — the first
 * real Claude capture re-parsed with no model at all.
 */
import type { Assistant } from '../types/answer';
import { GENERIC, PARSER_VERSION, type SiteSelectors } from './selectors';
import { cleanClone, commonAncestor, pickAll } from './utils';

export interface SnapshotInput {
  pageUrl: string;
  assistant: Assistant;
  site: SiteSelectors;
  language?: string;
  /** The model label read from the live page. */
  model?: string;
  lastUser: Element | null;
  answerTurn: Element | null;
  /** Elements a re-parse needs that may sit outside the conversation: sources panels. */
  extras: Element[];
}

export interface Snapshot {
  html: string;
  scope: 'conversation' | 'last turn' | 'truncated';
}

const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function serialise(el: Element, remove: string[]): string {
  const clone = cleanClone(el, remove);
  // Inlined images as data: URIs are the bulk of a page and nothing a parser reads.
  clone.querySelectorAll('img[src^="data:"]').forEach((img) => {
    if ((img.getAttribute('src') ?? '').length > 512) img.setAttribute('src', 'data:,');
  });
  return clone.outerHTML;
}

export function snapshot(doc: Document, input: SnapshotInput, maxBytes: number): Snapshot | undefined {
  const remove = [...GENERIC.private, ...input.site.private];
  const anchor = input.answerTurn;

  // The conversation: the site's root, else main, that holds the answer. Never <body>: it holds the sidebar.
  const conversation = anchor
    ? [...pickAll(doc, input.site.roots), ...pickAll(doc, ['main', '[role="main"]'])].find((r) => r.contains(anchor))
    : (pickAll(doc, ['main', '[role="main"]'])[0] ?? doc.body);
  const pair = commonAncestor([input.lastUser, anchor].filter((e): e is Element => Boolean(e)));

  const wrap = (root: Element) => {
    const outside = input.extras.filter((e) => !root.contains(e) && !input.extras.some((o) => o !== e && o.contains(e)));
    const parts = [...outside, root].map((e) => serialise(e, remove)).join('\n');
    return (
      `<div data-answer-reader-snapshot="1" data-url="${attr(input.pageUrl)}" data-assistant="${input.assistant}"` +
      ` data-lang="${attr(input.language ?? '')}" data-model="${attr(input.model ?? '')}"` +
      ` data-parser-version="${PARSER_VERSION}">\n${parts}\n</div>`
    );
  };

  if (conversation) {
    const html = wrap(conversation);
    if (html.length <= maxBytes) return { html, scope: 'conversation' };
  }
  if (pair) {
    const html = wrap(pair);
    if (html.length <= maxBytes) return { html, scope: 'last turn' };
    return { html: `${html.slice(0, maxBytes)}<!-- truncated at ${maxBytes} bytes -->`, scope: 'truncated' };
  }
  return undefined;
}
