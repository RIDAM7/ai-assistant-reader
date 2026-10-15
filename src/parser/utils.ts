/**
 * Shared helpers. No selector literals here — those live in selectors.ts.
 *
 * Everything works from markup alone (attributes, textContent, the tree), never
 * from layout: no innerText, no getComputedStyle. A live capture in Chrome and
 * a re-parse of its snapshot under linkedom must give the same record, and
 * SERP Reader learned that the hard way when Chrome and Node parsed one string
 * differently (its domainFromCite).
 */
import type { Assistant } from '../types/answer';

/** First element matching any selector in the list, or null. */
export function pick(root: ParentNode, selectors: string[]): Element | null {
  for (const sel of selectors) {
    try {
      const el = root.querySelector(sel);
      if (el) return el;
    } catch {
      // An invalid selector must not take the whole extraction down.
    }
  }
  return null;
}

/** The selectors in the list that parse, so one outgrown selector cannot void the rest. */
function validSelectors(root: ParentNode, selectors: string[]): string[] {
  return selectors.filter((sel) => {
    try {
      root.querySelector(sel);
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * Everything matching any selector in the list, de-duplicated, in document order.
 *
 * One querySelectorAll over the joined list, because a selector list is
 * returned in document order by Chrome and linkedom alike.
 */
export function pickAll(root: ParentNode, selectors: string[]): Element[] {
  const valid = validSelectors(root, selectors);
  if (!valid.length) return [];
  return Array.from(root.querySelectorAll(valid.join(', ')));
}

/**
 * Every match of the FIRST selector in the list that matches anything.
 *
 * For turns, where a list mixes a precise selector with a broader one: Claude's
 * `[data-is-streaming]` wraps `.font-claude-response`, and a union of the two
 * would count every answer twice and call the inner one the last.
 */
export function firstGroup(root: ParentNode, selectors: string[]): Element[] {
  for (const sel of validSelectors(root, selectors)) {
    const found = Array.from(root.querySelectorAll(sel));
    if (found.length) return found;
  }
  return [];
}

/** The element's ancestors and itself, outermost first. */
function lineage(el: Element): Element[] {
  const out: Element[] = [];
  for (let e: Element | null = el; e; e = e.parentElement) out.unshift(e);
  return out;
}

/**
 * True when `a` comes before `b` in the document.
 *
 * Worked out from the tree, not compareDocumentPosition: linkedom answers that
 * wrongly for cousins (two paragraphs in sibling divs come back reversed), and
 * the suite runs on linkedom while the extension runs in Chrome. A parser
 * whose order depends on the runtime is SERP Reader's domainFromCite again.
 */
export function precedes(a: Element, b: Element): boolean {
  if (a === b || b.contains(a)) return false;
  if (a.contains(b)) return true;
  const pa = lineage(a);
  const pb = lineage(b);
  let i = 0;
  while (i < pa.length && i < pb.length && pa[i] === pb[i]) i++;
  if (i === 0) return false; // different trees
  const siblings = Array.from(pa[i - 1].children);
  return siblings.indexOf(pa[i]) < siblings.indexOf(pb[i]);
}

/** The innermost element containing all of `els`. */
export function commonAncestor(els: Element[]): Element | null {
  if (!els.length) return null;
  let anc: Element | null = els[0];
  while (anc && !els.every((e) => anc!.contains(e))) anc = anc.parentElement;
  return anc;
}

/** A copy of `el` without anything matching `remove`. The live page is never touched: this runs on the user's real tab. */
export function cleanClone(el: Element, remove: string[]): Element {
  const clone = el.cloneNode(true) as Element;
  for (const sel of remove) {
    try {
      clone.querySelectorAll(sel).forEach((n) => n.remove());
    } catch {
      /* ignore */
    }
  }
  return clone;
}

/** One line of text: whitespace collapsed. For labels, titles and questions. */
export function text(el: Element | null | undefined, remove: string[] = ['script', 'style', 'noscript', 'template']): string {
  if (!el) return '';
  let source: Element = el;
  try {
    if (remove.some((sel) => el.querySelector(sel))) source = cleanClone(el, remove);
  } catch {
    /* cloning failed; accept the noise */
  }
  return (source.textContent ?? '').replace(/\s+/g, ' ').trim();
}

const BLOCK = new Set([
  'P', 'DIV', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BR', 'TR', 'TABLE', 'PRE', 'BLOCKQUOTE',
  'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'DL', 'DT', 'DD', 'HR', 'FIGURE', 'FIGCAPTION', 'DETAILS', 'SUMMARY',
]);

/**
 * An answer's text with its paragraphs and list items on their own lines.
 *
 * textContent runs "Coding Ninjas" at the end of one list item into the next
 * item's first word, and a brand list read that way is one long word. Walking
 * the tree and breaking at block elements keeps what the reader saw as lines,
 * with no layout engine involved.
 */
export function blockText(el: Element | null | undefined, remove: string[]): string {
  if (!el) return '';
  const root = cleanClone(el, remove);
  const out: string[] = [];
  // A link is its own word: "engineers<a>bosscoder</a>" must not read as one.
  const wordEnd = /[\p{L}\p{N}]$/u;
  const wordStart = /^[\p{L}\p{N}]/u;
  let afterLink = false;
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      const t = (node.textContent ?? '').replace(/\s+/g, ' ');
      if (afterLink && wordStart.test(t)) out.push(' ');
      if (t) afterLink = false;
      out.push(t);
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = (node as Element).tagName.toUpperCase();
    const block = BLOCK.has(tag);
    if (block) out.push('\n');
    // A table row stays one line, its cells apart: "Format | Live online classes".
    if ((tag === 'TD' || tag === 'TH') && (node as Element).previousElementSibling) out.push(' | ');
    if (tag === 'A' && wordEnd.test(out[out.length - 1] ?? '')) out.push(' ');
    node.childNodes.forEach(walk);
    if (tag === 'A') afterLink = true;
    if (block) out.push('\n');
  };
  walk(root);
  return out
    .join('')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/* ------------------------------------------------------------------ links */

export interface ResolvedHref {
  href: string;
  url: string;
  /** True when `url` is a Google redirect whose destination is not in the page. */
  isRedirect: boolean;
}

const GOOGLE_HOST = /(^|\.)google\.[a-z.]+$/i;

/**
 * An anchor's href made usable. SERP Reader's resolveHref, plus one step.
 *
 *   1. A direct link: kept.
 *   2. Google's /url?q=…: unwrapped to the destination.
 *   3. Google's /goto?url=<signed blob>: the destination is not in the href.
 *      Kept as the honest redirect, flagged, and its domain read elsewhere.
 *   4. The assistant's own tracking tag: ChatGPT appends utm_source=chatgpt.com
 *      to every citation. Removed from `url` (the href keeps it), because it is
 *      the assistant's mark, not the publisher's page.
 */
export function resolveHref(raw: string | null | undefined, pageUrl: string): ResolvedHref | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw, pageUrl);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const href = u.href;

  if (GOOGLE_HOST.test(u.hostname) && (u.pathname === '/url' || u.pathname === '/goto')) {
    const candidate = u.searchParams.get('q') ?? u.searchParams.get('url');
    if (candidate && /^https?:\/\//i.test(candidate)) {
      try {
        return { href, url: new URL(candidate).href, isRedirect: false };
      } catch {
        /* keep the redirect */
      }
    }
    return { href, url: href, isRedirect: true };
  }

  const source = u.searchParams.get('utm_source');
  if (source && /chatgpt|openai|perplexity|claude|anthropic/i.test(source)) {
    u.searchParams.delete('utm_source');
    return { href, url: u.href.replace(/\?$/, ''), isRedirect: false };
  }
  return { href, url: href, isRedirect: false };
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Hosts that are the assistant's own app, never a source it cites. Its company's site (openai.com, anthropic.com) can be a source and is not here. */
const APP_HOSTS: Record<Assistant, RegExp[]> = {
  chatgpt: [/^(chatgpt\.com|chat\.openai\.com|auth\.openai\.com)$/i],
  perplexity: [/(^|\.)perplexity\.ai$/i],
  claude: [/^claude\.ai$/i],
  gemini: [
    /^gemini.google.com$/i,
    /^(www.)?google.[a-z.]+$/i, // "search for this" links back into Google
    /^(accounts|policies|myaccount|myactivity|support).google.[a-z.]+$/i,
    /(^|.)gstatic.com$/i,
    /(^|.)googleusercontent.com$/i,
  ],
  google_ai_mode: [
    /^(www\.)?google\.[a-z.]+$/i, // the search host itself
    /^(accounts|policies|myaccount|myactivity|maps)\.google\.[a-z.]+$/i,
    /(^|\.)gstatic\.com$/i,
    /(^|\.)googleusercontent\.com$/i,
  ],
};

/** A link to the assistant's own app (a new chat, a settings page, its own search). A Google redirect is not: it is a citation. */
export function isAppLink(resolved: ResolvedHref, assistant: Assistant, pageUrl: string): boolean {
  if (resolved.isRedirect) return false;
  let host: string;
  try {
    host = new URL(resolved.url).hostname.toLowerCase();
  } catch {
    return true;
  }
  let pageHost = '';
  try {
    pageHost = new URL(pageUrl).hostname.toLowerCase();
  } catch {
    /* no page host to compare */
  }
  if (host.replace(/^www\./, '') === pageHost.replace(/^www\./, '')) return true;
  return APP_HOSTS[assistant].some((re) => re.test(host));
}

/**
 * Canonical form for de-duplication only — never stored. SERP Reader's.
 * Strips scheme, www, tracking parameters and a trailing slash, so the same
 * page cited twice counts once; keeps meaningful query strings.
 */
export function canonicalKey(url: string): string {
  try {
    const u = new URL(url);
    for (const p of [...u.searchParams.keys()]) {
      if (/^(utm_|gclid|fbclid|ref|referrer|sourceid|ved|usg|sa|ei)/i.test(p)) u.searchParams.delete(p);
    }
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.hostname.replace(/^www\./, '')}${path}${u.search}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** A hostname shape: labels separated by dots, ending in a real-looking TLD. */
const HOSTNAME = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}$/i;

/**
 * A destination domain read from a card's own markup, for a link whose href is
 * a signed Google /goto.
 *
 * Measured on the first real AI Mode reply: 15 of its 19 source cards carry
 * their site's origin, in a favicon request (`faviconV2?url=https://www.udemy.com`)
 * or in the card's other markup. The other four are YouTube cards with a video
 * thumbnail and no origin anywhere; those get no domain, and their card's site
 * name says what they were. Nothing is reconstructed from a title.
 */
export function domainFromMarkup(el: Element): string {
  const html = el.outerHTML ?? '';
  const favicon = html.match(/faviconV2\?url(?:=|\\u003d|%3D)(https?:\/\/[^&"'\\\s]+)/i);
  const candidates = [favicon?.[1], ...Array.from(html.matchAll(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,24}(?=[/"'&\\\s:]|$)/gi), (m) => m[0])];
  for (const c of candidates) {
    if (!c) continue;
    const domain = domainOf(c);
    if (!domain || !HOSTNAME.test(domain)) continue;
    // Google's own plumbing, not a publisher. developers.google.com and the like stay: SERP Reader dropped them once and invented a finding.
    if (/^google\.[a-z.]+$|(^|\.)(gstatic\.com|googleusercontent\.com|googleapis\.com|w3\.org|schema\.org)$/i.test(domain)) continue;
    return domain;
  }
  return '';
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `answer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** A label without the screen-reader suffixes Google appends to outbound links: "Title. Opens in new tab.", "…, video, open in an external site". */
export function cleanLabel(label: string | null | undefined): string {
  return (label ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\.?\s*Opens in (a )?new (tab|window)\.?$/i, '')
    .replace(/,?\s*open in an external site\.?$/i, '')
    .trim();
}
