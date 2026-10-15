/**
 * Synthetic assistant pages.
 *
 * ## Read this before trusting a passing test
 *
 * ChatGPT, Perplexity and Claude below are written from src/parser/selectors.ts,
 * not captured: fetching those pages programmatically is the automation this
 * project refuses, and a guessed copy of their markup would be a worse lie than
 * none. So what these prove is the parser's logic — the last turn and not the
 * first, links in order and de-duplicated, the assistant's own links left out,
 * the generic layer taking over when the site's selectors miss, nothing private
 * reaching the snapshot. They do not prove the selectors match today's apps.
 *
 * Google AI Mode is the exception: test/fixtures/real-google_ai_mode-*.html is
 * Google's own markup, an AI Mode reply from a SERP Reader capture.
 *
 * When a real capture is saved, run test/import-capture.mjs on the export. That
 * is the fixture worth having, and it can only come from a page a person opened.
 */

const page = ({ lang = 'en', head = '', body }) =>
  `<!doctype html><html lang="${lang}"><head><title>conversation</title>${head}</head><body>${body}</body></html>`;

/** What every chat page carries and no capture may keep: other chats, the account, session state. */
const PRIVATE_SCRIPT = '<script>window.__session={"email":"person@example.com","token":"sk-live-secret"}</script>';
const SIDEBAR = '<nav aria-label="Chat history"><a href="/c/older-chat">My private chat about salary</a></nav>';

export const QUESTION = 'Which is the best AI engineering course or bootcamp in India for freshers, with live classes?';

/** A recommendation answer naming brands, with citations the way ChatGPT ships them: utm_source=chatgpt.com on each. */
export const CHATGPT_ANSWER = `
  <p>For freshers who want live classes, these are the names that come up most:</p>
  <ul>
    <li><strong>Scaler</strong>: a long programme with mentors.<span data-testid="webpage-citation-pill"><a href="https://www.scaler.com/academy/?utm_source=chatgpt.com" target="_blank" rel="noopener">scaler.com</a></span></li>
    <li><strong>Coding Ninjas</strong>: live batches and doubt support.<span data-testid="webpage-citation-pill"><a href="https://www.codingninjas.com/courses?utm_source=chatgpt.com" target="_blank" rel="noopener">codingninjas</a></span></li>
    <li><strong>Masai School</strong>: pay-after-placement options.</li>
  </ul>
  <p>Compare fees before joining; Coding Ninjas lists them <a href="https://www.codingninjas.com/courses?utm_source=chatgpt.com" target="_blank" rel="noopener">on its site</a>.</p>
  <p>Start a <a href="/c/new-chat">new chat</a> to compare more.</p>`;

/**
 * ChatGPT. `turns` are [question, answerHtml] pairs, oldest first.
 * `modelSlug` sits on the assistant message; `header` is the model picker.
 */
export function chatgptPage({
  turns = [[QUESTION, CHATGPT_ANSWER]],
  modelSlug = 'gpt-5',
  header = 'ChatGPT 5',
  panel = [],
  streaming = false,
} = {}) {
  const pairs = turns
    .map(
      ([q, a], i) => `
      <article data-testid="conversation-turn-${2 * i + 1}">
        <div data-message-author-role="user" data-message-id="u${i}"><div class="whitespace-pre-wrap">${q}</div></div>
      </article>
      <article data-testid="conversation-turn-${2 * i + 2}">
        <div data-message-author-role="assistant" data-message-id="a${i}"${modelSlug ? ` data-message-model-slug="${modelSlug}"` : ''}>
          <div class="markdown prose">${a}</div>
        </div>
        <div><button aria-label="Copy">Copy</button><button>Sources</button></div>
      </article>`,
    )
    .join('');
  return page({
    head: PRIVATE_SCRIPT,
    body: `
    ${SIDEBAR}
    <header>
      ${header ? `<button data-testid="model-switcher-dropdown-button">${header}</button>` : ''}
      <button data-testid="profile-button">Person Name</button>
    </header>
    <main>
      ${pairs}
      <form><div id="prompt-textarea" contenteditable="true">half-typed draft about my salary</div>
        ${streaming ? '<button data-testid="stop-button">Stop</button>' : ''}</form>
    </main>
    ${
      panel.length
        ? `<aside aria-label="Sources"><h2>Sources</h2><ul>${panel
            .map((s) => `<li><a href="${s.url}" target="_blank"><div class="font-semibold">${s.title}</div></a></li>`)
            .join('')}</ul></aside>`
        : ''
    }`,
  });
}

/** Perplexity: the query as a heading, the answer in .prose, a sources list. */
export function perplexityPage({ question = QUESTION, answer, sources = [] } = {}) {
  return page({
    body: `
    ${SIDEBAR}
    <main>
      <div class="group/thread">
        <div class="group/query"><h1>${question}</h1></div>
        <div data-testid="sources-list">
          ${sources
            .map((s) => `<div data-testid="source-item"><a href="${s.url}"><div class="line-clamp-2">${s.title}</div></a></div>`)
            .join('')}
        </div>
        <div id="markdown-content-0" class="prose">${
          answer ??
          `<p>GeeksforGeeks and Newton School both run live cohorts<a class="citation" href="https://www.geeksforgeeks.org/courses/live">geeksforgeeks +2</a>.</p>
           <p>Bosscoder Academy focuses on working engineers<a class="citation" href="https://www.bosscoderacademy.com/">bosscoder</a>.</p>`
        }</div>
      </div>
      <textarea placeholder="Ask anything">draft</textarea>
    </main>`,
  });
}

/** Claude: user and assistant messages, the model picker, an optional web-search line. */
export function claudePage({ question = QUESTION, answer, model = 'Claude Opus 5.5', searched = false, streaming = false } = {}) {
  return page({
    body: `
    ${SIDEBAR}
    <header><button data-testid="model-selector-dropdown">${model}</button><button data-testid="user-menu-button">PN</button></header>
    <main>
      <div data-test-render-count="1"><div data-testid="user-message"><p>${question}</p></div></div>
      <div data-test-render-count="2">
        <div data-is-streaming="${streaming}">
          ${searched ? '<div data-testid="tool-use-block">Searched the web</div>' : ''}
          <div class="font-claude-response">${
            answer ??
            `<p>Sheryians Coding School and Geekster both teach in live batches.</p><p>Prokopi (prokopi.in) runs live, mentor-led classes in AI engineering.</p>`
          }</div>
        </div>
      </div>
      <fieldset><div contenteditable="true">a draft</div></fieldset>
    </main>`,
  });
}

export const URLS = {
  chatgpt: 'https://chatgpt.com/c/68ee1f2a-0b7c-8003-9f1e-2d6c1a5b7e10',
  perplexity: 'https://www.perplexity.ai/search/which-is-the-best-ai-engineeri-Xy7qLm0QTe6',
  claude: 'https://claude.ai/chat/0f9b2c4e-1a2b-4c3d-9e8f-123456789abc',
  google: 'https://www.google.com/search?q=ai+engineer+career&udm=50&hl=en',
};
