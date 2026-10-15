# Answer Reader

A local Chrome extension that reads the AI assistant answer **you already have
open** and stores it, for GEO citation tracking. ChatGPT, Perplexity, Claude,
Gemini and the AI Mode tab of Google search. No API, no server, no keys, no cost.

It is the assistant counterpart of [SERP Reader](https://github.com/RIDAM7/SERP-Reader):
same stack, same principles. It does not ask anything. You type the question,
the assistant answers, you press **Collect**, and the extension reads the DOM
that is already on screen. Everything downstream — storage, exports, history —
is built on an answer a person deliberately asked for.

---

## Install

```bash
npm install
npm run build
```

Then in Chrome:

1. `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → select the **`dist/`** folder (not the project root)

`npm run watch` rebuilds on save; press the reload icon on the extension card to
pick changes up. A tab that was open before the extension loaded needs one
refresh.

For Google AI Mode in Incognito: **Details** on Answer Reader → **Allow in
Incognito**.

---

## Using it

Once a month, the same questions to every assistant (the research repository's
`sites/<domain>/serps/assistant-questions.md` holds the sheet):

1. Open a fresh chat: ChatGPT in a **temporary chat** (otherwise its memory
   writes your own background into the answer — the first real capture did),
   Claude in a new chat outside any project, Perplexity logged out, Gemini in a
   new chat, Google AI Mode in an Incognito window. Web search on wherever the
   assistant offers it.
2. Paste the question exactly as written. Ask nothing else in between.
3. Wait until the answer has finished, then press **Collect** — the floating
   panel on the page or the toolbar popup. Both run the same code.
4. Next question, or next assistant.

Then **Export all** and file the three files under
`sites/<domain>/answers/<YYYY-MM>/` in the research repository, where
`npm run answers -- --site <domain>` reads them.

On google.com the extension runs only on the AI Mode tab (`udm=50` in the
URL). A plain results page belongs to SERP Reader, so one page never carries two
Collect buttons. Gemini is a different app, at gemini.google.com, and is read
there.

---

## What it collects

| | Detail |
| --- | --- |
| **Assistant and page** | Which of the four, the page URL, the conversation id when the URL carries one, `<html lang>` |
| **Question** | The last user turn, as the page shows it |
| **Answer** | The last assistant turn's text, with its paragraphs and list items on their own lines. Citation pills are left out: a pill is a citation, already in the links, and counting its label as prose would say the answer *named* a brand it only cited |
| **Links in the answer** | In order of first appearance: href, destination URL, domain, anchor text, and how many times the answer links it |
| **Sources panel** | The assistant's sources or citations list, in its order: title, URL, domain, and the publisher name a card shows |
| **Web sources** | Whether any appear at all: a link out, a sources panel, or the assistant's own "searched the web" line. *No* is a finding: the answer came from the model alone |
| **Model** | The label the page shows, when it shows one. ChatGPT's per-message model id is preferred over the header's picker, which names the *next* message's model |
| **Raw HTML** | The conversation's DOM, so a future parser can re-read the capture (below) |
| **Diagnostics** | Which layer produced each field, how many turns the site's selectors matched, whether the answer looked unfinished, warnings, parser version |

Two things are deliberately left as they are rather than tidied:

- **Google's links are signed `/goto` redirects.** The destination is in no
  anchor. The source card with the same href usually carries it, in a favicon
  request or its markup, and that is where `domain` comes from. A card that
  names none (YouTube's, on the first real reply) takes it from the record the
  reply keeps for that exact link: origin, the names the card shows, and the
  signed href. A card with neither keeps an empty domain and its `siteName`. A
  domain is never guessed from a title or a site name.
- **ChatGPT tags every citation `utm_source=chatgpt.com`.** `url` drops that tag,
  `href` keeps the page's value.

---

## Exports

**Export all** writes three files:

```
answers-YYYY-MM-DD.json            every record, raw HTML included: { exportedAt, count, answers }
answers-YYYY-MM-DD.csv             one row per capture
answer_citations-YYYY-MM-DD.csv    one row per panel source and per link in an answer (kind = source | link)
```

The JSON envelope is SERP Reader's, with `answers` where it has `serps`. The
date in the names is UTC, like every timestamp in the records.

---

## Architecture

```
src/
  parser/        pure functions: DOM in, data out. No chrome.* here.
    selectors.ts  EVERY selector, one block per assistant plus the generic one
    sites.ts      which assistant a URL is; conversation id; q= from the URL
    read.ts       the site layer and the generic layer that finds turns
    sources.ts    the sources panel: site selectors, else a panel headed "Sources"
    links.ts      links in the answer, de-duplicated by destination
    snapshot.ts   the raw HTML: the conversation, nothing private
    utils.ts      text, link resolution, document order, helpers
    index.ts      orchestrator; wraps every step so one failure is local
  content/       runs on the assistant's page: reads it, mounts the panel
  background/    service worker — the ONLY thing that touches storage
  storage/       IndexedDB, and the export builders
  shared/        lines and downloads the popup and history page share
  popup/ history/ UI
```

### Two layers

These apps change their DOM more often than Google does. So parsing is layered:

- **Generic.** Knows no site. The last element shaped like a turn (an
  `article`, a `[data-message-author-role]`, anything `markdown` or `prose`),
  every external link in it, and the last user-shaped element before it. If
  nothing on the page is turn-shaped, the whole conversation is the answer —
  wrong in a known way rather than empty — and a warning says so.
- **Site.** Each assistant's selectors replace the generic reading field by
  field: the exact turns, the answer's body without its toolbar, the model
  label, the sources panel, the "searched the web" marker.

`diagnostics.layers` records, per field, which one answered: `site`, `generic`,
`heading` (a panel found by its heading), `url` (the question read from `q=`),
or `none`. A capture the generic layer read is visibly one.

**Every selector is in `selectors.ts`.** When an assistant restyles, that is the
only file to edit.

**Storage lives in the service worker.** A content script's IndexedDB belongs to
chatgpt.com or claude.ai; captures would scatter across four origins and vanish
with a logout.

**Document order is worked out from the tree,** never `compareDocumentPosition`:
linkedom answers it wrongly for cousins (two paragraphs in sibling divs come
back reversed), the tests run on linkedom, and the extension runs in Chrome. A
parser whose order depends on the runtime would pass every test and pick the
wrong turn in the browser.

### The snapshot keeps nothing private

Exports go into a research repository, and a chat page carries what must never
get there: the sidebar's list of the person's other conversations, the account
menu with their name and email, a draft in the composer, inline scripts holding
session state. The snapshot is the element holding the conversation (never
`<body>`), copied with scripts, `nav`, the composer, inputs and each site's
account elements removed, plus the few elements outside it a re-parse needs (the
model label, a sources panel in a side sheet). It is wrapped in one element
recording the URL, assistant and language, so it re-parses on its own:

```bash
npm run reparse -- path/to/answers-2026-10-20.json    # writes answers-2026-10-20.reparsed.json beside it
```

A re-read keeps each record's id, time and model label, and prints what moved.

---

## Tests

```bash
npm test        # builds the parser bundle, then runs node --test
npm run typecheck
```

**What the tests prove, and what they do not.** ChatGPT, Perplexity and Claude
are synthetic fixtures written from `selectors.ts`. They prove the logic — the
last turn and not the first, links in order and de-duplicated, the app's own
links left out, the generic layer taking over when the site's selectors miss,
nothing private reaching the snapshot, a snapshot re-parsing to the same record.
They do **not** prove the selectors match today's apps: nothing here fetches
those pages, because that would be the automation this project refuses.

**Google AI Mode is read from real markup.** `test/fixtures/real-google_ai_mode-*`
is an AI Mode reply Google put in its overview slot, from a SERP Reader capture
of 2026-10-15. The AI Mode tab is assumed to draw its turns with the same
component; a capture from the tab confirms that or corrects it.

**When you have a real capture, keep it:**

```bash
node test/import-capture.mjs path/to/answers-2026-10-20.json
```

writes `test/fixtures/real-<assistant>-<question>.html` and a sidecar of what
the current parser reads from it: counts, domains in order, which layer
answered. `npm test` then holds every later selector edit to it.
`node test/regen-expected.mjs` re-baselines the sidecars after a deliberate
change — read the diff it prints first.

---

## Known limitations

- **Gemini's selectors are unverified.** ChatGPT, Perplexity and Claude were
  tuned on one real answer each (2026-10-15); all three had changed from what
  the first version assumed, and the first capture of each showed it. Gemini is
  written from the app's element names; until a real capture is imported,
  read `diagnostics.layers` on its captures.
- **ChatGPT's model is not read.** Its per-message model id is gone and the
  picker sits outside the conversation; no selector matched on the first
  capture. Perplexity shows no answering model at all.
- **Google AI Mode's question bubble is not known yet.** The reply's own heading
  ("AI Mode reply for <query>") or `q=` stands in.
- **"Unfinished" is a warning, not a refusal.** The streaming markers are
  selectors too; a stale one that always matched would block every capture.
  The capture is saved and flagged, and the panel says so.
- **The sources panel must be in the DOM.** A panel drawn only after a click is
  read once it is open; nothing here clicks it. The answer's own links are read
  either way.
- **A capture is one personalised answer at one moment.** A fresh chat, no
  memory and the same wording each month make it repeatable enough to compare.
  It is not a rank tracker, and the playbook's caution about manual prompt runs
  (§47) still applies.

---

## What this deliberately does not do

No typing, no clicking, no submitting, no scrolling, no network requests of its
own, no login, no CAPTCHA handling, no automated or scheduled questions. Asking
these services questions by script breaks their terms.

It reads a page you opened, when you press a button. That is the entire scope,
and the architecture has no seam where any of the above could be added quietly.
