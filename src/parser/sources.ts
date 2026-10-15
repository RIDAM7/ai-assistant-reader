/**
 * The sources or citations panel, in the panel's own order.
 *
 * Two ways in. The site's own selectors first. Failing those, a panel found by
 * its heading — an element reading exactly "Sources", "Citations" or
 * "References" — whose links are not the answer's. That second way knows no
 * site and is labelled `heading` in the diagnostics, so a capture says which
 * one produced its sources.
 */
import type { AnswerSource, Assistant, Layer } from '../types/answer';
import { GENERIC, type SiteSelectors } from './selectors';
import {
  canonicalKey, cleanLabel, closest, domainFromMarkup, domainFromSourceRecord, domainOf, isAppLink, pick, pickAll, precedes, resolveHref,
  text,
} from './utils';

export interface SourceContext {
  pageUrl: string;
  assistant: Assistant;
  /** The answer's own element: a panel never contains it, and its links are not sources. */
  answer: Element | null;
  /** The last question-and-answer pair's container, when the site has one. */
  scope: Element | null;
  /** The last user turn: a panel after it belongs to this answer. */
  lastUser: Element | null;
}

export interface SourcesRead {
  sources: AnswerSource[];
  /** The panel elements read, so the answer's text and links can leave them out and the snapshot can keep them. */
  panels: Element[];
  layer: Layer;
}

const SOURCES_HEADING = /^(sources?|citations?|references?)(\s*[·:(]?\s*\d+\s*\)?)?$/i;

/**
 * `outsideAnswer`: a panel found by its heading must not lend the answer's own
 * links to the sources. A panel the site's selectors name is a panel wherever
 * it sits — Google draws its cards inside the reply component.
 *
 * A /goto card's domain comes from its own markup, else from the source record
 * its reply component keeps for that exact link. The component's markup is read
 * once, and only for a card whose own markup names no origin.
 */
function readItems(items: Element[], site: SiteSelectors, ctx: SourceContext, out: AnswerSource[], seen: Set<string>, outsideAnswer: boolean) {
  const recordHtml = new Map<Element, string>();
  const fromRecord = (item: Element, href: string | null) => {
    const box = closest(item, site.sources.records);
    if (!box) return '';
    if (!recordHtml.has(box)) recordHtml.set(box, box.outerHTML ?? '');
    return domainFromSourceRecord(recordHtml.get(box)!, href);
  };

  for (const item of items) {
    const anchor = item.matches('a[href]') ? item : item.querySelector('a[href]');
    if (!anchor) continue;
    if (outsideAnswer && ctx.answer && ctx.answer.contains(anchor)) continue;
    const r = resolveHref(anchor.getAttribute('href'), ctx.pageUrl);
    if (!r || isAppLink(r, ctx.assistant, ctx.pageUrl)) continue;
    const key = r.isRedirect ? r.href : canonicalKey(r.url);
    if (seen.has(key)) continue;
    seen.add(key);

    const siteName = text(pick(item, site.sources.siteName)) || undefined;
    const title =
      text(pick(item, site.sources.title)) ||
      cleanLabel(anchor.getAttribute('aria-label')) ||
      cleanLabel(text(anchor)) ||
      undefined;
    const source: AnswerSource = {
      order: out.length + 1,
      title,
      url: r.url,
      domain: r.isRedirect ? domainFromMarkup(item) || fromRecord(item, anchor.getAttribute('href')) : domainOf(r.url),
    };
    if (siteName) source.siteName = siteName;
    if (r.isRedirect) source.urlIsRedirect = true;
    out.push(source);
  }
}

/** Panels that belong to the last answer: inside its pair, else after its question, else any. Outermost only. */
function choosePanels(found: Element[], ctx: SourceContext): Element[] {
  const usable = found.filter((p) => !(ctx.answer && p.contains(ctx.answer)));
  const inScope = ctx.scope ? usable.filter((p) => ctx.scope!.contains(p)) : [];
  const after = ctx.lastUser ? usable.filter((p) => precedes(ctx.lastUser!, p)) : [];
  const chosen = inScope.length ? inScope : after.length ? after : usable;
  return chosen.filter((p) => !chosen.some((q) => q !== p && q.contains(p)));
}

/** A panel found by its heading, for when the site's selectors match nothing. */
function panelsByHeading(root: Element, ctx: SourceContext): Element[] {
  const panels: Element[] = [];
  for (const el of pickAll(root, GENERIC.headings)) {
    // A "Sources:" line the model wrote is part of the answer, and its links are the answer's links.
    if (ctx.answer && ctx.answer.contains(el)) continue;
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent ?? '')
      .join('')
      .trim();
    if (!SOURCES_HEADING.test(own) && !(el.children.length <= 2 && SOURCES_HEADING.test(text(el)))) continue;
    // Climb to the nearest ancestor holding links that are not the answer's, and stop before the answer.
    let box: Element | null = el.parentElement;
    for (let depth = 0; box && depth < 4; depth++, box = box.parentElement) {
      if (ctx.answer && box.contains(ctx.answer)) break;
      const links = Array.from(box.querySelectorAll('a[href]')).filter((a) => /^https?:/i.test(a.getAttribute('href') ?? '') || (a.getAttribute('href') ?? '').startsWith('/'));
      if (links.length) {
        panels.push(box);
        break;
      }
    }
  }
  return choosePanels(panels, ctx);
}

export function readSources(doc: Document, root: Element, site: SiteSelectors, ctx: SourceContext): SourcesRead {
  const out: AnswerSource[] = [];
  const seen = new Set<string>();

  const sitePanels = choosePanels(pickAll(doc, site.sources.panels), ctx);
  for (const panel of sitePanels) {
    const items = pickAll(panel, site.sources.items);
    readItems(items.length ? items : Array.from(panel.querySelectorAll('a[href]')), site, ctx, out, seen, false);
  }
  if (out.length) return { sources: out, panels: sitePanels, layer: 'site' };

  // The whole page, not the conversation: side sheets are drawn outside it.
  const found = panelsByHeading(root.ownerDocument?.body ?? root, ctx);
  for (const panel of found) readItems(Array.from(panel.querySelectorAll('a[href]')), site, ctx, out, seen, true);
  if (out.length) return { sources: out, panels: found, layer: 'heading' };

  return { sources: [], panels: [], layer: 'none' };
}
