/**
 * Parser and export tests.
 *
 *   npm test
 *
 * What these prove and what they do not is written at the top of fixtures.mjs.
 * Short version: the logic, on markup written from selectors.ts — except Google
 * AI Mode, which is read from real markup here and in real-capture.test.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';

import { collectAnswer, detectAssistant } from './.parser.mjs';
import { answersCsv, answersJson, citationsCsv } from './.export.mjs';
import { CHATGPT_ANSWER, QUESTION, URLS, chatgptPage, claudePage, geminiPage, perplexityPage } from './fixtures.mjs';

const parse = (html) => parseHTML(html).document;
const collect = (html, url, opts = {}) => collectAnswer(parse(html), url, opts);

/* ------------------------------------------------------------- which site */

test('recognises the four assistants, and Google only on its AI Mode tab', () => {
  assert.equal(detectAssistant('https://chatgpt.com/c/abc'), 'chatgpt');
  assert.equal(detectAssistant('https://chat.openai.com/'), 'chatgpt');
  assert.equal(detectAssistant('https://www.perplexity.ai/search/x'), 'perplexity');
  assert.equal(detectAssistant('https://claude.ai/new'), 'claude');
  assert.equal(detectAssistant('https://gemini.google.com/app/e18b1d6c7596d509?hl=en-IN'), 'gemini');
  assert.equal(detectAssistant('https://www.google.com/search?q=x&udm=50'), 'google_ai_mode');
  assert.equal(detectAssistant('https://www.google.co.in/search?udm=50&q=x'), 'google_ai_mode');
  // A plain results page is SERP Reader's. Two Collect buttons on one SERP is a mistake waiting to happen.
  assert.equal(detectAssistant('https://www.google.com/search?q=x'), null);
  assert.equal(detectAssistant('https://www.google.com/search?q=x&udm=2'), null);
  assert.equal(detectAssistant('https://example.com/chat'), null);
  assert.equal(detectAssistant('not a url'), null);
});

/* ---------------------------------------------------------------- ChatGPT */

test('ChatGPT: the last question and the last answer, not the first', () => {
  const d = collect(
    chatgptPage({ turns: [['What is RAG?', '<p>Retrieval augmented generation is a pattern for grounding answers.</p>'], [QUESTION, CHATGPT_ANSWER]] }),
    URLS.chatgpt,
  );
  assert.equal(d.metadata.assistant, 'chatgpt');
  assert.equal(d.metadata.question, QUESTION);
  assert.match(d.answer, /names that come up most/);
  assert.doesNotMatch(d.answer, /Retrieval augmented/, 'an earlier answer leaked in');
  assert.doesNotMatch(d.answer, /\bCopy\b/, 'a button label leaked into the answer');
  assert.equal(d.metadata.conversationId, '68ee1f2a-0b7c-8003-9f1e-2d6c1a5b7e10');
  assert.deepEqual(d.diagnostics.turns, { user: 2, assistant: 2 });
  assert.deepEqual(d.diagnostics.warnings, []);
});

test('the answer keeps its lines: list items do not run into each other', () => {
  // textContent would give "…doubt support.codingninjasMasai School…", and a
  // brand list read that way is one long word.
  const d = collect(chatgptPage(), URLS.chatgpt);
  const lines = d.answer.split('\n');
  assert.ok(lines.some((l) => l.startsWith('Masai School')), d.answer);
  assert.ok(lines.some((l) => l.startsWith('Coding Ninjas')), d.answer);
});

test('a citation pill is a link, not prose: its label stays out of the answer text', () => {
  // Brand counts read the text. A pill reading "codingninjas" is a citation,
  // already in links; counted as prose it would say the answer *named* Coding
  // Ninjas when it only cited it. And a pill glued to the word before it read
  // "engineersbosscoder" on the first end-to-end run.
  const chat = collect(chatgptPage(), URLS.chatgpt);
  assert.doesNotMatch(chat.answer, /scaler\.com|codingninjas\b/, chat.answer);
  assert.ok(chat.links.some((l) => l.anchorText === 'codingninjas'), 'the pill is still a link');
  const pplx = collect(perplexityPage(), URLS.perplexity);
  assert.doesNotMatch(pplx.answer, /geeksforgeeks \+2|bosscoder\b/, pplx.answer);
  assert.match(pplx.answer, /working engineers\./);
  // An ordinary inline link keeps its words, apart from its neighbours.
  const glued = collect(chatgptPage({ turns: [[QUESTION, '<p>Read the<a href="https://www.geekster.in/">Geekster</a>guide.</p>']] }), URLS.chatgpt);
  assert.match(glued.answer, /Read the Geekster guide\./);
});

test('links: in order, one per destination with a count, the tracking tag off, the app itself left out', () => {
  const d = collect(chatgptPage(), URLS.chatgpt);
  assert.deepEqual(d.links.map((l) => l.domain), ['scaler.com', 'codingninjas.com']);
  assert.deepEqual(d.links.map((l) => l.order), [1, 2]);
  const ninjas = d.links[1];
  assert.equal(ninjas.count, 2, 'the same citation twice is one link cited twice');
  assert.equal(ninjas.url, 'https://www.codingninjas.com/courses', 'utm_source=chatgpt.com is the assistant\'s mark, not the page');
  assert.match(ninjas.href, /utm_source=chatgpt\.com/, 'the href is kept as the page had it');
  assert.equal(ninjas.anchorText, 'codingninjas');
  assert.ok(!d.links.some((l) => /chatgpt\.com/.test(l.url)), 'a link to a new chat is not a citation');
  assert.equal(d.metadata.webSources, true);
  assert.equal(d.diagnostics.layers.links, 'site');
});

test('model: the label on the answer itself, over the picker in the header', () => {
  // The picker says what the next message will use; the slug says what wrote this one.
  assert.equal(collect(chatgptPage({ modelSlug: 'gpt-5-thinking', header: 'ChatGPT 5' }), URLS.chatgpt).metadata.model, 'gpt-5-thinking');
  assert.equal(collect(chatgptPage({ modelSlug: null, header: 'ChatGPT 5 Pro' }), URLS.chatgpt).metadata.model, 'ChatGPT 5 Pro');
  const none = collect(chatgptPage({ modelSlug: null, header: null }), URLS.chatgpt);
  assert.equal(none.metadata.model, undefined, 'no label shown, none invented');
  assert.equal(none.diagnostics.layers.model, 'none');
});

test('sources panel: read in its own order, outside the conversation', () => {
  const panel = [
    { title: 'Scaler Academy', url: 'https://www.scaler.com/academy/?utm_source=chatgpt.com' },
    { title: 'Coding Ninjas courses', url: 'https://www.codingninjas.com/courses' },
    { title: 'GeeksforGeeks', url: 'https://www.geeksforgeeks.org/courses' },
  ];
  const d = collect(chatgptPage({ panel }), URLS.chatgpt);
  assert.deepEqual(d.sources.map((s) => [s.order, s.domain, s.title]), [
    [1, 'scaler.com', 'Scaler Academy'],
    [2, 'codingninjas.com', 'Coding Ninjas courses'],
    [3, 'geeksforgeeks.org', 'GeeksforGeeks'],
  ]);
  assert.equal(d.sources[0].url, 'https://www.scaler.com/academy/');
  assert.equal(d.diagnostics.layers.sources, 'site');
  assert.equal(d.links.length, 2, 'panel sources are not answer links');
});

test('a streaming answer is saved and flagged, never refused on a selector guess', () => {
  const d = collect(chatgptPage({ streaming: true }), URLS.chatgpt);
  assert.equal(d.diagnostics.streaming, true);
  assert.ok(d.diagnostics.warnings.some((w) => /still writing/.test(w)));
  assert.ok(d.answer.length > 0);
});

/* -------------------------------------------------------------- snapshot */

test('the snapshot holds the conversation and nothing private', () => {
  const html = chatgptPage({ panel: [{ title: 'Scaler', url: 'https://www.scaler.com/' }] });
  const d = collectAnswer(parse(html), URLS.chatgpt, { includeRawHtml: true });
  const raw = d.rawHtml;
  assert.ok(raw, 'no snapshot');
  assert.equal(d.diagnostics.snapshot, 'conversation');
  assert.match(raw, /names that come up most/);
  // These go into a research repository.
  assert.doesNotMatch(raw, /My private chat about salary/, 'the sidebar\'s other chats were kept');
  assert.doesNotMatch(raw, /person@example\.com|sk-live-secret/, 'session state from a script was kept');
  assert.doesNotMatch(raw, /half-typed draft/, 'the composer draft was kept');
  assert.doesNotMatch(raw, /Person Name/, 'the account button was kept');
  // ...and what a re-parse needs from outside the conversation is there.
  assert.match(raw, /data-model="gpt-5"/, 'the model label is recorded on the wrapper');
  assert.match(raw, /Scaler/);
});

test('a snapshot re-parses to the same record, with no live page', () => {
  const panel = [{ title: 'Scaler', url: 'https://www.scaler.com/' }];
  const live = collectAnswer(parse(chatgptPage({ panel, modelSlug: null })), URLS.chatgpt, { includeRawHtml: true });
  const again = collectAnswer(parse(live.rawHtml), live.metadata.url);
  const shape = (d) => ({ q: d.metadata.question, a: d.answer, l: d.links, s: d.sources, m: d.metadata.model, w: d.metadata.webSources, lang: d.metadata.language });
  assert.deepEqual(shape(again), shape(live));
  // The snapshot says which assistant it is, for a re-parse that has lost the URL.
  assert.equal(collectAnswer(parse(live.rawHtml), '').metadata.assistant, 'chatgpt');
});

test('the raw HTML is dropped from an export only when the caller says so', () => {
  const d = collectAnswer(parse(chatgptPage()), URLS.chatgpt, { includeRawHtml: true });
  const kept = JSON.parse(answersJson([d], true, new Date('2026-10-20T06:00:00Z')));
  assert.equal(kept.count, 1);
  assert.equal(kept.exportedAt, '2026-10-20T06:00:00.000Z');
  assert.ok(kept.answers[0].rawHtml, 'the snapshot was dropped from the full export');
  assert.equal(JSON.parse(answersJson([d], false)).answers[0].rawHtml, undefined);
});

/* ------------------------------------------------------- Perplexity, Claude */

test('Perplexity: the query heading, the prose answer, the sources list', () => {
  const sources = [
    { title: 'GeeksforGeeks live courses', url: 'https://www.geeksforgeeks.org/courses/live' },
    { title: 'Newton School', url: 'https://www.newtonschool.co/' },
  ];
  const d = collect(perplexityPage({ sources }), URLS.perplexity);
  assert.equal(d.metadata.question, QUESTION);
  assert.match(d.answer, /GeeksforGeeks and Newton School/);
  assert.deepEqual(d.links.map((l) => l.domain), ['geeksforgeeks.org', 'bosscoderacademy.com']);
  assert.deepEqual(d.sources.map((s) => s.title), ['GeeksforGeeks live courses', 'Newton School']);
  assert.equal(d.metadata.conversationId, 'which-is-the-best-ai-engineeri-Xy7qLm0QTe6');
});

test('Claude: question, answer and model; no links and no search means no web sources', () => {
  const d = collect(claudePage(), URLS.claude);
  assert.equal(d.metadata.question, QUESTION);
  assert.match(d.answer, /Prokopi \(prokopi\.in\) runs live/);
  assert.equal(d.metadata.model, 'Claude Opus 5.5');
  assert.equal(d.links.length, 0);
  assert.equal(d.metadata.webSources, false, 'an answer from the model alone must say so');
});

test('Claude: a "Searched the web" line counts as web sources even with nothing linked', () => {
  const d = collect(claudePage({ searched: true }), URLS.claude);
  assert.equal(d.metadata.webSources, true);
  assert.doesNotMatch(d.answer, /Searched the web/, 'the tool line is not the answer');
});

test('Claude: data-is-streaming="true" flags the capture', () => {
  assert.equal(collect(claudePage({ streaming: true }), URLS.claude).diagnostics.streaming, true);
  assert.equal(collect(claudePage({ streaming: false }), URLS.claude).diagnostics.streaming, false);
});

/* --------------------------------------------------------- generic layer */

test('when the site\'s selectors miss, the generic layer still reads the last turn and its links', () => {
  // A ChatGPT that renamed everything: no data-message-author-role anywhere.
  const html = `<!doctype html><html><body><main>
    <div class="msg user-message">Old question</div>
    <article class="turn"><div class="answer-markdown"><p>Old answer, long enough to count as a turn.</p></div></article>
    <div class="msg user-message">${QUESTION}</div>
    <article class="turn"><div class="answer-markdown"><p>Masai School and Scaler both run live cohorts for freshers.</p>
      <p><a href="https://www.masaischool.com/?utm_source=chatgpt.com">masaischool</a> <a href="/c/other">another chat</a></p></div></article>
  </main></body></html>`;
  const d = collect(html, URLS.chatgpt);
  assert.equal(d.diagnostics.layers.answer, 'generic');
  assert.ok(d.diagnostics.warnings.some((w) => /generic layer/.test(w)), 'the fallback must say it ran');
  assert.match(d.answer, /Masai School and Scaler/);
  assert.doesNotMatch(d.answer, /Old answer/);
  assert.equal(d.metadata.question, QUESTION);
  assert.deepEqual(d.links.map((l) => l.url), ['https://www.masaischool.com/']);
});

test('with nothing turn-shaped at all, the whole conversation is read and the record says so', () => {
  const html = `<!doctype html><html><body><main><p>${QUESTION}</p><p>Try <a href="https://www.scaler.com/">Scaler</a>.</p></main></body></html>`;
  const d = collect(html, URLS.claude);
  assert.match(d.answer, /Try Scaler/);
  assert.deepEqual(d.links.map((l) => l.domain), ['scaler.com']);
  assert.ok(d.diagnostics.warnings.some((w) => /whole conversation/.test(w)));
});

test('a panel headed "Sources" is found when the site\'s panel selectors miss', () => {
  const html = chatgptPage().replace(
    '</main>',
    '</main><section class="drawer"><h3>Sources</h3><a href="https://www.newtonschool.co/">Newton School</a><a href="https://www.masaischool.com/">Masai</a></section>',
  );
  const d = collect(html, URLS.chatgpt);
  assert.equal(d.diagnostics.layers.sources, 'heading');
  assert.deepEqual(d.sources.map((s) => s.domain), ['newtonschool.co', 'masaischool.com']);
});

test('a "Sources:" line the model wrote stays part of the answer', () => {
  const answer = `${CHATGPT_ANSWER}<p><strong>Sources</strong></p><ul><li><a href="https://www.geekster.in/">Geekster</a></li></ul>`;
  const d = collect(chatgptPage({ turns: [[QUESTION, answer]] }), URLS.chatgpt);
  assert.ok(d.links.some((l) => l.domain === 'geekster.in'), 'the answer lost its own links to a panel');
  assert.ok(!d.sources.some((s) => s.domain === 'geekster.in'));
});

test('an empty page yields an empty answer and says why, rather than throwing', () => {
  const d = collect('<html><body></body></html>', URLS.chatgpt);
  assert.equal(d.answer, '');
  assert.ok(d.diagnostics.warnings.length > 0);
  assert.throws(() => collect('<html><body></body></html>', 'https://example.com/'), /Not a supported assistant page/);
});

/* ------------------------------------------------- Google AI Mode, real markup */

const GOOGLE_REAL = readFileSync('test/fixtures/real-google_ai_mode-ai-engineer-career.html', 'utf8');
const GOOGLE_SERP_URL = 'https://www.google.com/search?q=ai%20engineer%20career&gl=in&hl=en&pws=0&num=20';

test('Google AI Mode: a /goto citation takes its domain from the source card with the same href', () => {
  // Every href is a signed /goto blob; the destination is in no anchor. The
  // cards carry it in their favicon request or markup, and an inline chip
  // shares its card's href.
  const d = collect(GOOGLE_REAL, GOOGLE_SERP_URL, { assistant: 'google_ai_mode' });
  assert.equal(d.metadata.question, 'ai engineer career', 'the reply names its own question');
  assert.equal(d.diagnostics.layers.question, 'site');
  assert.equal(d.sources.length, 19);
  assert.ok(d.sources.every((s) => s.urlIsRedirect && s.url.includes('/goto?')), 'the honest redirect is kept');
  assert.equal(d.sources[3].domain, 'udemy.com');
  assert.equal(d.links[0].domain, 'roadmap.sh');
  assert.equal(d.links[0].anchorText, 'Roadmap.sh');
  assert.doesNotMatch(d.answer, /Opens in new tab|AI Mode replied/);
});

test("Google AI Mode: a card that names no origin takes it from the reply's source record for its link", () => {
  const d = collect(GOOGLE_REAL, GOOGLE_SERP_URL, { assistant: 'google_ai_mode' });
  const youtube = d.sources.filter((s) => s.siteName === 'YouTube');
  assert.equal(youtube.length, 4);
  assert.ok(youtube.every((s) => s.domain === 'youtube.com'), 'from the record the reply keeps for each card');
  assert.ok(youtube.every((s) => !/open in an external site/.test(s.title)));
  // An inline link shares its card's href, so it shares the card's domain.
  const shared = d.links.filter((l) => youtube.some((s) => s.url === l.url));
  assert.deepEqual(shared.map((l) => l.domain), ['youtube.com']);
});

test('Google AI Mode: with no record and no origin in the markup, a card keeps its site name and no invented domain', () => {
  // The same reply with YouTube's origin made unreadable everywhere: nothing is left to say youtube.com but the site name.
  const stripped = GOOGLE_REAL.replace(/(https?:\/\/)(www\.)?youtube\.com/gi, '$1unknown');
  const d = collect(stripped, GOOGLE_SERP_URL, { assistant: 'google_ai_mode' });
  const youtube = d.sources.filter((s) => s.siteName === 'YouTube');
  assert.equal(youtube.length, 4);
  assert.ok(youtube.every((s) => s.domain === ''), 'a domain was guessed from a site name');
});

test("Google AI Mode: a source record answers for its own link only, never one its link's blob begins", () => {
  const blob = 'CAESawHr' + 'A'.repeat(16);
  const card = (b) => `<li class="Ioqnib"><a href="/goto?url=${b}&amp;ved=x"><span class="EsfOKc">YouTube</span></a></li>`;
  const page = `<html><body><main><div data-subtree="aimc"
    data-records='"https://www.youtube.com",["YouTube","Jean Lee"],"/goto?url=${blob}Z"'>
    <p>Watch a roadmap walkthrough first.</p>
    <ul class="hJYS7c">${card(`${blob}Z`)}${card(blob)}</ul>
  </div></main></body></html>`;
  const d = collect(page, GOOGLE_SERP_URL, { assistant: 'google_ai_mode' });
  assert.deepEqual(d.sources.map((s) => s.domain), ['youtube.com', '']);
});

test('Google AI Mode: q= is the question when the page names none', () => {
  const d = collect('<html><body><main><div data-subtree="aimc"><p>Masai School runs live cohorts in Bengaluru.</p></div></main></body></html>', URLS.google);
  assert.equal(d.metadata.question, 'ai engineer career');
  assert.equal(d.diagnostics.layers.question, 'url');
});

/* ------------------------------------------------------------------ export */

test('CSV: a multi-line answer with commas and quotes stays one row', () => {
  const d = collect(chatgptPage({ turns: [[QUESTION, '<p>Line one, with "quotes".</p><p>Line two.</p>']] }), URLS.chatgpt);
  const csv = answersCsv([d]);
  assert.ok(csv.includes('"Line one, with ""quotes"".\nLine two."'), csv);
  assert.equal(csv.split('\r\n').filter(Boolean).length, 2, 'header and one row');
});

test('citations CSV: one row per panel source and per answer link, kind says which', () => {
  const d = collect(chatgptPage({ panel: [{ title: 'Scaler', url: 'https://www.scaler.com/' }] }), URLS.chatgpt);
  const rows = citationsCsv([d]).trim().split('\r\n');
  assert.equal(rows[0], 'assistant,question,collected_at,kind,order,title,url,domain,site_name,count,answer_id');
  assert.equal(rows.length, 1 + 1 + 2);
  assert.equal(rows.filter((r) => r.includes(',source,')).length, 1);
  assert.equal(rows.filter((r) => r.includes(',link,')).length, 2);
  assert.ok(rows.some((r) => r.includes(',link,2,codingninjas,https://www.codingninjas.com/courses,codingninjas.com,,2,')));
});

/* ------------------------------------------- lessons of the first real captures */

test('a brand drawn as <span role="button"> stays in the answer', () => {
  // ChatGPT draws every programme it recommends as an interactive entity. The
  // first real capture read "1.  — AI Engineering Bootcamp": Codebasics, IIT
  // Patna and Dinesh AI Academy all removed as if they were buttons.
  const answer = '<h2>1. <span role="button" tabindex="0"><span>Codebasics</span></span> — AI Engineering Bootcamp</h2><p>Live online.</p><button>Copy</button>';
  const d = collect(chatgptPage({ turns: [[QUESTION, answer]] }), URLS.chatgpt);
  assert.match(d.answer, /1\. Codebasics — AI Engineering Bootcamp/);
  assert.doesNotMatch(d.answer, /Copy/, 'a real button is still chrome');
});

test('a table keeps one row per line with its cells apart', () => {
  const answer = '<table><tr><th>Factor</th><th>What it offers</th></tr><tr><td>Format</td><td>Live online classes</td></tr></table>';
  const d = collect(chatgptPage({ turns: [[QUESTION, answer]] }), URLS.chatgpt);
  assert.deepEqual(d.answer.split('\n'), ['Factor | What it offers', 'Format | Live online classes']);
});

test('a picker that names no model is not a model', () => {
  assert.equal(collect(chatgptPage({ modelSlug: null, header: 'Model' }), URLS.chatgpt).metadata.model, undefined);
});

test('the model label survives the snapshot when the composer around it does not', () => {
  // Claude and Gemini draw the label in the composer, which is private; the
  // first real Claude capture re-parsed with no model at all.
  const html = claudePage().replace('<fieldset>', '<fieldset><button data-testid="model-selector-dropdown">Sonnet 5.5 Medium</button>');
  const withoutHeader = html.replace(/<header>[\s\S]*?<\/header>/, '');
  const live = collectAnswer(parse(withoutHeader), URLS.claude, { includeRawHtml: true });
  assert.equal(live.metadata.model, 'Sonnet 5.5 Medium');
  assert.doesNotMatch(live.rawHtml, /a draft/, 'the composer itself was kept');
  assert.equal(collectAnswer(parse(live.rawHtml), URLS.claude).metadata.model, 'Sonnet 5.5 Medium');
});

test("Claude's chat header never reaches the snapshot: it names the linked computer", () => {
  const html = claudePage().replace(
    '<main>',
    '<main><div data-testid="chat-header"><button data-testid="cowork-computer-link-indicator" aria-label="PERSONS_PC, Asleep or app closed"></button></div>',
  );
  const d = collectAnswer(parse(html), URLS.claude, { includeRawHtml: true });
  assert.doesNotMatch(d.rawHtml, /PERSONS_PC/);
});

test('ChatGPT: a turn not yet "complete" is flagged as still writing', () => {
  const html = chatgptPage().replace('<article data-testid="conversation-turn-2">', '<article data-testid="conversation-turn-2" data-talvt-turn-state="streaming">');
  assert.equal(collect(html, URLS.chatgpt).diagnostics.streaming, true);
});

test('Gemini: question, answer, model, links; the sidebar and composer stay out of the snapshot', () => {
  const d = collectAnswer(parse(geminiPage()), URLS.gemini, { includeRawHtml: true });
  assert.equal(d.metadata.assistant, 'gemini');
  assert.equal(d.metadata.question, QUESTION);
  assert.equal(d.metadata.model, 'Flash');
  assert.equal(d.metadata.conversationId, 'e18b1d6c7596d509');
  assert.equal(d.diagnostics.layers.answer, 'site');
  assert.match(d.answer, /AlmaBetter \| Live online cohorts/);
  assert.doesNotMatch(d.answer, /ANI News/, 'a source chip is a citation, not prose');
  assert.deepEqual(d.links.map((l) => l.domain), ['almabetter.com'], 'a link back into Google search is not a citation');
  assert.doesNotMatch(d.rawHtml, /Pizza Tower|Person Name|a draft/);
  assert.equal(collectAnswer(parse(d.rawHtml), URLS.gemini).metadata.model, 'Flash');
});

/* ------------------------------------------- the second round of real captures, 2026-10-15 */

const real = (name) => {
  const doc = parse(readFileSync(`test/fixtures/real-${name}.html`, 'utf8'));
  return collectAnswer(doc, doc.querySelector('[data-answer-reader-snapshot]').getAttribute('data-url'));
};
const Q1 = 'what-is-the-difference-between-an-ai-engineer-an';

test("ChatGPT: a pill with no anchor is a citation of the site its favicon names, and not the answer's prose", () => {
  const d = real(`chatgpt-${Q1}`);
  assert.equal(d.metadata.webSources, true);
  assert.deepEqual(d.links.map((l) => [l.domain, l.count, l.urlIsOrigin]), [['brightinfonet.com', 2, true], ['naukri.com', 1, true]]);
  assert.equal(d.links[0].anchorText, 'Bright Infonet +1');
  assert.equal(d.links[0].url, 'https://brightinfonet.com/', 'the site, never a guessed page');
  assert.doesNotMatch(d.answer, /Bright Infonet|^\+1$/m);
});

test("ChatGPT: a table cell's paragraphs stay on its row", () => {
  const d = real(`chatgpt-${Q1}`);
  assert.match(d.answer, /^Factor \| AI Engineer \| ML Engineer$/m);
  assert.match(d.answer, /^Fresher, 0–2 years \| ₹4–10 LPA \| ₹4–9 LPA$/m);
  assert.doesNotMatch(d.answer, /^\|$/m);
});

test('ChatGPT: a pill naming the site of a link the answer already has joins that link', () => {
  const d = real('chatgpt-which-is-the-best-ai-engineering-course-or-bootc');
  assert.deepEqual(d.links.map((l) => [l.domain, l.count, Boolean(l.urlIsOrigin)]), [
    ['codebasics.io', 2, false], ['iitpatna.com', 2, false], ['store.dineshaiacademy.com', 2, false], ['iitd.emeritus.org', 2, false],
  ]);
  // A badge without a favicon is a button or a brand, and stays where it was.
  assert.match(d.answer, /My first choice/);
});

test("Perplexity: a citation with no anchor is read from its data-pplx-citation-url", () => {
  const d = real(`perplexity-${Q1}`);
  assert.deepEqual(d.links.map((l) => [l.domain, l.count]), [['online.iitkgp.ac.in', 6], ['naukri.com', 1], ['shooliniuniversity.com', 1]]);
  assert.match(d.links[0].url, /^https:\/\/online\.iitkgp\.ac\.in\/blog\/ai-engineer-vs-ml-engineer/);
  assert.match(d.answer, /^Aspect \| AI Engineer \| ML Engineer$/m);
});

test("Google AI Mode tab: the answer ends where the reply does; the share, feedback and help links are not it", () => {
  const d = real(`google_ai_mode-${Q1}`);
  assert.match(d.answer, /analyzing datasets and formulas\?$/);
  assert.doesNotMatch(d.answer, /AI can make mistakes|Share public link|Good response|Thanks for letting us know|Show all|0 files/);
  assert.ok(!d.links.some((l) => l.domain === 'support.google.com'), 'a help link from the feedback form was read as a citation');
  assert.equal(d.links.length, 8);
  assert.equal(d.sources.length, 14, 'the right-hand column is chrome to the text, and still the sources');
});

test('the snapshot never keeps a root whose private parts hold the answer: it falls back to the turn', () => {
  // The first real Gemini capture kept <main> and nothing in it but a sidebar button: a private element held the conversation.
  const html = `<!doctype html><html lang="en"><body><main class="chat-app">
    <div class="side-nav-menu-button"><a href="/">New chat</a></div>
    <side-navigation-v2>
      <bard-sidenav><a href="/app/older">Pizza Tower Next to Jenga</a></bard-sidenav>
      <div class="content"><div class="conversation-container">
        <user-query><div class="query-text"><p class="query-text-line">${QUESTION}</p></div></user-query>
        <model-response><message-content><div class="markdown"><p>For freshers, live cohorts with projects matter most.</p></div></message-content></model-response>
      </div></div>
    </side-navigation-v2></main></body></html>`;
  const d = collectAnswer(parse(html), URLS.gemini, { includeRawHtml: true });
  assert.equal(d.diagnostics.snapshot, 'last turn');
  assert.match(d.rawHtml, /live cohorts with projects/);
  assert.doesNotMatch(d.rawHtml, /Pizza Tower/);
  assert.equal(collectAnswer(parse(d.rawHtml), URLS.gemini).metadata.question, QUESTION);
});

test('Gemini: the "You said" label and the clipped preview are not the question', () => {
  const clipped = `${QUESTION.slice(0, 60)}…`;
  const html = geminiPage().replace(
    '<div class="query-text">',
    `<span class="cdk-visually-hidden">You said</span> <span class="preview">${clipped}</span> <div class="query-text">`,
  ).replace('<div class="query-text"><p class="query-text-line">', '<div><p>');
  // Neither question selector matches, so the whole user turn is read, label and preview with it.
  assert.ok(QUESTION.length > 60);
  assert.equal(collectAnswer(parse(html), URLS.gemini).metadata.question, QUESTION);
});

test('the snapshot keeps no email address a reader never sees, and every one the answer prints', () => {
  // Google's AI Mode tab put the signed-in account's address in comments, 20 times on its first capture.
  const html = chatgptPage({
    turns: [[QUESTION, '<p>Write to admissions@institute.example for a brochure.</p><!--[null,0,null,null,"person@gmail.com"]--><span data-x="person@gmail.com">.</span>']],
  });
  const raw = collectAnswer(parse(html), URLS.chatgpt, { includeRawHtml: true }).rawHtml;
  assert.doesNotMatch(raw, /person@gmail\.com/);
  assert.match(raw, /admissions@institute\.example/);
  assert.match(raw, /\[email\]/);
});

test("Gemini: a chip that names its source and links nowhere is a source by that name, once; the question is clean", () => {
  const d = real(`gemini-${Q1}`);
  assert.equal(d.metadata.question, 'What is the difference between an AI engineer and an ML engineer, and which should a fresher in India choose?');
  assert.deepEqual(d.sources.map((s) => [s.siteName, s.domain, s.url]), [['TryDigital Solution', '', ''], ['CloudThat', '', ''], ['AY Automate', '', '']]);
  assert.equal(d.metadata.webSources, true);
  assert.doesNotMatch(d.answer, /TryDigital|AY Automate/, 'a chip is a citation, not prose');
  assert.match(d.answer, /^Feature \| AI Engineer \(Product & Systems Focus\) \| ML Engineer \(Models & Algorithms Focus\)$/m);
});

test("Gemini: the person's profile picture never reaches the snapshot", () => {
  const html = geminiPage().replace(
    '<user-query>',
    '<user-query><user-profile-picture><img alt="profile picture" src="https://lh3.googleusercontent.com/a/person-photo"></user-profile-picture>',
  );
  const raw = collectAnswer(parse(html), URLS.gemini, { includeRawHtml: true }).rawHtml;
  assert.doesNotMatch(raw, /person-photo|profile picture/);
  assert.match(raw, /query-text-line/);
});

test('Gemini: a question short enough to preview whole is not read twice', () => {
  const html = geminiPage().replace(
    '<div class="query-text"><p class="query-text-line">',
    `<span class="cdk-visually-hidden">You said</span> <span class="preview">${QUESTION}</span> <div><p>`,
  );
  assert.equal(collectAnswer(parse(html), URLS.gemini).metadata.question, QUESTION);
});
