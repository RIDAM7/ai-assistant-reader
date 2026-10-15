/**
 * Links inside the answer: every one that leaves the assistant, in the order
 * it first appears.
 *
 * A citation drawn with no anchor counts too (the site's `unlinkedCitations`):
 * Perplexity's carries its page in data-pplx-citation-url, and ChatGPT's pill
 * shows only the site, in its favicon request, until it is clicked. A pill
 * that names only a site is `urlIsOrigin`, and joins the answer's link to that
 * site, before or after it, rather than standing beside it as a second source.
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
  /** Citations drawn without an anchor, read in the same pass. */
  unlinked?: string[];
}

/** The site a favicon request names: `s2/favicons?domain=https://www.naukri.com`, `favicons?sz=128&domain=naukri.com`. */
const FAVICON_SITE = /favicons?V?2?\?(?:[^"'\s>]*?&(?:amp;)?)?(?:domain|url)=(?:https?(?::|%3A)(?:\/\/|%2F%2F))?([a-z0-9.-]+\.[a-z]{2,24})/i;

/** "Bright Infonet+1" as the pill showed it: the name, and how many more sources it holds. */
const pillLabel = (s: string) => s.replace(/\s*\+\s*(\d+)$/, ' +$1');

export function extractLinks(scope: Element, ctx: LinkContext): AnswerLink[] {
  const out: AnswerLink[] = [];
  const byKey = new Map<string, AnswerLink>();
  const unlinked = ctx.unlinked ?? [];
  const selector = ['a[href]', ...unlinked].join(', ');

  const sameSite = (domain: string) => (domain ? out.find((l) => l.domain === domain) : undefined);

  let found: Element[] = [];
  try {
    found = Array.from(scope.querySelectorAll(selector));
  } catch {
    // A selector this browser cannot parse must not cost the plain links.
    found = Array.from(scope.querySelectorAll('a[href]'));
  }

  for (const el of found) {
    if (ctx.skip.some((s) => s !== scope && s.contains(el))) continue;

    /* ------------------------------------------------ a citation with no anchor */
    if (!el.matches('a[href]')) {
      // One that wraps an anchor, or sits in one, is that anchor's: counted once, there.
      if (el.querySelector('a[href]') || el.closest('a[href]')) continue;
      const anchorText = pillLabel(cleanLabel(text(el) || el.getAttribute('aria-label')));
      const page = el.getAttribute('data-pplx-citation-url');
      const r = page ? resolveHref(page, ctx.pageUrl) : null;
      if (r && !isAppLink(r, ctx.assistant, ctx.pageUrl)) {
        add(r, anchorText);
        continue;
      }
      const site = (el.outerHTML ?? '').match(FAVICON_SITE)?.[1]?.replace(/^www\./i, '').toLowerCase();
      if (!site) continue;
      const known = sameSite(site);
      if (known) {
        known.count++;
        continue;
      }
      const origin = `https://${site}/`;
      const link: AnswerLink = { order: out.length + 1, href: origin, url: origin, domain: site, anchorText, count: 1, urlIsOrigin: true };
      out.push(link);
      byKey.set(`origin:${site}`, link);
      continue;
    }

    /* ---------------------------------------------------------------- an anchor */
    const r = resolveHref(el.getAttribute('href'), ctx.pageUrl);
    if (!r || isAppLink(r, ctx.assistant, ctx.pageUrl)) continue;
    add(r, cleanLabel(text(el) || el.getAttribute('aria-label') || el.getAttribute('title')), el);
  }
  return out;

  function add(r: ResolvedHref, anchorText: string, anchor?: Element) {
    // A redirect's blob is its identity; two different blobs may be one page, and nothing here can tell.
    const key = r.isRedirect ? r.href : canonicalKey(r.url);
    const prev = byKey.get(key);
    if (prev) {
      prev.count++;
      if (!prev.anchorText && anchorText) prev.anchorText = anchorText;
      return;
    }
    const domain = r.isRedirect ? (anchor ? (ctx.redirectDomain?.(anchor, r) ?? '') : '') : domainOf(r.url);
    // A pill seen first named only this site: the page itself takes its place, and its count.
    const pill = !r.isRedirect ? byKey.get(`origin:${domain}`) : undefined;
    if (pill?.urlIsOrigin) {
      byKey.delete(`origin:${domain}`);
      Object.assign(pill, { href: r.href, url: r.url, count: pill.count + 1, anchorText: anchorText || pill.anchorText });
      delete pill.urlIsOrigin;
      byKey.set(key, pill);
      return;
    }
    const link: AnswerLink = { order: out.length + 1, href: r.href, url: r.url, domain, anchorText, count: 1 };
    if (r.isRedirect) link.urlIsRedirect = true;
    out.push(link);
    byKey.set(key, link);
  }
}
