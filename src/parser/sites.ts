/**
 * Which assistant a page is, and the selector block that goes with it.
 */
import type { Assistant } from '../types/answer';
import { CHATGPT, CLAUDE, GOOGLE_AI_MODE, PERPLEXITY, type SiteSelectors } from './selectors';

export const SITES: Record<Assistant, SiteSelectors> = {
  chatgpt: CHATGPT,
  perplexity: PERPLEXITY,
  claude: CLAUDE,
  google_ai_mode: GOOGLE_AI_MODE,
};

export const ASSISTANT_NAMES: Record<Assistant, string> = {
  chatgpt: 'ChatGPT',
  perplexity: 'Perplexity',
  claude: 'Claude',
  google_ai_mode: 'Google AI Mode',
};

/**
 * The assistant a URL belongs to, or null.
 *
 * Google is only Google AI Mode on the AI Mode tab, `udm=50`. Every other
 * google.com/search page is a SERP, and SERP Reader's: this extension stays off
 * it, so one results page never carries two Collect buttons for two tools.
 */
export function detectAssistant(url: string): Assistant | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (host === 'chatgpt.com' || host === 'chat.openai.com') return 'chatgpt';
  if (host === 'perplexity.ai' || host === 'www.perplexity.ai') return 'perplexity';
  if (host === 'claude.ai') return 'claude';
  if (/(^|\.)google\.[a-z.]+$/.test(host) && u.pathname === '/search' && u.searchParams.get('udm') === '50') {
    return 'google_ai_mode';
  }
  return null;
}

/** The conversation's id when the URL carries one: /c/<id>, /chat/<id>, /search/<slug>. */
export function conversationId(url: string): string | undefined {
  try {
    const m = new URL(url).pathname.match(/^\/(?:c|chat|search|share|g\/[^/]+\/c)\/([^/?#]+)/);
    return m?.[1] && m[1] !== 'new' ? m[1] : undefined;
  } catch {
    return undefined;
  }
}

/** The question in the URL, where a site puts it there: Google's q=, Perplexity's ?q=. */
export function questionFromUrl(url: string): string {
  try {
    return (new URL(url).searchParams.get('q') ?? '').trim();
  } catch {
    return '';
  }
}
