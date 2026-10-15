/**
 * Every selector in the project, in one file.
 *
 * These apps restyle without notice, more often than Google does, so the rule
 * is SERP Reader's: no selector literal appears anywhere else. When extraction
 * breaks — and it will — this is the only file to edit, and the diagnostics on
 * each capture say which layer had to answer for the site's.
 *
 * ## How sure each block is (2026-10-15)
 *
 * Google AI Mode: read from real markup. The AI Mode reply component
 * (`data-subtree="aimc"`, the `li.Ioqnib` source cards) as it appears inside 9
 * SERP Reader captures of 2026-10-15, where Google put an AI Mode reply in the
 * overview slot. The AI Mode tab is assumed to draw its turns with the same
 * component; a capture from the tab confirms or corrects that.
 *
 * ChatGPT, Perplexity, Claude: written from what these apps shipped through
 * mid-2026, not from a capture. Nothing here fetches those pages to check —
 * that would be the automation this extension refuses. The generic layer is
 * what makes a stale block survivable: it finds the last turn and its links
 * without knowing the site. Tune these on the first real capture of each.
 *
 * Within a list, order matters: turn selectors are tried in turn and the first
 * that matches anything wins, so a precise selector is never mixed with a
 * broader one that matches its children.
 */

export const PARSER_VERSION = '1.0.0';

export interface SiteSelectors {
  /** The conversation's container: the snapshot's root. Must hold the last answer to be used. */
  roots: string[];
  userTurn: string[];
  assistantTurn: string[];
  /** The container one question-and-answer pair lives in, where a site has one. Scopes the sources panel. */
  turnScope: string[];
  /** Inside an assistant turn: the answer's own body. The turn itself when none matches. */
  answerBody: string[];
  /** Inside the answer: UI that is not answer — removed from the text, never from the links. */
  answerNoise: string[];
  /** Inside a user turn: the question's own text. The turn itself when none matches. */
  questionText: string[];
  /** A visible model label: the header's model picker. */
  model: string[];
  /** Attributes carrying the model id on, or inside, the assistant turn. Preferred: per answer, not per page. */
  modelAttributes: string[];
  sources: {
    /** The sources or citations panel. */
    panels: string[];
    /** One source inside a panel. Every link in the panel when none matches. */
    items: string[];
    title: string[];
    /** The publisher name a card shows. */
    siteName: string[];
  };
  /** Present only while the answer is still being written. */
  streaming: string[];
  /** The assistant's own "searched the web" marker, inside the turn. */
  webSearch: string[];
  /** Never stored: account menus, the composer and its draft. Removed from the snapshot. */
  private: string[];
}

/**
 * The generic layer. It knows no site: the last thing that looks like a turn,
 * every external link in it, and the conversation's root for the snapshot.
 * Broad on purpose — it is what still works when a site block above is stale.
 */
export const GENERIC = {
  roots: ['main', '[role="main"]', 'body'],
  userTurn: [
    '[data-message-author-role="user"]',
    '[data-testid*="user-message" i]',
    '[data-role="user"]',
    '[class*="user-message" i]',
    '[class*="UserMessage"]',
  ],
  assistantTurn: [
    '[data-message-author-role="assistant"]',
    '[data-testid*="assistant-message" i]',
    '[data-role="assistant"]',
    '[class*="markdown" i]',
    '[class*="prose" i]',
    '[role="article"]',
    'article',
  ],
  /** Never part of an answer's text: chrome around it. */
  textNoise: ['script', 'style', 'noscript', 'template', 'button', '[role="button"]', 'svg', 'textarea', 'input'],
  /** Never in a snapshot, on any site. */
  private: ['script', 'style', 'noscript', 'template', 'iframe', 'textarea', 'input', 'select', '[contenteditable="true"]', 'nav'],
  /** Candidates for a panel found by its heading ("Sources", "Citations"); matched on text in sources.ts. */
  headings: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', '[role="heading"]', 'button', 'span', 'div'],
};

export const CHATGPT: SiteSelectors = {
  roots: ['main'],
  userTurn: ['[data-message-author-role="user"]'],
  assistantTurn: ['[data-message-author-role="assistant"]'],
  turnScope: ['article', '[data-testid^="conversation-turn-"]'],
  answerBody: ['.markdown', '[class*="markdown"]'],
  answerNoise: [],
  questionText: ['.whitespace-pre-wrap', '[data-message-content]'],
  model: ['[data-testid="model-switcher-dropdown-button"]', 'button[aria-label^="Model selector" i]'],
  modelAttributes: ['data-message-model-slug'],
  sources: {
    panels: ['[data-testid*="sources-panel" i]', 'section[aria-label*="Sources" i]', 'aside[aria-label*="Sources" i]', '[data-testid*="citations" i]'],
    items: ['li', '[data-testid*="source-item" i]'],
    title: ['[data-testid*="title" i]', '.font-semibold', 'h3', 'h4'],
    siteName: ['[data-testid*="domain" i]', '.text-token-text-secondary'],
  },
  streaming: ['[data-testid="stop-button"]', 'button[aria-label="Stop streaming" i]', '.result-streaming'],
  webSearch: ['[data-testid="webpage-citation-pill"]', '[data-testid*="search-results" i]'],
  private: ['form', '#prompt-textarea', '[data-testid*="composer" i]', '[data-testid*="profile" i]', '#thread-bottom-container'],
};

export const PERPLEXITY: SiteSelectors = {
  roots: ['main'],
  userTurn: ['[data-testid*="user-query" i]', 'div[class*="group/query"]', 'h1[class*="query" i]', 'h1'],
  assistantTurn: ['[id^="markdown-content-"]', 'div[class*="prose"]'],
  turnScope: ['[data-testid*="thread-entry" i]', 'div[class*="group/thread"]'],
  answerBody: ['.prose', '[class*="prose"]'],
  answerNoise: [],
  questionText: [],
  model: ['[data-testid*="model-name" i]', 'button[aria-label*="model" i]'],
  modelAttributes: [],
  sources: {
    panels: ['[data-testid*="sources" i]', 'div[class*="sources" i]'],
    items: ['[data-testid*="source-item" i]', 'a[href]'],
    title: ['[data-testid*="title" i]', '.line-clamp-2', '.line-clamp-1'],
    siteName: ['[data-testid*="domain" i]'],
  },
  streaming: ['[data-testid*="stop-generating" i]', 'button[aria-label="Stop" i]'],
  webSearch: ['a.citation', '[class*="citation" i] a[href]'],
  private: ['textarea', '[contenteditable="true"]', '[data-testid*="sidebar" i]', '[data-testid*="user-menu" i]'],
};

export const CLAUDE: SiteSelectors = {
  roots: ['main', '[data-testid="conversation-root"]'],
  userTurn: ['[data-testid="user-message"]'],
  assistantTurn: ['[data-is-streaming]', '.font-claude-response', '.font-claude-message'],
  turnScope: ['[data-test-render-count]'],
  answerBody: ['.font-claude-response', '.font-claude-message', '[class*="prose"]'],
  answerNoise: [],
  questionText: [],
  model: ['[data-testid="model-selector-dropdown"]', 'button[data-testid*="model" i]'],
  modelAttributes: [],
  sources: {
    panels: ['[data-testid*="sources" i]', '[data-testid*="citation" i]'],
    items: ['li', 'a[href]'],
    title: ['[data-testid*="title" i]', '.font-medium'],
    siteName: ['[data-testid*="domain" i]'],
  },
  streaming: ['[data-is-streaming="true"]', 'button[aria-label="Stop response" i]'],
  webSearch: ['[data-testid*="web-search" i]', '[data-testid*="tool-use" i]'],
  private: ['fieldset', '[contenteditable="true"]', '[data-testid="user-menu-button"]', '[data-testid*="sidebar" i]'],
};

export const GOOGLE_AI_MODE: SiteSelectors = {
  roots: ['[role="main"]', '#rcnt', '#center_col', 'main'],
  /*
   * Not known yet: the SERP-embedded reply shows no question bubble. Until a
   * capture of the AI Mode tab names one, the question comes from the reply's
   * own heading ("AI Mode reply for <query>", google.ts) or from q= in the URL.
   */
  userTurn: [],
  assistantTurn: ['[data-subtree="aimc"]', '[data-scope-id="turn"]'],
  turnScope: ['[data-scope-id="turn"]'],
  answerBody: [],
  // The reply's heading ("AI Mode replied:"), and every card list: cards are sources, not answer.
  answerNoise: ['h3.MheKwc', 'ul.hJYS7c', 'li.Ioqnib', '[aria-label="About this result"]'],
  questionText: [],
  model: [],
  modelAttributes: [],
  sources: {
    // The "related results" list: 19 cards on the first real reply, each a signed /goto.
    panels: ['ul.hJYS7c'],
    items: ['li.Ioqnib'],
    title: [],
    siteName: ['span.EsfOKc'],
  },
  streaming: ['[data-subtree="aimc"][data-complete="false"]'],
  webSearch: [],
  private: ['#gb', 'header', '[role="banner"]', 'form', '[aria-label^="Google Account" i]'],
};

/** The AI Mode reply's own heading, read as text in google.ts. */
export const GOOGLE_REPLY_LABEL = ['h3.MheKwc', '[data-subtree="aimc"] h3'];
/** A Google inline citation chip: an anchor whose aria-label is the site name. */
export const GOOGLE_CHIP = ['a.PMDqCb'];
