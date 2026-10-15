/**
 * Links inside the answer: every one that leaves the assistant, in the order
 * it first appears.
 */
import type { AnswerLink, Assistant } from '../types/answer';
import { canonicalKey, cleanLabel, domainOf, isAppLink, resolveHref, text, type ResolvedHref } from './utils';

export interface LinkContext {
  pageUrl: string;
  assistant: Assistant;
  /** Regions whose links are not the answer's: a sources panel inside the turn reports its links as sources. */
  skip: Element[];
  /** The destination domain of a Google /goto, when something else on the page holds it. */
  redirectDomain?: (anchor: Element, resolved: ResolvedHref) => string;
}

export function extractLinks(scope: Element, ctx: LinkContext): AnswerLink[] {
  const out: AnswerLink[] = [];
  const byKey = new Map<string, AnswerLink>();

  for (const a of Array.from(scope.querySelectorAll('a[href]'))) {
    if (ctx.skip.some((s) => s !== scope && s.contains(a))) continue;
    const r = resolveHref(a.getAttribute('href'), ctx.pageUrl);
    if (!r || isAppLink(r, ctx.assistant, ctx.pageUrl)) continue;

    const anchorText = cleanLabel(text(a) || a.getAttribute('aria-label') || a.getAttribute('title'));
    // A redirect's blob is its identity; two different blobs may be one page, and nothing here can tell.
    const key = r.isRedirect ? r.href : canonicalKey(r.url);
    const prev = byKey.get(key);
    if (prev) {
      prev.count++;
      if (!prev.anchorText && anchorText) prev.anchorText = anchorText;
      continue;
    }

    const link: AnswerLink = {
      order: out.length + 1,
      href: r.href,
      url: r.url,
      domain: r.isRedirect ? (ctx.redirectDomain?.(a, r) ?? '') : domainOf(r.url),
      anchorText,
      count: 1,
    };
    if (r.isRedirect) link.urlIsRedirect = true;
    out.push(link);
    byKey.set(key, link);
  }
  return out;
}
