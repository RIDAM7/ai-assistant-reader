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
 * ChatGPT, Perplexity, Claude: read from real captures, one answer each, made
 * by a person on 2026-10-15 and kept as test/fixtures/real-*. All three apps
 * had moved on from what the first version of this file assumed.
 *
 * Google AI Mode: read from real markup. The AI Mode reply component
 * (`data-subtree="aimc"`, the `li.Ioqnib` source cards) as it appears inside 9
 * SERP Reader captures of 2026-10-15, where Google put an AI Mode reply in the
 * overview slot. The AI Mode tab is assumed to draw its turns with the same
 * component; a capture from the tab confirms or corrects that.
 *
 * Gemini: written from the app's element names, not a capture. Nothing here
 * fetches these pages to check — that would be the automation this extension
 * refuses. The generic layer is what makes a stale block survivable: it finds
 * the last turn and its links without knowing the site.
 *
 * Within a list, order matters: turn selectors are tried in turn and the first
 * that matches anything wins, so a precise selector is never mixed with a
 * broader one that matches its children.
 */

export const PARSER_VERSION = '1.1.0';

export interface SiteSelectors {
  /** The conversation's container: the snapshot's root. Must hold the last answer to be used. */
  roots: string[];
  userTurn: string[];
  assistantTurn: string[];
  /** The container one question-and-answer pair lives in, where a site has one. Scopes the sources panel. */
  turnScope: string[];
  /** Inside an assistant turn: the answer's own body. The turn itself when none matches. */
  answerBody: string[];
  /**
   * Inside the answer: what is not the answer's prose — removed from the text, never from the links.
   * Citation pills belong here: a pill is a citation, read into `links`, and its label ("codingninjas",
   * "geeksforgeeks +2") is not the answer naming a brand. Brand counts read the text.
   */
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
  /*
   * Never part of an answer's text: chrome around it. Real <button>s only, not [role="button"]:
   * ChatGPT draws every brand it recommends as <span role="button">Codebasics</span>, and
   * removing those took the names out of the first real capture's answer.
   */
  textNoise: ['script', 'style', 'noscript', 'template', 'button', 'svg', 'textarea', 'input'],
  /** Never in a snapshot, on any site. */
  private: ['script', 'style', 'noscript', 'template', 'iframe', 'textarea', 'input', 'select', '[contenteditable="true"]', 'nav'],
  /** Candidates for a panel found by its heading ("Sources", "Citations"); matched on text in sources.ts. */
  headings: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', '[role="heading"]', 'button', 'span', 'div'],
};

/*
 * ChatGPT, as captured 2026-10-15: each question-and-answer pair is a
 * [data-turn-key]; inside it the parts are named by a search-unit key ending
 * ":user" or ":assistant"; the answer body says data-markdown-text-style=
 * "assistant-message". data-message-author-role and the per-message model slug
 * are gone. The older selectors stay behind the new ones, for a browser still
 * served the old app.
 */
export const CHATGPT: SiteSelectors = {
  roots: ['main', '[role="region"][aria-label="Conversation"]'],
  userTurn: ['[data-content-search-unit-key$=":user"]', '[data-message-author-role="user"]'],
  assistantTurn: ['[data-content-search-unit-key$=":assistant"]', '[data-message-author-role="assistant"]'],
  turnScope: ['[data-turn-key]', 'article', '[data-testid^="conversation-turn-"]'],
  answerBody: ['[data-markdown-text-style="assistant-message"]', '[data-markdown-copy="contents"]', '.markdown', '[class*="markdown"]'],
  answerNoise: ['[data-testid="webpage-citation-pill"]'],
  questionText: ['.whitespace-pre-wrap', '[data-message-content]'],
  // Not in the 2026-10-15 capture: the picker sits outside the conversation and none of these matched.
  model: ['[data-testid="model-switcher-dropdown-button"]', 'button[aria-label^="Model selector" i]'],
  modelAttributes: ['data-message-model-slug'],
  sources: {
    panels: ['[data-testid*="sources-panel" i]', 'section[aria-label*="Sources" i]', 'aside[aria-label*="Sources" i]', '[data-testid*="citations" i]'],
    items: ['li', '[data-testid*="source-item" i]'],
    title: ['[data-testid*="title" i]', '.font-semibold', 'h3', 'h4'],
    siteName: ['[data-testid*="domain" i]', '.text-token-text-secondary'],
  },
  streaming: [
    '[data-talvt-turn-state]:not([data-talvt-turn-state="complete"])',
    '[data-testid="stop-button"]',
    'button[aria-label="Stop streaming" i]',
    '.result-streaming',
  ],
  webSearch: ['[data-testid="webpage-citation-pill"]', '[data-testid*="search-results" i]'],
  private: ['form', '#prompt-textarea', '[data-testid*="composer" i]', '[data-testid*="profile" i]', '#thread-bottom-container'],
};

/*
 * Perplexity, as captured 2026-10-15: the question is the right-hand bubble;
 * the answer is the [data-workflow-final-text] block, whose one div.prose
 * holds every section. A broader `div[class*="prose"]` also matches table cells
 * inside it, and the last of those was read as the whole answer: 221
 * characters of a 2,673-character reply. Citations are span.citation pills
 * around an anchor. The "Model" button is the composer's picker for the next
 * question, not the model that answered, so it is not read.
 */
export const PERPLEXITY: SiteSelectors = {
  roots: ['main'],
  userTurn: ['[data-message-bubble="right"]', '[data-testid*="user-query" i]', 'div[class*="group/query"]', 'h1[class*="query" i]'],
  assistantTurn: ['[data-workflow-final-text]', '[id^="markdown-content-"]', 'div.prose[data-renderer="lm"]'],
  turnScope: [],
  answerBody: ['div.prose[data-renderer="lm"]', 'div.prose'],
  answerNoise: ['span.citation', 'a.citation', '[data-pplx-citation]'],
  questionText: [],
  model: [],
  modelAttributes: [],
  sources: {
    panels: ['[data-testid*="sources" i]', 'div[class*="sources" i]'],
    items: ['[data-testid*="source-item" i]', 'a[href]'],
    title: ['[data-testid*="title" i]', '.line-clamp-2', '.line-clamp-1'],
    siteName: ['[data-testid*="domain" i]'],
  },
  streaming: ['[data-testid*="stop-generating" i]', 'button[aria-label="Stop" i]'],
  webSearch: ['[data-pplx-citation]', 'span.citation'],
  private: ['textarea', '[contenteditable="true"]', '[data-testid*="sidebar" i]', '[data-testid*="user-menu" i]', '[data-testid^="ask-input"]'],
};

/*
 * Claude, as captured 2026-10-15: [data-testid="assistant-message"] carries
 * data-is-streaming; the reply's text is [data-perf-reply-text]; a citation
 * pill is an anchor inside span[data-not-prose] — the app's own word for
 * "not the answer's prose". The chat header inside <main> carries the linked
 * computer's name ("<name>_PC, Asleep or app closed"), so it never reaches a
 * snapshot.
 */
export const CLAUDE: SiteSelectors = {
  roots: ['main', '[data-testid="chat-column"]'],
  userTurn: ['[data-testid="user-message"]'],
  assistantTurn: ['[data-testid="assistant-message"]', '[data-is-streaming]', '.font-claude-response', '.font-claude-message'],
  turnScope: [],
  answerBody: ['[data-perf-reply-text]', '.standard-markdown', '.font-claude-response', '.font-claude-message'],
  answerNoise: ['span[data-not-prose]'],
  questionText: [],
  model: ['[data-testid="model-selector-dropdown"]', 'button[data-testid*="model" i]'],
  modelAttributes: [],
  sources: {
    panels: ['[data-testid*="sources" i]', '[data-testid*="citation" i]'],
    items: ['li', 'a[href]'],
    title: ['[data-testid*="title" i]', '.font-medium'],
    siteName: ['[data-testid*="domain" i]'],
  },
  streaming: ['[data-testid="assistant-message"][data-is-streaming="true"]', '[data-is-streaming="true"]', 'button[aria-label="Stop response" i]'],
  webSearch: ['[data-testid*="web-search" i]', '[data-testid*="tool-use" i]'],
  private: [
    'fieldset',
    '[contenteditable="true"]',
    '[data-testid="user-menu-button"]',
    '[data-testid*="sidebar" i]',
    '[data-testid="chat-header"]',
    '[data-testid="cowork-computer-link-indicator"]',
  ],
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

/*
 * Gemini, gemini.google.com: written from the Angular app's own element names
 * (user-query, model-response, message-content), not yet from a capture. The
 * sidebar lists the person's other chats and ends with their name, and the
 * composer holds the model switcher ("Flash", "Pro") — so both are private,
 * and the model label is kept on its own (snapshot.ts).
 */
export const GEMINI: SiteSelectors = {
  roots: ['#chat-history', 'chat-window', 'main'],
  userTurn: ['user-query', '[data-test-id="user-query"]'],
  assistantTurn: ['model-response', '[data-test-id="model-response"]'],
  turnScope: ['.conversation-container', '[data-test-id="conversation-container"]'],
  answerBody: ['message-content', '.markdown'],
  // Inline source chips ("ANI News") are citations, not prose.
  answerNoise: ['source-inline-chip', 'sources-carousel-inline', '.source-inline-chip-container'],
  questionText: ['.query-text', '.query-text-line'],
  model: ['[data-test-id="bard-mode-menu-button"]', 'bard-mode-switcher button', 'button.input-area-switch'],
  modelAttributes: [],
  sources: {
    panels: ['sources-list', 'source-list', '[data-test-id*="sources" i]'],
    items: ['a[href]'],
    title: [],
    siteName: [],
  },
  streaming: ['model-response [aria-busy="true"]', 'button[aria-label="Stop response" i]'],
  webSearch: ['source-inline-chip', 'sources-carousel-inline'],
  private: [
    'bard-sidenav',
    'side-navigation-v2',
    'mat-sidenav',
    'input-area-v2',
    'rich-textarea',
    'top-bar-actions',
    'header',
    '[aria-label*="Google Account" i]',
  ],
};

/** The AI Mode reply's own heading, read as text in google.ts. */
export const GOOGLE_REPLY_LABEL = ['h3.MheKwc', '[data-subtree="aimc"] h3'];
/** A Google inline citation chip: an anchor whose aria-label is the site name. */
export const GOOGLE_CHIP = ['a.PMDqCb'];
