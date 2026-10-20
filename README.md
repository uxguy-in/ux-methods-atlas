# UX Methods Atlas

A React + Node.js website holding every UX research method from Vivek Gopinath's library of books, treatises,
compendia and playbooks, including the rigorous methods the field lost and the ones borrowed from other disciplines.
It asks a few questions, reads a short problem brief with Claude, and recommends a research direction.
It also has UX calculators (sample size, confidence intervals, SUS/UMUX-Lite/NPS scoring and significance tests) and
a form for the community to submit methods.

## Use it online

The public version runs on GitHub Pages at https://uxguy-in.github.io/ux-methods-atlas/. It has every method, the finder and the library. The AI research direction needs a server and an API key, so it only runs in the downloaded version.

## Run it

Needs Node.js 18.18 or newer.

```bash
npm install
cp .env.example .env        # then paste your Anthropic API key into .env (only needed for the AI brief)
npm run build
npm start                   # http://localhost:8787
```

For development with hot reload: `npm run dev` (Vite on http://localhost:5173, API on 8787).

## What's inside

| Path | What it is |
| --- | --- |
| `server/index.js` | Express API and static file server |
| `server/lib/recommend.js` | Rule-based finder: scores each method against goal, stage, access, time, evidence and expertise |
| `server/lib/brief.js` | AI brief: sends the brief plus the best-matching slice of the atlas to Claude (`claude-opus-5-5`) and returns a structured plan that only uses methods in the atlas |
| `server/data/methods.json` | The methods, one record each (see schema below) |
| `server/data/books.json` | The 253-book library, linked to the methods each book sources |
| `server/data/meta.json` | Disciplines, loss taxonomy, causes of method death, UX epidemiology glossary |
| `client/` | React app (Vite). Theme tokens are at the top of `client/src/styles.css` |

## The AI brief

The `/api/brief` endpoint uses the official Anthropic SDK with adaptive thinking, structured JSON output, and
server-side refusal fallbacks (`fallbacks: "default"`). Set `CLAUDE_MODEL` in `.env` to use a different model.
Without an API key the site still works; the finder falls back to rule-based matches.

## Method record schema

`id, name, aka[], family, donor, origin, status, summary, description, steps[], outputs, useWhen, avoidWhen,
whyLost, whereToUse, example, sources[], reference, facets{goals[], stage[], data, participants, effort, expertise,
setting[]}, relatedIds[], bookIds[], keywords[]`

`status` follows the taxonomy of loss from *Lost Methods in UX*: active, vestigial, siloed, renamed, latent,
extinct, unmigrated, plus `community` for community-proposed frameworks. Community frameworks also carry
`proposedBy` and `validation` (`tested` or `untested`); a framework counts as tested once there is published
evidence of use beyond the person who proposed it. Edit `methods.json` directly to add or correct methods, then
run `npm run check:data`.

## Community submissions

The **Submit a method** page builds a pre-filled GitHub issue, and `.github/ISSUE_TEMPLATE/submit-method.yml` offers
the same form directly on GitHub. Review each issue, add accepted methods to `methods.json` with credit, and mark new
frameworks `untested` until there is evidence.

## Calculators

`client/src/calc/stats.js` holds the statistics (adjusted-Wald, exact binomial and mid-p, N−1 two-proportion test,
McNemar, Welch and paired t-tests, log-time and median intervals, problem-discovery adjustment, sample size formulas),
following Sauro & Lewis, *Quantifying the User Experience*. Everything runs in the browser.

## GitHub Pages

`npm run build:pages` builds a static copy of the site into `site/`, with the data beside it and hash-based URLs, so it runs on any static host.
`.github/workflows/pages.yml` runs that build and publishes it on every push to `main`. In the repository's
Settings → Pages, set **Source** to **GitHub Actions** once.
