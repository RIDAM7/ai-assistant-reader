/**
 * Finding the last question and the last answer: the site layer, and the
 * generic layer under it.
 *
 * The generic layer is the floor. It knows no site, and on any chat page it
 * still returns the last thing shaped like a turn — or, failing even that, the
 * conversation's whole text — with every external link in it. The site layer
 * replaces it field by field where its selectors match. Either way the
 * diagnostics say which one answered, so a capture read by the fallback is
 * visibly a capture read by the fallback.
 */
import type { Layer } from '../types/answer';
import { GENERIC, type SiteSelectors } from './selectors';
import { firstGroup, pick, pickAll, precedes, text } from './utils';

export interface Turns {
  userTurns: Element[];
  assistantTurns: Element[];
  lastUser: Element | null;
  /** The last assistant turn as the site marks it. */
  lastAssistant: Element | null;
  /** The answer's own body inside it: what the text and links are read from. */
  answer: Element | null;
  /** The question-and-answer pair's container, where the site has one. */
  scope: Element | null;
  layer: Layer;
}

const hasContent = (el: Element) => text(el).length > 0 || Boolean(el.querySelector('a[href]'));

/** The last user turn before `answer`, or null. */
function lastBefore(users: Element[], answer: Element): Element | null {
  let found: Element | null = null;
  for (const u of users) if (u !== answer && !u.contains(answer) && precedes(u, answer)) found = u;
  return found;
}

function closestOf(el: Element, selectors: string[]): Element | null {
  for (const sel of selectors) {
    try {
      const c = el.closest(sel);
      if (c) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** The site layer, or null when the site's assistant-turn selectors match nothing. */
export function siteTurns(doc: Document, site: SiteSelectors): Turns | null {
  const assistantTurns = firstGroup(doc, site.assistantTurn).filter(hasContent);
  if (!assistantTurns.length) return null;
  const lastAssistant = assistantTurns[assistantTurns.length - 1];
  const userTurns = firstGroup(doc, site.userTurn).filter((u) => text(u).length > 0);
  return {
    userTurns,
    assistantTurns,
    lastUser: lastBefore(userTurns, lastAssistant),
    lastAssistant,
    answer: pick(lastAssistant, site.answerBody) ?? lastAssistant,
    scope: closestOf(lastAssistant, site.turnScope),
    layer: 'site',
  };
}

/**
 * The generic layer.
 *
 * Candidates are anything turn-shaped (GENERIC.assistantTurn). A candidate
 * holding two or more candidates that are not nested in each other is a
 * wrapper of turns, not a turn, and is dropped; of the rest the outermost are
 * the turns, and the last of those is the answer. If nothing is turn-shaped the
 * whole conversation root is the answer, which is wrong in a known way rather
 * than empty.
 */
export function genericTurns(root: Element): Turns {
  const candidates = pickAll(root, GENERIC.assistantTurn).filter((el) => text(el).length >= 20);
  const isWrapper = (c: Element) => {
    const inside = candidates.filter((o) => o !== c && c.contains(o));
    return inside.some((a) => inside.some((b) => a !== b && !a.contains(b) && !b.contains(a)));
  };
  const turns = candidates.filter((c) => !isWrapper(c));
  const outermost = turns.filter((c) => !turns.some((o) => o !== c && o.contains(c)));
  const answer = outermost[outermost.length - 1] ?? null;

  const userTurns = pickAll(root, GENERIC.userTurn).filter((u) => text(u).length > 0);
  return {
    userTurns,
    assistantTurns: outermost,
    lastUser: answer ? lastBefore(userTurns, answer) : null,
    lastAssistant: answer,
    answer: answer ?? root,
    scope: null,
    layer: 'generic',
  };
}
